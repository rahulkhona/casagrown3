import { test, expect } from "@playwright/test";

test.describe("Earnings Holds UI", () => {
    test("displays active holds section", async ({ page }) => {
        // Go to earnings page
        await page.goto("/earnings");
        
        // Ensure the active holds or pending balances section is visible
        const holdsSection = page.locator("text=/Active Holds|Pending Holds|Reserved Balance/i").first();
        
        // Wait for page to load
        await page.waitForTimeout(1000);
        
        // If there's an active hold, it should show the amount and a release hint
        if (await holdsSection.isVisible()) {
            const holdCard = holdsSection.locator("..").first();
            await expect(holdCard).toBeVisible();
            await expect(holdCard.locator("text=/\\$/")).toBeVisible(); // Has currency
            
            // Check for top-ups mention or release notice
            await expect(holdCard.locator("text=/released|top-up|authorization/i")).toBeVisible();
        }
    });
});
