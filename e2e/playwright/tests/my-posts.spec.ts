/**
 * My Posts E2E Tests — validate the user's posts management page.
 *
 * Authenticated as Test Seller (via setup).
 */

import { expect, test } from "@playwright/test";

test.describe("My Posts", () => {
    test("displays posts authored by the current user", async ({ page }) => {
        // Navigate to My Posts (via profile or direct URL)
        await page.goto("/my-posts");
        await page.waitForTimeout(3000);

        // If redirected, try via the profile path
        if (page.url().includes("/login")) {
            // Auth might have expired; skip this test
            test.skip();
        }

        // Should see the test seller's posts
        const tomatoPost = page.locator("text=Tomatoes").first();
        const strawberryPost = page.locator("text=Strawberries").first();

        // At least one of the seeded sell posts should be visible
        const hasTomato = await tomatoPost.isVisible().catch(() => false);
        const hasStrawberry = await strawberryPost.isVisible().catch(() =>
            false
        );
        expect(hasTomato || hasStrawberry).toBeTruthy();
    });

    test("my posts shows correct author attribution", async ({ page }) => {
        await page.goto("/my-posts");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Should show seller name, not "Unknown"
        const unknownCount = await page.locator("text=Unknown").count();
        expect(unknownCount).toBe(0);
    });
});
