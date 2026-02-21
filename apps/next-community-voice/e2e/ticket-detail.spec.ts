/**
 * E2E Tests — Ticket Detail page
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Dev server running on port 3002
 */

import { expect, test } from "@playwright/test";

test.describe("Ticket Detail", () => {
    test("navigating from board to detail shows ticket content", async ({ page }) => {
        await page.goto("/board");
        // Wait for board data — either results text or a ticket title appears
        await page.locator("text=Allow uploading videos in chat").or(
            page.locator("text=/\\d+ results?/"),
        ).first().waitFor({ timeout: 20_000 });

        // Click on "Allow uploading videos in chat" ticket
        await page.locator("text=Allow uploading videos in chat").first()
            .click();
        await page.waitForTimeout(2000);

        // Should show full title
        await expect(page.locator("text=Allow uploading videos in chat"))
            .toBeVisible();

        // Should show description text
        await expect(page.locator("text=/share short videos/i").first())
            .toBeVisible();

        // Should show vote count
        await expect(page.locator("text=/\\d+/").first()).toBeVisible();

        // Should show "Back to Board" button
        await expect(page.locator("text=Back to Board")).toBeVisible();

        // Should show comments section
        await expect(page.locator("text=/Comments \\(\\d+\\)/").first())
            .toBeVisible();
    });

    test("shows comments with official badge", async ({ page }) => {
        await page.goto("/board");
        await page.locator("text=/results/").first().waitFor({
            timeout: 15_000,
        });

        // Navigate to the ticket with official comments
        await page.locator("text=Allow uploading videos in chat").first()
            .click();
        await page.waitForTimeout(2000);

        // Should have official comment with OFFICIAL badge
        await expect(page.locator("text=OFFICIAL").first()).toBeVisible({
            timeout: 10_000,
        });

        // Official comment content should appear
        await expect(page.locator("text=/roadmap|Q2/i").first()).toBeVisible();
    });

    test("comment section shows login prompt when not logged in", async ({ page }) => {
        await page.goto("/board");
        await page.locator("text=/results/").first().waitFor({
            timeout: 15_000,
        });

        await page.locator("text=Allow uploading videos in chat").first()
            .click();
        await page.waitForTimeout(2000);

        // When not logged in, should show "Log in to comment" button
        await expect(page.getByRole("button", { name: "Log in to comment" }))
            .toBeVisible();
    });

    test("back to board button works", async ({ page }) => {
        await page.goto("/board");
        await page.locator("text=/results/").first().waitFor({
            timeout: 15_000,
        });

        await page.locator("text=Allow uploading videos in chat").first()
            .click();
        await page.waitForTimeout(2000);

        await page.locator("text=Back to Board").click();
        await page.waitForURL(/\/board$/, { timeout: 5_000 });

        // Should be back on the board with tickets
        await expect(page.locator("text=/results/").first()).toBeVisible();
    });
});
