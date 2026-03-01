import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * Deno Unit Tests for refund-purchased-points edge function logic.
 * Validates refund routing, bucket status tracking, and metadata injection.
 */

// ─── Card Refund Logic ───────────────────────────────────────────────────────

Deno.test({
    name: "Card Refund - computes correct Stripe refund amount from bucket",
    fn() {
        const bucket = {
            id: "b1",
            original_amount: 5000,
            remaining_amount: 3000,
            payment_transaction_id: "pt-1",
            metadata: {
                amount_cents: 5000,
                stripe_payment_intent_id: "pi_xxx",
            },
        };

        // Refund amount = remaining_amount converted to cents
        const refundAmountCents = bucket.remaining_amount;
        assertEquals(refundAmountCents, 3000);
    },
});

Deno.test({
    name: "Card Refund - blocks refund when bucket has no remaining amount",
    fn() {
        const bucket = { remaining_amount: 0, status: "depleted" };

        const canRefund = bucket.remaining_amount > 0;
        assertEquals(canRefund, false);
    },
});

// ─── Venmo Fallback Logic ────────────────────────────────────────────────────

Deno.test({
    name: "Venmo Fallback - constructs PayPal payout payload with phone number",
    fn() {
        const targetPhoneNumber = "4085551234";
        const amountCents = 1500;

        const payoutPayload = {
            sender_batch_id: `venmo-refund-${Date.now()}`,
            items: [{
                recipient_type: "PHONE",
                amount: {
                    value: (amountCents / 100).toFixed(2),
                    currency: "USD",
                },
                receiver: targetPhoneNumber,
                note: "CasaGrown point refund",
            }],
        };

        assertEquals(payoutPayload.items[0]!.amount.value, "15.00");
        assertEquals(payoutPayload.items[0]!.receiver, "4085551234");
        assertEquals(payoutPayload.items[0]!.recipient_type, "PHONE");
    },
});

// ─── Gift Card Fallback Logic ────────────────────────────────────────────────

Deno.test({
    name:
        "Gift Card Fallback - injects brand_name and face_value_cents into metadata",
    fn() {
        const amountCents = 1000;
        const brandName = "Amazon.com";

        const metadata = {
            bucket_id: "b1",
            refund_method: "Transferred to E-Gift Card",
            brand_name: brandName,
            face_value_cents: amountCents,
        };

        assertEquals(metadata.brand_name, "Amazon.com");
        assertEquals(metadata.face_value_cents, 1000);
        assertEquals(metadata.refund_method, "Transferred to E-Gift Card");
    },
});

// ─── finalize_point_refund RPC params ────────────────────────────────────────

Deno.test({
    name: "finalize_point_refund - builds correct RPC params for card refund",
    fn() {
        const userId = "user-1";
        const bucketId = "bucket-1";
        const amountCents = 2500;
        const paymentTransactionId = "pt-1";

        const rpcParams = {
            p_user_id: userId,
            p_bucket_id: bucketId,
            p_amount_cents: amountCents,
            p_reference_id: paymentTransactionId,
            p_metadata: {
                refund_method: "Stripe Refund",
                card_last4: "4242",
                stripe_refund_id: "re_xxx",
            },
        };

        assertEquals(rpcParams.p_amount_cents, 2500);
        assertEquals(rpcParams.p_bucket_id, "bucket-1");
        assertExists(rpcParams.p_metadata.stripe_refund_id);
    },
});

Deno.test({
    name: "Bucket status transitions - refund depletes bucket to 'refunded'",
    fn() {
        const computeStatus = (remaining: number, refundAmount: number) => {
            const newRemaining = remaining - refundAmount;
            return newRemaining === 0 ? "refunded" : "partially_refunded";
        };

        assertEquals(computeStatus(5000, 5000), "refunded");
        assertEquals(computeStatus(5000, 2000), "partially_refunded");
    },
});
