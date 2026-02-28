import { expect, test } from "@playwright/test";

test("capture wallet UI screenshots", async ({ page }) => {
    // 1. Go to feed/login
    await page.goto("/feed");
    await page.waitForTimeout(3000);

    // Wait for the Points badge in the header
    const pointsBadge = page.locator("text=/\\d+\\s*(pts|points)/i").first();
    await expect(pointsBadge).toBeVisible({ timeout: 15000 });

    // Click the Points badge to toggle the dropdown
    await pointsBadge.click();
    await page.waitForTimeout(500);

    const historyOption = page.getByText("Transaction History").first();
    await historyOption.click();

    // 2. Wait for segregated balances to be visible
    await expect(page.getByText(/Earned Balance/i).first()).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByText(/Purchased Balance/i).first()).toBeVisible();

    // 3. Take screenshot of the new Wallet Dashboard (now with Total Balance)
    await page.screenshot({
        path:
            "/Users/rkhona/.gemini/antigravity/brain/d999f481-52ed-4948-9af6-bdb5a52195d6/wallet_dashboard_segregation.png",
        fullPage: true,
    });

    // 4. Open Hamburger Menu
    const menuButton = page.locator(
        'div[aria-label="Menu"], button[aria-label="Menu"], [aria-label="Menu"]',
    ).first();
    await menuButton.click();
    await page.waitForTimeout(500);

    // 5. Click the new Refund Points menu item
    const refundOption = page.getByText("Refund Points", { exact: false })
        .first();
    await refundOption.click();

    // 6. Wait for Dedicated Screen (Bucket List)
    await expect(page.getByText(/Select an active purchase/i).first())
        .toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for animation and buckets to load

    // Capture Bucket List (Refunding to existing card)
    await page.screenshot({
        path:
            "/Users/rkhona/.gemini/antigravity/brain/d999f481-52ed-4948-9af6-bdb5a52195d6/refund_bucket_list.png",
    });

    // 7. Trigger the Refund Evaluation
    const selectActionButton = page.getByRole("button", { name: "Select" })
        .first();
    if (await selectActionButton.isVisible()) {
        await selectActionButton.click();

        // Wait for Fallback choices (Matrix Evaluation)
        await expect(page.getByText(/Points Balance Available/i).first())
            .toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(1000);

        // Capture Fallback Options Screen
        await page.screenshot({
            path:
                "/Users/rkhona/.gemini/antigravity/brain/d999f481-52ed-4948-9af6-bdb5a52195d6/refund_fallback_options.png",
        });

        // 8. Intercept the Edge Function call to mock a Stripe `charge_expired` error
        await page.route(
            "**/functions/v1/refund-purchased-points*",
            async (route) => {
                await route.fulfill({
                    status: 400,
                    json: { error: "Stripe refund window expired" },
                });
            },
        );

        // Click Return to Card
        const returnCardButton = page.getByRole("button", {
            name: /Return To Original Card/i,
        }).first();
        if (await returnCardButton.isVisible()) {
            await returnCardButton.click();
            await page.waitForTimeout(1000);
        }
    }

    // Navigate to Reedeem Points to show the Earned Balance relabeling
    await page.goto("/redeem");
    await page.waitForTimeout(3000);
    await page.screenshot({
        path:
            "/Users/rkhona/.gemini/antigravity/brain/d999f481-52ed-4948-9af6-bdb5a52195d6/redemption_earned_label.png",
    });
});
