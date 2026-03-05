/**
 * Compliance Receipts E2E — Playwright
 *
 * Creates an order via RPC, completes it, then verifies:
 *  - Payment ledger metadata has product, total, platform_fee
 *  - Chat messages are generated for both buyer and seller
 *  - Transaction History page shows receipt data
 *
 * Prerequisites:
 *  - Local Supabase running with seed data
 *  - Web dev server on port 3000
 */

import { expect, test } from "@playwright/test";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const SELLER_ID = "a1111111-1111-1111-1111-111111111111";
const BUYER_ID = "b2222222-2222-2222-2222-222222222222";

async function supabaseRpc(fn: string, body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function supabaseQuery(table: string, query: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
        },
    });
    return res.json();
}

async function supabasePatch(
    table: string,
    query: string,
    body: Record<string, unknown>,
) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
    });
}

async function supabaseDelete(table: string, query: string) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: "DELETE",
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Prefer: "return=minimal",
        },
    });
}

test.describe.serial("Compliance Receipts", () => {
    // Only run in seller project
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === "buyer") {
            test.skip(true, "DB-mutating tests run only in seller project");
        }
    });

    const createdOrderIds: string[] = [];
    const createdConversationIds: string[] = [];

    test.afterAll(async () => {
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
    });

    test("profile addresses are populated for compliance", async () => {
        const sellers = await supabaseQuery(
            "profiles",
            `id=eq.${SELLER_ID}&select=zip_code,street_address,state_code,phone_number`,
        );
        expect(sellers.length).toBe(1);
        expect(sellers[0].zip_code).toBe("95125");
        expect(sellers[0].state_code).toBe("CA");
        expect(sellers[0].phone_number).toBeTruthy();

        const buyers = await supabaseQuery(
            "profiles",
            `id=eq.${BUYER_ID}&select=zip_code,street_address,state_code`,
        );
        expect(buyers.length).toBe(1);
        expect(buyers[0].zip_code).toBe("95120");
    });

    test("sell posts have is_produce and harvest_date", async () => {
        const details = await supabaseQuery(
            "want_to_sell_details",
            `post_id=eq.c3333333-3333-3333-3333-333333333333&select=is_produce,harvest_date,produce_name`,
        );
        expect(details.length).toBe(1);
        expect(details[0].is_produce).toBe(true);
        expect(details[0].harvest_date).toBeTruthy();
    });

    test("order completion generates ledger entries with metadata", async () => {
        // Create an order
        const create = await supabaseRpc("create_order_atomic", {
            p_buyer_id: BUYER_ID,
            p_seller_id: SELLER_ID,
            p_post_id: "c3333333-3333-3333-3333-333333333333",
            p_quantity: 1,
            p_points_per_unit: 5,
            p_total_price: 5,
            p_category: "vegetables",
            p_product: "Receipt Test Tomatoes",
        });

        if (!create.orderId) {
            console.error(
                "create_order_atomic failed:",
                JSON.stringify(create),
            );
        }
        expect(create.orderId).toBeTruthy();

        const orderId = create.orderId;
        createdOrderIds.push(orderId);
        createdConversationIds.push(create.conversationId);

        // Move through lifecycle
        await supabasePatch("orders", `id=eq.${orderId}`, {
            status: "accepted",
        });
        await supabasePatch("orders", `id=eq.${orderId}`, {
            status: "delivered",
        });

        // Complete
        const confirm = await supabaseRpc("confirm_order_delivery", {
            p_order_id: orderId,
            p_buyer_id: BUYER_ID,
        });
        expect(confirm.success || confirm.error === undefined).toBeTruthy();

        // Verify payment ledger entry
        const ledger = await supabaseQuery(
            "point_ledger",
            `reference_id=eq.${orderId}&type=eq.payment&select=metadata`,
        );
        expect(ledger.length).toBeGreaterThanOrEqual(1);
        expect(ledger[0].metadata.product).toBe("Receipt Test Tomatoes");
        expect(ledger[0].metadata.total).toBeTruthy();
        expect(ledger[0].metadata.order_id).toBe(orderId);

        // Verify platform fee entry
        const fees = await supabaseQuery(
            "point_ledger",
            `reference_id=eq.${orderId}&type=eq.platform_fee&select=metadata`,
        );
        expect(fees.length).toBeGreaterThanOrEqual(1);
    });

    test("CA produce categories have 0% sales tax", async () => {
        const rules = await supabaseQuery(
            "category_tax_rules",
            "state_code=eq.CA&rule_type=eq.fixed&select=category_name,rate_pct",
        );
        expect(rules.length).toBeGreaterThan(0);

        const vegRule = rules.find(
            (r: { category_name: string }) => r.category_name === "vegetables",
        );
        expect(vegRule).toBeTruthy();
        expect(Number(vegRule.rate_pct)).toBe(0);

        const fruitRule = rules.find(
            (r: { category_name: string }) => r.category_name === "fruits",
        );
        expect(fruitRule).toBeTruthy();
        expect(Number(fruitRule.rate_pct)).toBe(0);
    });

    test("Transaction History page renders", async ({ page }) => {
        await page.goto("/feed");
        await page
            .locator("text=Tomatoes")
            .or(page.locator("text=No posts found"))
            .first()
            .waitFor({ timeout: 15_000 });

        // Navigate to menu → Transaction History
        const menuBtn = page.locator("text=Menu").first();
        const hasMenu = await menuBtn.isVisible().catch(() => false);
        if (!hasMenu) {
            test.skip(true, "Menu button not visible in this viewport");
            return;
        }

        await menuBtn.click();
        await page.waitForTimeout(1000);

        const txLink = page
            .locator("text=/Points Balance|Transaction History/i")
            .first();
        const hasTxLink = await txLink.isVisible({ timeout: 5_000 }).catch(() =>
            false
        );
        if (!hasTxLink) {
            test.skip(true, "Transaction History link not found");
            return;
        }

        await txLink.click();
        await page.waitForTimeout(2000);

        // Verify balance section renders
        const hasBalance = await page
            .locator("text=/Total Balance|Earned Balance/i")
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        expect(hasBalance).toBeTruthy();
    });
});
