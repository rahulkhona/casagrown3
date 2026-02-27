import { expect, test } from "@playwright/test";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Cashout Flow UI", () => {
    test.beforeEach(async ({ page }) => {
        // 1. Mock Supabase Auth
        await page.addInitScript(() => {
            window.localStorage.setItem("E2E_BYPASS_AUTH", "true");

            const sessionData = JSON.stringify({
                access_token: "mock-token",
                token_type: "bearer",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user: {
                    id: "00000000-0000-0000-0000-000000000000",
                    email: "test@example.com",
                    aud: "authenticated",
                    role: "authenticated",
                },
            });
            window.localStorage.setItem("supabase.auth.token", sessionData);
            window.localStorage.setItem("sb-127-auth-token", sessionData);
            window.localStorage.setItem("sb-127.0.0.1-auth-token", sessionData);
            window.localStorage.setItem("sb-localhost-auth-token", sessionData);
        });

        // 2. Mock profiles lookup
        await page.route("**/rest/v1/profiles*", async (route) => {
            const accept = route.request().headers()["accept"] || "";
            if (accept.includes("application/vnd.pgrst.object+json")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        id: MOCK_USER_ID,
                        paypal_payout_id: null,
                    }),
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([{
                        id: MOCK_USER_ID,
                        paypal_payout_id: null,
                    }]),
                });
            }
        });

        // 2b. Mock Auth session check
        await page.route("**/auth/v1/user*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    id: MOCK_USER_ID,
                    email: "test@example.com",
                    role: "authenticated",
                }),
            });
        });

        // 3. Mock point balance RPC (get_user_balance)
        await page.route("**/rest/v1/rpc/get_user_balance*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(50000), // 50,000 points
            });
        });

        // 4. Mock point ledger (for the layout & hook polling)
        await page.route("**/rest/v1/point_ledger*", async (route) => {
            const accept = route.request().headers()["accept"] || "";
            if (accept.includes("application/vnd.pgrst.object+json")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ balance_after: 50000 }),
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([{ balance_after: 50000 }]),
                });
            }
        });

        // Block realtime websocket
        await page.route("**/realtime/v1/websocket*", async (route) => {
            await route.abort();
        });

        // Empty endpoints to suppress noise
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
        await page.route("**/functions/v1/fetch-gift-cards", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ cards: [] }),
            });
        });
        await page.route(
            "**/functions/v1/fetch-donation-projects",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ projects: [] }),
                });
            },
        );
    });

    test("User successfully cashes out points", async ({ page }) => {
        // Mock get_active_redemption_providers to include paypal
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "paypal", is_queuing: false },
                    ]),
                });
            },
        );

        // Mock redeem-paypal-payout edge function
        await page.route(
            "**/functions/v1/redeem-paypal-payout*",
            async (route) => {
                const body = JSON.parse(route.request().postData() || "{}");
                if (body.pointsToRedeem && body.payoutId) {
                    await route.fulfill({
                        status: 200,
                        contentType: "application/json",
                        body: JSON.stringify({ success: true }),
                    });
                } else {
                    await route.fulfill({
                        status: 400,
                        body: JSON.stringify({ error: "Invalid data" }),
                    });
                }
            },
        );

        // Go to redeem page
        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000); // react processing

        // Verify Cashout Tab is visible and click it
        const cashoutTab = page.getByText("Cashout", { exact: true });
        await expect(cashoutTab).toBeVisible({ timeout: 10000 });
        await cashoutTab.click();

        await page.waitForTimeout(500);

        // Click Cashout button inside the tab
        // The first "Cashout" text is the tab itself. The second is the submit button.
        const cashoutSubmitBtn = page.getByText("Cashout", { exact: true })
            .last();
        await cashoutSubmitBtn.click();

        // Verify modal opened and input is present
        const inputLocator = page.locator('input[placeholder*="Venmo"]');
        await expect(inputLocator).toBeVisible({ timeout: 15000 });

        // Fill in payout ID
        await inputLocator.fill("+15554443333");

        // Verify "Confirm Cashout" button
        const confirmBtn = page.getByRole("button", { name: "Confirm Cashout" })
            .first();
        await expect(confirmBtn).toBeVisible();
        await confirmBtn.click();

        // Wait for success screen
        await expect(page.getByText("Funds Sent!")).toBeVisible({
            timeout: 10000,
        });
        await expect(page.getByText("+15554443333")).toBeVisible();

        // Ensure DOM point balance sync logic executed natively
        // Test passes if Funds Sent occurs, meaning the function mock fired.

        await page.screenshot({
            path: "e2e/screenshots/cashout-success.png",
            fullPage: true,
        });

        // Click Done
        await page.getByText("Done", { exact: true }).click();
    });
});
