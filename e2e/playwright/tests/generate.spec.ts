import { expect, test } from "@playwright/test";
import path from "path";
import fs from "fs";

// Directory to save screenshots — use temp dir to avoid depending on a specific brain path
const outDir = "/tmp/playwright-screenshots";

// Ensure the output directory exists
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

test.describe("UI Combinations Screenshots", () => {
    // Increase timeout — full suite can overwhelm local Supabase
    test.setTimeout(120_000);

    test("Mock States for Screenshots", async ({ page }) => {
        // Use the E2E bypass flag already built into usePointsBalance (50,000 pts)
        // This is more reliable than route interception for Supabase POST RPCs
        await page.addInitScript(() => {
            window.localStorage.setItem("E2E_BYPASS_AUTH", "true");
        });

        // --- State 1: All Options Active ---
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        {
                            method: "giftcards",
                            is_active: true,
                            instruments: [{
                                instrument: "tremendous",
                                is_active: true,
                            }],
                        },
                        {
                            method: "charity",
                            is_active: true,
                            instruments: [{
                                instrument: "globalgiving",
                                is_active: true,
                            }],
                        },
                        {
                            method: "cashout",
                            is_active: true,
                            instruments: [{
                                instrument: "paypal",
                                is_active: true,
                            }],
                        },
                        { method: "529c", is_active: true, instruments: [] },
                    ]),
                });
            },
        );

        await page.goto("/redeem");
        // Wait for the Redeem page to fully load (handles slow starts in full suite)
        await page.locator("text=Redeem Points").first().waitFor({
            timeout: 30_000,
        });
        await page.waitForTimeout(2000); // give time for animation and icons
        await page.screenshot({
            path: path.join(outDir, "state_1_all_active.png"),
        });
        await page.unroute("**/rest/v1/rpc/get_active_redemption_providers*");

        // --- State 2: Methods explicitly disabled (e.g. Gift cards offline) ---
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        {
                            method: "giftcards",
                            is_active: false,
                            instruments: [{
                                instrument: "tremendous",
                                is_active: true,
                            }],
                        },
                        {
                            method: "charity",
                            is_active: true,
                            instruments: [{
                                instrument: "globalgiving",
                                is_active: true,
                            }],
                        },
                        {
                            method: "cashout",
                            is_active: true,
                            instruments: [{
                                instrument: "paypal",
                                is_active: true,
                            }],
                        },
                        { method: "529c", is_active: true, instruments: [] },
                    ]),
                });
            },
        );

        await page.reload();
        await page.waitForTimeout(2000);
        await page.screenshot({
            path: path.join(outDir, "state_2_giftcards_disabled.png"),
        });
        await page.unroute("**/rest/v1/rpc/get_active_redemption_providers*");

        // --- State 3: Instrument Implicit Disabling (e.g. Paypal goes down, cashout tab disappears) ---
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        {
                            method: "giftcards",
                            is_active: true,
                            instruments: [{
                                instrument: "tremendous",
                                is_active: true,
                            }],
                        },
                        {
                            method: "charity",
                            is_active: true,
                            instruments: [{
                                instrument: "globalgiving",
                                is_active: true,
                            }],
                        },
                        {
                            method: "cashout",
                            is_active: true,
                            instruments: [{
                                instrument: "paypal",
                                is_active: false,
                            }],
                        }, // method active, but NO instruments active
                        { method: "529c", is_active: true, instruments: [] },
                    ]),
                });
            },
        );

        await page.reload();
        await page.waitForTimeout(2000);
        await page.screenshot({
            path: path.join(outDir, "state_3_cashout_instrument_offline.png"),
        });
        await page.unroute("**/rest/v1/rpc/get_active_redemption_providers*");

        // --- State 4 & 5: Queueing ---
        // We will just mock the actual UI submission response for a gift card directly
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        {
                            method: "giftcards",
                            is_active: true,
                            instruments: [{
                                instrument: "tremendous",
                                is_active: true,
                            }],
                        },
                    ]),
                });
            },
        );

        await page.route("**/functions/v1/fetch-gift-cards*", async (route) => {
            const mockCard = {
                id: "mock_card",
                brandName: "Mock Card",
                brandKey: "mock-card",
                logoUrl: "",
                brandColor: "#000000",
                brandIcon: "🎁",
                category: "Shopping",
                denominationType: "range",
                fixedDenominations: [],
                minDenomination: 5,
                maxDenomination: 100,
                currencyCode: "USD",
                availableProviders: [{
                    provider: "tremendous",
                    productId: "mock",
                    discountPercentage: 0,
                    feePerTransaction: 0,
                    feePercentage: 0,
                }],
                hasProcessingFee: false,
                processingFeeUsd: 0,
            };
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ cards: [mockCard] }),
            });
        });

        await page.reload();
        await page.waitForTimeout(2000);

        // Mock points cost
        await page.route(
            "**/rest/v1/rpc/calculate_points_cost*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: "100",
                });
            },
        );

        // Click on the gift card "Mock Card"
        const giftCard = page.getByText("Mock Card", { exact: false }).first();
        await giftCard.waitFor({ state: "visible", timeout: 5000 });

        await giftCard.click({ force: true });
        await page.waitForTimeout(1000);

        // Fill input amount
        await page.getByPlaceholder("Enter amount").fill("10");
        await page.waitForTimeout(1000);

        // State 4: Mock SUCCESSFUL REDEMPTION (Queue OFF)
        await page.route(
            "**/functions/v1/redeem-gift-card*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        success: true,
                        status: "completed",
                    }),
                });
            },
        );

        // Click Next/Confirm
        await page.getByRole("button", { name: "Confirm Redemption" }).click();
        await page.waitForTimeout(2000); // let confetti/success modal trigger
        await page.screenshot({
            path: path.join(outDir, "state_4_queue_off.png"),
        });

        // Unroute and open again for Queued state
        await page.unroute("**/functions/v1/redeem-gift-card*");

        // We MUST re-mock the active providers because the reload will wipe the previous intercept if it was unrouted elsewhere (or just to be safe)
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify([
                        {
                            method: "giftcards",
                            is_active: true,
                            instruments: [{
                                instrument: "tremendous",
                                is_active: true,
                            }],
                        },
                    ]),
                });
            },
        );

        await page.reload();
        await page.waitForTimeout(2000);

        // Wait for Mock Card to render on reload
        const newGiftCard = page.getByText("Mock Card", { exact: false })
            .first();
        await newGiftCard.waitFor({ state: "visible", timeout: 5000 });

        await newGiftCard.click({ force: true });
        await page.waitForTimeout(1000);
        await page.getByPlaceholder("Enter amount").fill("10");
        await page.waitForTimeout(1000);
        // State 5: Mock QUEUED REDEMPTION (Queue ON)
        await page.route(
            "**/functions/v1/redeem-gift-card*",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        success: true,
                        status: "queued",
                    }),
                });
            },
        );

        await page.getByRole("button", { name: "Confirm Redemption" }).click();
        await page.waitForTimeout(2000); // let queued modal trigger
        await page.screenshot({
            path: path.join(outDir, "state_5_queue_on.png"),
        });
    });
});
