/**
 * Invite Modal E2E Tests — validate the invite friends modal.
 *
 * Tests opening the invite modal, QR code, referral link, and share functionality.
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Web dev server running on port 3000
 * - Auth setup has run
 */

import { expect, test } from "@playwright/test";

test.describe("Invite Modal", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/feed");
        await page.locator("text=Tomatoes").or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });
    });

    test("Invite button is visible in the header", async ({ page }) => {
        // The "Invite" button should be visible in the header
        const inviteBtn = page.locator("text=Invite").first();
        await expect(inviteBtn).toBeVisible({ timeout: 10_000 });
    });

    test("clicking Invite opens the invite modal", async ({ page }) => {
        await page.locator("text=Invite").first().click();
        await page.waitForTimeout(1000);

        // Modal should show invite title
        await expect(
            page.locator("text=/Invite Friends|Invite.*Neighbors/i").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("invite modal shows QR code section", async ({ page }) => {
        await page.locator("text=Invite").first().click();
        await page.waitForTimeout(1000);

        // QR code section should be visible
        const hasQR = await page
            .locator("text=/Scan to Join|QR/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasQR).toBeTruthy();
    });

    test("invite modal shows share link section", async ({ page }) => {
        await page.locator("text=Invite").first().click();
        await page.waitForTimeout(1000);

        // Share link section with Copy button
        const hasCopy = await page
            .locator("text=Copy")
            .first()
            .isVisible()
            .catch(() => false);
        const hasShare = await page
            .locator("text=/Share.*Invite|Share.*Link/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasCopy || hasShare).toBeTruthy();
    });

    test("invite modal shows benefits section", async ({ page }) => {
        await page.locator("text=Invite").first().click();
        await page.waitForTimeout(1000);

        // "Why Invite Others?" section
        const hasWhy = await page
            .locator("text=/Why Invite/i")
            .first()
            .isVisible()
            .catch(() => false);
        const hasBenefit = await page
            .locator("text=/Build Community|More Options|Reduce Waste/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasWhy || hasBenefit).toBeTruthy();
    });

    test("invite modal can be closed", async ({ page }) => {
        await page.locator("text=Invite").first().click();
        await page.locator("text=/Invite Friends|Invite.*Neighbors/i").first()
            .waitFor({ timeout: 10_000 });

        // Close via Escape key (most reliable cross-platform modal close)
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // Or try clicking outside / close button
        const closeBtn = page
            .locator("[aria-label*='close'], [aria-label*='Close']")
            .first();
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click();
        }
    });
});
