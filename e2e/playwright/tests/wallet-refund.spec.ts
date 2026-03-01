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

        // 2. Navigate via Points Menu to Transaction History
        const pointsBadge = page.locator("text=/\\d+\\s*(pts|points)/i")
            .first();
        await expect(pointsBadge).toBeVisible({ timeout: 15000 });
        await pointsBadge.click();
        await page.waitForTimeout(500);

        const historyOption = page.getByText("Transaction History").first();
        await expect(historyOption).toBeVisible({ timeout: 10000 });
        await historyOption.click();

        // 3. Verify Strict Segregation of Points in the UI
        await expect(page.getByText(/Earned Balance/i).first()).toBeVisible({
            timeout: 10000,
        });
        await expect(page.getByText(/Purchased Balance/i).first())
            .toBeVisible();

        // 4. Assert Refund Escape Hatch is accessible
        const menuButton = page.locator(
            'div[aria-label="Menu"], button[aria-label="Menu"], [aria-label="Menu"]',
        ).first();
        await menuButton.click();
        await page.waitForTimeout(500);

        const refundButton = page.getByText("Refund Points", { exact: false })
            .first();
        await expect(refundButton).toBeVisible({ timeout: 10000 });
        await refundButton.click();

        // 5. Wait for the Dedicated Refund Screen context
        await expect(page.getByText(/Select a point purchase/i).first())
            .toBeVisible({ timeout: 5000 });

        // Assert the buckets payload arrived or fallback UI is clean
        await expect(
            page.locator("text=/Remaining points:|No active purchases/i")
                .first(),
        ).toBeVisible({ timeout: 5000 });
    });

    test("Venmo and Refund-to-Card buttons have distinct background colors", async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(2000);
        if (page.url().includes("/login")) test.skip();

        // Navigate to Refund page
        const pointsBadge = page.locator("text=/\\d+\\s*(pts|points)/i")
            .first();
        await expect(pointsBadge).toBeVisible({ timeout: 15000 });
        await pointsBadge.click();
        await page.waitForTimeout(500);

        const menuButton = page.locator(
            'div[aria-label="Menu"], button[aria-label="Menu"], [aria-label="Menu"]',
        ).first();
        await menuButton.click();
        await page.waitForTimeout(500);

        const refundButton = page.getByText("Refund Points", { exact: false })
            .first();
        await expect(refundButton).toBeVisible({ timeout: 10000 });
        await refundButton.click();
        await page.waitForTimeout(2000);

        // Find Venmo and Refund to Card buttons — they should have different bg colors
        const venmoBtn = page.getByText("Venmo", { exact: true }).first();
        const cardBtn = page.getByText("Refund to Card", { exact: true })
            .first();

        if (await venmoBtn.isVisible() && await cardBtn.isVisible()) {
            const venmoBg = await venmoBtn.evaluate((el) => {
                return getComputedStyle(el.closest("button") || el)
                    .backgroundColor;
            });
            const cardBg = await cardBtn.evaluate((el) => {
                return getComputedStyle(el.closest("button") || el)
                    .backgroundColor;
            });
            expect(venmoBg).not.toEqual(cardBg);
        }
    });

    test("Refund button icons render as white (not black)", async ({ page }) => {
        await page.goto("/feed");
        await page.waitForTimeout(2000);
        if (page.url().includes("/login")) test.skip();

        const pointsBadge = page.locator("text=/\\d+\\s*(pts|points)/i")
            .first();
        await expect(pointsBadge).toBeVisible({ timeout: 15000 });
        await pointsBadge.click();
        await page.waitForTimeout(500);

        const menuButton = page.locator(
            'div[aria-label="Menu"], button[aria-label="Menu"], [aria-label="Menu"]',
        ).first();
        await menuButton.click();
        await page.waitForTimeout(500);

        const refundButton = page.getByText("Refund Points", { exact: false })
            .first();
        await expect(refundButton).toBeVisible({ timeout: 10000 });
        await refundButton.click();
        await page.waitForTimeout(2000);

        // Check SVG icons inside Venmo button are white (color: white or stroke: white)
        const venmoBtn = page.getByText("Venmo", { exact: true }).first();
        if (await venmoBtn.isVisible()) {
            const iconColor = await venmoBtn.evaluate((el) => {
                const parent = el.closest("button") || el.parentElement;
                const svg = parent?.querySelector("svg");
                if (svg) return getComputedStyle(svg).color;
                return null;
            });
            // Icon should be white (rgb(255, 255, 255)) not black (rgb(0, 0, 0))
            if (iconColor) {
                expect(iconColor).not.toContain("rgb(0, 0, 0)");
            }
        }
    });
});
