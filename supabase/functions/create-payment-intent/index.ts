import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * create-payment-intent — Supabase Edge Function
 *
 * Creates a payment transaction and, if in Stripe mode, a Stripe PaymentIntent.
 * In mock mode, creates the transaction and immediately confirms it (credits points).
 *
 * Request body: { amountCents: number, pointsAmount: number, serviceFeeCents?: number, provider?: 'mock' | 'stripe' }
 * Response: { clientSecret: string, transactionId: string, provider: string }
 *
 * Environment variables:
 *   - STRIPE_SECRET_KEY: Stripe secret key (required for stripe provider)
 *   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: Supabase credentials
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const MIN_AMOUNT_CENTS = 50;
const MAX_AMOUNT_CENTS = 100_000;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
            "SUPABASE_SERVICE_ROLE_KEY",
        );
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Parse request
        const {
            amountCents,
            pointsAmount,
            serviceFeeCents = 0,
            provider = "mock",
        } = await req.json();

        // Validate
        if (!amountCents || typeof amountCents !== "number") {
            throw new Error("amountCents is required and must be a number");
        }
        if (!pointsAmount || typeof pointsAmount !== "number") {
            throw new Error("pointsAmount is required and must be a number");
        }
        if (amountCents < MIN_AMOUNT_CENTS) {
            throw new Error(
                `Amount must be at least $${
                    (MIN_AMOUNT_CENTS / 100).toFixed(2)
                }`,
            );
        }
        if (amountCents > MAX_AMOUNT_CENTS) {
            throw new Error(
                `Amount cannot exceed $${(MAX_AMOUNT_CENTS / 100).toFixed(2)}`,
            );
        }

        // Authenticate user
        const authHeader = req.headers.get("authorization");
        let userId: string | null = null;

        if (authHeader) {
            const token = authHeader.replace("Bearer ", "");
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id || null;
        }

        if (!userId) {
            return new Response(
                JSON.stringify({ error: "Authentication required" }),
                {
                    status: 401,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // ─── STRIPE MODE ───────────────────────────────────────────────
        if (provider === "stripe") {
            if (!STRIPE_SECRET_KEY) {
                throw new Error("STRIPE_SECRET_KEY is not configured");
            }

            // Create Stripe PaymentIntent
            const piResponse = await fetch(
                "https://api.stripe.com/v1/payment_intents",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                        amount: String(Math.round(amountCents)),
                        currency: "usd",
                        "metadata[user_id]": userId,
                        "metadata[type]": "buy_points",
                        "metadata[points_amount]": String(pointsAmount),
                        description:
                            `CasaGrown Points Purchase — ${pointsAmount} points`,
                    }),
                },
            );

            if (!piResponse.ok) {
                const error = await piResponse.json();
                console.error("Stripe error:", error);
                throw new Error(
                    error?.error?.message || "Stripe payment creation failed",
                );
            }

            const intentData = await piResponse.json();

            // Record in payment_transactions (status: pending, webhook will confirm)
            const { data: txn, error: txnError } = await supabase
                .from("payment_transactions")
                .insert({
                    user_id: userId,
                    stripe_payment_intent_id: intentData.id,
                    stripe_client_secret: intentData.client_secret,
                    amount_cents: amountCents,
                    service_fee_cents: serviceFeeCents,
                    points_amount: pointsAmount,
                    status: "pending",
                    provider: "stripe",
                })
                .select("id")
                .single();

            if (txnError) {
                console.error(
                    "Failed to create payment_transaction:",
                    txnError,
                );
                throw new Error("Failed to record transaction");
            }

            console.log(
                `✅ [STRIPE] PaymentIntent created: ${intentData.id}, txn: ${txn.id}, ` +
                    `amount: $${
                        (amountCents / 100).toFixed(2)
                    }, user: ${userId}`,
            );

            return new Response(
                JSON.stringify({
                    clientSecret: intentData.client_secret,
                    transactionId: txn.id,
                    intentId: intentData.id,
                    provider: "stripe",
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

        // ─── MOCK MODE ─────────────────────────────────────────────────
        const mockSecret = `mock_secret_${Date.now()}_${
            crypto.randomUUID().slice(0, 8)
        }`;

        // Create payment_transaction record (status: pending)
        const { data: txn, error: txnError } = await supabase
            .from("payment_transactions")
            .insert({
                user_id: userId,
                stripe_payment_intent_id: `mock_pi_${Date.now()}`,
                stripe_client_secret: mockSecret,
                amount_cents: amountCents,
                service_fee_cents: serviceFeeCents,
                points_amount: pointsAmount,
                status: "pending",
                provider: "mock",
            })
            .select("id")
            .single();

        if (txnError) {
            console.error("Failed to create payment_transaction:", txnError);
            throw new Error("Failed to record transaction");
        }

        console.log(
            `✅ [MOCK] Transaction created: ${txn.id}, ` +
                `amount: $${
                    (amountCents / 100).toFixed(2)
                }, points: ${pointsAmount}, user: ${userId}`,
        );

        return new Response(
            JSON.stringify({
                clientSecret: mockSecret,
                transactionId: txn.id,
                provider: "mock",
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (error: unknown) {
        const message = error instanceof Error
            ? error.message
            : "Unknown error";
        console.error("create-payment-intent error:", error);
        return new Response(
            JSON.stringify({ error: message }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});
