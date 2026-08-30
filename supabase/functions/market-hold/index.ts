/**
 * market-hold — Supabase Edge Function
 *
 * Creates or tops up a Stripe PaymentIntent with capture_method: 'manual'
 * for the market buy flow (authorize-then-capture).
 *
 * HOLD-FIRST: This function is called BEFORE the order is created.
 * The hold secures payment (balance + card) before the order exists,
 * preventing orphaned orders when payment fails.
 *
 * BALANCE-FIRST: Before creating/topping up a Stripe hold, the buyer's
 * available balance is debited first. The Stripe hold is only for the
 * remainder. If balance fully covers the purchase, no Stripe PI is created.
 *
 * Flow:
 *   1. Check buyer's available balance via debit_buyer_balance RPC (atomic, locked)
 *   2. Compute remainder after balance applied
 *   3. If remainder > 0: create/top-up Stripe PaymentIntent
 *   4. If remainder = 0: skip Stripe entirely (fully covered by balance)
 *   5. Record balance_applied_cents on market_holds
 *
 * Request: { amount_cents, order_id?, suggested_hold_cents? }
 * Response: { clientSecret?, holdId?, holdAmountCents, balanceAppliedCents, isTopUp, requiresCardEntry }
 */

import {
    jsonOk,
    jsonError,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { getStripeApiBase } from "../_shared/stripe.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    // Authenticate first — reject anon before revealing config state
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const buyerId = auth;

    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
        return jsonError("STRIPE_SECRET_KEY not configured", corsHeaders);
    }
    const STRIPE_API_BASE = getStripeApiBase();

    // Diagnostic: log key prefix to trace which key is being used
    const keyPrefix = STRIPE_SECRET_KEY.substring(0, 12);
    console.log(`[MARKET-HOLD] Using Stripe key: ${keyPrefix}...`);

    const { action, order_id, amount_cents, suggested_hold_cents, hold_id, new_amount_cents } = await req.json();

    // ══════════════════════════════════════════════════════════
    // Handle action: adjust or release (C-3 Fix)
    // ══════════════════════════════════════════════════════════
    if (action === 'adjust' && hold_id && new_amount_cents !== undefined) {
        const { data: hold } = await supabase.from('market_holds').select('*').eq('id', hold_id).single();
        if (hold && hold.stripe_payment_intent_id) {
            const newHoldCents = Math.max(100, new_amount_cents); // Stripe min $1
            const adjustResponse = await fetch(
                `${STRIPE_API_BASE}/v1/payment_intents/${hold.stripe_payment_intent_id}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: `amount=${newHoldCents}`,
                }
            );
            if (adjustResponse.ok) {
                await supabase.from('market_holds')
                    .update({ hold_amount_cents: newHoldCents, updated_at: new Date().toISOString() })
                    .eq('id', hold_id);
                return jsonOk({ success: true, adjustedCents: newHoldCents }, corsHeaders);
            }
        }
        return jsonError("Failed to adjust hold", corsHeaders);
    }
    
    if (action === 'release' && hold_id) {
        const { data: hold } = await supabase.from('market_holds').select('*').eq('id', hold_id).single();
        if (hold && hold.stripe_payment_intent_id) {
            const cancelResponse = await fetch(
                `${STRIPE_API_BASE}/v1/payment_intents/${hold.stripe_payment_intent_id}/cancel`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );
            if (cancelResponse.ok) {
                await supabase.from('market_holds').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', hold_id);
                return jsonOk({ success: true }, corsHeaders);
            }
        }
        return jsonError("Failed to release hold", corsHeaders);
    }

    if (!amount_cents) {
        return jsonError("amount_cents is required", corsHeaders);
    }

    // ══════════════════════════════════════════════════════════
    // Check if buyer has outstanding debts (blocked from purchases)
    // ══════════════════════════════════════════════════════════
    const { data: debtCheck } = await supabase.rpc("is_buyer_blocked", {
        p_buyer_id: buyerId,
    });
    if (debtCheck?.blocked) {
        return jsonError(
            `You have $${debtCheck.total_debt_usd.toFixed(2)} in outstanding charges. ` +
                `Please update your payment method or add funds to your balance to continue shopping.`,
            corsHeaders,
            403,
        );
    }

    // Verify order belongs to buyer (only if order_id provided — hold-first flow skips this)
    if (order_id) {
        const { data: order, error: orderErr } = await supabase
            .from("market_orders")
            .select("id, total_usd, status")
            .eq("id", order_id)
            .eq("buyer_id", buyerId)
            .single();

        if (orderErr || !order) {
            return jsonError("Order not found", corsHeaders);
        }
    }

    // ══════════════════════════════════════════════════════════
    // Step 1: Debit buyer's available balance (atomic, locked)
    // ══════════════════════════════════════════════════════════
    const { data: balanceDebitedCents, error: debitErr } = await supabase.rpc(
        "debit_buyer_balance",
        {
            p_buyer_id: buyerId,
            p_max_amount_cents: amount_cents,
        },
    );

    // BUG FIX C-4: Return error on balance debit failure
    if (debitErr) {
        console.error("Balance debit failed:", debitErr);
        return jsonError("Failed to process wallet balance. Please try again.", corsHeaders, 500);
    }

    const balanceAppliedCents = balanceDebitedCents || 0;
    const remainderCents = amount_cents - balanceAppliedCents;

    // Update order with balance applied (only if order_id provided)
    if (order_id) {
        await supabase
            .from("market_orders")
            .update({ balance_applied_usd: balanceAppliedCents / 100 })
            .eq("id", order_id);
    }

    console.log(
        `[MARKET-HOLD] Balance applied: $${(balanceAppliedCents / 100).toFixed(2)}, ` +
        `remainder for card: $${(remainderCents / 100).toFixed(2)}`,
    );

    // ══════════════════════════════════════════════════════════
    // Step 2: If balance fully covers, skip Stripe
    // ══════════════════════════════════════════════════════════
    if (remainderCents <= 0) {
        // Check for existing hold to link order
        let { data: existingHold } = await supabase
            .from("market_holds")
            .select("id, spent_amount_cents, balance_applied_cents")
            .eq("buyer_id", buyerId)
            .eq("status", "active")
            .single();

        if (existingHold) {
            // Update existing hold with more balance applied
            // BUG FIX H-4: Fix balance accumulation tautology
            await supabase
                .from("market_holds")
                .update({
                    balance_applied_cents: existingHold.balance_applied_cents + balanceAppliedCents,
                    spent_amount_cents: existingHold.spent_amount_cents + amount_cents,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existingHold.id);

            if (order_id) {
                await supabase
                    .from("market_orders")
                    .update({ hold_id: existingHold.id })
                    .eq("id", order_id);
            }
        } else {
            // BUG FIX H-5: Create a minimal hold row for balance-only checkouts
            const { data: newHold } = await supabase
                .from("market_holds")
                .insert({
                    buyer_id: buyerId,
                    stripe_payment_intent_id: "wallet_only",
                    hold_amount_cents: 0,
                    balance_applied_cents: balanceAppliedCents,
                    spent_amount_cents: amount_cents,
                    status: "active",
                }).select('id').single();
            existingHold = newHold;
        }

        console.log(
            `✅ [MARKET-HOLD] Fully covered by balance: $${(balanceAppliedCents / 100).toFixed(2)}`,
        );

        return jsonOk({
            clientSecret: null,
            holdId: existingHold?.id || null,
            holdAmountCents: 0,
            balanceAppliedCents,
            spentAmountCents: amount_cents,
            isTopUp: false,
            requiresCardEntry: false,
        }, corsHeaders);
    }

    // ══════════════════════════════════════════════════════════
    // Step 3: Remainder needs card — check for existing hold
    // ══════════════════════════════════════════════════════════
    const { data: existingHold } = await supabase
        .from("market_holds")
        .select("*")
        .eq("buyer_id", buyerId)
        .eq("status", "active")
        .single();

    let holdAmountCents: number;
    let isTopUp = false;

    // Helper to send hold notification
    const notifyHoldPlaced = async (userId: string, holdCents: number, pi: any) => {
        try {
            // In-app notification
            await supabase.from("market_notifications").insert({
                user_id: userId,
                content: `💳 A hold of $${(holdCents / 100).toFixed(2)} has been placed on your card for your market purchases.`,
                link_url: "/earnings",
            });

            // Typed email via send-notification-email
            const { data: profile } = await supabase
                .from("profiles").select("full_name").eq("id", userId).single();
            const { data: emailData } = await supabase
                .rpc("get_user_email", { p_user_id: userId });

            if (emailData) {
                // Extract last4 from Stripe PI if available
                const cardLast4 = pi.payment_method_options?.card?.last4 ||
                    pi.charges?.data?.[0]?.payment_method_details?.card?.last4 || "";

                await supabase.functions.invoke("send-notification-email", {
                    body: {
                        type: "card_hold_placed",
                        recipients: [{ email: emailData, name: profile?.full_name || "there" }],
                        holdAmountUsd: holdCents / 100,
                        cardLast4,
                    },
                });
            }
        } catch (notifErr) {
            // Non-critical — don't fail the hold
            console.warn("Hold notification failed:", notifErr);
        }
    };

    if (existingHold) {
        // Top-up: cancel old PI, create new PI with old_hold + new_remainder
        isTopUp = true;

        // Enforce max 10 top-ups per hold
        const currentTopUps = existingHold.top_up_count || 0;
        if (currentTopUps >= 10) {
            // Refund the balance we just debited
            await supabase.rpc("refund_buyer_balance", {
                p_buyer_id: buyerId,
                p_amount_cents: balanceAppliedCents,
                p_reason: "topup_limit_reached",
            });
            return jsonError(
                "You've reached the maximum number of card authorizations for this market session. " +
                "Your existing hold will be settled at the end of the day.",
                corsHeaders,
                429,
            );
        }

        const newSpent = existingHold.spent_amount_cents + amount_cents;
        const newBalanceApplied = existingHold.balance_applied_cents + balanceAppliedCents;
        holdAmountCents = Math.max(
            existingHold.hold_amount_cents + remainderCents,
            suggested_hold_cents || 0,
            existingHold.hold_amount_cents,
        );

        // Cancel old Stripe PI
        const cancelResponse = await fetch(
            `${STRIPE_API_BASE}/v1/payment_intents/${existingHold.stripe_payment_intent_id}/cancel`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            },
        );
        if (!cancelResponse.ok) {
            console.warn(
                `⚠️ [MARKET-HOLD] Failed to cancel old PI ${existingHold.stripe_payment_intent_id}: HTTP ${cancelResponse.status}. Continuing with new PI.`,
            );
        }

        // Create new PI with the card-only amount
        const piResponse = await fetch(
            `${STRIPE_API_BASE}/v1/payment_intents`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    amount: String(holdAmountCents),
                    currency: "usd",
                    capture_method: "manual",
                    setup_future_usage: "off_session",
                    "metadata[user_id]": buyerId,
                    "metadata[type]": "market_hold",
                    "metadata[order_ids]": order_id,
                    "metadata[balance_applied_cents]": String(newBalanceApplied),
                    description: `CasaGrown Market Hold — $${(holdAmountCents / 100).toFixed(2)} (card portion)`,
                }),
            },
        );

        if (!piResponse.ok) {
            const error = await piResponse.json();
            console.error("Stripe PI create error:", error);
            // Refund the balance we just debited
            await supabase.rpc("refund_buyer_balance", {
                p_buyer_id: buyerId,
                p_amount_cents: balanceAppliedCents,
                p_reason: "stripe_hold_failed",
            });
            return jsonError(
                error?.error?.message || "Failed to create payment hold",
                corsHeaders,
            );
        }

        const piData = await piResponse.json();

        // Update existing hold record
        const { error: updateErr } = await supabase
            .from("market_holds")
            .update({
                stripe_payment_intent_id: piData.id,
                stripe_client_secret: piData.client_secret,
                hold_amount_cents: holdAmountCents,
                spent_amount_cents: newSpent,
                balance_applied_cents: newBalanceApplied,
                top_up_count: currentTopUps + 1,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existingHold.id);

        if (updateErr) {
            console.error("Failed to update hold:", updateErr);
            return jsonError("Failed to update hold record", corsHeaders);
        }

        // Link order to hold (only if order_id provided)
        if (order_id) {
            await supabase
                .from("market_orders")
                .update({ hold_id: existingHold.id })
                .eq("id", order_id);
        }

        console.log(
            `✅ [MARKET-HOLD] Top-up: hold ${existingHold.id}, PI: ${piData.id}, ` +
            `card: $${(holdAmountCents / 100).toFixed(2)}, balance: $${(newBalanceApplied / 100).toFixed(2)}`,
        );

        await notifyHoldPlaced(buyerId, holdAmountCents, piData);

        return jsonOk({
            clientSecret: piData.client_secret,
            holdId: existingHold.id,
            holdAmountCents,
            balanceAppliedCents,
            spentAmountCents: newSpent,
            isTopUp: true,
            requiresCardEntry: true,
        }, corsHeaders);
    }

    // ══════════════════════════════════════════════════════════
    // No existing hold — create fresh (card-only portion)
    // ══════════════════════════════════════════════════════════
    holdAmountCents = Math.max(remainderCents, (suggested_hold_cents || 0) - balanceAppliedCents);
    // Ensure hold is at least the remainder
    holdAmountCents = Math.max(holdAmountCents, remainderCents);

    const piResponse = await fetch(
        `${STRIPE_API_BASE}/v1/payment_intents`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                amount: String(holdAmountCents),
                currency: "usd",
                capture_method: "manual",
                setup_future_usage: "off_session",
                "metadata[user_id]": buyerId,
                "metadata[type]": "market_hold",
                "metadata[order_ids]": order_id,
                "metadata[balance_applied_cents]": String(balanceAppliedCents),
                description: `CasaGrown Market Hold — $${(holdAmountCents / 100).toFixed(2)} (card portion, ` +
                    `$${(balanceAppliedCents / 100).toFixed(2)} from balance)`,
            }),
        },
    );

    if (!piResponse.ok) {
        const error = await piResponse.json();
        console.error(`❌ [MARKET-HOLD] Stripe PI create FAILED (HTTP ${piResponse.status}):`, JSON.stringify(error));
        console.error(`❌ [MARKET-HOLD] Key prefix: ${keyPrefix}, amount: ${holdAmountCents}, buyer: ${buyerId}`);
        // Refund the balance we just debited
        await supabase.rpc("refund_buyer_balance", {
            p_buyer_id: buyerId,
            p_amount_cents: balanceAppliedCents,
            p_reason: "stripe_hold_failed",
        });
        return jsonError(
            error?.error?.message || "Failed to create payment hold",
            corsHeaders,
        );
    }

    const piData = await piResponse.json();
    console.log(
        `✅ [MARKET-HOLD] Stripe PI created: id=${piData.id}, ` +
        `status=${piData.status}, amount=${piData.amount}, ` +
        `client_secret_prefix=${piData.client_secret?.substring(0, 20)}..., ` +
        `key_prefix=${keyPrefix}`,
    );

    // Create hold record — wrap in try/catch to clean up Stripe PI on failure
    let hold: { id: string };
    try {
        const { data: holdData, error: holdErr } = await supabase
            .from("market_holds")
            .insert({
                buyer_id: buyerId,
                stripe_payment_intent_id: piData.id,
                stripe_client_secret: piData.client_secret,
                hold_amount_cents: holdAmountCents,
                spent_amount_cents: amount_cents,
                balance_applied_cents: balanceAppliedCents,
                status: "active",
            })
            .select("id")
            .single();

        if (holdErr) {
            throw holdErr;
        }
        hold = holdData;
    } catch (dbErr) {
        console.error("Failed to create hold, cleaning up Stripe PI:", dbErr);
        // Cancel the orphaned Stripe PaymentIntent
        try {
            await fetch(
                `${STRIPE_API_BASE}/v1/payment_intents/${piData.id}/cancel`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                },
            );
        } catch (cancelErr) {
            console.error("Failed to cancel orphaned PI:", cancelErr);
        }
        // Refund the debited balance
        await supabase.rpc("refund_buyer_balance", {
            p_buyer_id: buyerId,
            p_amount_cents: balanceAppliedCents,
            p_reason: "hold_insert_failed",
        });
        return jsonError("Failed to record hold", corsHeaders);
    }

    // Link order to hold (only if order_id provided)
    if (order_id) {
        await supabase
            .from("market_orders")
            .update({ hold_id: hold.id })
            .eq("id", order_id);
    }

    console.log(
        `✅ [MARKET-HOLD] New hold: ${hold.id}, PI: ${piData.id}, ` +
        `card: $${(holdAmountCents / 100).toFixed(2)}, balance: $${(balanceAppliedCents / 100).toFixed(2)}`,
    );

    await notifyHoldPlaced(buyerId, holdAmountCents, piData);

    return jsonOk({
        clientSecret: piData.client_secret,
        holdId: hold.id,
        holdAmountCents,
        balanceAppliedCents,
        spentAmountCents: amount_cents,
        isTopUp: false,
        requiresCardEntry: true,
    }, corsHeaders);
});
