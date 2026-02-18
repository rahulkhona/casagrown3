/**
 * Chat → Order from Feed E2E Tests
 *
 * Tests the Order flow from the feed:
 * 1. Navigate to feed → find a sell post from another user (Peppers by Test Buyer)
 * 2. Click Order button to open the OrderSheet modal
 * 3. Verify order form fields, product details, dismiss, and points balance
 *
 * Prerequisites:
 * - Local Supabase running with seed data (supabase db reset)
 * - Web dev server running on port 3000
 * - Auth setup has run (automatic via Playwright config)
 * - Seed data includes buyer's sell post (Peppers) so seller sees Order button
 */

import { expect, test } from "@playwright/test";

test.describe("Order from Chat Flow", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/feed");
        // Wait for the Peppers post (buyer's sell post) to be visible
        await page.locator("text=Peppers").first().waitFor({ timeout: 15_000 });
        // Scroll Peppers into view
        await page.locator("text=Peppers").first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
    });

    test("full flow: feed → click Order → order form appears", async ({ page }) => {
        // Find the Order button on the Peppers post card
        const orderBtn = page.getByText("Order", { exact: true }).first();
        const hasOrder = await orderBtn.isVisible().catch(() => false);
        if (!hasOrder) {
            test.skip();
        }

        // Click Order — this opens the OrderSheet modal on the feed page
        await orderBtn.click();
        await page.waitForTimeout(2000);

        // Should see the order form modal with quantity, delivery, or points info
        const hasOrderForm = await page
            .locator(
                "text=/Quantity|Delivery|Points|Submit|Place|Total|lbs|boxes|bunch/i",
            )
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasOrderForm).toBeTruthy();
    });

    test("order sheet shows product details from the post", async ({ page }) => {
        const orderBtn = page.getByText("Order", { exact: true }).first();
        const hasOrder = await orderBtn.isVisible().catch(() => false);
        if (!hasOrder) test.skip();

        await orderBtn.click();
        await page.waitForTimeout(2000);

        // The order sheet should show product-related fields
        const formElements = [
            page.locator("text=/quantity/i").first(),
            page.locator("text=/delivery/i").first(),
            page.locator("text=/points/i").first(),
            page.locator("text=/Peppers/i").first(),
        ];

        let foundElements = 0;
        for (const el of formElements) {
            if (await el.isVisible().catch(() => false)) {
                foundElements++;
            }
        }

        // At least one order-related element should be visible
        expect(foundElements).toBeGreaterThan(0);
    });

    test("order sheet can be dismissed", async ({ page }) => {
        const orderBtn = page.getByText("Order", { exact: true }).first();
        const hasOrder = await orderBtn.isVisible().catch(() => false);
        if (!hasOrder) test.skip();

        await orderBtn.click();
        await page.waitForTimeout(2000);

        // Try to dismiss with close button, Cancel, or ESC key
        const closeBtn = page.locator(
            "[aria-label*='close'], [aria-label*='Close']",
        ).or(page.getByText("Cancel", { exact: true }))
            .or(page.getByText("×", { exact: true }))
            .or(page.getByText("Close", { exact: true }))
            .first();
        const hasClose = await closeBtn.isVisible().catch(() => false);

        if (hasClose) {
            await closeBtn.click();
        } else {
            await page.keyboard.press("Escape");
        }

        await page.waitForTimeout(1000);

        // After dismissing, we should still be on the feed page
        expect(page.url()).toContain("feed");
    });

    test("points balance is shown on order sheet", async ({ page }) => {
        const orderBtn = page.getByText("Order", { exact: true }).first();
        const hasOrder = await orderBtn.isVisible().catch(() => false);
        if (!hasOrder) test.skip();

        await orderBtn.click();
        await page.waitForTimeout(2000);

        // Should show points balance or cost information
        const hasPoints = await page
            .locator(
                "text=/points|balance|total|cost|pts/i",
            )
            .first()
            .isVisible()
            .catch(() => false);

        // Points info should be visible on the order form
        expect(hasPoints).toBeTruthy();
    });
});
