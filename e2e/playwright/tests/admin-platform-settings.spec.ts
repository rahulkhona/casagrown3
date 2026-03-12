/**
 * Admin Platform Settings E2E Tests
 *
 * Two sections:
 * 1. "Global Platform Settings" — grace period input + "Save Settings" button
 * 2. "Platform Fees Ledger" — data grid + "Update Fee" button → form → "Apply New Rate"
 */

import { expect, test } from "@playwright/test";
import { dbQuery } from "../helpers/supabase-db";

test.describe("Admin Platform Settings", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/platform-settings");
        await page.locator("text=Global Platform Settings").waitFor({ timeout: 15_000 });
    });

    // ────────── RENDER ──────────
    test("renders settings page with both sections", async ({ page }) => {
        await expect(page.locator("text=Global Platform Settings")).toBeVisible();
        await expect(page.locator("text=Platform Fees Ledger")).toBeVisible();
        await expect(page.locator("text=Save Settings")).toBeVisible();
    });

    // ────────── UPDATE GRACE PERIOD ──────────
    test("updates grace period and verifies DB", async ({ page }) => {
        const before = await dbQuery("platform_settings", "limit=1");
        expect(before.length).toBe(1);
        const originalMs = before[0].provider_grace_period_ms;
        const originalMinutes = originalMs / 60000;

        const graceInput = page.locator("input").first();
        await graceInput.clear();
        const newMinutes = originalMinutes === 30 ? 45 : 30;
        await graceInput.fill(newMinutes.toString());

        await page.locator("text=Save Settings").click();
        await page.waitForTimeout(2000);

        const after = await dbQuery("platform_settings", "limit=1");
        expect(after[0].provider_grace_period_ms).toBe(newMinutes * 60000);

        // Restore
        await graceInput.clear();
        await graceInput.fill(originalMinutes.toString());
        await page.locator("text=Save Settings").click();
        await page.waitForTimeout(1000);
    });

    // ────────── FEE TABLE ──────────
    test("fee ledger shows table with columns", async ({ page }) => {
        await expect(page.locator("text=Country").first()).toBeVisible();
        await expect(page.locator("text=Fee Rate").first()).toBeVisible();
        await expect(page.locator("text=Effective Date").first()).toBeVisible();
    });

    // ────────── ADD FEE ──────────
    test("adds a new platform fee and verifies DB", async ({ page }) => {
        // Click "Update Fee" button to open the form
        await page.locator("text=Update Fee").click();
        await page.waitForTimeout(500);
        await expect(page.locator("text=Set New Fee Rate")).toBeVisible();

        // Find the fee percentage input (appears after opening the form)
        // The form has: Country (fixed to USA), Fee Percentage input, Cancel + Apply buttons
        const feeInput = page.locator('input[placeholder="e.g. 10 for 10%"]');
        await feeInput.fill("3.5");

        // Submit via "Apply New Rate" button
        await page.locator("text=Apply New Rate").click();
        await page.waitForTimeout(2000);

        // Verify in DB
        const fees = await dbQuery("platform_fees", "order=creation_date.desc&limit=1");
        expect(fees.length).toBeGreaterThanOrEqual(1);
        // The page stores fee as percentage/100, so 3.5% → 0.035
        expect(fees[0].fees).toBeCloseTo(0.035, 3);
    });
});
