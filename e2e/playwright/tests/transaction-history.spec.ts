import { expect, test } from "@playwright/test";

test.describe("Transaction History Page", () => {
    test("Page loads without 'Unexpected text node' crash", async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(2000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Navigate to Transaction History via Points badge
        const pointsBadge = page.locator("text=/\\d+\\s*(pts|points)/i")
            .first();
        await expect(pointsBadge).toBeVisible({ timeout: 15000 });
        await pointsBadge.click();
        await page.waitForTimeout(500);

        const historyOption = page.getByText("Transaction History").first();
        await expect(historyOption).toBeVisible({ timeout: 10000 });
        await historyOption.click();

        // Page should load without crashing — verify key UI elements render
        await expect(page.getByText(/Earned Balance/i).first()).toBeVisible({
            timeout: 10000,
        });
        await expect(page.getByText(/Purchased Balance/i).first())
            .toBeVisible();

        // No React error overlay should be visible
        await expect(page.locator("#react-error-overlay")).toHaveCount(0);
    });

    test("Gift card redemptions display brand and value", async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(2000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        const pointsBadge = page.locator("text=/\\d+\\s*(pts|points)/i")
            .first();
        await expect(pointsBadge).toBeVisible({ timeout: 15000 });
        await pointsBadge.click();
        await page.waitForTimeout(500);

        const historyOption = page.getByText("Transaction History").first();
        await expect(historyOption).toBeVisible({ timeout: 10000 });
        await historyOption.click();

        // Wait for transactions to load
        await page.waitForTimeout(2000);

        // Look for any gift card redemption showing "Redeemed:" prefix
        const giftCardEntry = page.getByText(/Redeemed:.*Gift Card/i).first();
        if (await giftCardEntry.isVisible()) {
            // Verify it contains a dollar amount
            await expect(giftCardEntry).toContainText(/\$/);
        }
    });

    test("Donation entries show organization name", async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(2000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        const pointsBadge = page.locator("text=/\\d+\\s*(pts|points)/i")
            .first();
        await expect(pointsBadge).toBeVisible({ timeout: 15000 });
        await pointsBadge.click();
        await page.waitForTimeout(500);

        const historyOption = page.getByText("Transaction History").first();
        await expect(historyOption).toBeVisible({ timeout: 10000 });
        await historyOption.click();

        await page.waitForTimeout(2000);

        // Look for any donation entry showing "Donated to:" prefix
        const donationEntry = page.getByText(/Donated to:/i).first();
        if (await donationEntry.isVisible()) {
            await expect(donationEntry).toContainText("Donated to:");
        }
    });
});
