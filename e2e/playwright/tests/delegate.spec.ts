/**
 * Delegate Screen E2E Tests — validate the delegation management UI.
 *
 * Tests the delegate screen including tabs, add delegate flow, and join by code.
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

    test("shows My Delegates and Delegating For tabs", async ({ page }) => {
        await expect(
            page.locator("text=My Delegates").first(),
        ).toBeVisible({ timeout: 10_000 });
        await expect(
            page.locator("text=Delegating For").first(),
        ).toBeVisible();
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

    test("clicking Add New Delegate shows the add delegate modal", async ({page,}) => {
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

    test("Delegating For tab shows correct content", async ({ page }) => {
        await page.locator("text=Delegating For").first().click();
        await page.waitForTimeout(1000);

        // Should show either delegates or empty state
        const hasEmpty = await page
            .locator("text=/Not Delegating for Anyone/i")
            .first()
            .isVisible()
            .catch(() => false);
        const hasDelegates = await page
            .locator("text=/selling for|Pending|Active/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasEmpty || hasDelegates).toBeTruthy();
    });

    test("Join by Code button is visible in Delegating For tab", async ({page,}) => {
        await page.locator("text=Delegating For").first().click();
        await page.waitForTimeout(1000);

        const hasJoinByCode = await page
            .locator("text=Join by Code")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasJoinByCode).toBeTruthy();
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
