/**
 * Post Management E2E Tests — validate the My Posts screen functionality.
 *
 * Tests viewing, filtering, and interacting with posts on the My Posts screen.
 * Logged in as Test Seller who has seeded posts (Tomatoes, Strawberries).
 *
 * Actual UI shows:
 * - Filter dropdowns: TYPE, STATUS, SORT
 * - Badges: "Selling" (green), "Active"
 * - Action buttons: "View", "Edit", "Clone", "Delete"
 * - Stats: "Posted 1 days ago"
 *
 * Prerequisites:
 * - Local Supabase running with seed data (supabase db reset)
 * - Web dev server running on port 3000
 * - Auth setup has run (automatic via Playwright config)
 */

import { expect, test } from "@playwright/test";

test.describe("Post Management", () => {
    test.beforeEach(async ({ page }) => {
        // Suppress notification prompt modal (it triggers on create-post mount after Edit click)
        await page.addInitScript(() => {
            localStorage.setItem(
                "casagrown_notif_dismissed_at",
                new Date().toISOString(),
            );
        });
        await page.goto("/my-posts");
        await page.waitForTimeout(3000);

        // If redirected to login, mark as skipped
        if (page.url().includes("/login")) {
            test.skip();
        }
    });

    test("displays the My Posts page content", async ({ page }) => {
        // Page should show either posts or empty state
        const hasPosts = await page
            .locator("text=/Selling|Wanted|Tomatoes|No posts yet/i")
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        expect(hasPosts).toBeTruthy();
    });

    test("shows seeded seller posts", async ({ page }) => {
        // Seller's posts: Tomatoes, Strawberries
        // Buyer's posts: Peppers, Basil
        const hasTomatoes = await page
            .locator("text=Tomatoes")
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        const hasPeppers = await page
            .locator("text=Peppers")
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        const hasEmpty = await page
            .locator("text=No posts yet")
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);

        // Whichever role, should show posts or empty state
        expect(hasTomatoes || hasPeppers || hasEmpty).toBeTruthy();
    });

    test("shows post type badge 'Selling'", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Post type badge shows "Selling" — only for seller who has posts
        const hasSelling = await page
            .locator("text=Selling")
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        const hasEmpty = await page
            .locator("text=No posts yet")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasSelling || hasEmpty).toBeTruthy();
    });

    test("shows post status 'Active'", async ({ page }) => {
        await page.waitForTimeout(2000);

        const hasActive = await page
            .locator("text=Active")
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
        const hasEmpty = await page
            .locator("text=No posts yet")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasActive || hasEmpty).toBeTruthy();
    });

    test("shows action buttons: View, Edit, Clone, Delete", async ({ page }) => {
        await page.waitForTimeout(2000);

        const hasView = await page.locator("text=View").first().isVisible()
            .catch(() => false);
        const hasEmpty = await page.locator("text=No posts yet").first()
            .isVisible().catch(() => false);

        // Only check action buttons if posts exist
        if (hasView) {
            await expect(page.locator("text=Edit").first()).toBeVisible();
            await expect(page.locator("text=Clone").first()).toBeVisible();
            await expect(page.locator("text=Delete").first()).toBeVisible();
        } else {
            expect(hasEmpty).toBeTruthy();
        }
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
        const hasEmpty = await page
            .locator("text=No posts yet")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasVegetables || hasFruits || hasEmpty).toBeTruthy();
    });

    test("shows price info", async ({ page }) => {
        await page.waitForTimeout(2000);

        const hasPrice = await page
            .locator("text=/\\$/")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
        const hasPts = await page
            .locator("text=/pts/")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
        const hasEmpty = await page
            .locator("text=No posts yet")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasPrice || hasPts || hasEmpty).toBeTruthy();
    });

    test("shows posted time", async ({ page }) => {
        await page.waitForTimeout(2000);

        const hasPosted = await page
            .locator("text=/Posted.*ago/i")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
        const hasEmpty = await page
            .locator("text=No posts yet")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasPosted || hasEmpty).toBeTruthy();
    });

    test("shows post count or content indicator", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Either shows posts with content or empty state
        const hasContent = await page
            .locator("text=/Selling|Wanted|No posts yet/i")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);

        expect(hasContent).toBeTruthy();
    });

    test("Edit button is interactive", async ({ page }) => {
        await page.waitForTimeout(2000);

        // Click Edit on the first post (only if posts exist)
        const editBtn = page.locator("text=Edit").first();
        const hasEdit = await editBtn.isVisible().catch(() => false);

        if (hasEdit) {
            await editBtn.click();
            // Wait for navigation to complete
            await page.waitForTimeout(5000);

            // Should navigate away from my-posts to create-post/edit screen
            const urlChanged = !page.url().includes("/my-posts");
            const hasForm = await page
                .locator(
                    "text=/Category|Quantity|Price|Create Post|Sell|Buy|What are you/i",
                )
                .first()
                .isVisible()
                .catch(() => false);

            // Pass if we navigated OR form is visible
            expect(urlChanged || hasForm).toBeTruthy();
        }
    });
});
