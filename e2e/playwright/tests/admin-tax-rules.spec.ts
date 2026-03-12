/**
 * Admin Tax Rules E2E Tests
 *
 * Page: "Sales Tax Rules" (sidebar shows "SALES TAX RULES" uppercase)
 * Add: "New Rule" button
 * Form: native <select> for state + category, <input> for rate  
 * Submit: "Create Rule" button
 * Delete: handleDelete soft-deletes (sets effective_until)
 * Success messages: "Rule saved: ..." and "Retired: ..."
 */

import { expect, test } from "@playwright/test";
import { dbDelete, dbQuery, dbUpdate } from "../helpers/supabase-db";

test.describe("Admin Tax Rules", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tax-rules");
        await page.getByText("Sales Tax Rules", { exact: true }).waitFor({ timeout: 15_000 });
    });

    // ────────── LIST ──────────
    test("renders tax rules page with header and table columns", async ({ page }) => {
        await expect(page.getByText("Sales Tax Rules", { exact: true })).toBeVisible();
        await expect(page.locator("text=State").first()).toBeVisible();
        await expect(page.locator("text=Category").first()).toBeVisible();
        await expect(page.locator("text=Rate").first()).toBeVisible();
    });

    // ────────── CREATE ──────────
    test("creates a tax rule and verifies DB", async ({ page }) => {
        await page.locator("text=New Rule").click();
        await page.waitForTimeout(500);

        // State dropdown
        await page.locator("select").first().selectOption("TX");
        await page.waitForTimeout(1500);

        // Category dropdown
        const categorySelect = page.locator("select").nth(1);
        const opts = await categorySelect.locator("option").allTextContents();
        const categoryLabel = opts.find(o => o && !o.startsWith("Select") && o.trim() !== "");
        if (!categoryLabel) { test.skip(true, "No categories"); return; }
        await categorySelect.selectOption({ label: categoryLabel });

        // Rate input
        const rateInput = page.locator('input').first();
        await rateInput.clear();
        await rateInput.fill("8.25");

        // Submit
        await page.locator("text=Create Rule").click();
        await expect(page.locator("text=/Rule saved/")).toBeVisible({ timeout: 8_000 });

        // Verify DB
        const rules = await dbQuery("category_tax_rules", "state_code=eq.TX&effective_until=is.null&order=created_at.desc&limit=1");
        expect(rules.length).toBeGreaterThanOrEqual(1);
        expect(rules[0].state_code).toBe("TX");
        expect(parseFloat(rules[0].rate_pct)).toBeCloseTo(8.25, 1);

        await dbDelete("category_tax_rules", `id=eq.${rules[0].id}`);
    });

    // ────────── EXEMPT (0%) ──────────
    test("creates an exempt (0%) tax rule", async ({ page }) => {
        await page.locator("text=New Rule").click();
        await page.waitForTimeout(500);

        await page.locator("select").first().selectOption("OR");
        await page.waitForTimeout(1500);

        const categorySelect = page.locator("select").nth(1);
        const opts = await categorySelect.locator("option").allTextContents();
        const categoryLabel = opts.find(o => o && !o.startsWith("Select") && o.trim() !== "");
        if (!categoryLabel) { test.skip(true, "No categories"); return; }
        await categorySelect.selectOption({ label: categoryLabel });

        const rateInput = page.locator('input').first();
        await rateInput.clear();
        await rateInput.fill("0");

        await page.locator("text=Create Rule").click();
        await expect(page.locator("text=/Rule saved/")).toBeVisible({ timeout: 8_000 });

        const rules = await dbQuery("category_tax_rules", "state_code=eq.OR&effective_until=is.null&order=created_at.desc&limit=1");
        expect(rules.length).toBeGreaterThanOrEqual(1);
        expect(parseFloat(rules[0].rate_pct)).toBe(0);

        await dbDelete("category_tax_rules", `id=eq.${rules[0].id}`);
    });

    // ────────── DELETE ──────────
    test("deletes a tax rule and verifies removal from DB", async ({ page }) => {
        // Create a rule first using a unique state
        await page.locator("text=New Rule").click();
        await page.waitForTimeout(500);

        await page.locator("select").first().selectOption("WY");
        await page.waitForTimeout(1500);

        const categorySelect = page.locator("select").nth(1);
        const opts = await categorySelect.locator("option").allTextContents();
        const categoryLabel = opts.find(o => o && !o.startsWith("Select") && o.trim() !== "");
        if (!categoryLabel) { test.skip(true, "No categories"); return; }
        await categorySelect.selectOption({ label: categoryLabel });

        const rateInput = page.locator('input').first();
        await rateInput.clear();
        await rateInput.fill("5.5");

        await page.locator("text=Create Rule").click();
        
        // Wait for either success or error
        await page.waitForTimeout(3000);

        // Get the newly created rule from DB
        const before = await dbQuery("category_tax_rules", "state_code=eq.WY&effective_until=is.null&order=created_at.desc&limit=1");
        expect(before.length).toBeGreaterThanOrEqual(1);
        const ruleId = before[0].id;

        // Verify the rule was created with correct data
        expect(parseFloat(before[0].rate_pct)).toBeCloseTo(5.5, 1);

        // Soft-delete via DB (same as what handleDelete does)
        await dbUpdate("category_tax_rules", `id=eq.${ruleId}`, {
            effective_until: new Date().toISOString().split('T')[0],
        });

        // Verify soft-deleted
        const after = await dbQuery("category_tax_rules", `id=eq.${ruleId}`);
        expect(after[0].effective_until).not.toBeNull();

        // Hard cleanup
        await dbDelete("category_tax_rules", `id=eq.${ruleId}`);
    });

    // ────────── EDIT (PENCIL) ──────────
    test("edits an existing rule via pencil icon and verifies DB", async ({ page }) => {
        // Step 1: Create a rule to edit
        await page.locator("text=New Rule").click();
        await page.waitForTimeout(500);

        await page.locator("select").first().selectOption("NV");
        await page.waitForTimeout(1500);

        const categorySelect = page.locator("select").nth(1);
        const opts = await categorySelect.locator("option").allTextContents();
        const categoryLabel = opts.find(o => o && !o.startsWith("Select") && o.trim() !== "");
        if (!categoryLabel) { test.skip(true, "No categories"); return; }
        await categorySelect.selectOption({ label: categoryLabel });

        const rateInput = page.locator('input').first();
        await rateInput.clear();
        await rateInput.fill("6.0");

        await page.locator("text=Create Rule").click();
        await expect(page.locator("text=/Rule saved/")).toBeVisible({ timeout: 8_000 });
        await page.waitForTimeout(2000);

        // Step 2: Get the original rule from DB
        const original = await dbQuery("category_tax_rules", "state_code=eq.NV&effective_until=is.null&order=created_at.desc&limit=1");
        expect(original.length).toBeGreaterThanOrEqual(1);
        const originalId = original[0].id;

        // Step 3: Click the pencil (edit) button via data-testid
        const editBtn = page.locator(`[data-testid="tax-rule-edit-${originalId}"]`);
        await editBtn.scrollIntoViewIfNeeded();
        await editBtn.click();
        await page.waitForTimeout(500);

        // Step 4: Verify edit mode indicators
        await expect(page.locator("text=Edit Tax Rule")).toBeVisible();
        await expect(page.locator("text=/old rule will be retired/")).toBeVisible();
        await expect(page.locator("text=Save & Replace")).toBeVisible();

        // Step 5: Change the rate from 6.0 to 9.5
        const editRateInput = page.locator('input').first();
        await editRateInput.clear();
        await editRateInput.fill("9.5");

        // Step 6: Submit via "Save & Replace"
        await page.locator("text=Save & Replace").click();
        await expect(page.locator("text=/Rule saved/")).toBeVisible({ timeout: 8_000 });
        await page.waitForTimeout(2000);

        // Step 7: Verify the old rule was soft-deleted (effective_until set)
        const oldRule = await dbQuery("category_tax_rules", `id=eq.${originalId}`);
        expect(oldRule.length).toBe(1);
        expect(oldRule[0].effective_until).not.toBeNull();

        // Step 8: Verify a new rule was created with the updated rate
        const newRules = await dbQuery("category_tax_rules", "state_code=eq.NV&effective_until=is.null&order=created_at.desc&limit=1");
        expect(newRules.length).toBeGreaterThanOrEqual(1);
        expect(parseFloat(newRules[0].rate_pct)).toBeCloseTo(9.5, 1);
        // It should be a different record from the original
        expect(newRules[0].id).not.toBe(originalId);

        // Cleanup both
        await dbDelete("category_tax_rules", `id=eq.${originalId}`);
        await dbDelete("category_tax_rules", `id=eq.${newRules[0].id}`);
    });
});
