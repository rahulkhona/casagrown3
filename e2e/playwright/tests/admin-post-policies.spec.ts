/**
 * Admin Post Policies E2E Tests
 *
 * Page: "Post Expiration Policies"
 * Table sorted by expiration_days ascending in the DB query.
 * Each row: label (Text), days input (Input), Save/dash in Action column.
 * The adminSupabase client writes with service_role (persistSession:false).
 */

import { expect, test } from "@playwright/test";
import { dbQuery, dbUpdate } from "../helpers/supabase-db";

test.describe("Admin Post Policies", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/post-policies");
        await page.locator("text=Post Expiration Policies").waitFor({ timeout: 15_000 });
        // Wait for data to load
        await page.waitForTimeout(3000);
    });

    // ────────── RENDER ──────────
    test("renders all 6 post type policies", async ({ page }) => {
        await expect(page.locator("text=Post Expiration Policies")).toBeVisible();
        for (const label of ["Want to Sell", "Want to Buy", "Offering Service", "Need Service", "Seeking Advice", "General Info"]) {
            await expect(page.locator(`text=${label}`)).toBeVisible();
        }
    });

    test("renders table with correct column headers", async ({ page }) => {
        await expect(page.locator("text=Post Type").first()).toBeVisible();
        await expect(page.locator("text=/Expiration/i").first()).toBeVisible();
        await expect(page.locator("text=Action").first()).toBeVisible();
    });

    // ────────── EDIT ──────────
    test("editing expiration days shows Save button", async ({ page }) => {
        const firstInput = page.locator("input").first();
        const currentValue = await firstInput.inputValue();
        const newValue = currentValue === "30" ? "45" : "30";

        await firstInput.clear();
        await firstInput.fill(newValue);

        await expect(page.locator("text=Save").first()).toBeVisible();

        // Restore original value so isDirty returns false
        await firstInput.clear();
        await firstInput.fill(currentValue);
    });

    test("saves updated expiration days and verifies DB", async ({ page }) => {
        // The page sorts by expiration_days ascending
        // Read all policies from DB in same sort order
        const policies = await dbQuery("post_type_policies", "order=expiration_days");
        if (policies.length === 0) { test.skip(true, "No policies"); return; }

        const firstPolicy = policies[0];
        const originalDays = firstPolicy.expiration_days;
        // Change to something clearly different
        const newDays = originalDays + 1;

        // Type the new value into the first input
        const input = page.locator("input").first();
        await input.clear();
        await input.fill(newDays.toString());

        // The Save button should appear
        const saveBtn = page.locator("text=Save").first();
        await expect(saveBtn).toBeVisible({ timeout: 5_000 });
        await saveBtn.click();

        // Wait for success toast
        await page.waitForTimeout(3000);

        // Verify DB
        const after = await dbQuery("post_type_policies", `post_type=eq.${firstPolicy.post_type}`);
        expect(after[0].expiration_days).toBe(newDays);

        // Restore via direct DB update (more reliable than UI since page re-sorts)
        await dbUpdate("post_type_policies", `post_type=eq.${firstPolicy.post_type}`, {
            expiration_days: originalDays,
        });
    });

    // ────────── UNCHANGED ──────────
    test("action column shows dash when value unchanged", async ({ page }) => {
        const dashes = page.locator("text=—");
        const count = await dashes.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    // ────────── INDEPENDENT UPDATES ──────────
    test("can update multiple policies independently", async ({ page }) => {
        const policies = await dbQuery("post_type_policies", "order=expiration_days");
        if (policies.length < 2) { test.skip(true, "Need 2+ policies"); return; }

        const firstPolicy = policies[0];
        const secondPolicy = policies[1];
        const originalDays = firstPolicy.expiration_days;
        const secondOriginalDays = secondPolicy.expiration_days;
        const newDays = originalDays + 1;

        // Change only the first input
        const firstInput = page.locator("input").first();
        await firstInput.clear();
        await firstInput.fill(newDays.toString());

        const saveBtn = page.locator("text=Save").first();
        await expect(saveBtn).toBeVisible({ timeout: 5_000 });
        await saveBtn.click();
        await page.waitForTimeout(3000);

        // Verify only first changed
        const firstAfter = await dbQuery("post_type_policies", `post_type=eq.${firstPolicy.post_type}`);
        const secondAfter = await dbQuery("post_type_policies", `post_type=eq.${secondPolicy.post_type}`);
        expect(firstAfter[0].expiration_days).toBe(newDays);
        // Second policy should remain unchanged from its original value
        expect(secondAfter[0].expiration_days).toBe(secondOriginalDays);

        // Restore via DB
        await dbUpdate("post_type_policies", `post_type=eq.${firstPolicy.post_type}`, {
            expiration_days: originalDays,
        });
    });
});
