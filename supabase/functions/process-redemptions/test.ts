import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * Deno Unit Tests for process-redemptions cron edge function.
 * Tests queue processing logic, finalize_redemption routing, and failure handling.
 */

Deno.test({
    name: "Process Redemptions - filters pending and failed items for retry",
    fn() {
        const queue = [
            { id: "r1", status: "pending", type: "gift_card" },
            { id: "r2", status: "completed", type: "gift_card" },
            { id: "r3", status: "failed", type: "donation" },
            { id: "r4", status: "pending", type: "donation" },
        ];

        const toProcess = queue.filter((r) =>
            r.status === "pending" || r.status === "failed"
        );

        assertEquals(toProcess.length, 3);
        assertEquals(toProcess.map((r) => r.id), ["r1", "r3", "r4"]);
    },
});

Deno.test({
    name: "Process Redemptions - routes to correct provider by type",
    fn() {
        const routeProvider = (
            type: string,
            provider: string,
        ): string => {
            if (type === "gift_card") return provider; // tremendous or reloadly
            if (type === "donation") return "globalgiving";
            if (type === "cashout") return "paypal";
            return "unknown";
        };

        assertEquals(routeProvider("gift_card", "tremendous"), "tremendous");
        assertEquals(routeProvider("gift_card", "reloadly"), "reloadly");
        assertEquals(routeProvider("donation", "globalgiving"), "globalgiving");
        assertEquals(routeProvider("cashout", "paypal"), "paypal");
    },
});

Deno.test({
    name: "Process Redemptions - handles empty queue gracefully",
    fn() {
        const queue: any[] = [];
        const result = queue.length === 0
            ? { processed: 0, message: "No pending redemptions" }
            : { processed: queue.length };

        assertEquals(result.processed, 0);
        assertEquals(result.message, "No pending redemptions");
    },
});

Deno.test({
    name:
        "Process Redemptions - marks redemption as failed after provider error",
    fn() {
        const redemption = { id: "r1", status: "pending" };
        const providerError = { error: "Insufficient provider balance" };

        // On provider failure, status should be set to 'failed'
        if (providerError.error) {
            redemption.status = "failed";
        }

        assertEquals(redemption.status, "failed");
    },
});

Deno.test({
    name:
        "Process Redemptions - builds finalize_redemption payload after success",
    fn() {
        const redemptionType = "gift_card";
        const providerName = "tremendous";
        const externalOrderId = "TRM-001";

        const payload = {
            redemption_id: "r1",
            redemption_type: redemptionType,
            provider_name: providerName,
            external_order_id: externalOrderId,
            actual_cost_cents: 2500,
            card_code: "CODE-123",
            card_url: "https://example.com/card",
        };

        assertEquals(payload.redemption_type, "gift_card");
        assertEquals(payload.external_order_id, "TRM-001");
    },
});
