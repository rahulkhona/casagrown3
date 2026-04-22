/**
 * Admin Recurring Incentives E2E Tests
 */

import { expect, test } from "@playwright/test";
import { dbDelete, dbQuery } from "../helpers/supabase-db";

const UNIQUE = `PW_${Date.now()}`;

test.describe("Admin Recurring Incentives", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/campaigns/incentives");
        await page.getByText("Recurring Incentives", { exact: true }).waitFor({ timeout: 15_000 });
    });

    test("renders incentives list page with header and create form", async ({ page }) => {
        await expect(page.getByText("Recurring Incentives", { exact: true })).toBeVisible();
        await expect(page.locator("text=Issue Recurring Credits")).toBeVisible();
        await expect(page.locator("text=User Search")).toBeVisible();
        await expect(page.locator("text=Credit Amount ($)")).toBeVisible();
    });

    test("creates a new recurring incentive and verifies DB", async ({ page }) => {
        // We will create an incentive for an existing test user
        const testUserEmail = 'buyer1_46@test.com'; // Wait, maybe use 'e2e-buyer@example.com' if it exists. 
        // We'll just search for 'test' and pick the first user
        await page.locator('input[placeholder="Search by name or email..."]').fill('test');
        await page.waitForTimeout(2000);
        
        // Pick the first user in the dropdown list
        await page.locator('[data-testid^="user-result-"]').first().click();

        await page.locator('input[placeholder="e.g. 50"]').fill("25");
        await page.locator("select").first().selectOption("purchase");
        await page.locator("select").nth(1).selectOption("monthly");
        
        // Cap type
        await page.locator('button:has-text("% per Order")').click();
        await page.locator('input[placeholder="e.g. 20"]').fill("100");

        // Submit
        await page.locator("text=Create Incentive").click();
        await expect(page.locator(`text=/Incentive created successfully/`)).toBeVisible({ timeout: 10_000 });

        // Verify DB
        const incentives = await dbQuery("user_incentives", `amount_usd=eq.25`);
        expect(incentives.length).toBeGreaterThan(0);

        const lastIncentive = incentives[incentives.length - 1];
        expect(lastIncentive.amount_usd).toBe(25);
        expect(lastIncentive.expiration_frequency).toBe("monthly");
        expect(lastIncentive.cap_type).toBe("percentage");
        expect(lastIncentive.cap_value).toBe(100);

        await dbDelete("user_incentives", `id=eq.${lastIncentive.id}`);
    });

});
