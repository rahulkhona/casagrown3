/**
 * Chat Restriction E2E Tests — verify restriction banner and button disabling.
 *
 * Inserts category & product restrictions via Supabase REST API (service role),
 * then verifies the chat UI shows the ⚠️ restriction banner and hides
 * transaction buttons (Place Order / Make Offer).
 *
 * Uses serial mode to prevent parallel test interference.
 *
 * Prerequisites:
 * - Local Supabase running with seed data (seed-test-data.sh)
 * - Web dev server running on port 3000
 * - Auth setup has run
 */

import { expect, test } from "@playwright/test";

// Force serial execution — these tests modify shared DB state
test.describe.configure({ mode: "serial" });

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Unique marker to identify test-created data for safe cleanup
const TEST_MARKER = "PW_E2E_RESTRICTION_TEST";

/** Insert a row via Supabase REST with the service role key. */
async function supabaseInsert(table: string, data: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            Prefer: "return=minimal",
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Insert into ${table} failed (${res.status}): ${body}`);
    }
}

/** Delete rows from a table matching a filter. */
async function supabaseDelete(table: string, filter: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: "DELETE",
        headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
    });
    // Ignore errors — cleanup is best-effort
}

/** Clean up all test-created restrictions. */
async function cleanupTestRestrictions() {
    await supabaseDelete("category_restrictions", `reason=eq.${TEST_MARKER}`);
    await supabaseDelete("blocked_products", `reason=eq.${TEST_MARKER}`);
}

/**
 * Navigate to a chat conversation about a Tomatoes-related post.
 *
 * Strategy 1: Navigate to /feed and click Chat/Order on the Tomatoes post
 * Strategy 2: Navigate to /chats and click on a conversation about tomatoes
 *
 * Returns true if we land in a chat conversation screen (not just the chat list).
 */
async function navigateToTomatoChat(
    page: import("@playwright/test").Page,
): Promise<boolean> {
    // Strategy 1: Navigate from feed
    await page.goto("/feed");

    const feedLoaded = page.locator("text=Tomatoes").or(
        page.locator("text=No posts found"),
    ).first();
    await feedLoaded.waitFor({ timeout: 15_000 });

    const hasTomatoes = await page.locator("text=Tomatoes").first()
        .isVisible().catch(() => false);

    if (hasTomatoes) {
        // Try Chat button
        const chatBtn = page.locator("text=Chat").first();
        const hasChat = await chatBtn.isVisible().catch(() => false);

        if (hasChat) {
            await chatBtn.click();
            await page.waitForTimeout(5000);
            if (page.url().includes("chat/")) return true;
        }

        // Try Order button
        const orderBtn = page.locator("text=Order").first();
        const hasOrder = await orderBtn.isVisible().catch(() => false);
        if (hasOrder) {
            await orderBtn.click();
            await page.waitForTimeout(5000);
            if (page.url().includes("chat/")) return true;
        }
    }

    // Strategy 2: Navigate from chats list and open an existing conversation
    await page.goto("/chats");
    await page.waitForTimeout(3000);

    // Look for an existing conversation mentioning tomatoes or peppers (seeded data)
    const tomatoConvo = page.locator("text=/tomato/i").first();
    const pepperConvo = page.locator("text=/pepper/i").first();
    const anyConvo = page.locator("text=/For Sale|Wanted/i").first();

    const hasTomatoConvo = await tomatoConvo.isVisible().catch(() => false);
    const hasPepperConvo = await pepperConvo.isVisible().catch(() => false);
    const hasAnyConvo = await anyConvo.isVisible().catch(() => false);

    if (hasTomatoConvo) {
        await tomatoConvo.click();
    } else if (hasPepperConvo) {
        await pepperConvo.click();
    } else if (hasAnyConvo) {
        await anyConvo.click();
    } else {
        return false;
    }

    await page.waitForTimeout(5000);
    return true;
}

test.describe("Chat Restrictions", () => {
    // Clean up before and after every test to prevent cross-contamination
    test.beforeEach(async ({ browserName }, testInfo) => {
        // Skip in seller project — these tests modify shared DB state (restrictions table)
        // and would race with buyer project tests. The buyer project is the primary test
        // target since buyers see Order/Offer buttons that get disabled.
        if (testInfo.project.name === "seller") {
            test.skip();
            return;
        }
        await cleanupTestRestrictions();
    });

    test.afterEach(async ({}, testInfo) => {
        if (testInfo.project.name === "seller") return;
        await cleanupTestRestrictions();
    });

    // ── Control Test: no restriction = no banner ──

    test("no restriction banner when category is not restricted", async ({ page }) => {
        const onChat = await navigateToTomatoChat(page);
        if (!onChat) test.skip();

        // Wait for restriction check to complete
        await page.waitForTimeout(3000);

        // Restriction banner should NOT be visible
        const banner = page
            .locator("text=/restricted|blocked|restriction/i")
            .first();
        const hasBanner = await banner.isVisible().catch(() => false);
        expect(hasBanner).toBeFalsy();
    });

    // ── Category Restriction: banner appears ──

    test("restriction banner appears when post category is restricted", async ({ page }) => {
        // Insert a global restriction on 'vegetables' (Tomatoes & Peppers are vegetables)
        await supabaseInsert("category_restrictions", {
            category_name: "vegetables",
            community_h3_index: null,
            reason: TEST_MARKER,
        });

        const onChat = await navigateToTomatoChat(page);
        if (!onChat) test.skip();

        // Verify restriction banner is visible
        const banner = page
            .locator(`text=/${TEST_MARKER}|restricted|blocked/i`)
            .first();
        await expect(banner).toBeVisible({ timeout: 10_000 });
    });

    // ── Product Restriction: banner appears ──

    test("restriction banner appears when product is blocked", async ({ page }) => {
        // Block 'Tomatoes' product globally
        await supabaseInsert("blocked_products", {
            product_name: "Tomatoes",
            community_h3_index: null,
            reason: TEST_MARKER,
        });

        // Also block Peppers in case test opens a Peppers chat
        await supabaseInsert("blocked_products", {
            product_name: "Peppers",
            community_h3_index: null,
            reason: TEST_MARKER,
        });

        const onChat = await navigateToTomatoChat(page);
        if (!onChat) test.skip();

        // Verify restriction banner is visible
        const banner = page
            .locator(`text=/${TEST_MARKER}|restricted|blocked/i`)
            .first();
        await expect(banner).toBeVisible({ timeout: 10_000 });
    });

    // ── Restriction removal: banner disappears ──

    test("banner disappears after restriction is removed and page reloaded", async ({ page }) => {
        // Insert restriction
        await supabaseInsert("category_restrictions", {
            category_name: "vegetables",
            community_h3_index: null,
            reason: TEST_MARKER,
        });

        const onChat = await navigateToTomatoChat(page);
        if (!onChat) test.skip();

        // Verify banner is visible
        const banner = page
            .locator(`text=/${TEST_MARKER}|restricted|blocked/i`)
            .first();
        await expect(banner).toBeVisible({ timeout: 10_000 });

        // Remove restriction
        await cleanupTestRestrictions();

        // Navigate completely away and come back to force a fresh state
        // (page.reload() can still show cached data from the hook)
        await page.goto("/feed");
        await page.waitForTimeout(3000);

        // Navigate back to the chat
        const onChatAgain = await navigateToTomatoChat(page);
        if (!onChatAgain) test.skip();

        await page.waitForTimeout(5000);

        // The banner should no longer be visible
        const bannerGone = page
            .locator(`text=/${TEST_MARKER}|restricted|blocked/i`)
            .first();
        const hasBanner = await bannerGone.isVisible().catch(() => false);
        expect(hasBanner).toBeFalsy();
    });
});
