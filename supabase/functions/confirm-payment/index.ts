import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * confirm-payment — Supabase Edge Function
 *
 * Called after a payment is confirmed (by webhook for Stripe, directly for mock).
 * Credits points to the user by inserting into point_ledger and updating
 * the payment_transactions record.
 *
 * This is the SINGLE source of truth for crediting points from purchases.
 * Both mock and Stripe flows converge here.
 *
 * Request body: { paymentTransactionId: string }
 * Response: { success: boolean, pointsAmount: number, newBalance: number }
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

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { paymentTransactionId } = await req.json();

        if (!paymentTransactionId) {
            throw new Error("paymentTransactionId is required");
        }

        // 1. Fetch the payment transaction
        const { data: txn, error: txnError } = await supabase
            .from("payment_transactions")
            .select("*")
            .eq("id", paymentTransactionId)
            .single();

        if (txnError || !txn) {
            throw new Error(
                `Payment transaction not found: ${
                    txnError?.message || "no data"
                }`,
            );
        }

        // Idempotency: if already succeeded, return existing result
        if (txn.status === "succeeded" && txn.point_ledger_id) {
            console.log(
                `Payment ${paymentTransactionId} already confirmed, returning cached result`,
            );
            return new Response(
                JSON.stringify({
                    success: true,
                    pointsAmount: txn.points_amount,
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

        // 2. Insert point_ledger entry
        // balance_after is auto-computed by DB trigger (trg_compute_balance_after)
        const { data: ledgerEntry, error: ledgerError } = await supabase
            .from("point_ledger")
            .insert({
                user_id: txn.user_id,
                type: "purchase",
                amount: txn.points_amount,
                balance_after: 0, // overridden by DB trigger
                reference_id: txn.id,
                metadata: {
                    payment_transaction_id: txn.id,
                    stripe_payment_intent_id: txn.stripe_payment_intent_id,
                    provider: txn.provider,
                    amount_cents: txn.amount_cents,
                    service_fee_cents: txn.service_fee_cents,
                },
            })
            .select()
            .single();

        if (ledgerError) {
            throw new Error(
                `Failed to create point_ledger entry: ${ledgerError.message}`,
            );
        }

        // 4. Update payment_transaction status
        const { error: updateError } = await supabase
            .from("payment_transactions")
            .update({
                status: "succeeded",
                point_ledger_id: ledgerEntry.id,
                webhook_received_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", paymentTransactionId);

        if (updateError) {
            console.error("Failed to update payment_transaction:", updateError);
            // Points were already credited, don't throw — just log
        }

        console.log(
            `✅ Payment confirmed: txn=${paymentTransactionId}, user=${txn.user_id}, ` +
                `points=+${txn.points_amount}, newBalance=${ledgerEntry.balance_after}, provider=${txn.provider}`,
        );

        return new Response(
            JSON.stringify({
                success: true,
                pointsAmount: txn.points_amount,
                newBalance: ledgerEntry.balance_after,
                ledgerEntryId: ledgerEntry.id,
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
        console.error("confirm-payment error:", error);
        return new Response(
            JSON.stringify({ error: message }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});
