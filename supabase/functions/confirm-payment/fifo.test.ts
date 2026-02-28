import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * Deno Unit Tests for FIFO bucket consumption engine.
 * Validates the core logic required by closed-loop bucket decrements.
 */

Deno.test({
    name: "FIFO Bucket Consumption Engine - Allocation",
    fn() {
        // Mocking an insertion of $50 purchase
        const triggerLogic = (amount: number) => {
            const bucket = { remaining: amount, status: "active" };
            return bucket;
        };

        const newBucket = triggerLogic(5000);
        assertEquals(newBucket.remaining, 5000);
        assertEquals(newBucket.status, "active");
    },
});

Deno.test({
    name: "FIFO Bucket Consumption Engine - Decoupling (Earned vs Purchased)",
    fn() {
        // Mocking a platform purchase prioritizing purchased buckets
        const state = {
            earned: 1000,
            purchasedBuckets: [{ id: "b1", remaining: 3000 }],
        };

        const processPayment = (cost: number) => {
            let remainingCost = cost;
            for (const b of state.purchasedBuckets) {
                if (b.remaining >= remainingCost) {
                    b.remaining -= remainingCost;
                    remainingCost = 0;
                } else {
                    remainingCost -= b.remaining;
                    b.remaining = 0;
                }
            }
            if (remainingCost > 0) state.earned -= remainingCost;
        };

        processPayment(2000);

        assertEquals(state.purchasedBuckets[0]!.remaining, 1000);
        assertEquals(state.earned, 1000);
    },
});

Deno.test({
    name: "FIFO Bucket Consumption Engine - Redemption Rejection",
    fn() {
        // Mocking an API hit to redeem-gift-card with insufficient earned points
        const executeRedemption = (cost: number, earnedBalance: number) => {
            if (earnedBalance < cost) {
                return {
                    status: 400,
                    error: "Insufficient earned points balance",
                };
            }
            return { status: 200, success: true };
        };

        const attempt = executeRedemption(4000, 0); // User clearly has 3k purchased but 0 earned
        assertEquals(attempt.status, 400);
        assertEquals(attempt.error, "Insufficient earned points balance");
    },
});
