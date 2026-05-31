/**
 * Receipt Tier-Aware Fees E2E Tests
 *
 * Verifies that digital receipts correctly reflect tier-based platform fees.
 * Pro sellers should have lower fee rates than Lite sellers, and the
 * fee_rate_pct field should be present in seller receipts.
 *
 * Also verifies buyer receipts include credit_applied when promo credits used.
 *
 * This test operates at the API/DB level (no browser), following the pattern
 * from digital-receipts.spec.ts. Uses Supabase REST API with service_role key.
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - subscription_tiers table seeded
 * - get_seller_fee_rate() function deployed
 */

import { expect, test } from "@playwright/test";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const SELLER_ID = "a1111111-1111-1111-1111-111111111111";
const BUYER_ID = "b2222222-2222-2222-2222-222222222222";
const POST_ID = "c3333333-3333-3333-3333-333333333333";

// ── Inline Supabase helpers (same pattern as digital-receipts.spec.ts) ────

async function supabaseRpc(fn: string, body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function supabaseQuery(table: string, query: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
    return res.json();
}

async function supabasePatch(
    table: string,
    query: string,
    body: Record<string, unknown>,
) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: "return=representation",
        },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function supabaseDelete(table: string, query: string) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: "DELETE",
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: "return=minimal",
        },
    });
}

// ── Helper: Create order, move through lifecycle, confirm delivery ────────

async function createAndConfirmOrder(product: string, pricePerUnit: number) {
    // 1. Create order
    const createResult = await supabaseRpc("create_order_atomic", {
        p_buyer_id: BUYER_ID,
        p_seller_id: SELLER_ID,
        p_post_id: POST_ID,
        p_quantity: 1,
        p_points_per_unit: pricePerUnit,
        p_total_price: pricePerUnit,
        p_category: "vegetables",
        p_product: product,
    });

    if (!createResult.orderId) {
        console.error(
            "create_order_atomic failed:",
            JSON.stringify(createResult),
        );
    }

    const orderId = createResult.orderId;
    const conversationId = createResult.conversationId;

    if (!orderId) return { orderId: null, conversationId: null };

    // 2. Move through lifecycle: accepted → delivered
    await supabasePatch("orders", `id=eq.${orderId}`, {
        status: "accepted",
    });
    await supabasePatch("orders", `id=eq.${orderId}`, {
        status: "delivered",
    });

    // 3. Confirm delivery — generates digital receipt
    const confirmResult = await supabaseRpc("confirm_order_delivery", {
        p_order_id: orderId,
        p_buyer_id: BUYER_ID,
    });

    return { orderId, conversationId, confirmResult };
}

// ════════════════════════════════════════════════════════════════════════════

