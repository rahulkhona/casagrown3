import { expect, test } from "@playwright/test";
test("snapshot only", async ({ page }) => {
    // 1. Mock Supabase Auth to simulate logged-in user and bypass Next.js AuthGuard
    await page.addInitScript(() => {
        window.localStorage.setItem("E2E_BYPASS_AUTH", "true");
        window.localStorage.setItem(
            "supabase.auth.token",
            JSON.stringify({
                currentSession: {
                    user: {
                        id: "00000000-0000-0000-0000-000000000000",
                        email: "test@example.com",
                    },
                    access_token: "mock-token",
                },
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
            }),
        );
    });

    await page.route("**/rest/v1/rpc/get_user_balance*", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(50000),
        });
    });
    await page.route("**/rest/v1/point_ledger*", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([{ balance_after: 50000 }]),
        });
    });
    await page.route("**/rest/v1/notifications*", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        });
    });
    await page.route("**/rest/v1/feature_waitlist*", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        });
    });

    // Mock get_active_redemption_providers
    await page.route(
        "**/rest/v1/rpc/get_active_redemption_providers*",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([{
                    provider: "tremendous",
                    is_queuing: false,
                }]),
            });
        },
    );

    // Mock catalog to return Amazon range
    await page.route("**/functions/v1/fetch-gift-cards*", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                cards: [
                    {
                        id: "brand-amazon",
                        brandName: "Amazon",
                        brandKey: "amazon",
                        logoUrl: "",
                        brandColor: "#FF9900",
                        brandIcon: "📦",
                        category: "Shopping",
                        denominationType: "range",
                        minDenomination: 10,
                        maxDenomination: 500,
                        currencyCode: "USD",
                        availableProviders: [{
                            provider: "tremendous",
                            productId: "mock-amazon",
                            discountPercentage: 0,
                            feePerTransaction: 0,
                            feePercentage: 0,
                        }],
                        hasProcessingFee: false,
                        processingFeeUsd: 0,
                    },
                ],
            }),
        });
    });

    await page.goto("/redeem");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.getByText("Gift Cards", { exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByText("Amazon", { exact: true }).click({ force: true });
    await page.waitForTimeout(500);

    const amountInput = page.getByPlaceholder(/Amount/i);
    await amountInput.click({ force: true });
    await amountInput.fill("10");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);

    await page.screenshot({
        path: "e2e/screenshots/raw-render4.png",
        fullPage: true,
    });
});
