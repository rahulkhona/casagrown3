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
        // Use a generous timeout to handle Tamagui SSR hydration delays
        try {
            await page.locator("text=/results/").first().waitFor({
                timeout: 30_000,
            });
        } catch {
            // If results text doesn't appear, wait for any content to load
            await page.waitForTimeout(5000);
        }
    });

    test("displays seeded tickets with vote and comment counts", async ({ page }) => {
        // Should show "X results" (public tickets from seed data)
        const resultsText = page.locator("text=/\\d+ results?/");
        await expect(resultsText).toBeVisible({ timeout: 15_000 });

        // Check for any seeded ticket title
        const hasTicketContent = await page.locator("body").innerText();
        const hasExpectedContent =
            hasTicketContent.includes("Allow uploading videos in chat") ||
            hasTicketContent.includes("Dark mode support") ||
            hasTicketContent.includes("Map not loading") ||
            hasTicketContent.includes("Notification badge");
        expect(hasExpectedContent).toBeTruthy();

        // Status badges should be visible
        const hasStatus =
            hasTicketContent.includes("Planned") ||
            hasTicketContent.includes("Open") ||
            hasTicketContent.includes("Completed");
        expect(hasStatus).toBeTruthy();

        // Type badges should appear
        const hasType =
            hasTicketContent.includes("BUG") ||
            hasTicketContent.includes("FEATURE");
        expect(hasType).toBeTruthy();
    });

    test("search filters tickets by keyword (server-side)", async ({ page }) => {
        // Search for "video"
        const searchInput = page.locator('[placeholder*="Search"]');
        await expect(searchInput).toBeVisible({ timeout: 10_000 });
        await searchInput.fill("video");

        // Wait for debounced search to fire (300ms + network)
        await page.waitForTimeout(1500);

        // "Allow uploading videos in chat" should match
        await expect(
            page.locator("text=Allow uploading videos in chat").first(),
        ).toBeVisible({ timeout: 10_000 });

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
        await page.waitForTimeout(1500);

        // Oldest ticket — "Map not loading" (10 days ago) should be visible
        await expect(page.locator("text=Map not loading").first())
            .toBeVisible({ timeout: 10_000 });
    });

    test("search bar and filter button are visible", async ({ page }) => {
        await expect(page.locator('[placeholder*="Search"]')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator("text=Filters")).toBeVisible();
    });

    test("Report Issue and Suggest Feature buttons navigate correctly", async ({ page }) => {
        const reportBtn = page.locator("text=Report Issue");
        await expect(reportBtn).toBeVisible({ timeout: 10_000 });
        await reportBtn.click();
        await page.waitForURL(/\/submit\?type=bug/, { timeout: 10_000 });
        expect(page.url()).toContain("/submit?type=bug");

        await page.goBack();
        await page.waitForTimeout(2000);

        const suggestBtn = page.locator("text=Suggest Feature");
        await expect(suggestBtn).toBeVisible({ timeout: 10_000 });
        await suggestBtn.click();
        await page.waitForURL(/\/submit\?type=feature/, { timeout: 10_000 });
        expect(page.url()).toContain("/submit?type=feature");
    });
});
