/**
 * Feed Filters E2E Tests — validate filter tabs, search, and category filtering.
 *
 * Prerequisites:
 * - Local Supabase running with seed data (supabase db reset)
 * - Web dev server running on port 3000
 * - Auth setup has run (automatic via Playwright config)
 */

import { expect, test } from "@playwright/test";

test.describe("Feed Filters", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/feed");
        await page.locator("text=Tomatoes").or(
            page.locator("text=No posts found"),
        ).first().waitFor({ timeout: 15_000 });
    });

    test("shows all filter tabs", async ({ page }) => {
        // All 6 filter pills should be visible
        await expect(page.locator("text=All Posts").first()).toBeVisible({
            timeout: 10_000,
        });
        await expect(page.locator("text=For Sale").first()).toBeVisible();
        await expect(page.locator("text=Wanted").first()).toBeVisible();
        await expect(page.locator("text=Services").first()).toBeVisible();
        await expect(page.locator("text=Advice").first()).toBeVisible();
    });

    test('clicking "For Sale" filter shows only sell posts', async ({ page }) => {
        // Click "For Sale" filter
        await page.locator("text=For Sale").first().click();
        await page.waitForTimeout(1000);

        // Tomatoes sell post should still be visible
        await expect(page.locator("text=Tomatoes").first()).toBeVisible({
            timeout: 10_000,
        });

        // The "Looking for" buy post should be hidden (it is a "want_to_buy" type)
        // Note: A "Basil" sell post exists from order seed data, so we check
        // specifically for the buy-post title which contains "Looking for"
        const buyPostVisible = await page
            .locator("text=Looking for")
            .first()
            .isVisible()
            .catch(() => false);
        // Buy posts should be filtered out
        expect(buyPostVisible).toBeFalsy();
    });

    test('clicking "Wanted" filter shows only buy posts', async ({ page }) => {
        // Click "Wanted" filter
        await page.locator("text=Wanted").first().click();
        await page.waitForTimeout(1000);

        // Basil buy post should be visible
        await expect(page.locator("text=basil").first()).toBeVisible({
            timeout: 10_000,
        });

        // Tomatoes sell post should NOT be visible
        const tomatoVisible = await page
            .locator("text=Tomatoes")
            .first()
            .isVisible()
            .catch(() => false);
        expect(tomatoVisible).toBeFalsy();
    });

    test('"All Posts" filter shows all post types', async ({ page }) => {
        // First switch to For Sale
        await page.locator("text=For Sale").first().click();
        await page.waitForTimeout(500);

        // Then switch back to All Posts
        await page.locator("text=All Posts").first().click();
        await page.waitForTimeout(1000);

        // Both sell and buy posts should be visible
        await expect(page.locator("text=Tomatoes").first()).toBeVisible({
            timeout: 10_000,
        });
        await expect(page.locator("text=basil").first()).toBeVisible({
            timeout: 5_000,
        });
    });

    test("search filters posts by keywords", async ({ page }) => {
        // Find the search input
        const searchInput = page
            .locator(
                "[placeholder*='Search'], [placeholder*='search'], input[type='search']",
            )
            .first();
        await expect(searchInput).toBeVisible();

        // Type "Tomatoes" in the search
        await searchInput.fill("Tomatoes");
        await page.waitForTimeout(1000);

        // Tomatoes post should be visible
        await expect(page.locator("text=Tomatoes").first()).toBeVisible({
            timeout: 10_000,
        });
    });

    test("search with no results shows empty state", async ({ page }) => {
        const searchInput = page
            .locator(
                "[placeholder*='Search'], [placeholder*='search'], input[type='search']",
            )
            .first();
        await expect(searchInput).toBeVisible();

        // Search for something that doesn't exist
        await searchInput.fill("xyznonexistent123");
        await page.waitForTimeout(1000);

        // Should show empty message or no posts
        const noPostsVisible = await page
            .locator("text=/no posts|no results/i")
            .first()
            .isVisible()
            .catch(() => false);
        // Or the feed should be empty (no post cards visible)
        const tomatoVisible = await page
            .locator("text=Tomatoes")
            .isVisible()
            .catch(() => false);
        // Either an empty state message appears, or the known posts are gone
        expect(noPostsVisible || !tomatoVisible).toBeTruthy();
    });
});
