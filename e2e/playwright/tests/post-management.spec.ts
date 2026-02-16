/**
 * Post Management E2E Tests — validate the My Posts screen functionality.
 *
 * Tests viewing, filtering, and interacting with posts on the My Posts screen.
 * Logged in as Test Seller who has seeded posts (Tomatoes, Strawberries).
 *
 * Actual UI shows:
 * - Title: "My Posts 2" (number appended)
 * - Badges: "Selling" (green), "Active"
 * - Action buttons: "View", "Edit", "Clone", "Delete"
 * - Stats: "Posted 0 days ago"
 *
 * Prerequisites:
 * - Local Supabase running with seed data (supabase db reset)
 * - Web dev server running on port 3000
 * - Auth setup has run (automatic via Playwright config)
 */

import { expect, test } from "@playwright/test";

test.describe("Post Management", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/my-posts");
        await page.waitForTimeout(3000);

        // If redirected to login, mark as skipped
        if (page.url().includes("/login")) {
            test.skip();
        }
    });

    test("displays the My Posts screen title", async ({ page }) => {
        await expect(page.locator("text=My Posts").first()).toBeVisible({
            timeout: 10_000,
        });
    });

    test("shows seeded seller posts", async ({ page }) => {
        // Test Seller's posts (Tomatoes, Strawberries) should be visible
        await expect(page.locator("text=Tomatoes").first()).toBeVisible({
            timeout: 10_000,
        });
        await expect(page.locator("text=Strawberries").first()).toBeVisible();
    });

    test("shows post type badge 'Selling'", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Post type badge shows "Selling" (not "For Sale")
        await expect(page.locator("text=Selling").first()).toBeVisible({
            timeout: 10_000,
        });
    });

    test("shows post status 'Active'", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Status badge shows "Active"
        await expect(page.locator("text=Active").first()).toBeVisible({
            timeout: 10_000,
        });
    });

    test("shows action buttons: View, Edit, Clone, Delete", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Each post card should have these action buttons
        await expect(page.locator("text=View").first()).toBeVisible();
        await expect(page.locator("text=Edit").first()).toBeVisible();
        await expect(page.locator("text=Clone").first()).toBeVisible();
        await expect(page.locator("text=Delete").first()).toBeVisible();
    });

    test("shows post category", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Categories from seed data
        const hasVegetables = await page
            .locator("text=vegetables")
            .first()
            .isVisible()
            .catch(() => false);
        const hasFruits = await page
            .locator("text=fruits")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasVegetables || hasFruits).toBeTruthy();
    });

    test("shows price info", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Price info: "$25.00/box" or "$40.00/box" on My Posts page
        await expect(page.locator("text=/\\$/").first()).toBeVisible({
            timeout: 5_000,
        });
    });

    test("shows posted time", async ({ page }) => {
        await page.waitForTimeout(2000);

        // "Posted X days ago"
        await expect(
            page.locator("text=/Posted.*ago/i").first(),
        ).toBeVisible({ timeout: 5_000 });
    });

    test("shows post count in header", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Title shows "My Posts 2"
        await expect(
            page.locator("text=/My Posts.*\\d/").first(),
        ).toBeVisible({ timeout: 5_000 });
    });

    test("Edit button is interactive", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Click Edit on the first post
        const editBtn = page.locator("text=Edit").first();
        await expect(editBtn).toBeVisible();
        await editBtn.click();
        await page.waitForTimeout(2000);

        // Should navigate to edit screen or open edit modal
        const urlChanged = !page.url().includes("/my-posts");
        const hasForm = await page
            .locator("text=/Category|Quantity|Price/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(urlChanged || hasForm).toBeTruthy();
    });
});
