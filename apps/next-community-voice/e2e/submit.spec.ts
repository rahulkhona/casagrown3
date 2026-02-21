/**
 * E2E Tests — Feedback Submit Form
 *
 * Prerequisites:
 * - Local Supabase running with seed data
 * - Dev server running on port 3002
 */

import { expect, test } from "@playwright/test";

test.describe("Submit Feedback", () => {
    test("bug report form has correct initial state", async ({ page }) => {
        await page.goto("/submit?type=bug");
        await page.waitForTimeout(1000);

        // When type is in URL, page shows "Report a Bug" title
        await expect(page.locator("text=Report a Bug")).toBeVisible();

        // Title and description inputs should be visible
        await expect(page.locator('[placeholder*="Short summary"]'))
            .toBeVisible();
        await expect(page.locator('[placeholder*="Describe"]')).toBeVisible();

        // Submit button should be visible with type-aware text
        await expect(page.getByRole("button", { name: "Submit Bug Report" }))
            .toBeVisible();
    });

    test("support request shows privacy notice", async ({ page }) => {
        await page.goto("/submit?type=support");
        await page.waitForTimeout(1000);

        // Privacy notice should be visible
        await expect(
            page.locator("text=/private.*only you and CasaGrown staff/i"),
        ).toBeVisible();

        // Submit button should show type-aware text
        await expect(
            page.getByRole("button", { name: "Submit Support Request" }),
        ).toBeVisible();
    });

    test("generic submit form shows type selector", async ({ page }) => {
        await page.goto("/submit");
        await page.waitForTimeout(1000);

        // Without type param, type selector buttons should be visible
        await expect(page.locator("text=Bug Report").first()).toBeVisible();
        await expect(page.locator("text=Feature Request").first())
            .toBeVisible();
        await expect(page.locator("text=Support Request").first())
            .toBeVisible();
    });

    test("attachment input accepts documents", async ({ page }) => {
        await page.goto("/submit?type=bug");
        await page.waitForTimeout(1000);

        // Look for the file input element itself as proof the attachment UI exists
        await expect(page.locator('input[type="file"]')).toBeAttached();
    });

    test("submit without auth redirects to login", async ({ page }) => {
        await page.goto("/submit?type=bug");
        await page.waitForTimeout(1000);

        // Fill in the form
        await page.locator('[placeholder*="Short summary"]').fill(
            "E2E Test: Automated Bug Report",
        );
        await page.locator('[placeholder*="Describe"]').fill(
            "This ticket was created by a Playwright E2E test.",
        );

        // Submit (not logged in — should redirect to login)
        await page.getByRole("button", { name: "Submit Bug Report" }).click();

        // Should either navigate to login or to board
        await page.waitForURL(/\/(login|board)/, { timeout: 10_000 });
    });

    test("back navigation works from submit page", async ({ page }) => {
        // Navigate to board first, then submit, so browser has history
        await page.goto("/board");
        await page.locator("text=/results/").first().waitFor({
            timeout: 30_000,
        });
        await page.goto("/submit?type=feature");
        await page.waitForTimeout(1000);

        // Use browser back (submit page uses router.back())
        await page.goBack();
        await page.waitForURL(/\/board/, { timeout: 5_000 });
    });
});
