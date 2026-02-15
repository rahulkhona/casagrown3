import {
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

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

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");

    // Authenticate user
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

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
        return jsonOk({
            resolved: [],
            pending: [],
            message: "No pending transactions",
        }, corsHeaders);
    }

    console.log(
        `Found ${pendingTxns.length} pending transaction(s) for user ${userId}`,
    );

    const resolved: Array<{ id: string; points: number; status: string }> = [];
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
            console.log(`Auto-confirming mock transaction ${txn.id}`);

            const { data: confirmResult, error: confirmError } = await supabase
                .functions
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
                // Still processing
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

    return jsonOk({ resolved, pending: stillPending }, corsHeaders);
}, { errorStatus: 500 });