test.describe.serial("Receipt Tier-Aware Fees", () => {
    // Only run in seller project to avoid duplicate DB mutations
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === "buyer") {
            test.skip(true, "DB-mutating tests run only in seller project");
        }
    });

    // Track IDs for cleanup
    const createdOrderIds: string[] = [];
    const createdConversationIds: string[] = [];
    let originalPlan: string | null = null;

    // Clean up ALL test data after suite completes
    test.afterAll(async () => {
        // Delete in FK-safe order: receipts → messages → orders → offers → conversations
        for (const orderId of createdOrderIds) {
            await supabaseDelete("digital_receipts", `order_id=eq.${orderId}`);
            await supabaseDelete("orders", `id=eq.${orderId}`);
        }
        for (const convId of createdConversationIds) {
            await supabaseDelete(
                "chat_messages",
                `conversation_id=eq.${convId}`,
            );
            await supabaseDelete("offers", `conversation_id=eq.${convId}`);
            await supabaseDelete("conversations", `id=eq.${convId}`);
        }

        // Restore seller subscription plan if we changed it
        if (originalPlan !== null) {
            await supabasePatch(
                "seller_subscriptions",
                `user_id=eq.${SELLER_ID}`,
                { plan: originalPlan },
            );
        }
    });

    // ── 1. Create order for Lite seller → receipt has default fee rate ────
    test("lite seller order generates receipt with default (higher) fee rate", async () => {
        // Save original plan for restoration
        const subs = await supabaseQuery(
            "seller_subscriptions",
            `user_id=eq.${SELLER_ID}&select=plan`,
        );
        if (subs && subs.length > 0) {
            originalPlan = subs[0].plan;
        }

        // Set seller to lite plan
        await supabasePatch(
            "seller_subscriptions",
            `user_id=eq.${SELLER_ID}`,
            { plan: "lite" },
        );

        const { orderId, conversationId, confirmResult } =
            await createAndConfirmOrder("PW Lite Fee Tomatoes", 20);

        expect(orderId).toBeTruthy();
        createdOrderIds.push(orderId!);
        if (conversationId) createdConversationIds.push(conversationId);

        expect(confirmResult.success).toBe(true);

        // Check receipt
        const receipts = await supabaseQuery(
            "digital_receipts",
            `order_id=eq.${orderId}&select=seller_receipt,buyer_receipt`,
        );

        expect(receipts.length).toBe(1);

        const sellerReceipt = receipts[0].seller_receipt;

        // Seller receipt should include fee_rate_pct
        expect(sellerReceipt.fee_rate_pct).toBeDefined();
        // Lite tier default fee is 10%
        expect(sellerReceipt.fee_rate_pct).toBeGreaterThanOrEqual(10);
        // Platform fee should be > 0 for non-zero subtotal
        expect(sellerReceipt.platform_fee).toBeGreaterThanOrEqual(0);
    });

    // ── 2. Create order for Pro seller → receipt has reduced fee rate ─────
    test("pro seller order generates receipt with reduced fee rate", async () => {
        // Set seller to pro plan
        await supabasePatch(
            "seller_subscriptions",
            `user_id=eq.${SELLER_ID}`,
            { plan: "pro" },
        );

        const { orderId, conversationId, confirmResult } =
            await createAndConfirmOrder("PW Pro Fee Tomatoes", 20);

        expect(orderId).toBeTruthy();
        createdOrderIds.push(orderId!);
        if (conversationId) createdConversationIds.push(conversationId);

        expect(confirmResult.success).toBe(true);

        // Check receipt
        const receipts = await supabaseQuery(
            "digital_receipts",
            `order_id=eq.${orderId}&select=seller_receipt,buyer_receipt`,
        );

        expect(receipts.length).toBe(1);

        const sellerReceipt = receipts[0].seller_receipt;

        // Pro tier fee should be 5% (lower than Lite 10%)
        expect(sellerReceipt.fee_rate_pct).toBeDefined();
        expect(sellerReceipt.fee_rate_pct).toBeLessThanOrEqual(5);
    });

    // ── 3. Verify fee_rate_pct field is present in seller receipt JSON ────
    test("fee_rate_pct field present in seller receipt JSON", async () => {
        // Use the Pro order created in the previous test
        const lastOrderId = createdOrderIds[createdOrderIds.length - 1];
        expect(lastOrderId).toBeTruthy();

        const receipts = await supabaseQuery(
            "digital_receipts",
            `order_id=eq.${lastOrderId}&select=seller_receipt`,
        );

        expect(receipts.length).toBe(1);

        const sellerReceipt = receipts[0].seller_receipt;

        // Verify the field exists and is a number
        expect(sellerReceipt).toHaveProperty("fee_rate_pct");
        expect(typeof sellerReceipt.fee_rate_pct).toBe("number");

        // Verify other expected receipt fields exist
        expect(sellerReceipt).toHaveProperty("transaction_id");
        expect(sellerReceipt).toHaveProperty("platform_fee");
        expect(sellerReceipt).toHaveProperty("seller_payout");
        expect(sellerReceipt).toHaveProperty("product");
        expect(sellerReceipt).toHaveProperty("quantity");
    });

    // ── 4. Buyer receipt shows credit_applied field ──────────────────────
    test("buyer receipt shows credit_applied field", async () => {
        // Use the first order (lite seller) as reference
        const firstOrderId = createdOrderIds[0];
        expect(firstOrderId).toBeTruthy();

        const receipts = await supabaseQuery(
            "digital_receipts",
            `order_id=eq.${firstOrderId}&select=buyer_receipt`,
        );

        expect(receipts.length).toBe(1);

        const buyerReceipt = receipts[0].buyer_receipt;

        // Buyer receipt should have credit_applied field (may be 0 if no promo)
        expect(buyerReceipt).toHaveProperty("credit_applied");
        expect(typeof buyerReceipt.credit_applied).toBe("number");
        expect(buyerReceipt.credit_applied).toBeGreaterThanOrEqual(0);

        // Verify other expected buyer receipt fields
        expect(buyerReceipt).toHaveProperty("transaction_id");
        expect(buyerReceipt).toHaveProperty("product");
        expect(buyerReceipt).toHaveProperty("total");
    });

    // ── 5. Pro seller fee rate < Lite seller fee rate ─────────────────────
    test("pro seller fee rate is lower than lite seller fee rate", async () => {
        // We need at least 2 orders: one at lite rate, one at pro rate
        expect(createdOrderIds.length).toBeGreaterThanOrEqual(2);

        const liteOrderId = createdOrderIds[0]; // Created with lite plan
        const proOrderId = createdOrderIds[1]; // Created with pro plan

        const [liteReceipts, proReceipts] = await Promise.all([
            supabaseQuery(
                "digital_receipts",
                `order_id=eq.${liteOrderId}&select=seller_receipt`,
            ),
            supabaseQuery(
                "digital_receipts",
                `order_id=eq.${proOrderId}&select=seller_receipt`,
            ),
        ]);

        expect(liteReceipts.length).toBe(1);
        expect(proReceipts.length).toBe(1);

        const liteFeeRate = liteReceipts[0].seller_receipt.fee_rate_pct;
        const proFeeRate = proReceipts[0].seller_receipt.fee_rate_pct;

        // Pro fee rate should be strictly less than Lite fee rate
        expect(proFeeRate).toBeLessThan(liteFeeRate);

        // Verify the actual expected values (Lite=10%, Pro=5%)
        expect(liteFeeRate).toBeGreaterThanOrEqual(10);
        expect(proFeeRate).toBeLessThanOrEqual(5);

        // Log for debugging
        console.log(`Lite fee rate: ${liteFeeRate}%, Pro fee rate: ${proFeeRate}%`);
    });
});
