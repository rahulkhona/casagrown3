/**
 * market-hold — Supabase Edge Function
 *
 * Creates or tops up a Stripe PaymentIntent with capture_method: 'manual'
 * for the market buy flow (authorize-then-capture).
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
 *   5. Record balance_applied_cents on market_holds and market_orders
 *
 * Request: { order_id, amount_cents, suggested_hold_cents? }
 * Response: { clientSecret?, holdId?, holdAmountCents, balanceAppliedCents, isTopUp, requiresCardEntry }
 */

import {
    jsonOk,
    jsonError,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
        return jsonError("STRIPE_SECRET_KEY not configured", corsHeaders);
    }

    const { order_id, amount_cents, suggested_hold_cents } = await req.json();

    if (!order_id || !amount_cents) {
        return jsonError("order_id and amount_cents are required", corsHeaders);
    }

    // Authenticate
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const buyerId = auth;

    // Verify order belongs to buyer
    const { data: order, error: orderErr } = await supabase
        .from("market_orders")
        .select("id, total_usd, status")
        .eq("id", order_id)
        .eq("buyer_id", buyerId)
        .single();

    if (orderErr || !order) {
        return jsonError("Order not found", corsHeaders);
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

    if (debitErr) {
        console.error("Balance debit failed:", debitErr);
        // Non-fatal — proceed with full card hold
    }

    const balanceAppliedCents = balanceDebitedCents || 0;
    const remainderCents = amount_cents - balanceAppliedCents;

    // Update order with balance applied
    await supabase
        .from("market_orders")
        .update({ balance_applied_usd: balanceAppliedCents / 100 })
        .eq("id", order_id);

    console.log(
        `[MARKET-HOLD] Balance applied: $${(balanceAppliedCents / 100).toFixed(2)}, ` +
        `remainder for card: $${(remainderCents / 100).toFixed(2)}`,
    );

    // ══════════════════════════════════════════════════════════
    // Step 2: If balance fully covers, skip Stripe
    // ══════════════════════════════════════════════════════════
    if (remainderCents <= 0) {
        // Check for existing hold to link order
        const { data: existingHold } = await supabase
            .from("market_holds")
            .select("id")
            .eq("buyer_id", buyerId)
            .eq("status", "active")
            .single();

        if (existingHold) {
            // Update existing hold with more balance applied
            await supabase
                .from("market_holds")
                .update({
                    balance_applied_cents: supabase.rpc ? balanceAppliedCents : balanceAppliedCents,
                    spent_amount_cents: existingHold.spent_amount_cents + amount_cents,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existingHold.id);

            await supabase
                .from("market_orders")
                .update({ hold_id: existingHold.id })
                .eq("id", order_id);
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

    if (existingHold) {
        // Top-up: cancel old PI, create new PI with old_hold + new_remainder
        isTopUp = true;
        const newSpent = existingHold.spent_amount_cents + amount_cents;
        const newBalanceApplied = existingHold.balance_applied_cents + balanceAppliedCents;
        holdAmountCents = Math.max(
            existingHold.hold_amount_cents + remainderCents,
            suggested_hold_cents || 0,
            existingHold.hold_amount_cents,
        );

        // Cancel old Stripe PI
        await fetch(
            `https://api.stripe.com/v1/payment_intents/${existingHold.stripe_payment_intent_id}/cancel`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            },
        );

        // Create new PI with the card-only amount
        const piResponse = await fetch(
            "https://api.stripe.com/v1/payment_intents",
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
                updated_at: new Date().toISOString(),
            })
            .eq("id", existingHold.id);

        if (updateErr) {
            console.error("Failed to update hold:", updateErr);
            return jsonError("Failed to update hold record", corsHeaders);
        }

        // Link order to hold
        await supabase
            .from("market_orders")
            .update({ hold_id: existingHold.id })
            .eq("id", order_id);

        console.log(
            `✅ [MARKET-HOLD] Top-up: hold ${existingHold.id}, PI: ${piData.id}, ` +
            `card: $${(holdAmountCents / 100).toFixed(2)}, balance: $${(newBalanceApplied / 100).toFixed(2)}`,
        );

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
        "https://api.stripe.com/v1/payment_intents",
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

    // Create hold record
    const { data: hold, error: holdErr } = await supabase
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
        console.error("Failed to create hold:", holdErr);
        return jsonError("Failed to record hold", corsHeaders);
    }

    // Link order to hold
    await supabase
        .from("market_orders")
        .update({ hold_id: hold.id })
        .eq("id", order_id);

    console.log(
        `✅ [MARKET-HOLD] New hold: ${hold.id}, PI: ${piData.id}, ` +
        `card: $${(holdAmountCents / 100).toFixed(2)}, balance: $${(balanceAppliedCents / 100).toFixed(2)}`,
    );

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
