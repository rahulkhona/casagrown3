/**
 * Create Post E2E Tests — validate the sell post creation flow.
 *
 * Authenticated as Test Seller (via setup).
 */

import { expect, test } from "@playwright/test";

test.describe("Create Post", () => {
    test("can navigate to create post form", async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(3000);

        // Look for the create post button
        const createBtn = page.locator("text=Create Post").first();
        await expect(createBtn).toBeVisible({ timeout: 10_000 });
        await createBtn.click();

        // Should navigate to post creation screen
        await page.waitForURL(/\/(create|post|new)/, { timeout: 10_000 });
    });

    test("sell form shows required fields", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        // Select "Looking to Sell" post type
        const sellCard = page.locator("text=Looking to Sell").first();
        if (await sellCard.isVisible().catch(() => false)) {
            await sellCard.click();
            await page.waitForTimeout(1000);
        }

        // If form is visible, verify key fields exist
        const hasCategory = await page
            .locator("text=Category")
            .first()
            .isVisible()
            .catch(() => false);

        const hasQuantity = await page
            .locator("text=/Quantity|Available/i")
            .first()
            .isVisible()
            .catch(() => false);

        // At least some form elements should be visible
        expect(hasCategory || hasQuantity).toBeTruthy();
    });
});
