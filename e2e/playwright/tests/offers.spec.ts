/**
 * Offers Screen E2E Tests — status display and click-to-chat navigation.
 *
 * Tests that offer cards display correct statuses and that clicking a card
 * navigates to the associated chat conversation. Mirrors the orders.spec.ts
 * structure using buyer/seller project perspectives.
 *
 * Seed data provides 3 standalone offers:
 *   Cilantro  — pending   (seller=Test Seller made the offer, buyer=Test Buyer)
 *   Mint      — rejected  (seller=Test Seller made the offer, buyer=Test Buyer)
 *   Rosemary  — withdrawn (seller=Test Seller made the offer, buyer=Test Buyer)
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

/** Navigate to Offers page and wait for it to load */
async function goToOffers(page: import("@playwright/test").Page) {
    await page.goto("/offers");
    // Wait for either offer cards or empty state
    await page
        .locator("[data-testid^='offer-card-']")
        .or(page.getByText(/No open offers/i))
        .first()
        .waitFor({ timeout: 15_000 });
}

/** Find an offer card by product name */
function offerCard(page: import("@playwright/test").Page, product: string) {
    return page
        .locator("[data-testid^='offer-card-']")
        .filter({ hasText: product });
}

/** Get the status badge text for an offer card */
async function getStatus(
    page: import("@playwright/test").Page,
    product: string,
) {
    const statusEl = offerCard(page, product).locator(
        "[data-testid^='offer-status-']",
    );
    return (await statusEl.textContent())?.trim().toUpperCase();
}

// =============================================================================
// SELLER TESTS — logged in as Test Seller (seller@test.local)
// The seller is the offer maker (created_by) for all seeded offers.
// =============================================================================

test.describe("Offers — Seller perspective", () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({ page }) => {
        test.skip(
            test.info().project.name !== "seller",
            "Seller-only test",
        );
        await goToOffers(page);
    });

    test("shows pending offer on Open tab", async ({ page }) => {
        await expect(offerCard(page, "Cilantro")).toBeVisible();
    });

    test("pending offer shows correct status", async ({ page }) => {
        expect(await getStatus(page, "Cilantro")).toBe("PENDING");
    });

    test("shows rejected and withdrawn on Past tab", async ({ page }) => {
        await page.getByText("Past", { exact: true }).click();
        await page.waitForTimeout(1500);

        await expect(offerCard(page, "Mint")).toBeVisible();
        await expect(offerCard(page, "Rosemary")).toBeVisible();
    });

    test("past tab shows correct statuses", async ({ page }) => {
        await page.getByText("Past", { exact: true }).click();
        await page.waitForTimeout(1500);
        expect(await getStatus(page, "Mint")).toBe("REJECTED");
        expect(await getStatus(page, "Rosemary")).toBe("WITHDRAWN");
    });

    test("tabs and filters are present", async ({ page }) => {
        await expect(page.getByText("Open", { exact: true })).toBeVisible();
        await expect(page.getByText("Past", { exact: true })).toBeVisible();
        await expect(page.getByText("All", { exact: true })).toBeVisible();
        await expect(page.getByText("Buying", { exact: true })).toBeVisible();
        await expect(page.getByText("Selling", { exact: true })).toBeVisible();
    });

    test("filter: Selling shows seller's offers", async ({ page }) => {
        await page.getByText("Selling", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Seller made all offers, so Cilantro should still be visible
        await expect(offerCard(page, "Cilantro")).toBeVisible();
    });

    test("filter: Buying shows no offers for seller on Open tab", async ({ page }) => {
        await page.getByText("Buying", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Seller is not the buyer on any offers
        await expect(page.getByText(/No open offers/i)).toBeVisible();
    });

    test("clicking offer card navigates to chat", async ({ page }) => {
        await offerCard(page, "Cilantro").click();
        await page.waitForURL(/\/chat\?.*postId=.*otherUserId=.*from=offers/);
        await page
            .locator("[data-testid='chat-header']")
            .or(page.getByText(/loading/i))
            .first()
            .waitFor({ timeout: 10_000 });
    });
});

// =============================================================================
// BUYER TESTS — logged in as Test Buyer (buyer@test.local)
// The buyer is the buy-post author who receives offers.
// =============================================================================

test.describe("Offers — Buyer perspective", () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({ page }) => {
        test.skip(
            test.info().project.name !== "buyer",
            "Buyer-only test",
        );
        await goToOffers(page);
    });

    test("shows pending offer on Open tab", async ({ page }) => {
        await expect(offerCard(page, "Cilantro")).toBeVisible();
    });

    test("offer card shows correct status", async ({ page }) => {
        const cilantroStatus = await getStatus(page, "Cilantro");
        expect(cilantroStatus).toBe("PENDING");
    });

    test("filter: Buying shows buyer's received offers", async ({ page }) => {
        await page.getByText("Buying", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Buyer receives all offers (is the buy post author)
        await expect(offerCard(page, "Cilantro")).toBeVisible();
    });

    test("filter: Selling shows no offers for buyer on Open tab", async ({ page }) => {
        await page.getByText("Selling", { exact: true }).click();
        await page.waitForTimeout(1500);
        // Buyer is not the seller on any seeded offers
        await expect(page.getByText(/No open offers/i)).toBeVisible();
    });

    test("clicking offer card navigates to chat", async ({ page }) => {
        await offerCard(page, "Cilantro").click();
        await page.waitForURL(/\/chat\?.*postId=.*otherUserId=.*from=offers/);
    });
});
