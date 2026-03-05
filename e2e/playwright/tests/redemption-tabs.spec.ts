import { expect, test } from "@playwright/test";

test.describe("Redemption Architecture Tab Toggling", () => {
    test("Hides Gift Cards tab when method is_active is false", async ({ page }) => {
        // Mock the RPC call to explicitly hide Gift Cards but leave others active
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                const mockResponse = [
                    {
                        method: "giftcards",
                        is_active: false,
                        instruments: [
                            { instrument: "tremendous", is_active: true },
                            { instrument: "reloadly", "is_active": true },
                        ],
                    },
                    {
                        method: "charity",
                        is_active: true,
                        instruments: [{
                            instrument: "globalgiving",
                            is_active: true,
                        }],
                    },
                ];
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(mockResponse),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForTimeout(1000);

        // Verify the Donate tab is cleanly visible
        await expect(page.getByText("Donate", { exact: true }).first())
            .toBeVisible({ timeout: 5000 });

        // Assert Gift Cards tab is absolutely hidden because its method `is_active` = false
        // Even though its instruments were returned as active!
        await expect(page.getByText("Gift Cards", { exact: true })).toHaveCount(
            0,
        );
    });

    test("Hides Charity tab when all its instruments are disabled", async ({ page }) => {
        // Mock the RPC call where the method is TRUE but all instruments are FALSE
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                const mockResponse = [
                    {
                        method: "charity",
                        is_active: true,
                        instruments: [{
                            instrument: "globalgiving",
                            is_active: false,
                        }],
                    },
                ];
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(mockResponse),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForTimeout(1000);

        // Assert Donate tab is absolutely hidden because of the secondary instrument-hiding check
        await expect(page.getByText("Donate", { exact: true })).toHaveCount(0);
    });

    // =========================================
    // Compliance: State Redemption Method Blocks
    // =========================================

    test("Hides Cashout tab when state block is active via DB mock", async ({ page }) => {
        // Use the Supabase service role to insert a real state block record
        const SUPABASE_URL = "http://127.0.0.1:54321";
        const SERVICE_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

        // Insert a cashout block for California
        const insertRes = await fetch(
            `${SUPABASE_URL}/rest/v1/state_redemption_method_blocks`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SERVICE_KEY,
                    Authorization: `Bearer ${SERVICE_KEY}`,
                    Prefer: "return=representation",
                },
                body: JSON.stringify({
                    state_code: "CA",
                    method: "cashout",
                    reason: "E2E test block",
                }),
            },
        );
        const insertedRows = await insertRes.json();
        const blockId = insertedRows?.[0]?.id;

        try {
            // Set up a promise to wait for the state_redemption_method_blocks API call
            const blockQueryPromise = page.waitForResponse(
                (resp) =>
                    resp.url().includes("state_redemption_method_blocks") &&
                    resp.status() === 200,
                { timeout: 15_000 },
            );

            // Navigate to redeem page
            await page.goto("/redeem");

            // Wait for the state block query to actually complete
            await blockQueryPromise;

            // Give React time to re-render after the async state update
            await page.waitForTimeout(2000);

            // Gift Cards and Donate should be visible
            const hasDonate = await page
                .getByText("Donate", { exact: true })
                .first()
                .isVisible({ timeout: 5000 })
                .catch(() => false);

            const hasGiftCards = await page
                .getByText("Gift Cards", { exact: true })
                .first()
                .isVisible({ timeout: 5000 })
                .catch(() => false);

            expect(hasDonate || hasGiftCards).toBeTruthy();

            // Cashout tab should be HIDDEN due to state block
            await expect(
                page.getByText("Cashout", { exact: true }),
            ).toHaveCount(0);
        } finally {
            // Clean up: remove the block
            if (blockId) {
                await fetch(
                    `${SUPABASE_URL}/rest/v1/state_redemption_method_blocks?id=eq.${blockId}`,
                    {
                        method: "DELETE",
                        headers: {
                            apikey: SERVICE_KEY,
                            Authorization: `Bearer ${SERVICE_KEY}`,
                            Prefer: "return=minimal",
                        },
                    },
                );
            }
        }
    });

    // =========================================
    // Compliance: Escrow → Hold language check in Redemptions
    // =========================================

    test("Redemption page does not contain escrow language", async ({ page }) => {
        await page.route(
            "**/rest/v1/rpc/get_active_redemption_providers*",
            async (route) => {
                const mockResponse = [
                    {
                        method: "giftcards",
                        is_active: true,
                        instruments: [
                            { instrument: "tremendous", is_active: true },
                        ],
                    },
                ];
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(mockResponse),
                });
            },
        );

        await page.goto("/redeem");
        await page.waitForTimeout(2000);

        // Page should show "Earned Redeemable Pts" not "escrow" or "escrowed"
        const bodyText = await page.locator("body").textContent();
        expect(bodyText?.toLowerCase()).not.toContain("escrow");
    });
});
