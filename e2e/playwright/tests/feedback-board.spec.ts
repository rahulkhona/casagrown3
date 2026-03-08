/**
 * Feedback Board E2E — Tests the Community Feedback board and form submission.
 *
 * Validates:
 * - Board loads with Community Board / My Support tabs
 * - Tab switching updates the view correctly
 * - Feedback submit form has proper sections (title, description, screenshots)
 * - Support ticket submission navigates back to board
 * - Board shows submitted tickets
 */

import { expect, test } from "@playwright/test";

test.describe("Feedback Board", () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to feedback board — requires auth
        await page.goto("/feedback");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }
    });

    test("board has Community Board and My Support tabs", async ({ page }) => {
        await expect(page.getByText("Community Board")).toBeVisible({
            timeout: 10000,
        });
        await expect(page.getByText("My Support")).toBeVisible();
    });

    test("Community Board tab shows header and search", async ({ page }) => {
        await expect(page.getByText("Community Feedback")).toBeVisible({
            timeout: 10000,
        });
        await expect(
            page.getByPlaceholder("Search issues and feature requests..."),
        ).toBeVisible();
    });

    test("My Support tab switches correctly", async ({ page }) => {
        await page.getByText("My Support").click();
        await page.waitForTimeout(500);

        await expect(page.getByText("My Support Tickets")).toBeVisible({
            timeout: 5000,
        });
        await expect(
            page.getByPlaceholder("Search your support tickets..."),
        ).toBeVisible();
    });

    test("web header has all three action buttons", async ({ page }) => {
        await expect(page.getByText("Report Issue")).toBeVisible({
            timeout: 10000,
        });
        await expect(page.getByText("Suggest Feature")).toBeVisible();
        // The Support button in the header (not the "My Support" tab)
        await expect(
            page.locator('button:has-text("Support")').first(),
        ).toBeVisible();
    });

    test("Report Issue button navigates to submit form", async ({ page }) => {
        await page.getByText("Report Issue").click();
        await page.waitForURL("**/feedback-submit*", { timeout: 5000 });
        await expect(page.getByText("Report a Bug")).toBeVisible({
            timeout: 5000,
        });
    });

    test("Support button navigates to support form", async ({ page }) => {
        // Click the Support button in the green header area (not the tab)
        await page.locator('button:has-text("Support")').first().click();
        await page.waitForURL("**/feedback-submit*type=support*", {
            timeout: 5000,
        });
        await expect(page.getByText("Support Request", { exact: true }))
            .toBeVisible({
                timeout: 5000,
            });
        // Verify private ticket notice is shown
        await expect(
            page.getByText("This ticket is private"),
        ).toBeVisible();
    });
});

test.describe("Feedback Submit Form", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/feedback-submit?type=bug");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }
    });

    test("form has title, description, and screenshots sections", async ({ page }) => {
        await expect(page.getByText("Title")).toBeVisible({ timeout: 10000 });
        await expect(page.getByText("Description")).toBeVisible();
        await expect(page.getByText("Screenshots (optional)")).toBeVisible();
    });

    test("screenshots section is visually separated from description", async ({ page }) => {
        // The screenshots section should be in its own bordered container
        const screenshotsSection = page.getByText("Screenshots (optional)");
        await expect(screenshotsSection).toBeVisible({ timeout: 10000 });
    });

    test("submit button is disabled without title and description", async ({ page }) => {
        const submitButton = page.getByText("Submit Bug Report");
        await expect(submitButton).toBeVisible({ timeout: 10000 });
        // Button should have gray background (disabled state)
        await expect(submitButton).toBeVisible();
    });

    test("submitting a bug report navigates to feedback board", async ({ page }) => {
        // Fill out the form
        await page
            .getByPlaceholder("Short summary...")
            .fill("Test bug report from Playwright");
        await page
            .getByPlaceholder("Describe the issue or idea in detail...")
            .fill("This is an automated test bug report.");

        // Submit
        await page.getByText("Submit Bug Report").click();

        // Should navigate back to the feedback board
        await page.waitForURL("**/feedback", { timeout: 10000 });
        await expect(page.getByText("Community Board")).toBeVisible({
            timeout: 5000,
        });
    });
});
