import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * resolve-pending-payments — Supabase Edge Function
 *
 * Called on app open to check for any payment_transactions stuck in 'pending' status.
 * If any are found:
 *   - For mock payments: automatically confirms them (credits points)
 *   - For stripe payments: checks with Stripe API if the payment actually succeeded
 *     and confirms if so
 *
 * This handles the edge case where:
 *   - The app was killed before the frontend could process the confirmation
 *   - The webhook was delayed or failed and hasn't retried yet
 *
 * Request: GET (authenticated)
 * Response: { resolved: PaymentTransaction[], pending: PaymentTransaction[] }
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
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
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

        // Fetch pending transactions for this user
        const { data: pendingTxns, error: fetchError } = await supabase
            .from("payment_transactions")
            .select("*")
            .eq("user_id", userId)
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (fetchError) {
            throw new Error(
                `Failed to fetch pending transactions: ${fetchError.message}`,
            );
        }

        if (!pendingTxns || pendingTxns.length === 0) {
            return new Response(
                JSON.stringify({
                    resolved: [],
                    pending: [],
                    message: "No pending transactions",
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

        console.log(
            `Found ${pendingTxns.length} pending transaction(s) for user ${userId}`,
        );

        const resolved: Array<{ id: string; points: number; status: string }> =
            [];
        const stillPending: Array<
            { id: string; points: number; provider: string; createdAt: string }
        > = [];

        for (const txn of pendingTxns) {
            // Check if transaction is stale (> 24 hours old) — mark as failed
            const ageMs = Date.now() - new Date(txn.created_at).getTime();
            const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

            if (ageMs > MAX_AGE_MS) {
                console.log(
                    `Transaction ${txn.id} is stale (${
                        Math.round(ageMs / 3600000)
                    }h old), marking failed`,
                );
                await supabase
                    .from("payment_transactions")
                    .update({
                        status: "failed",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", txn.id);
                continue;
            }

            if (txn.provider === "mock") {
                // Mock payments that are still pending should be auto-confirmed
                // (this means the app was killed during the 2s simulated delay)
                console.log(`Auto-confirming mock transaction ${txn.id}`);

                const { data: confirmResult, error: confirmError } =
                    await supabase.functions
                        .invoke("confirm-payment", {
                            body: { paymentTransactionId: txn.id },
                        });

                if (confirmError || !confirmResult?.success) {
                    console.error(
                        `Failed to confirm mock txn ${txn.id}:`,
                        confirmError || confirmResult,
                    );
                    stillPending.push({
                        id: txn.id,
                        points: txn.points_amount,
                        provider: txn.provider,
                        createdAt: txn.created_at,
                    });
                } else {
                    resolved.push({
                        id: txn.id,
                        points: confirmResult.pointsAmount,
                        status: "succeeded",
                    });
                }
            } else if (txn.provider === "stripe") {
                // Check Stripe API for actual payment status
                if (!STRIPE_SECRET_KEY) {
                    console.warn(
                        "STRIPE_SECRET_KEY not configured, cannot verify Stripe payment",
                    );
                    stillPending.push({
                        id: txn.id,
                        points: txn.points_amount,
                        provider: txn.provider,
                        createdAt: txn.created_at,
                    });
                    continue;
                }

                const stripeId = txn.stripe_payment_intent_id;
                if (!stripeId || stripeId.startsWith("mock_")) {
                    stillPending.push({
                        id: txn.id,
                        points: txn.points_amount,
                        provider: txn.provider,
                        createdAt: txn.created_at,
                    });
                    continue;
                }

                // Fetch PaymentIntent from Stripe
                const piResponse = await fetch(
                    `https://api.stripe.com/v1/payment_intents/${stripeId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                        },
                    },
                );

                if (!piResponse.ok) {
                    console.error(
                        `Failed to fetch Stripe PI ${stripeId}:`,
                        await piResponse.text(),
                    );
                    stillPending.push({
                        id: txn.id,
                        points: txn.points_amount,
                        provider: txn.provider,
                        createdAt: txn.created_at,
                    });
                    continue;
                }

                const pi = await piResponse.json();

                if (pi.status === "succeeded") {
                    // Payment succeeded on Stripe side — credit points
                    console.log(
                        `Stripe PI ${stripeId} succeeded, confirming points`,
                    );

                    const { data: confirmResult, error: confirmError } =
                        await supabase.functions
                            .invoke("confirm-payment", {
                                body: { paymentTransactionId: txn.id },
                            });

                    if (confirmError || !confirmResult?.success) {
                        console.error(
                            `Failed to confirm Stripe txn ${txn.id}:`,
                            confirmError || confirmResult,
                        );
                        stillPending.push({
                            id: txn.id,
                            points: txn.points_amount,
                            provider: txn.provider,
                            createdAt: txn.created_at,
                        });
                    } else {
                        resolved.push({
                            id: txn.id,
                            points: confirmResult.pointsAmount,
                            status: "succeeded",
                        });
                    }
                } else if (
                    pi.status === "canceled" ||
                    pi.status === "requires_payment_method"
                ) {
                    // Payment failed — mark as failed
                    console.log(
                        `Stripe PI ${stripeId} status: ${pi.status}, marking failed`,
                    );
                    await supabase
                        .from("payment_transactions")
                        .update({
                            status: "failed",
                            metadata: { stripe_status: pi.status },
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", txn.id);
                } else {
                    // Still processing (requires_confirmation, processing, etc.)
                    stillPending.push({
                        id: txn.id,
                        points: txn.points_amount,
                        provider: txn.provider,
                        createdAt: txn.created_at,
                    });
                }
            }
        }

        console.log(
            `Resolved ${resolved.length} transaction(s), ${stillPending.length} still pending`,
        );

        return new Response(
            JSON.stringify({ resolved, pending: stillPending }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (error: unknown) {
        const message = error instanceof Error
            ? error.message
            : "Unknown error";
        console.error("resolve-pending-payments error:", error);
        return new Response(
            JSON.stringify({ error: message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});
