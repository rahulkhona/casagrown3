/**
 * Hamburger Menu E2E — Tests web hamburger menu navigation (mobile viewport).
 *
 * Validates:
 * - Profile menu item navigates to /profile
 * - Transfer Points is NOT in the menu
 * - Key menu items are present and functional
 *
 * Uses mobile viewport so the hamburger menu renders instead of desktop nav.
 */

import { expect, test } from "@playwright/test";

// Override to mobile viewport so hamburger renders
test.use({ viewport: { width: 390, height: 844 } });

test.describe("Hamburger Menu", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }
    });

    async function openMenu(page: any) {
        const menuButton = page.getByLabel("Menu").first();
        await expect(menuButton).toBeVisible({ timeout: 10000 });
        await menuButton.click();
        await page.waitForTimeout(500);
    }

    test("Profile & Settings menu item is present", async ({ page }) => {
        await openMenu(page);
        await expect(page.getByText("Profile & Settings")).toBeVisible({
            timeout: 5000,
        });
    });

    test("Profile navigates to /profile (not /my-posts)", async ({ page }) => {
        await openMenu(page);

        await page.getByText("Profile & Settings").click();

        await page.waitForURL("**/profile", { timeout: 5000 });
        await expect(page).toHaveURL(/\/profile/);
        expect(page.url()).not.toMatch(/\/my-posts/);
    });

    test("Transfer Points is NOT in the menu", async ({ page }) => {
        await openMenu(page);

        await expect(page.getByText("Sign Out")).toBeVisible({
            timeout: 3000,
        });
        await expect(page.getByText("Transfer Points")).not.toBeVisible();
    });

    test("all expected menu items are present", async ({ page }) => {
        await openMenu(page);

        await expect(page.getByText("Sign Out")).toBeVisible({
            timeout: 5000,
        });

        await expect(page.getByText("Profile & Settings")).toBeVisible();
        await expect(page.getByText("Buy Points")).toBeVisible();
        await expect(page.getByText("Redeem Points")).toBeVisible();
        await expect(page.getByText("Delegate Sales")).toBeVisible();
        await expect(page.getByText("Invite Friends")).toBeVisible();
        await expect(page.getByText("My Posts")).toBeVisible();
    });
});
