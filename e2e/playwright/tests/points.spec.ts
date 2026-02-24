import { expect, test } from "@playwright/test";

test.describe("Points System Flow", () => {
    test("dropdown opens and navigates to Buy Points", async ({ page }) => {
        // 1. Navigate to feed and wait for load
        await page.goto("/feed");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Wait for the Points badge in the header
        // On desktop it shows "points", on mobile "pts"
        // The badge is a TouchableOpacity (div on web), not a button
        const pointsBadge = page
            .locator("text=/\\d+\\s*(pts|points)/i")
            .first();

        await expect(pointsBadge).toBeVisible({ timeout: 15000 });

        // 2. Click the Points badge to toggle the dropdown
        await pointsBadge.click();
        await page.waitForTimeout(500);

        // 3. Verify the dropdown items appear
        const buyPointsOption = page.getByText("Buy Points").first();
        await expect(buyPointsOption).toBeVisible({ timeout: 5000 });

        const redeemPointsOption = page.getByText("Redeem").first();
        await expect(redeemPointsOption).toBeVisible({ timeout: 5000 });

        // 4. Navigate to Buy Points
        await buyPointsOption.click();

        // 5. Verify URL routed correctly
        await expect(page).toHaveURL(/.*\/buy-points.*/);

        // 6. Verify Buy Points Screen contents
        await expect(
            page.getByText("How many points do you want to buy?").first(),
        ).toBeVisible({ timeout: 10000 });
        await expect(
            page.getByText("Pay").first(),
        ).toBeVisible();
    });
});
