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
