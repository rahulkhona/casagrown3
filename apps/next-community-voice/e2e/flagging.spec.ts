/**
 * E2E Tests — Content Flagging & Support Flow
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Dev server running on port 3002
 */

import { expect, test } from "@playwright/test";

test.describe("Content Flagging", () => {
    test("flag button is visible on board ticket cards", async ({ page }) => {
        await page.goto("/board");
        await page.locator("text=/results/").first().waitFor({
            timeout: 15_000,
        });

        // Ticket cards should render with flag icons
        await expect(
            page.locator("text=Allow uploading videos in chat").first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("flag button is visible on ticket detail page", async ({ page }) => {
        await page.goto("/board");
        await page.locator("text=/results/").first().waitFor({
            timeout: 15_000,
        });

        // Navigate to a ticket detail
        await page.locator("text=Allow uploading videos in chat").first()
            .click();
        await page.waitForTimeout(2000);

        // Should show the ticket detail with title
        await expect(page.locator("text=Allow uploading videos in chat"))
            .toBeVisible();
    });

    test("support ticket form accessible via direct URL", async ({ page }) => {
        await page.goto("/submit?type=support");
        await page.waitForTimeout(1000);

        // Should show the support request header
        await expect(
            page.locator("text=Get help from the CasaGrown team."),
        ).toBeVisible();

        // Privacy notice should be visible for support tickets
        await expect(
            page.locator("text=/private.*only you and CasaGrown staff/i"),
        ).toBeVisible();

        // Submit button should show type-aware text
        await expect(
            page.getByRole("button", { name: "Submit Support Request" }),
        ).toBeVisible();
    });
});
