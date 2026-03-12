/**
 * Admin Campaigns E2E Tests
 *
 * Uses data-testid selectors for Tamagui components.
 * Button: "New Campaign", Submit: "Create Campaign"
 * Status checkbox: data-testid="campaign-status-{id}"
 * Edit: data-testid="campaign-edit-{id}"
 * Delete: data-testid="campaign-delete-{id}"
 */

import { expect, test } from "@playwright/test";
import { dbDelete, dbQuery } from "../helpers/supabase-db";

const UNIQUE = `PW_${Date.now()}`;

test.describe("Admin Campaigns", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/campaigns");
        await page.getByText("Incentive Campaigns", { exact: true }).waitFor({ timeout: 15_000 });
    });

    // ────────── LIST ──────────
    test("renders campaign list page with header and New Campaign button", async ({ page }) => {
        await expect(page.getByText("Incentive Campaigns", { exact: true })).toBeVisible();
        await expect(page.locator("text=New Campaign")).toBeVisible();
        await expect(page.locator("text=Campaign Name").first()).toBeVisible();
        await expect(page.locator("text=Duration").first()).toBeVisible();
        await expect(page.locator("text=Status").first()).toBeVisible();
    });

    // ────────── CREATE ──────────
    test("creates a campaign with rewards and verifies DB", async ({ page }) => {
        const name = `Test Campaign ${UNIQUE}`;

        await page.locator("text=New Campaign").click();
        await expect(page.locator("text=Create New Campaign")).toBeVisible();

        await page.locator('input[placeholder="e.g. Spring Launch Bonus"]').fill(name);
        await page.locator('input[placeholder="YYYY-MM-DD"]').first().fill("2026-06-01");
        await page.locator('input[placeholder="YYYY-MM-DD"]').nth(1).fill("2026-12-31");

        // Add reward
        await page.locator("select").first().selectOption("signup");
        await page.locator('input[placeholder="Points"]').first().fill("100");

        await page.locator("text=Create Campaign").click();
        await expect(page.locator(`text=/Campaign.*created/`)).toBeVisible({ timeout: 10_000 });

        // Verify DB
        const campaigns = await dbQuery("incentive_campaigns", `name=eq.${encodeURIComponent(name)}`);
        expect(campaigns.length).toBe(1);
        expect(campaigns[0].is_active).toBe(true);

        const rewards = await dbQuery("campaign_rewards", `campaign_id=eq.${campaigns[0].id}`);
        expect(rewards.length).toBe(1);
        expect(rewards[0].behavior).toBe("signup");
        expect(rewards[0].points).toBe(100);

        await dbDelete("incentive_campaigns", `id=eq.${campaigns[0].id}`);
    });

    // ────────── TOGGLE STATUS ──────────
    test("toggles campaign active status and verifies DB", async ({ page }) => {
        const name = `Toggle Test ${UNIQUE}`;

        // Create campaign
        await page.locator("text=New Campaign").click();
        await page.locator('input[placeholder="e.g. Spring Launch Bonus"]').fill(name);
        await page.locator('input[placeholder="YYYY-MM-DD"]').first().fill("2026-01-01");
        await page.locator('input[placeholder="YYYY-MM-DD"]').nth(1).fill("2026-12-31");
        await page.locator("text=Create Campaign").click();
        await expect(page.locator(`text=/Campaign.*created/`)).toBeVisible({ timeout: 10_000 });

        // Get campaign ID from DB
        const campaigns = await dbQuery("incentive_campaigns", `name=eq.${encodeURIComponent(name)}`);
        expect(campaigns.length).toBe(1);
        const campaignId = campaigns[0].id;

        // Toggle off using data-testid
        const statusCheckbox = page.locator(`[data-testid="campaign-status-${campaignId}"]`);
        await statusCheckbox.click();
        await page.waitForTimeout(2000);

        const after = await dbQuery("incentive_campaigns", `id=eq.${campaignId}`);
        expect(after[0].is_active).toBe(false);

        // Toggle back on
        await statusCheckbox.click();
        await page.waitForTimeout(2000);

        const afterBack = await dbQuery("incentive_campaigns", `id=eq.${campaignId}`);
        expect(afterBack[0].is_active).toBe(true);

        await dbDelete("incentive_campaigns", `id=eq.${campaignId}`);
    });

    // ────────── EDIT ──────────
    test("edits campaign name and dates, verifies DB", async ({ page }) => {
        const name = `Edit Test ${UNIQUE}`;
        const updatedName = `Updated ${name}`;

        // Create
        await page.locator("text=New Campaign").click();
        await page.locator('input[placeholder="e.g. Spring Launch Bonus"]').fill(name);
        await page.locator('input[placeholder="YYYY-MM-DD"]').first().fill("2026-01-01");
        await page.locator('input[placeholder="YYYY-MM-DD"]').nth(1).fill("2026-12-31");
        await page.locator("text=Create Campaign").click();
        await expect(page.locator(`text=/Campaign.*created/`)).toBeVisible({ timeout: 10_000 });

        // Get ID
        const campaigns = await dbQuery("incentive_campaigns", `name=eq.${encodeURIComponent(name)}`);
        const campaignId = campaigns[0].id;

        // Click edit via data-testid
        await page.locator(`[data-testid="campaign-edit-${campaignId}"]`).click();

        // Edit name (the inline edit form has Input fields labeled "Name")
        const nameInput = page.locator('input').first();
        await nameInput.clear();
        await nameInput.fill(updatedName);

        await page.locator("text=Save").click();
        await expect(page.locator("text=Campaign updated")).toBeVisible({ timeout: 10_000 });

        // Verify DB
        const updated = await dbQuery("incentive_campaigns", `id=eq.${campaignId}`);
        expect(updated[0].name).toBe(updatedName);

        await dbDelete("incentive_campaigns", `id=eq.${campaignId}`);
    });

    // ────────── DELETE ──────────
    test("deletes a campaign and verifies cascading cleanup", async ({ page }) => {
        const name = `Delete Test ${UNIQUE}`;

        // Create with reward
        await page.locator("text=New Campaign").click();
        await page.locator('input[placeholder="e.g. Spring Launch Bonus"]').fill(name);
        await page.locator('input[placeholder="YYYY-MM-DD"]').first().fill("2026-01-01");
        await page.locator('input[placeholder="YYYY-MM-DD"]').nth(1).fill("2026-12-31");
        await page.locator("select").first().selectOption("first_post");
        await page.locator('input[placeholder="Points"]').first().fill("50");
        await page.locator("text=Create Campaign").click();
        await expect(page.locator(`text=/Campaign.*created/`)).toBeVisible({ timeout: 10_000 });

        const campaigns = await dbQuery("incentive_campaigns", `name=eq.${encodeURIComponent(name)}`);
        const campaignId = campaigns[0].id;

        const rewardsBefore = await dbQuery("campaign_rewards", `campaign_id=eq.${campaignId}`);
        expect(rewardsBefore.length).toBe(1);

        // Delete via data-testid
        await page.locator(`[data-testid="campaign-delete-${campaignId}"]`).click();
        await page.waitForTimeout(2000);

        // Verify deleted
        const after = await dbQuery("incentive_campaigns", `id=eq.${campaignId}`);
        expect(after.length).toBe(0);

        const rewardsAfter = await dbQuery("campaign_rewards", `campaign_id=eq.${campaignId}`);
        expect(rewardsAfter.length).toBe(0);
    });

    // ────────── EXPAND & VIEW DETAILS ──────────
    test("expanding a campaign shows rewards and zone info", async ({ page }) => {
        const name = `Expand Test ${UNIQUE}`;

        await page.locator("text=New Campaign").click();
        await page.locator('input[placeholder="e.g. Spring Launch Bonus"]').fill(name);
        await page.locator('input[placeholder="YYYY-MM-DD"]').first().fill("2026-01-01");
        await page.locator('input[placeholder="YYYY-MM-DD"]').nth(1).fill("2026-12-31");
        await page.locator("select").first().selectOption("per_referral");
        await page.locator('input[placeholder="Points"]').first().fill("200");
        await page.locator("text=Create Campaign").click();
        await expect(page.locator(`text=/Campaign.*created/`)).toBeVisible({ timeout: 10_000 });

        // Wait for the campaign list to reload and show the new campaign
        // The success message also contains the name, so wait for it to disappear
        await page.waitForTimeout(5000);

        // Click campaign row to expand — use .last() because the success message fading
        // might still match; the table row is always last.
        const campaignName = page.locator(`text=${name}`).last();
        await expect(campaignName).toBeVisible({ timeout: 10_000 });
        await campaignName.click();
        await page.waitForTimeout(2000);

        await expect(page.locator("text=Reward Rules")).toBeVisible({ timeout: 5_000 });
        await expect(page.locator("text=Per Referral")).toBeVisible();
        await expect(page.locator("text=200 pts")).toBeVisible();
        await expect(page.locator("text=/Target Zones/")).toBeVisible();

        // Cleanup
        const campaigns = await dbQuery("incentive_campaigns", `name=eq.${encodeURIComponent(name)}`);
        if (campaigns.length > 0) {
            await dbDelete("incentive_campaigns", `id=eq.${campaigns[0].id}`);
        }
    });

    // ────────── CANCEL ──────────
    test("cancel button closes create form without creating", async ({ page }) => {
        await page.locator("text=New Campaign").click();
        await expect(page.locator("text=Create New Campaign")).toBeVisible();
        await page.locator("text=Cancel").click();
        await expect(page.locator("text=Create New Campaign")).not.toBeVisible();
    });
});
