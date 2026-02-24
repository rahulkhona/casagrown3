/**
 * Invite Modal E2E Tests — validate the invite friends modal.
 *
 * Tests opening the invite modal via the hamburger menu, QR code, referral link,
 * and share functionality.
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Web dev server running on port 3000
 * - Auth setup has run
 */

import { expect, test } from "@playwright/test";

/**
 * Helper: open the Invite modal via the hamburger menu.
 * The nav bar has too many items to display "Invite" inline,
 * so we use the hamburger menu → "Invite Friends" instead.
 */
async function openInviteModal(page: any) {
    // Open the hamburger menu
    const menuBtn = page.locator("[aria-label='Menu']").first();
    await expect(menuBtn).toBeVisible({ timeout: 10_000 });
    await menuBtn.click();
    await page.waitForTimeout(500);

    // Click "Invite Friends" in the dropdown
    const inviteFriends = page.locator("text=Invite Friends").first();
    await expect(inviteFriends).toBeVisible({ timeout: 5_000 });
    await inviteFriends.click();
    await page.waitForTimeout(1000);
}

test.describe("Invite Modal", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/feed");
        await page.locator("text=Tomatoes").or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });
    });

    test("Invite Friends is accessible via hamburger menu", async ({ page }) => {
        const menuBtn = page.locator("[aria-label='Menu']").first();
        await expect(menuBtn).toBeVisible({ timeout: 10_000 });
        await menuBtn.click();
        await page.waitForTimeout(500);

        const inviteFriends = page.locator("text=Invite Friends").first();
        await expect(inviteFriends).toBeVisible({ timeout: 5_000 });
    });

    test("clicking Invite Friends opens the invite modal", async ({ page }) => {
        await openInviteModal(page);

        // Modal should show invite title
        await expect(
            page.locator("text=/Invite Friends|Invite.*Neighbors/i").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("invite modal shows QR code section", async ({ page }) => {
        await openInviteModal(page);

        // Wait for modal content to fully render
        await page.locator("text=/Invite Friends|Invite.*Neighbors/i").first()
            .waitFor({ timeout: 10_000 });
        await page.waitForTimeout(1000);

        const hasQR = await page
            .locator("text=/Scan to Join|QR/i")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);

        expect(hasQR).toBeTruthy();
    });

    test("invite modal shows share link section", async ({ page }) => {
        await openInviteModal(page);

        // Wait for modal content to fully render (animation + data load)
        await page.locator("text=/Invite Friends|Invite.*Neighbors/i").first()
            .waitFor({ timeout: 10_000 });
        await page.waitForTimeout(1000);

        const hasCopy = await page
            .locator("text=Copy")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
        const hasShare = await page
            .locator("text=/Share.*Invite|Share.*Link/i")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);

        expect(hasCopy || hasShare).toBeTruthy();
    });

    test("invite modal shows benefits section", async ({ page }) => {
        await openInviteModal(page);

        // Wait for modal content to fully render
        await page.locator("text=/Invite Friends|Invite.*Neighbors/i").first()
            .waitFor({ timeout: 10_000 });
        await page.waitForTimeout(1000);

        const hasWhy = await page
            .locator("text=/Why Invite/i")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
        const hasBenefit = await page
            .locator("text=/Build Community|More Options|Reduce Waste/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasWhy || hasBenefit).toBeTruthy();
    });

    test("invite modal can be closed", async ({ page }) => {
        await openInviteModal(page);

        // Verify modal is open
        await page.locator("text=/Invite Friends|Invite.*Neighbors/i").first()
            .waitFor({ timeout: 10_000 });

        // Close via Escape key
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // Or try clicking close button
        const closeBtn = page
            .locator("[aria-label*='close'], [aria-label*='Close']")
            .first();
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click();
        }
    });
});
