import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
            "SUPABASE_SERVICE_ROLE_KEY",
        );
        const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase credentials");
        }

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
                return new Response(
                    JSON.stringify({ error: "Invalid signature" }),
                    {
                        status: 401,
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json",
                        },
                    },
                );
            }
        } else if (STRIPE_WEBHOOK_SECRET && !signature) {
            console.error("Missing stripe-signature header");
            return new Response(
                JSON.stringify({ error: "Missing signature" }),
                {
                    status: 401,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const event = JSON.parse(body);
        console.log(`Stripe webhook received: ${event.type}, id: ${event.id}`);

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
                    return new Response(
                        JSON.stringify({
                            received: true,
                            warning: "Transaction not found",
                        }),
                        {
                            status: 200,
                            headers: {
                                ...corsHeaders,
                                "Content-Type": "application/json",
                            },
                        },
                    );
                }

                // Already processed (idempotency)
                if (txn.status === "succeeded") {
                    console.log(
                        `Payment ${txn.id} already confirmed, skipping`,
                    );
                    return new Response(
                        JSON.stringify({
                            received: true,
                            alreadyProcessed: true,
                        }),
                        {
                            status: 200,
                            headers: {
                                ...corsHeaders,
                                "Content-Type": "application/json",
                            },
                        },
                    );
                }

                // Call confirm-payment to credit points
                const { data: confirmResult, error: confirmError } =
                    await supabase.functions
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

                return new Response(
                    JSON.stringify({ received: true, ...confirmResult }),
                    {
                        status: 200,
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json",
                        },
                    },
                );
            }

            case "payment_intent.payment_failed": {
                const paymentIntent = event.data.object;
                const stripeId = paymentIntent.id;
                const failureMessage =
                    paymentIntent.last_payment_error?.message ||
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

                return new Response(
                    JSON.stringify({ received: true }),
                    {
                        status: 200,
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json",
                        },
                    },
                );
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
                return new Response(
                    JSON.stringify({ received: true }),
                    {
                        status: 200,
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json",
                        },
                    },
                );
        }
    } catch (error: unknown) {
        const message = error instanceof Error
            ? error.message
            : "Unknown error";
        console.error("stripe-webhook error:", error);
        return new Response(
            JSON.stringify({ error: message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});

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
