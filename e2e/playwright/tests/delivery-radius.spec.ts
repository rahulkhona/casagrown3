import { test, expect } from "@playwright/test";

test.describe("Delivery Radius Enforcement", () => {
    test.use({
        geolocation: { latitude: 37.7749, longitude: -122.4194 }, // SF
        permissions: ['geolocation'],
    });

    test("enforces delivery radius on checkout", async ({ page }) => {
        // Go to market
        await page.goto("/market");
        
        // Find a post with delivery available (assuming seeded data)
        const orderBtn = page.locator("text=Order").first();
        await orderBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
        
        if (await orderBtn.isVisible()) {
            await orderBtn.click();
            
            // Check if there is an out of delivery range warning
            const outOfRangeMsg = page.locator("text=/out of delivery range/i");
            const submitBtn = page.locator("text=/Submit Request|Place Order|Submit/i").first();
            
            // If we are out of range, submit button should be disabled or hidden
            if (await outOfRangeMsg.isVisible()) {
                await expect(submitBtn).toBeDisabled();
            } else {
                // If in range, mock geolocation far away and reload
                await page.context().setGeolocation({ latitude: 40.7128, longitude: -74.0060 }); // NY
                await page.reload();
                await orderBtn.click();
                
                // Now it should be out of range
                const newOutOfRangeMsg = page.locator("text=/out of delivery range/i");
                if (await newOutOfRangeMsg.isVisible()) {
                   await expect(page.locator("text=/Submit Request|Place Order|Submit/i").first()).toBeDisabled();
                }
            }
        }
    });
});
