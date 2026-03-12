/**
 * Admin Redemption Methods E2E Tests
 *
 * Uses data-testid selectors. Clicks the inner button[role="checkbox"]
 * without force:true so React event delegation works properly.
 */

import { expect, test } from "@playwright/test";
import { dbQuery } from "../helpers/supabase-db";

/** Click the checkbox button inside a data-testid container */
async function clickCheckbox(page: import("@playwright/test").Page, testId: string) {
    const container = page.locator(`[data-testid="${testId}"]`);
    // Tamagui Checkbox renders as: <button data-testid="..." role="checkbox">
    // The data-testid may be on the button itself or on a wrapper.
    const button = container.locator('button[role="checkbox"]');
    if (await button.count() > 0) {
        await button.click();
    } else {
        // If the container IS the button
        await container.click();
    }
}

test.describe("Admin Redemption Methods", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/methods");
        await page.locator("text=Redemption Methods").first().waitFor({ timeout: 15_000 });
        await page.waitForTimeout(2000);
    });

    // ────────── RENDER ──────────
    test("renders page title and all 4 method cards", async ({ page }) => {
        await expect(page.locator("text=Redemption Methods").first()).toBeVisible();
        for (const method of ["giftcards", "cashout", "charity", "529c"]) {
            await expect(page.locator(`[data-testid="method-card-${method}"]`)).toBeVisible();
        }
    });

    test("gift cards shows Tremendous and Reloadly providers", async ({ page }) => {
        await expect(page.locator("text=Tremendous")).toBeVisible();
        await expect(page.locator("text=Reloadly")).toBeVisible();
    });

    // ────────── GIFT CARDS: Instrument Active ──────────
    test("toggle Tremendous active status and verify DB", async ({ page }) => {
        const before = await dbQuery("available_redemption_method_instruments", "instrument=eq.tremendous");
        const wasActive = before[0].is_active;

        await clickCheckbox(page, "instrument-active-tremendous");
        await page.waitForTimeout(2000);

        const after = await dbQuery("available_redemption_method_instruments", "instrument=eq.tremendous");
        expect(after[0].is_active).toBe(!wasActive);

        // Restore
        await clickCheckbox(page, "instrument-active-tremendous");
        await page.waitForTimeout(1000);
    });

    // ────────── GIFT CARDS: Instrument Queue ──────────
    test("toggle Tremendous queue status and verify DB", async ({ page }) => {
        const before = await dbQuery("instrument_queuing_status", "instrument=eq.tremendous");
        const wasQueuing = before[0].is_queuing;

        await clickCheckbox(page, "instrument-queue-tremendous");
        await page.waitForTimeout(2000);

        const after = await dbQuery("instrument_queuing_status", "instrument=eq.tremendous");
        expect(after[0].is_queuing).toBe(!wasQueuing);

        // Restore
        await clickCheckbox(page, "instrument-queue-tremendous");
        await page.waitForTimeout(1000);
    });

    // ────────── CASHOUT: Method Active ──────────
    test("toggle Cash Out method active and verify DB", async ({ page }) => {
        const before = await dbQuery("available_redemption_methods", "method=eq.cashout");
        const wasActive = before[0].is_active;

        await clickCheckbox(page, "method-active-cashout");
        await page.waitForTimeout(2000);

        const after = await dbQuery("available_redemption_methods", "method=eq.cashout");
        expect(after[0].is_active).toBe(!wasActive);

        // Restore
        await clickCheckbox(page, "method-active-cashout");
        await page.waitForTimeout(1000);
    });

    // ────────── CASHOUT: Queue PayPal ──────────
    test("toggle cashout queue redemptions and verify DB", async ({ page }) => {
        const before = await dbQuery("instrument_queuing_status", "instrument=eq.paypal");
        const wasQueuing = before[0].is_queuing;

        await clickCheckbox(page, "instrument-queue-paypal");
        await page.waitForTimeout(2000);

        const after = await dbQuery("instrument_queuing_status", "instrument=eq.paypal");
        expect(after[0].is_queuing).toBe(!wasQueuing);

        // Restore
        await clickCheckbox(page, "instrument-queue-paypal");
        await page.waitForTimeout(1000);
    });

    // ────────── CHARITY ──────────
    test("charity shows Provider: GlobalGiving", async ({ page }) => {
        await expect(page.locator("text=Provider: GlobalGiving")).toBeVisible();
    });

    test("toggle charity queue redemptions and verify DB", async ({ page }) => {
        const before = await dbQuery("instrument_queuing_status", "instrument=eq.globalgiving");
        const wasQueuing = before[0].is_queuing;

        await clickCheckbox(page, "instrument-queue-globalgiving");
        await page.waitForTimeout(2000);

        const after = await dbQuery("instrument_queuing_status", "instrument=eq.globalgiving");
        expect(after[0].is_queuing).toBe(!wasQueuing);

        // Restore
        await clickCheckbox(page, "instrument-queue-globalgiving");
        await page.waitForTimeout(1000);
    });

    // ────────── INFO BOX ──────────
    test("shows About Queue Redemptions info box", async ({ page }) => {
        await expect(page.locator("text=About Queue Redemptions")).toBeVisible();
    });
});
