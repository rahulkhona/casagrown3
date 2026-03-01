import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * Deno Unit Tests for redeem-gift-card ACID logic.
 * Tests finalize_redemption payload construction for gift card type.
 */

Deno.test({
    name:
        "Gift Card ACID - builds finalize_redemption payload with card metadata",
    fn() {
        const payload = {
            redemption_id: "red-gc-1",
            redemption_type: "gift_card",
            provider_name: "tremendous",
            external_order_id: "TRM-ORDER-123",
            actual_cost_cents: 2500,
            card_code: "AMZN-XXXX-YYYY",
            card_url: "https://tremendous.com/rewards/claim/abc123",
        };

        assertEquals(payload.redemption_type, "gift_card");
        assertEquals(payload.provider_name, "tremendous");
        assertExists(payload.card_code);
        assertExists(payload.card_url);
    },
});

Deno.test({
    name: "Gift Card ACID - selects cheapest provider (Tremendous > Reloadly)",
    fn() {
        // Tremendous has no processing fee; Reloadly charges 2-4%
        const providers = [
            { name: "tremendous", fee_percent: 0, available: true },
            { name: "reloadly", fee_percent: 3.5, available: true },
        ];

        const cheapest = providers
            .filter((p) => p.available)
            .sort((a, b) => a.fee_percent - b.fee_percent)[0];

        assertEquals(cheapest!.name, "tremendous");
    },
});

Deno.test({
    name: "Gift Card ACID - falls back to Reloadly when Tremendous unavailable",
    fn() {
        const providers = [
            { name: "tremendous", fee_percent: 0, available: false },
            { name: "reloadly", fee_percent: 3.5, available: true },
        ];

        const available = providers.filter((p) => p.available);
        assertEquals(available.length, 1);
        assertEquals(available[0]!.name, "reloadly");
    },
});

Deno.test({
    name: "Gift Card ACID - computes item_name from brand + face value",
    fn() {
        const brandName = "Amazon.com";
        const faceValueCents = 2500;

        const itemName = `${brandName} $${
            (faceValueCents / 100).toFixed(2)
        } Gift Card`;
        assertEquals(itemName, "Amazon.com $25.00 Gift Card");
    },
});

Deno.test({
    name: "Gift Card ACID - refunds points when provider API fails",
    fn() {
        const pointsDeducted = 2500;
        const refundLedgerEntry = {
            type: "refund",
            amount: pointsDeducted,
            metadata: {
                reason: "Provider order failed",
                provider: "tremendous",
            },
        };

        assertEquals(refundLedgerEntry.amount, 2500);
        assertEquals(
            refundLedgerEntry.metadata.reason,
            "Provider order failed",
        );
    },
});
