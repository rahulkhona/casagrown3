import { expect, test } from "@playwright/test";

test.describe("Closed-Loop Wallet & Refund Flow", () => {
    test("Segmented balances render and Refund UI operates securely", async ({ page }) => {
        // 1. Navigate to feed
        await page.goto("/feed");
        await page.waitForTimeout(2000);

        // Skips test logic if e2e auth boot bypass fails
        if (page.url().includes("/login")) {
            test.skip();
        }

        // 2. Navigate via Menu to Transaction History
        const menuTab = page.locator("text=/.*Menu.*/i").first();
        if (await menuTab.isVisible()) {
            await menuTab.click();
        }

        const historyOption = page.locator(
            "text=/Transaction History|Points Balance/i",
        ).first();
        await expect(historyOption).toBeVisible({ timeout: 10000 });
        await historyOption.click();

        // 3. Verify Strict Segregation of Points in the UI
        await expect(page.getByText(/Earned Balance/i).first()).toBeVisible({
            timeout: 10000,
        });
        await expect(page.getByText(/Purchased Balance/i).first())
            .toBeVisible();

        // 4. Assert Refund Escape Hatch is accessible
        const refundButton = page.getByText(/Refund Purchased Points/i).first();
        await expect(refundButton).toBeVisible();
        await refundButton.click();

        // 5. Wait for the Bottom Sheet portal to render Refund context
        await expect(page.getByText(/Refund Purchased Points/i).nth(1))
            .toBeVisible({ timeout: 5000 });

        // Assert the buckets payload arrived or fallback UI is clean
        await expect(
            page.locator("text=/available for refund|No active purchases/i")
                .first(),
        ).toBeVisible({ timeout: 5000 });
    });
});
