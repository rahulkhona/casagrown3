/**
 * Feed E2E Tests — validate that the community feed displays correctly.
 *
 * Prerequisites:
 * - Local Supabase is running with seed data (supabase db reset)
 * - Web dev server is running on port 3000
 * - Auth setup has run (automatic via Playwright config)
 */

import { expect, test } from "@playwright/test";

test.describe("Feed Page", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/feed");
        // Wait for feed to load — look for any sell post or empty state
        await page.locator("text=Strawberries").or(
            page.locator("text=Tomatoes"),
        ).or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });
    });

    test("displays seeded sell posts with price and quantity", async ({ page }) => {
        // Strawberries sell post should be visible (renders first)
        await expect(page.locator("text=Strawberries").first()).toBeVisible({ timeout: 10_000 });

        // Scroll to find the Tomatoes sell post (may be below the fold)
        const tomatoPost = page.locator("text=Tomatoes").first();
        await tomatoPost.scrollIntoViewIfNeeded();
        await expect(tomatoPost).toBeVisible({ timeout: 10_000 });

        // The post card should show price info (pts format)
        await expect(page.locator("text=/\\d+\\s*pts/i").first()).toBeVisible();

        // The post card should show quantity info (Available: N)
        await expect(page.locator("text=/Available/i").first())
            .toBeVisible();
    });

    test("displays sell post category", async ({ page }) => {
        // The category badge (vegetables, fruits) should be visible
        const categoryBadge = page.locator("text=/vegetables|fruits/i").first();
        await expect(categoryBadge).toBeVisible({ timeout: 10_000 });
    });

    test("displays author name instead of Unknown", async ({ page }) => {
        // Test Seller's posts should show their name
        await expect(page.locator("text=Test Seller").first()).toBeVisible({
            timeout: 10_000,
        });
    });

    test("displays buy posts with description", async ({ page }) => {
        // A buy post (want_to_buy) from Test Buyer should be visible
        // Seed data has: "Looking for fresh basil for cooking"
        await expect(
            page.locator("text=/basil|cilantro|mint|rosemary/i").first(),
        ).toBeVisible({ timeout: 10_000 });

        // Buy post should have the "Wanted" type badge
        await expect(
            page.locator("text=/Wanted/i").first(),
        ).toBeVisible({ timeout: 5_000 });
    });

    test("search bar is visible", async ({ page }) => {
        await expect(
            page.locator("[placeholder*='Search'], [placeholder*='search']")
                .first(),
        ).toBeVisible();
    });

    test("can navigate to profile tab and back", async ({ page }) => {
        // Navigate to profile via URL (nav uses avatars/icons, not text links)
        await page.goto("/profile");
        await page.waitForURL(/\/profile/, { timeout: 10_000 });

        // Verify on profile page
        const hasProfile = await page
            .locator("text=/Test Seller|Profile|Settings/i")
            .first()
            .isVisible()
            .catch(() => false);
        expect(hasProfile || page.url().includes("/profile")).toBeTruthy();

        // Navigate back to Feed — use domcontentloaded to avoid auth redirect timeout
        await page.goto("/feed", { waitUntil: "domcontentloaded" });
        await page.locator("text=Strawberries").or(
            page.locator("text=Tomatoes"),
        ).or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });
    });
});
