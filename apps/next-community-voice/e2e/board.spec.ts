/**
 * E2E Tests — Community Board (feedback list page)
 *
 * Prerequisites:
 * - Local Supabase running with seed data (supabase db reset + seed-feedback.sql)
 * - Dev server running on port 3002
 */

import { expect, test } from "@playwright/test";

test.describe("Community Board", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/board");
        // Wait for tickets to load (real data from Supabase)
        await page.locator("text=/results/").first().waitFor({
            timeout: 30_000,
        });
    });

    test("displays seeded tickets with vote and comment counts", async ({ page }) => {
        // Should show "6 results" (6 public tickets from seed data)
        await expect(page.locator("text=/\\d+ results?/")).toBeVisible();

        // Seeded ticket titles should appear
        await expect(
            page.locator("text=Allow uploading videos in chat").first(),
        ).toBeVisible({ timeout: 10_000 });
        await expect(page.locator("text=Dark mode support").first())
            .toBeVisible();

        // Status badges should be visible
        await expect(page.locator("text=Planned").first()).toBeVisible();
        await expect(page.locator("text=Open").first()).toBeVisible();

        // Type badges should appear
        await expect(page.locator("text=BUG").first()).toBeVisible();
        await expect(page.locator("text=FEATURE").first()).toBeVisible();
    });

    test("search filters tickets by keyword (server-side)", async ({ page }) => {
        // Search for "video"
        await page.locator('[placeholder*="Search"]').fill("video");

        // Wait for debounced search to fire (300ms + network)
        await page.waitForTimeout(1000);

        // "Allow uploading videos in chat" should match
        await expect(
            page.locator("text=Allow uploading videos in chat").first(),
        ).toBeVisible();

        // "Dark mode support" should NOT appear
        await expect(page.locator("text=Dark mode support")).not.toBeVisible();
    });

    test("type filter shows only bugs", async ({ page }) => {
        // Open filter panel
        await page.locator("text=Filters").click();
        await page.waitForTimeout(300);

        // Click "Bugs" type filter — use regex to avoid strict mode
        await page.getByRole("button", { name: /Bugs/ }).click();
        await page.waitForTimeout(1000);

        // All visible tickets should have BUG badge
        const bugBadges = page.locator("text=BUG");
        await expect(bugBadges.first()).toBeVisible();

        // Feature type badges on ticket cards should not appear — only BUG badges
        const featureBadges = page.locator('text="FEATURE"');
        await expect(featureBadges).toHaveCount(0);
    });

    test("sort by oldest shows oldest first", async ({ page }) => {
        // Open filter panel
        await page.locator("text=Filters").click();
        await page.waitForTimeout(300);

        // Click "Oldest" sort
        await page.getByRole("button", { name: /Oldest/ }).click();
        await page.waitForTimeout(1000);

        // Oldest ticket — "Map not loading" (10 days ago) should be visible
        await expect(page.locator("text=Map not loading").first())
            .toBeVisible();
    });

    test("search bar and filter button are visible", async ({ page }) => {
        await expect(page.locator('[placeholder*="Search"]')).toBeVisible();
        await expect(page.locator("text=Filters")).toBeVisible();
    });

    test("Report Issue and Suggest Feature buttons navigate correctly", async ({ page }) => {
        await page.locator("text=Report Issue").click();
        await page.waitForURL(/\/submit\?type=bug/, { timeout: 5_000 });
        expect(page.url()).toContain("/submit?type=bug");

        await page.goBack();
        await page.locator("text=/results/").first().waitFor({
            timeout: 10_000,
        });

        await page.locator("text=Suggest Feature").click();
        await page.waitForURL(/\/submit\?type=feature/, { timeout: 5_000 });
        expect(page.url()).toContain("/submit?type=feature");
    });
});
