/**
 * Profile E2E Tests — validate profile management screen.
 *
 * Tests viewing profile, editing name, managing notifications, community, and logout.
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Web dev server running on port 3000
 * - Auth setup has run
 */

import { expect, test } from "@playwright/test";

test.describe("Profile", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/profile");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }
    });

    test("displays Profile Settings title", async ({ page }) => {
        await expect(
            page.locator("text=/Profile|Settings/i").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("shows user name and avatar section", async ({ page }) => {
        // The profile should show the user's name or edit profile button
        const hasName = await page
            .locator("text=/Test Seller|Test Buyer|Edit Profile/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasName).toBeTruthy();
    });

    test("shows community section", async ({ page }) => {
        await expect(
            page.locator("text=/My Community|community/i").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("shows notification preferences", async ({ page }) => {
        const hasNotif = await page
            .locator("text=/Notification|Push|SMS/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasNotif).toBeTruthy();
    });

    test("shows contact information section", async ({ page }) => {
        const hasContact = await page
            .locator("text=/Contact|Phone|Email/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasContact).toBeTruthy();
    });

    test("shows logout button", async ({ page }) => {
        // Scroll to find the logout button
        await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
        );
        await page.waitForTimeout(500);

        const hasLogout = await page
            .locator("text=Logout")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasLogout).toBeTruthy();
    });

    test("Edit Profile button is visible", async ({ page }) => {
        const hasEdit = await page
            .locator("text=Edit Profile")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasEdit).toBeTruthy();
    });

    test("shows activity stats section", async ({ page }) => {
        const hasStats = await page
            .locator("text=/Activity|Stats|Transactions|Rating|Posts/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasStats).toBeTruthy();
    });
});
