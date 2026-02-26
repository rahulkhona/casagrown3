import { expect, test } from "@playwright/test";

// Use a fixed user UUID for mocking
const MOCK_USER_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Redemption Queueing and States UI", () => {
    // Before each test, load the page, mock auth, and mock the user balance so the page renders normally
    test.beforeEach(async ({ page }) => {
        // Log all console messages so we can debug point_ledger fetch issues
        page.on("console", (msg) => {
            if (
                msg.type() === "error" || msg.type() === "warning" ||
                msg.text().includes("[POINTS]") ||
                msg.text().includes("[REDEEM]") ||
                msg.text().includes("session")
            ) {
                console.log(`BROWSER [${msg.type()}]:`, msg.text());
            }
        });

        // 1. Mock Supabase Auth to simulate logged-in user and bypass Next.js AuthGuard
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

            // Set for v1 and all v2 local hostname variations
            window.localStorage.setItem("supabase.auth.token", sessionData);
            window.localStorage.setItem("sb-127-auth-token", sessionData);
            window.localStorage.setItem("sb-127.0.0.1-auth-token", sessionData);
            window.localStorage.setItem("sb-localhost-auth-token", sessionData);
        });

        // 1b. Mock `profiles` lookup to satisfy useAuth's stale session guard
        await page.route("**/rest/v1/profiles*", async (route) => {
            const accept = route.request().headers()["accept"] || "";
            if (accept.includes("application/vnd.pgrst.object+json")) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ id: MOCK_USER_ID }),
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([{ id: MOCK_USER_ID }]),
                });
            }
        });

        // 2. Mock point balance RPC (get_user_balance)
        await page.route("**/rest/v1/rpc/get_user_balance*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(50000), // 50,000 points
            });
        });

        // 3. Mock point ledger (for the layout & hook polling)
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

        // 3b. Block realtime websocket connections to avoid hook sync issues
        await page.route("**/realtime/v1/websocket*", async (route) => {
            await route.abort();
        });

        // 4. Mock notifications (for the layout)
        await page.route("**/rest/v1/notifications*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([]),
            });
        });

        // 5. Mock waiting list for 529 tab
        await page.route("**/rest/v1/feature_waitlist*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([]),
            });
        });

        // 6. Mock gift card catalog fetch
        await page.route("**/functions/v1/fetch-gift-cards", async (route) => {
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
                            fixedDenominations: [25, 50, 100],
                            minDenomination: 10,
                            maxDenomination: 500,
                            currencyCode: "USD",
                            availableProviders: [
                                {
                                    provider: "tremendous",
                                    productId: "mock-amazon",
                                    discountPercentage: 0,
                                    feePerTransaction: 0,
                                    feePercentage: 0,
                                },
                            ],
                            hasProcessingFee: false,
                            processingFeeUsd: 0,
                        },
                        {
                            id: "brand-target",
                            brandName: "Target",
                            brandKey: "target",
                            logoUrl: "",
                            brandColor: "#CC0000",
                            brandIcon: "🎯",
                            category: "Shopping",
                            denominationType: "range",
                            fixedDenominations: [25, 50, 100],
                            minDenomination: 10,
                            maxDenomination: 500,
                            currencyCode: "USD",
                            availableProviders: [
                                {
                                    provider: "reloadly",
                                    productId: "mock-target",
                                    discountPercentage: 0,
                                    feePerTransaction: 0.50,
                                    feePercentage: 0,
                                },
                            ],
                            hasProcessingFee: true,
                            processingFeeUsd: 0.50,
                        },
                    ],
                }),
            });
        });

        // 7. Mock charity catalog fetch
        await page.route(
            "**/functions/v1/fetch-donation-projects",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        projects: [
                            {
                                id: 1001,
                                title: "Feed Families in Rural Communities",
                                organization: "Food For All Foundation",
                                theme: "Hunger",
                                imageUrl:
                                    "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400",
                                goal: 20000,
                                raised: 13400,
                                summary: "Providing fresh meals and produce.",
                            },
                        ],
                    }),
                });
            },
        );
    });

    test("(a) Global Giving disabled", async ({ page }) => {
        // Mock get_active_redemption_providers to ONLY return tremendous (no globalgiving)
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "tremendous", is_queuing: false },
                    ]),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000); // give react time to process mock

        // Make sure the navigation and page title load
        await expect(page.getByText("Redeem Points", { exact: true }))
            .toBeVisible({ timeout: 10000 });

        // Validate "Donate" tab is MISSING
        await expect(page.getByText("Donate")).not.toBeVisible();

        await page.screenshot({
            path: "e2e/screenshots/a-global-giving-disabled.png",
            fullPage: true,
        });
    });

    test("(a) Global Giving enabled", async ({ page }) => {
        // Mock get_active_redemption_providers to include globalgiving
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "tremendous", is_queuing: false },
                        { provider: "globalgiving", is_queuing: false },
                    ]),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000); // give react time to process mock

        // Validate "Donate" tab is VISIBLE
        await expect(page.getByText("Donate")).toBeVisible();

        await page.screenshot({
            path: "e2e/screenshots/a-global-giving-enabled.png",
            fullPage: true,
        });
    });

    test("(b) Gift Cards disabled", async ({ page }) => {
        // Mock get_active_redemption_providers to ONLY return globalgiving (no tremendous/reloadly)
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "globalgiving", is_queuing: false },
                    ]),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000); // give react time to process mock

        // Validate "Gift Cards" tab is MISSING (strict match)
        await expect(page.getByRole("tab", { name: "Gift Cards" })).not
            .toBeVisible();

        await page.screenshot({
            path: "e2e/screenshots/b-gift-cards-disabled.png",
            fullPage: true,
        });
    });

    test("(b) Gift Cards enabled", async ({ page }) => {
        // Mock get_active_redemption_providers to include tremendous
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "tremendous", is_queuing: false },
                        { provider: "globalgiving", is_queuing: false },
                    ]),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000); // give react time to process mock

        // Validate "Gift Cards" tab is VISIBLE (strict match)
        await expect(page.getByText("Gift Cards", { exact: true }))
            .toBeVisible();

        await page.screenshot({
            path: "e2e/screenshots/b-gift-cards-enabled.png",
            fullPage: true,
        });
    });

    // Note on (c) and (d): UI-wise, both tremendous and reloadly collapse into the single "Gift Cards" tab.
    // The catalog edge function (`fetch-gift-cards`) handles sorting/filtering brands based on provider active status.
    // If we want to simulate JUST tremendous being active vs just reloadly, we change the catalog response.

    test("(c) Tremendous only (Global Giving enabled)", async ({ page }) => {
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "globalgiving", is_queuing: false },
                        { provider: "tremendous", is_queuing: false },
                    ]),
                });
            },
        );

        // Mock catalog to ONLY return Amazon (Tremendous brand)
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
                            fixedDenominations: [25, 50, 100],
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
        await page.waitForTimeout(2000); // give react time to process mock

        // Switch to Gift Cards tab
        await page.getByText("Gift Cards", { exact: true }).click();
        await page.waitForTimeout(500);

        // Amazon visible, Target not
        await expect(page.getByText("Amazon", { exact: true })).toBeVisible();
        await expect(page.getByText("Target", { exact: true })).not
            .toBeVisible();

        await page.screenshot({
            path: "e2e/screenshots/c-tremendous-only.png",
            fullPage: true,
        });
    });

    test("(d) Reloadly only (Global Giving enabled)", async ({ page }) => {
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "globalgiving", is_queuing: false },
                        { provider: "reloadly", is_queuing: false },
                    ]),
                });
            },
        );

        // Mock catalog to ONLY return Target (Reloadly brand)
        await page.route("**/functions/v1/fetch-gift-cards*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    cards: [
                        {
                            id: "brand-target",
                            brandName: "Target",
                            brandKey: "target",
                            logoUrl: "",
                            brandColor: "#CC0000",
                            brandIcon: "🎯",
                            category: "Shopping",
                            denominationType: "range",
                            fixedDenominations: [25, 50, 100],
                            minDenomination: 10,
                            maxDenomination: 500,
                            currencyCode: "USD",
                            availableProviders: [{
                                provider: "reloadly",
                                productId: "mock-target",
                                discountPercentage: 0,
                                feePerTransaction: 0.50,
                                feePercentage: 0,
                            }],
                            hasProcessingFee: true,
                            processingFeeUsd: 0.50,
                        },
                    ],
                }),
            });
        });

        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000); // give react time to process mock

        // Switch to Gift Cards tab
        await page.getByText("Gift Cards", { exact: true }).click();
        await page.waitForTimeout(500);

        // Target visible, Amazon not
        await expect(page.getByText("Target", { exact: true })).toBeVisible();
        await expect(page.getByText("Amazon", { exact: true })).not
            .toBeVisible();

        await page.screenshot({
            path: "e2e/screenshots/d-reloadly-only.png",
            fullPage: true,
        });
    });

    test("(e) Out of money triggering queueing", async ({ page }) => {
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "tremendous", is_queuing: false },
                    ]),
                });
            },
        );

        // Mock redeem edge function to return the "queued" status
        await page.route("**/functions/v1/redeem-gift-card*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    success: true,
                    redemptionId: "mock-123",
                    provider: "tremendous",
                    netFeeCents: 0,
                    status: "queued",
                }),
            });
        });

        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000); // give react time to process mock

        // Switch to Gift Cards tab
        await page.getByText("Gift Cards", { exact: true }).click();
        await page.waitForTimeout(500);

        // Click Amazon card to redeem (forcing click due to pointer-events intercepts on styled divs)
        await page.getByText("Amazon", { exact: true }).click({ force: true });
        await page.waitForTimeout(500);

        // Enter $10 into amount field
        const amountInput = page.getByPlaceholder(/Amount/i);
        await amountInput.click({ force: true });
        await amountInput.fill("10");
        await page.keyboard.press("Tab"); // Blur the input to ensure state commits

        // Wait to make sure rendering finishes
        await page.waitForTimeout(500);

        await page.screenshot({
            path: "e2e/screenshots/debug-before-confirm.png",
        });

        // Click "Confirm Redemption"
        await page.getByRole("button", { name: /Confirm Redemption/i }).click();

        await page.waitForTimeout(2000); // Give the modal time to fetch and render
        await page.screenshot({
            path: "e2e/screenshots/debug-after-confirm.png",
        });

        // Wait for the completion sheet to render. When a provider returns "queued",
        // the system shows the success sheet with a "Queued" status instead of a card code.
        await expect(page.getByText(/Your gift card order is queued/i))
            .toBeVisible({ timeout: 10000 });

        await page.screenshot({
            path: "e2e/screenshots/e-out-of-money-queued.png",
            fullPage: true,
        });
    });

    test("(f) Gift Cards empty state (Tremendous and Reloadly disabled)", async ({ page }) => {
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        { provider: "globalgiving", is_queuing: false },
                    ]),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000); // give react time to process mock

        // Try to verify Gift Cards tab is not visible, while Donate is visible
        await expect(page.getByText("Donate", { exact: true })).toBeVisible();
        await expect(page.getByText("Gift Cards", { exact: true })).not
            .toBeVisible();

        await page.screenshot({
            path: "e2e/screenshots/f-gift-cards-empty.png",
            fullPage: true,
        });
    });
});
