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
});
