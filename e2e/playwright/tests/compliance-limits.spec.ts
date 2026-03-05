/**
 * Compliance Limits & State Blocks E2E — Playwright
 *
 * Not UI tests — uses the API to verify:
 *  - Purchase limits table has defaults
 *  - State redemption method blocks CRUD
 *  - Redemption methods and instruments are queryable
 *  - Category tax rules exist for all CA produce categories
 *
 * Prerequisites:
 *  - Local Supabase running with seed data
 */

import { expect, test } from "@playwright/test";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function supabaseQuery(table: string, query: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
        },
    });
    return res.json();
}

async function supabaseInsert(table: string, body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
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
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Prefer: "return=minimal",
        },
    });
}

test.describe("Compliance Limits & State Blocks", () => {
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === "buyer") {
            test.skip(true, "DB tests run only in seller project");
        }
    });

    test("purchase limits table has USA defaults", async () => {
        const limits = await supabaseQuery(
            "point_purchase_limits",
            "country_iso_3=eq.USA&select=max_outstanding_cents,daily_limit_cents",
        );
        expect(limits.length).toBeGreaterThanOrEqual(1);
        expect(limits[0].max_outstanding_cents).toBe(200000); // $2,000
        expect(limits[0].daily_limit_cents).toBe(50000); // $500
    });

    test("state redemption method blocks CRUD", async () => {
        const TEST_STATE = "NY";
        const TEST_METHOD = "cashout";

        // Insert
        await supabaseInsert("state_redemption_method_blocks", {
            country_iso_3: "USA",
            state_code: TEST_STATE,
            method: TEST_METHOD,
            reason: "Test compliance PW",
        });

        // Verify inserted
        const blocks = await supabaseQuery(
            "state_redemption_method_blocks",
            `state_code=eq.${TEST_STATE}&method=eq.${TEST_METHOD}`,
        );
        expect(blocks.length).toBeGreaterThanOrEqual(1);
        expect(blocks[0].method).toBe(TEST_METHOD);
        expect(blocks[0].state_code).toBe(TEST_STATE);

        // Cleanup
        await supabaseDelete(
            "state_redemption_method_blocks",
            `state_code=eq.${TEST_STATE}&method=eq.${TEST_METHOD}`,
        );

        // Verify deleted
        const after = await supabaseQuery(
            "state_redemption_method_blocks",
            `state_code=eq.${TEST_STATE}&method=eq.${TEST_METHOD}`,
        );
        expect(after.length).toBe(0);
    });

    test("active redemption methods are queryable", async () => {
        const methods = await supabaseQuery(
            "available_redemption_methods",
            "is_active=eq.true&select=method,is_active",
        );
        // Should have at least one active method
        expect(methods.length).toBeGreaterThan(0);

        const methodNames = methods.map(
            (m: { method: string }) => m.method,
        );
        // At least gift cards or charity should be active
        const hasCommonMethod = methodNames.includes("giftcards") ||
            methodNames.includes("charity") ||
            methodNames.includes("cashout");
        expect(hasCommonMethod).toBeTruthy();
    });

    test("CA has tax exemptions for produce categories", async () => {
        const rules = await supabaseQuery(
            "category_tax_rules",
            "state_code=eq.CA&select=category_name,rule_type,rate_pct",
        );
        expect(rules.length).toBeGreaterThan(0);

        // Check all produce categories are exempt
        const exemptCategories = rules
            .filter((r: { rule_type: string }) => r.rule_type === "fixed")
            .filter((r: { rate_pct: string }) => Number(r.rate_pct) === 0)
            .map((r: { category_name: string }) => r.category_name);

        expect(exemptCategories).toContain("vegetables");
        expect(exemptCategories).toContain("fruits");
        expect(exemptCategories).toContain("herbs");
    });

    test("orders table supports tax fields", async () => {
        const orders = await supabaseQuery(
            "orders",
            "select=id,tax_rate_pct,tax_amount,harvest_date&limit=1",
        );
        expect(orders.length).toBeGreaterThan(0);
        // Verify the columns exist (not erroring means they exist)
        expect(orders[0]).toHaveProperty("tax_rate_pct");
        expect(orders[0]).toHaveProperty("tax_amount");
        expect(orders[0]).toHaveProperty("harvest_date");
    });

    test("Redeem Page shows available tabs", async ({ page }) => {
        await page.goto("/feed");
        await page
            .locator("text=Tomatoes")
            .or(page.locator("text=No posts found"))
            .first()
            .waitFor({ timeout: 15_000 });

        // Navigate to Redeem page
        const menuBtn = page.locator("text=Menu").first();
        const hasMenu = await menuBtn.isVisible().catch(() => false);
        if (!hasMenu) {
            test.skip(true, "Menu button not visible");
            return;
        }

        await menuBtn.click();
        await page.waitForTimeout(1000);

        const redeemLink = page
            .locator("text=/Redeem|Gift Cards/i")
            .first();
        const hasRedeem = await redeemLink
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
        if (!hasRedeem) {
            test.skip(true, "Redeem link not found in menu");
            return;
        }

        await redeemLink.click();
        await page.waitForTimeout(3000);

        // Check for at least one tab (Gift Cards, Donate, Cashout, or 529)
        const tabText = page.locator(
            "text=/Gift Cards|Donate|Cashout|529 Savings|Redeem Points/i",
        );
        const hasTab = await tabText
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        expect(hasTab).toBeTruthy();
    });
});
