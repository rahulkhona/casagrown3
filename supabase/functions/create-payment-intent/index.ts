import {
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

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

const MIN_AMOUNT_CENTS = 50;
const MAX_AMOUNT_CENTS = 100_000;

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");

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
            `Amount must be at least $${(MIN_AMOUNT_CENTS / 100).toFixed(2)}`,
        );
    }
    if (amountCents > MAX_AMOUNT_CENTS) {
        throw new Error(
            `Amount cannot exceed $${(MAX_AMOUNT_CENTS / 100).toFixed(2)}`,
        );
    }

    // Authenticate user
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

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

        // Record in payment_transactions
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
                `amount: $${(amountCents / 100).toFixed(2)}, user: ${userId}`,
        );

        return jsonOk({
            clientSecret: intentData.client_secret,
            transactionId: txn.id,
            intentId: intentData.id,
            provider: "stripe",
        }, corsHeaders);
    }

    // ─── MOCK MODE ─────────────────────────────────────────────────
    const mockSecret = `mock_secret_${Date.now()}_${
        crypto.randomUUID().slice(0, 8)
    }`;

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

    return jsonOk({
        clientSecret: mockSecret,
        transactionId: txn.id,
        provider: "mock",
    }, corsHeaders);
});
