/**
 * stripe-webhook — Supabase Edge Function
 *
 * Receives webhook events from Stripe and processes them.
 * Primary event: payment_intent.succeeded → calls confirm-payment to credit points.
 *
 * This handles the case where the user kills the app before the frontend
 * can confirm the payment — Stripe still sends the webhook, and points
 * are credited server-side.
 *
 * Security: Verifies Stripe webhook signature to prevent spoofing.
 *
 * Setup:
 *   1. Set STRIPE_WEBHOOK_SECRET env var (from Stripe dashboard → Webhooks)
 *   2. Configure Stripe webhook endpoint to point to this function's URL
 *   3. Subscribe to event: payment_intent.succeeded
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

// ── Main handler ────────────────────────────────────────────────────────────

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET");

    // Parse the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Verify webhook signature (if secret is configured)
    if (STRIPE_WEBHOOK_SECRET && signature) {
        const isValid = await verifyStripeSignature(
            body,
            signature,
            STRIPE_WEBHOOK_SECRET,
        );
        if (!isValid) {
            console.error("Invalid Stripe webhook signature");
            return jsonError("Invalid signature", corsHeaders, 401);
        }
    } else if (STRIPE_WEBHOOK_SECRET && !signature) {
        console.error("Missing stripe-signature header");
        return jsonError("Missing signature", corsHeaders, 401);
    }

    const event = JSON.parse(body);
    console.log(`Stripe webhook received: ${event.type}, id: ${event.id}`);

    switch (event.type) {
        case "payment_intent.succeeded": {
            const paymentIntent = event.data.object;
            const stripeId = paymentIntent.id;

            console.log(`Processing payment_intent.succeeded: ${stripeId}`);

            // Find the matching payment_transaction
            const { data: txn, error: txnError } = await supabase
                .from("payment_transactions")
                .select("id, status")
                .eq("stripe_payment_intent_id", stripeId)
                .single();

            if (txnError || !txn) {
                console.error(
                    `No payment_transaction found for Stripe PI: ${stripeId}`,
                    txnError,
                );
                // Return 200 anyway — Stripe will stop retrying
                return jsonOk(
                    { received: true, warning: "Transaction not found" },
                    corsHeaders,
                );
            }

            // Already processed (idempotency)
            if (txn.status === "succeeded") {
                console.log(
                    `Payment ${txn.id} already confirmed, skipping`,
                );
                return jsonOk(
                    { received: true, alreadyProcessed: true },
                    corsHeaders,
                );
            }

            // Call confirm-payment to credit points
            const { data: confirmResult, error: confirmError } = await supabase
                .functions
                .invoke("confirm-payment", {
                    body: { paymentTransactionId: txn.id },
                });

            if (confirmError) {
                console.error(
                    "confirm-payment invocation failed:",
                    confirmError,
                );
                throw new Error(
                    `Failed to confirm payment: ${confirmError.message}`,
                );
            }

            console.log(
                `✅ Webhook processed: ${stripeId} → ${confirmResult?.pointsAmount} points`,
            );

            return jsonOk(
                { received: true, ...confirmResult },
                corsHeaders,
            );
        }

        case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object;
            const stripeId = paymentIntent.id;
            const failureMessage = paymentIntent.last_payment_error?.message ||
                "Payment failed";

            console.log(
                `Processing payment_intent.payment_failed: ${stripeId}`,
            );

            // Update the transaction status to failed
            await supabase
                .from("payment_transactions")
                .update({
                    status: "failed",
                    metadata: { failure_reason: failureMessage },
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_payment_intent_id", stripeId);

            return jsonOk({ received: true }, corsHeaders);
        }

        // ═══════════════════════════════════════════════════════
        // Payout events — settlement clearing
        // ═══════════════════════════════════════════════════════

        case "payout.paid": {
            const payout = event.data.object;
            const payoutId = payout.id;
            const payoutAmountUsd = payout.amount / 100;

            console.log(
                `Processing payout.paid: ${payoutId}, amount: $${payoutAmountUsd}`,
            );

            // Find settlements in funds_pending state
            // Match by looking at settlements without a stripe_payout_id
            const { data: pendingSettlements } = await supabase
                .from("market_settlements")
                .select("id, total_captured_usd")
                .eq("status", "funds_pending")
                .is("stripe_payout_id", null)
                .order("created_at", { ascending: true });

            if (!pendingSettlements || pendingSettlements.length === 0) {
                console.log(
                    `No pending settlements found for payout ${payoutId}`,
                );
                return jsonOk(
                    { received: true, warning: "No matching settlements" },
                    corsHeaders,
                );
            }

            // Match settlements to this payout
            // In sandbox, payouts often batch multiple settlements
            let remainingAmount = payoutAmountUsd;
            const matchedSettlements: string[] = [];

            for (const settlement of pendingSettlements) {
                if (remainingAmount <= 0) break;

                // Record bank ledger inflow for this settlement's portion
                const portionUsd = Math.min(
                    remainingAmount,
                    settlement.total_captured_usd,
                );

                await supabase.rpc("append_bank_ledger_entry", {
                    p_event_type: "stripe_payout_received",
                    p_direction: "inflow",
                    p_amount_usd: portionUsd,
                    p_provider: "stripe",
                    p_reference_type: "payout",
                    p_reference_id: payoutId,
                    p_settlement_id: settlement.id,
                    p_metadata: {
                        payout_total: payoutAmountUsd,
                        settlement_captured: settlement.total_captured_usd,
                    },
                });

                // Call confirm_settlement_funds_received
                const { data: result, error: confirmErr } = await supabase.rpc(
                    "confirm_settlement_funds_received",
                    {
                        p_settlement_id: settlement.id,
                        p_stripe_payout_id: payoutId,
                        p_stripe_payout_amount_usd: portionUsd,
                    },
                );

                if (confirmErr) {
                    console.error(
                        `Failed to confirm settlement ${settlement.id}:`,
                        confirmErr,
                    );
                } else {
                    matchedSettlements.push(settlement.id);
                    console.log(
                        `✅ Settlement ${settlement.id} cleared via payout ${payoutId}`,
                    );
                }

                remainingAmount -= portionUsd;
            }

            return jsonOk({
                received: true,
                payout_id: payoutId,
                matched_settlements: matchedSettlements,
            }, corsHeaders);
        }

        case "payout.failed": {
            const payout = event.data.object;
            const payoutId = payout.id;
            const failureMessage = payout.failure_message ||
                "Payout failed";

            console.error(
                `⚠️ Payout FAILED: ${payoutId}, reason: ${failureMessage}`,
            );

            // Notify admin via notification to staff
            const { data: staffMembers } = await supabase
                .from("staff_members")
                .select("user_id");

            if (staffMembers) {
                const notifications = staffMembers.map((s: { user_id: string }) => ({
                    user_id: s.user_id,
                    content:
                        `🚨 Stripe payout ${payoutId} FAILED: ${failureMessage}. Check Stripe dashboard.`,
                    link_url: "/admin/settlements",
                }));

                await supabase.from("notifications").insert(notifications);
            }

            return jsonOk({ received: true }, corsHeaders);
        }

        // ═══════════════════════════════════════════════════════
        // Dispute events — chargeback handling
        // ═══════════════════════════════════════════════════════

        case "charge.dispute.created": {
            const dispute = event.data.object;
            const chargeId = dispute.charge;
            const disputeAmountUsd = dispute.amount / 100;

            console.log(
                `Processing charge.dispute.created: charge=${chargeId}, amount=$${disputeAmountUsd}`,
            );

            // Find the capture associated with this charge
            const { data: capture } = await supabase
                .from("settlement_captures")
                .select("id, buyer_id, settlement_id")
                .eq("stripe_capture_id", chargeId)
                .single();

            if (capture) {
                // Create buyer debt for the disputed amount
                await supabase.from("buyer_debts").insert({
                    buyer_id: capture.buyer_id,
                    settlement_id: capture.settlement_id,
                    capture_id: capture.id,
                    amount_usd: disputeAmountUsd,
                    reason: "chargeback",
                    stripe_payment_intent_id: chargeId,
                    metadata: {
                        dispute_id: dispute.id,
                        reason: dispute.reason,
                    },
                });

                // Bank ledger outflow
                await supabase.rpc("append_bank_ledger_entry", {
                    p_event_type: "chargeback_debit",
                    p_direction: "outflow",
                    p_amount_usd: disputeAmountUsd,
                    p_provider: "stripe",
                    p_reference_type: "dispute",
                    p_reference_id: dispute.id,
                    p_settlement_id: capture.settlement_id,
                });

                // Notify buyer
                await supabase.from("notifications").insert({
                    user_id: capture.buyer_id,
                    content:
                        `⚠️ A chargeback of $${disputeAmountUsd.toFixed(2)} has been filed. Please contact support.`,
                    link_url: "/earnings",
                });
            }

            return jsonOk({ received: true }, corsHeaders);
        }

        case "charge.dispute.closed": {
            const dispute = event.data.object;
            const chargeId = dispute.charge;
            const disputeStatus = dispute.status; // won, lost, etc.

            console.log(
                `Processing charge.dispute.closed: charge=${chargeId}, status=${disputeStatus}`,
            );

            // Find associated buyer debt
            const { data: debt } = await supabase
                .from("buyer_debts")
                .select("*")
                .eq("stripe_payment_intent_id", chargeId)
                .eq("reason", "chargeback")
                .single();

            if (debt) {
                if (disputeStatus === "won") {
                    // We won — resolve debt, re-credit bank ledger
                    await supabase
                        .from("buyer_debts")
                        .update({
                            status: "recovered",
                            recovered_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            metadata: {
                                ...debt.metadata,
                                dispute_result: "won",
                            },
                        })
                        .eq("id", debt.id);

                    // Bank re-credit
                    await supabase.rpc("append_bank_ledger_entry", {
                        p_event_type: "stripe_payout_received",
                        p_direction: "inflow",
                        p_amount_usd: debt.amount_usd,
                        p_provider: "stripe",
                        p_reference_type: "dispute_won",
                        p_reference_id: dispute.id,
                        p_settlement_id: debt.settlement_id,
                    });
                } else {
                    // We lost — debt remains, write off if needed
                    await supabase
                        .from("buyer_debts")
                        .update({
                            updated_at: new Date().toISOString(),
                            metadata: {
                                ...debt.metadata,
                                dispute_result: disputeStatus,
                            },
                        })
                        .eq("id", debt.id);
                }
            }

            return jsonOk({ received: true }, corsHeaders);
        }

        default:
            console.log(`Unhandled event type: ${event.type}`);
            return jsonOk({ received: true }, corsHeaders);
    }
}, { extraCorsHeaders: "stripe-signature", errorStatus: 500 });

// ============================================================================
// Stripe Signature Verification (HMAC-SHA256)
// ============================================================================
async function verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string,
): Promise<boolean> {
    try {
        // Parse Stripe signature header: t=timestamp,v1=hash
        const parts = signature.split(",");
        const timestampPart = parts.find((p) => p.startsWith("t="));
        const signaturePart = parts.find((p) => p.startsWith("v1="));

        if (!timestampPart || !signaturePart) return false;

        const timestamp = timestampPart.split("=")[1];
        const expectedSig = signaturePart.split("=")[1];

        // Construct signed payload
        const signedPayload = `${timestamp}.${payload}`;

        // Compute HMAC
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );

        const mac = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(signedPayload),
        );

        const computedSig = Array.from(new Uint8Array(mac))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        return computedSig === expectedSig;
    } catch (e) {
        console.error("Signature verification error:", e);
        return false;
    }
}
