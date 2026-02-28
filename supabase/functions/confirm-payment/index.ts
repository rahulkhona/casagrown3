import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";

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

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
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
            `Payment transaction not found: ${txnError?.message || "no data"}`,
        );
    }

    // Idempotency: if already succeeded, return existing result
    if (txn.status === "succeeded" && txn.point_ledger_id) {
        console.log(
            `Payment ${paymentTransactionId} already confirmed, returning cached result`,
        );
        return jsonOk({
            success: true,
            pointsAmount: txn.points_amount,
            alreadyProcessed: true,
        }, corsHeaders);
    }

    // 1.5 Fetch Stripe metadata if 'stripe'
    const cardMetadata: { last4?: string; brand?: string } = {};
    if (
        txn.provider === "stripe" && txn.stripe_payment_intent_id &&
        STRIPE_SECRET_KEY
    ) {
        try {
            const piResponse = await fetch(
                `https://api.stripe.com/v1/payment_intents/${txn.stripe_payment_intent_id}?expand[]=payment_method`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                    },
                },
            );
            if (piResponse.ok) {
                const intentData = await piResponse.json();
                const card = intentData?.payment_method?.card;
                if (card) {
                    cardMetadata.last4 = card.last4;
                    cardMetadata.brand = card.brand;
                }
            } else {
                console.error(
                    "Failed to fetch intent from Stripe:",
                    await piResponse.text(),
                );
            }
        } catch (e) {
            console.error("Error expanding Stripe payment intent:", e);
        }
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
                card_last4: cardMetadata.last4,
                card_brand: cardMetadata.brand,
            },
        })
        .select()
        .single();

    if (ledgerError) {
        throw new Error(
            `Failed to create point_ledger entry: ${ledgerError.message}`,
        );
    }

    // 3. Create purchased points bucket
    const { error: bucketError } = await supabase
        .from("purchased_points_buckets")
        .insert({
            user_id: txn.user_id,
            payment_transaction_id: txn.id,
            point_ledger_id: ledgerEntry.id,
            original_amount: txn.points_amount,
            remaining_amount: txn.points_amount,
            status: "active",
            metadata: {
                stripe_payment_intent_id: txn.stripe_payment_intent_id,
                provider: txn.provider,
                card_last4: cardMetadata.last4,
                card_brand: cardMetadata.brand,
            },
        });

    if (bucketError) {
        console.error("Failed to create purchased points bucket:", bucketError);
        // We log the error but do not fail the function, as the points are already credited to the ledger.
    }

    // 4. Update payment_transaction status
    const { error: updateError } = await supabase
        .from("payment_transactions")
        .update({
            status: "succeeded",
            point_ledger_id: ledgerEntry.id,
            webhook_received_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {
                ...(txn.metadata || {}),
                card_last4: cardMetadata.last4,
                card_brand: cardMetadata.brand,
            },
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

    return jsonOk({
        success: true,
        pointsAmount: txn.points_amount,
        newBalance: ledgerEntry.balance_after,
        ledgerEntryId: ledgerEntry.id,
    }, corsHeaders);
});
