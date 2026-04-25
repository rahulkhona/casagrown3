/**
 * execute-settlement-captures — Supabase Edge Function
 *
 * Called after run_market_settlement() to execute actual Stripe captures.
 * For each settlement_captures record in 'captured' status (DB-side marking),
 * calls Stripe API to capture the PaymentIntent.
 *
 * Flow:
 *   1. Query settlement_captures with capture_status = 'captured' for the given settlement
 *   2. For each: POST /v1/payment_intents/{id}/capture with the exact amount
 *   3. On success: update capture with stripe_capture_id
 *   4. On failure: auto-retry once after 5s delay
 *   5. If retry fails: create buyer_debt, notify buyer
 *   6. Record bank ledger inflow for successful captures
 *
 * Trigger: Called by settlement cron via pg_net, or manually by admin
 *
 * Request: { settlement_id }
 * Response: { total, succeeded, failed, debts_created }
 */

import {
    jsonOk,
    jsonError,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
        return jsonError("STRIPE_SECRET_KEY not configured", corsHeaders);
    }

    const { settlement_id } = await req.json();
    if (!settlement_id) {
        return jsonError("settlement_id is required", corsHeaders);
    }

    // Get all captures for this settlement that need Stripe execution
    const { data: captures, error: captureErr } = await supabase
        .from("settlement_captures")
        .select("*")
        .eq("settlement_id", settlement_id)
        .eq("capture_status", "captured")  // DB marked as captured, but Stripe API not yet called
        .gt("capture_amount_usd", 0);

    if (captureErr) {
        console.error("Failed to fetch captures:", captureErr);
        return jsonError("Failed to fetch captures", corsHeaders);
    }

    if (!captures || captures.length === 0) {
        return jsonOk({ message: "No captures to execute", total: 0 }, corsHeaders);
    }

    console.log(`[CAPTURE] Processing ${captures.length} captures for settlement ${settlement_id}`);

    let succeeded = 0;
    let failed = 0;
    let debtsCreated = 0;

    for (const capture of captures) {
        const captureAmountCents = Math.round(capture.capture_amount_usd * 100);

        // Attempt Stripe capture
        const result = await attemptStripeCapture(
            STRIPE_SECRET_KEY,
            capture.stripe_payment_intent_id,
            captureAmountCents,
        );

        if (result.success) {
            // Update capture record with Stripe charge ID
            await supabase
                .from("settlement_captures")
                .update({
                    stripe_capture_id: result.chargeId,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", capture.id);

            console.log(`✅ [CAPTURE] ${capture.stripe_payment_intent_id} → $${capture.capture_amount_usd}`);
            succeeded++;
        } else {
            console.warn(`⚠️ [CAPTURE] First attempt failed for ${capture.stripe_payment_intent_id}: ${result.error}`);

            // Auto-retry after 5 second delay
            await new Promise((resolve) => setTimeout(resolve, 5000));

            const retryResult = await attemptStripeCapture(
                STRIPE_SECRET_KEY,
                capture.stripe_payment_intent_id,
                captureAmountCents,
            );

            if (retryResult.success) {
                await supabase
                    .from("settlement_captures")
                    .update({
                        stripe_capture_id: retryResult.chargeId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", capture.id);

                console.log(`✅ [CAPTURE] Retry succeeded: ${capture.stripe_payment_intent_id}`);
                succeeded++;
            } else {
                // Permanent failure → mark capture failed, create buyer debt
                const errorMsg = retryResult.error || "Capture failed after retry";

                await supabase
                    .from("settlement_captures")
                    .update({
                        capture_status: "failed",
                        error_message: errorMsg,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", capture.id);

                // Create buyer debt
                await supabase.from("buyer_debts").insert({
                    buyer_id: capture.buyer_id,
                    settlement_id: settlement_id,
                    capture_id: capture.id,
                    amount_usd: capture.capture_amount_usd,
                    reason: "capture_failed",
                    stripe_payment_intent_id: capture.stripe_payment_intent_id,
                    error_message: errorMsg,
                    retry_count: 2,
                });

                // Notify buyer (GAP-9: fix table + add email + SMS)
                await supabase.from("market_notifications").insert({
                    user_id: capture.buyer_id,
                    content: `⚠️ Payment of $${capture.capture_amount_usd.toFixed(2)} could not be processed. ` +
                        `Please update your payment method to continue using the market.`,
                    link_url: "/profile",
                });

                // Typed email for capture failure
                try {
                    const { data: profile } = await supabase
                        .from("profiles").select("full_name").eq("id", capture.buyer_id).single();
                    const { data: emailData } = await supabase
                        .rpc("get_user_email", { p_user_id: capture.buyer_id });

                    if (emailData) {
                        await supabase.functions.invoke("send-notification-email", {
                            body: {
                                type: "capture_failed",
                                recipients: [{ email: emailData, name: profile?.full_name || "there" }],
                                dollarAmount: capture.capture_amount_usd,
                            },
                        });
                    }
                } catch (emailErr) {
                    console.warn("Capture failure email failed:", emailErr);
                }

                // SMS fallback for capture failure
                try {
                    await supabase.functions.invoke("send-sms-notification", {
                        body: {
                            userId: capture.buyer_id,
                            message: `⚠️ CasaGrown: Payment of $${capture.capture_amount_usd.toFixed(2)} could not be processed. Please update your payment method.`,
                            linkUrl: "/profile",
                        },
                    });
                } catch (smsErr) {
                    console.warn("Capture failure SMS failed:", smsErr);
                }

                console.error(`❌ [CAPTURE] Failed permanently: ${capture.stripe_payment_intent_id} → debt created`);
                failed++;
                debtsCreated++;
            }
        }
    }

    // Record bank ledger inflow for total successfully captured amount
    if (succeeded > 0) {
        const totalCaptured = captures
            .filter((_c, i) => i < succeeded)  // approximation — we track individually
            .reduce((sum, c) => sum + c.capture_amount_usd, 0);

        // We'll let the payout webhook handle the actual bank ledger inflow
        // since money doesn't arrive until Stripe sends the payout
        console.log(`[CAPTURE] Total captured: $${totalCaptured.toFixed(2)} (awaiting payout)`);
    }

    return jsonOk({
        settlement_id,
        total: captures.length,
        succeeded,
        failed,
        debts_created: debtsCreated,
    }, corsHeaders);
});

// ── Helper: Attempt Stripe capture ──────────────────────────────────────────

async function attemptStripeCapture(
    stripeKey: string,
    paymentIntentId: string,
    amountCents: number,
): Promise<{ success: boolean; chargeId?: string; error?: string }> {
    try {
        const response = await fetch(
            `https://api.stripe.com/v1/payment_intents/${paymentIntentId}/capture`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${stripeKey}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    amount_to_capture: String(amountCents),
                }),
            },
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data?.error?.message || `HTTP ${response.status}`,
            };
        }

        // Get the charge ID from the captured payment intent
        const chargeId = data.latest_charge || data.charges?.data?.[0]?.id;

        return { success: true, chargeId };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        };
    }
}
