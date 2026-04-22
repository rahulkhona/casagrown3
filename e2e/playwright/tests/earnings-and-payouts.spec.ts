import { expect, test } from "@playwright/test";

test.describe("Earnings & Payout Dashboard UX", () => {
    test("Earnings summary page persistently shows Processing Payouts card when active", async ({ page }) => {
        // Mock the transaction summary to return a processing payout amount
        await page.route(
            "**/rest/v1/rpc/get_transaction_summary*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        available_usd: 47.50,
                        processing_payouts_usd: 12.34,
                        total_sales: 100,
                        pending_usd: 0,
                    }),
                });
            },
        );

        await page.goto("/earnings");
        await page.waitForTimeout(1000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Assert the main Earnings header is present
        await expect(page.getByText("Earnings & Activity").first()).toBeVisible();

        // Assert the Processing Payouts card renders with the mocked total
        const processingCard = page.getByText("Processing Payouts");
        await expect(processingCard).toBeVisible();
        await expect(page.getByText("$12.34").first()).toBeVisible();
    });

    test("Earnings summary page prominently displays Store Credits when user has an active balance", async ({ page }) => {
        // Mock the transaction summary
        await page.route(
            "**/rest/v1/rpc/get_transaction_summary*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ available_usd: 0, processing_payouts_usd: 0, total_sales: 0, pending_usd: 0 }),
                });
            },
        );

        // Mock the user credit balance
        await page.route(
            "**/rest/v1/rpc/get_user_credit_balance*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        purchase_credits_usd: 25.50,
                        platform_fee_credits_usd: 5.00,
                        total_credits_usd: 30.50
                    }),
                });
            },
        );

        await page.goto("/earnings");
        await page.waitForTimeout(1000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Verify the Store Credits section is visible
        await expect(page.getByText("Credits Available")).toBeVisible();
        await expect(page.getByText("For Purchases")).toBeVisible();
        await expect(page.getByText("$25.50").first()).toBeVisible();
        await expect(page.getByText("For Seller Fees")).toBeVisible();
        await expect(page.getByText("$5.00").first()).toBeVisible();
    });

    test("Payout page defaults to Auto-Payout flow for new users", async ({ page }) => {
        // Mock auto config to return null ( simulating a new user )
        await page.route(
            "**/rest/v1/rpc/get_auto_redemption_config*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(null),
                });
            },
        );

        // Mock payout status to unverified
        await page.route(
            "**/rest/v1/rpc/get_payout_status*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ verified: false, handle: null, handle_type: null }),
                });
            },
        );

        // Intercept provider fetching to ensure UI renders Cashout tab
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        {
                            method: "cashout",
                            is_active: true,
                            instruments: [{ instrument: "paypal", is_active: true }],
                        },
                    ]),
                });
            },
        );

        await page.goto("/earnings/payout");
        await page.waitForTimeout(1000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Auto-Payout should be toggled ON natively for unconfigured users
        await expect(page.getByText("Automatically pay out your earnings").first()).toBeVisible();

        // Ensure the global Auto-Payout setup form is visible
        await expect(page.getByText("Set up auto-payout account").first()).toBeVisible();
    });

    test("Manual payout dynamically uses inline double-entry verification for unverified users", async ({ page }) => {
        // Mock auto config to explicit false so we default to Manual mode
        await page.route(
            "**/rest/v1/rpc/get_auto_redemption_config*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ enabled: false, method: "cashout", threshold_usd: 50 }),
                });
            },
        );

        // Mock payout status to unverified
        await page.route(
            "**/rest/v1/rpc/get_payout_status*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ verified: false, handle: null, handle_type: null }),
                });
            },
        );

        await page.route("**/rest/v1/rpc/get_active_redemption_providers*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([{ method: "cashout", is_active: true, instruments: [] }]),
            });
        });

        await page.goto("/earnings/payout");
        await page.waitForTimeout(1000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // We should be in Manual mode, meaning the huge set-up box is HIDDEN
        await expect(page.getByText("Set up auto-payout account")).toHaveCount(0);
        await expect(page.getByText("Manual Payout Amount")).toBeVisible();

        // Type an amount to trigger the inline destination UI
        await page.locator("input[type='number']").fill("10");

        // Inline double-entry block should appear
        await expect(page.getByText("Where should we send this cashout?").first()).toBeVisible();
        await expect(page.getByPlaceholder(/Confirm.*phone|email/i).first()).toBeVisible();
    });
});
