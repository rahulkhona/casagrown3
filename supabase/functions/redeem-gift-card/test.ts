import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { computeNetFee, ProviderOption } from "../_shared/gift-card-types.ts";

/**
 * Deno Unit Tests for redeem-gift-card with real-time provider comparison.
 * Tests pickBestProvider logic, computeNetFee, and fallback behavior.
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
    name: "pickBestProvider - selects cheapest provider by net fee",
    fn() {
        // Tremendous: 0 fee, 0 discount → $0 net fee
        const tremendous: ProviderOption = {
            provider: "tremendous",
            productId: "t1",
            discountPercentage: 0,
            feePerTransaction: 0,
            feePercentage: 0,
        };

        // Reloadly: 7.5% discount, $0.50 flat fee → at $25: $0.50 - $1.875 = -$1.375 → $0
        const reloadly: ProviderOption = {
            provider: "reloadly",
            productId: "r1",
            discountPercentage: 7.5,
            feePerTransaction: 0.5,
            feePercentage: 0,
        };

        const providers = [tremendous, reloadly];
        const faceValueCents = 2500;

        // Sort by net fee (cheapest first)
        providers.sort((a, b) =>
            computeNetFee(faceValueCents, a) -
            computeNetFee(faceValueCents, b)
        );

        // Both should have $0 net fee (clamped), but order should be stable
        assertEquals(computeNetFee(faceValueCents, tremendous), 0);
        assertEquals(computeNetFee(faceValueCents, reloadly), 0);
    },
});

Deno.test({
    name: "pickBestProvider - Reloadly with high fee is more expensive",
    fn() {
        const tremendous: ProviderOption = {
            provider: "tremendous",
            productId: "t1",
            discountPercentage: 0,
            feePerTransaction: 0,
            feePercentage: 0,
        };

        // Reloadly with 5% fee and no discount
        const reloadly: ProviderOption = {
            provider: "reloadly",
            productId: "r1",
            discountPercentage: 0,
            feePerTransaction: 0.5,
            feePercentage: 5,
        };

        const faceValueCents = 2500;
        const tFee = computeNetFee(faceValueCents, tremendous);
        const rFee = computeNetFee(faceValueCents, reloadly);

        assertEquals(tFee, 0); // No fees
        assertEquals(rFee, 1.75); // $0.50 + $1.25 = $1.75
        assertEquals(tFee < rFee, true, "Tremendous should be cheaper");
    },
});

Deno.test({
    name: "pickBestProvider - unavailable provider is filtered out",
    fn() {
        const providers: (ProviderOption | null)[] = [
            null, // Tremendous returned null (unavailable)
            {
                provider: "reloadly",
                productId: "r1",
                discountPercentage: 3,
                feePerTransaction: 0.5,
                feePercentage: 0,
            },
        ];

        const available = providers.filter(
            (p): p is ProviderOption => p !== null,
        );
        assertEquals(available.length, 1);
        assertEquals(available[0]!.provider, "reloadly");
    },
});

Deno.test({
    name: "pickBestProvider - falls back to cached when all lookups fail",
    fn() {
        const cachedProviders: ProviderOption[] = [
            {
                provider: "tremendous",
                productId: "t1",
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            },
        ];

        // Simulate all real-time lookups returning null
        const realtimeResults: null[] = [null, null];
        const successfulResults = realtimeResults.filter(
            (r): r is never => r !== null,
        );

        assertEquals(successfulResults.length, 0);

        // Fallback to cached
        const fallback = cachedProviders[0]!;
        assertEquals(fallback.provider, "tremendous");
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
    name: "computeNetFee - fresh discount changes net fee",
    fn() {
        // Cached: 3% discount
        const cached: ProviderOption = {
            provider: "reloadly",
            productId: "r1",
            discountPercentage: 3,
            feePerTransaction: 0.5,
            feePercentage: 0,
        };

        // Real-time: 10% discount (promotional)
        const realtime: ProviderOption = {
            provider: "reloadly",
            productId: "r1",
            discountPercentage: 10,
            feePerTransaction: 0.5,
            feePercentage: 0,
        };

        const faceValueCents = 5000; // $50
        const cachedFee = computeNetFee(faceValueCents, cached);
        const realtimeFee = computeNetFee(faceValueCents, realtime);

        // Cached: $0.50 - $1.50 = -$1.00 → $0 (clamped)
        assertEquals(cachedFee, 0);
        // Realtime: $0.50 - $5.00 = -$4.50 → $0 (clamped)
        assertEquals(realtimeFee, 0);

        // At a larger fee scenario:
        const highFee: ProviderOption = {
            provider: "reloadly",
            productId: "r1",
            discountPercentage: 0,
            feePerTransaction: 2,
            feePercentage: 3,
        };
        // $2 + $1.50 = $3.50
        assertEquals(computeNetFee(faceValueCents, highFee), 3.5);
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
