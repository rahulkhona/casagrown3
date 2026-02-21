import { expect, test } from "@playwright/test";

test.describe("Points System Flow", () => {
    test("dropdown opens and navigates to Buy Points", async ({ page }) => {
        // 1. Navigate to home and wait for load
        await page.goto("/");

        // We expect the backend login / mocked auth to drop us on the feed
        // Wait for the Points badge in the header
        const pointsBadge = page.locator("button", { hasText: "pts" }).or(
            page.locator("button", { hasText: "points" }),
        ).first();

        // Fallback locator if the explicit text isn't matching perfectly
        // Find the header Points section - it should have Coins icon or be clickable
        await expect(pointsBadge).toBeVisible({ timeout: 15000 });

        // 2. Click the Points badge to toggle the dropdown
        await pointsBadge.click();

        // 3. Verify the dropdown items appear
        const buyPointsOption = page.locator("text=Buy Points").first();
        await expect(buyPointsOption).toBeVisible();

        const redeemPointsOption = page.locator("text=Redeem Points").first();
        await expect(redeemPointsOption).toBeVisible();

        // 4. Navigate to Buy Points
        await buyPointsOption.click();

        // 5. Verify URL routed correctly
        await expect(page).toHaveURL(/.*\/buy-points.*/);

        // 6. Verify Buy Points Screen contents
        await expect(page.locator("text=Add Points to Your Loop"))
            .toBeVisible();
        await expect(page.locator("text=1000 Points").first()).toBeVisible();
    });
});
