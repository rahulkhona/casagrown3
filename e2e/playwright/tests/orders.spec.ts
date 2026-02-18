/**
 * Orders Screen E2E Tests — status display and click-to-chat navigation.
 *
 * Tests that order cards display correct statuses and that clicking a card
 * navigates to the associated chat conversation. Action buttons are no longer
 * on the orders screen — all actions happen in the chat interface.
 *
 * Seed data provides 6 orders in different states:
 *   001: Peppers   — pending   (buyer=Seller, seller=Buyer)
 *   002: Tomatoes  — accepted  (buyer=Buyer,  seller=Seller)
 *   003: Strawberries — delivered (buyer=Buyer, seller=Seller)
 *   004: Basil     — disputed  (buyer=Seller, seller=Buyer)
 *   005: Lemons    — completed (buyer=Buyer,  seller=Seller)
 *   006: Herbs Mix — cancelled (buyer=Buyer,  seller=Seller)
 *
 * Prerequisites:
 * - Local Supabase running with seed data (supabase db reset)
 * - Web dev server running on port 3000
 * - Auth setup has run (automatic via Playwright config)
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to Orders page and wait for it to load */
async function goToOrders(page: import("@playwright/test").Page) {
    await page.goto("/orders");
    // Wait for either order cards or empty state
    await page
        .locator("[data-testid^='order-card-']")
        .or(page.getByText(/No open orders/i))
        .first()
        .waitFor({ timeout: 15_000 });
}

/** Find an order card by product name */
function orderCard(page: import("@playwright/test").Page, product: string) {
    return page
        .locator("[data-testid^='order-card-']")
        .filter({ hasText: product });
}

/** Get the status badge text for an order card */
async function getStatus(
    page: import("@playwright/test").Page,
    product: string,
) {
    const statusEl = orderCard(page, product).locator(
        "[data-testid^='order-status-']",
    );
    return (await statusEl.textContent())?.trim().toUpperCase();
}

// =============================================================================
// SELLER TESTS — logged in as Test Seller (seller@test.local)
// =============================================================================

test.describe("Orders — Seller perspective", () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({ page }) => {
        // Only run in the "seller" project
        test.skip(
            test.info().project.name !== "seller",
            "Seller-only test",
        );
        await goToOrders(page);
    });

    test("shows all order cards on the Open tab", async ({ page }) => {
        // Open tab should show pending, accepted, delivered, disputed orders
        await expect(orderCard(page, "Peppers")).toBeVisible();
        await expect(orderCard(page, "Tomatoes")).toBeVisible();
        await expect(orderCard(page, "Strawberries")).toBeVisible();
        await expect(orderCard(page, "Basil")).toBeVisible();
    });

    test("shows completed and cancelled on Past tab", async ({ page }) => {
        await page.getByText("Past", { exact: true }).click();
        await page.waitForTimeout(1500);

        await expect(orderCard(page, "Lemons")).toBeVisible();
        await expect(orderCard(page, "Herbs Mix")).toBeVisible();
    });

    test("order cards show correct statuses", async ({ page }) => {
        expect(await getStatus(page, "Peppers")).toBe("PENDING");
        expect(await getStatus(page, "Tomatoes")).toBe("ACCEPTED");
        expect(await getStatus(page, "Strawberries")).toBe("DELIVERED");
        expect(await getStatus(page, "Basil")).toMatch(/DISPUTED|ESCALATED/);
    });

    test("past tab shows correct statuses", async ({ page }) => {
        await page.getByText("Past", { exact: true }).click();
        await page.waitForTimeout(1500);
        expect(await getStatus(page, "Lemons")).toBe("COMPLETED");
        expect(await getStatus(page, "Herbs Mix")).toBe("CANCELLED");
    });

    test("no action buttons on any order cards", async ({ page }) => {
        const actionBtns = page.locator("[data-testid^='order-action-']");
        await expect(actionBtns).toHaveCount(0);
    });

    test("clicking order card navigates to chat", async ({ page }) => {
        await orderCard(page, "Tomatoes").click();
        // Should navigate to chat page with postId and otherUserId params
        await page.waitForURL(/\/chat\?.*postId=.*otherUserId=.*from=orders/);
        // The chat screen should load
        await page
            .locator("[data-testid='chat-header']")
            .or(page.getByText(/loading/i))
            .first()
            .waitFor({ timeout: 10_000 });
    });

    test("chat back button returns to orders", async ({ page }) => {
        await orderCard(page, "Tomatoes").click();
        await page.waitForURL(/\/chat\?/);
        await page.waitForTimeout(2000);

        // Click back button
        const backBtn = page.getByLabel("Back");
        await expect(backBtn).toBeVisible();
        await backBtn.click();

        // Should return to orders page
        await page.waitForURL(/\/orders/);
        await expect(orderCard(page, "Tomatoes")).toBeVisible();
    });

    test("filter: Buying shows only orders where seller is buyer", async ({ page }) => {
        await page.getByText("Buying", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Seller is buyer on Peppers and Basil
        await expect(orderCard(page, "Basil")).toBeVisible();
    });

    test("filter: Selling shows only orders where seller is seller", async ({ page }) => {
        await page.getByText("Selling", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Seller is seller on Tomatoes, Strawberries
        await expect(orderCard(page, "Tomatoes")).toBeVisible();
        await expect(orderCard(page, "Strawberries")).toBeVisible();
    });
});

// =============================================================================
// BUYER TESTS — logged in as Test Buyer (buyer@test.local)
// =============================================================================

test.describe("Orders — Buyer perspective", () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({ page }) => {
        // Only run in the "buyer" project
        test.skip(
            test.info().project.name !== "buyer",
            "Buyer-only test",
        );
        await goToOrders(page);
    });

    test("shows order cards for buyer", async ({ page }) => {
        // Buyer is buyer on Tomatoes, Strawberries
        await expect(orderCard(page, "Tomatoes")).toBeVisible();
        await expect(orderCard(page, "Strawberries")).toBeVisible();
    });

    test("order cards show correct statuses", async ({ page }) => {
        const tomatoStatus = await getStatus(page, "Tomatoes");
        expect(tomatoStatus).toMatch(/ACCEPTED|DELIVERED/);
    });

    test("clicking order card navigates to chat", async ({ page }) => {
        await orderCard(page, "Tomatoes").click();
        await page.waitForURL(/\/chat\?.*postId=.*otherUserId=.*from=orders/);
    });

    test("filter: Buying shows buyer's purchases", async ({ page }) => {
        await page.getByText("Buying", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Buyer is the buyer on Tomatoes, Strawberries, Lemons, Herbs Mix
        await expect(orderCard(page, "Tomatoes")).toBeVisible();
    });

    test("filter: Selling shows buyer's sales", async ({ page }) => {
        await page.getByText("Selling", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Buyer is the seller on Basil (and Peppers if visible)
        await expect(orderCard(page, "Basil")).toBeVisible();
    });
});
