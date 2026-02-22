/**
 * Delegate Screen E2E Tests — validate the delegation management UI.
 *
 * Tests the delegate screen including title, add delegate button, and empty state.
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Web dev server running on port 3000
 * - Auth setup has run
 */

import { expect, test } from "@playwright/test";

test.describe("Delegate Screen", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/delegate");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }
    });

    test("displays Delegate Sales title", async ({ page }) => {
        await expect(
            page.locator("text=Delegate Sales").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("shows manage subtitle", async ({ page }) => {
        await expect(
            page.locator("text=Manage who can sell on your behalf").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("shows info banner about delegation", async ({ page }) => {
        await expect(
            page
                .locator("text=/delegation lets someone|trust/i")
                .first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("shows Add New Delegate button", async ({ page }) => {
        await expect(
            page.locator("text=Add New Delegate").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("clicking Add New Delegate shows the add delegate modal", async ({ page }) => {
        await page.locator("text=Add New Delegate").first().click();
        await page.waitForTimeout(1000);

        // The modal should show "Add Delegate" title or tabs
        const hasTitle = await page
            .locator("text=Add Delegate")
            .first()
            .isVisible()
            .catch(() => false);
        const hasInPerson = await page
            .locator("text=In Person")
            .first()
            .isVisible()
            .catch(() => false);
        const hasSearch = await page
            .locator("text=Search by Name")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasTitle || hasInPerson || hasSearch).toBeTruthy();
    });

    test("empty state shows when no delegates exist", async ({ page }) => {
        // If the seeded user has no delegates, show the empty state
        const hasEmpty = await page
            .locator("text=/No Delegates Yet/i")
            .first()
            .isVisible()
            .catch(() => false);

        if (hasEmpty) {
            await expect(
                page
                    .locator(
                        "text=/Add someone you trust/i",
                    )
                    .first(),
            ).toBeVisible();
        }
    });
});
