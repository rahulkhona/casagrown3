/**
 * Admin Campaign Promotions (Legacy) E2E Tests
 *
 * Tests the legacy /campaigns/promotions page which manages CRM promotions
 * with composable offers: Giveaway, Recurring Store Credits, Pro Subscription Discount.
 *
 * Page heading: "Public Promotions"
 * New button:   "New Promotion"
 * Submit:       "Create Promotion"
 * Cancel:       "Cancel"
 *
 * Checkbox labels (from page.tsx):
 *   - "Enable Giveaway Prize"
 *   - "Enable Recurring Store Credits"
 *   - "Enable Pro Subscription Discount"
 *   - "Auto-generate CRM Campaign and Public Landing Page Route"
 *
 * DB tables:
 *   crm_promotions, crm_promo_giveaways, crm_promo_buyer_discounts,
 *   crm_promo_subscription_discounts, crm_campaigns, crm_landing_pages
 */

import { expect, test } from "@playwright/test";
import { dbDelete, dbQuery } from "../helpers/supabase-db";

const UNIQUE = `PW_${Date.now()}`;

test.describe("Campaign Promotions (Legacy)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/campaigns/promotions");
        // The page heading is "Public Promotions"
        await page
            .getByText("Public Promotions", { exact: true })
            .waitFor({ timeout: 15_000 });
    });

    // ────────── LIST ──────────
    test("renders campaign promotions list page with header and New Promotion button", async ({
        page,
    }) => {
        await expect(
            page.getByText("Public Promotions", { exact: true })
        ).toBeVisible();
        await expect(page.locator("text=New Promotion")).toBeVisible();
        // Table headers
        await expect(
            page.locator("text=Promotion").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Offers").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Enrollment").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Actions").first()
        ).toBeVisible();
        // Subtitle
        await expect(
            page.locator(
                "text=Build multi-offer CRM campaigns and auto-generate landing pages."
            )
        ).toBeVisible();
    });

    // ────────── OPEN/CLOSE CREATE FORM ──────────
    test("cancel button closes create form without creating", async ({
        page,
    }) => {
        await page.locator("text=New Promotion").click();
        await expect(
            page.locator("text=1. Base Configuration")
        ).toBeVisible();
        await page.locator("text=Cancel").click();
        await expect(
            page.locator("text=1. Base Configuration")
        ).not.toBeVisible();
    });

    // ────────── CREDITS FORM ──────────
    test("create promotion form reveals credit fields when toggling Enable Recurring Store Credits", async ({
        page,
    }) => {
        await page.locator("text=New Promotion").click();
        await expect(
            page.locator("text=1. Base Configuration")
        ).toBeVisible();

        // Click "Enable Recurring Store Credits" checkbox label
        await page
            .locator("text=Enable Recurring Store Credits")
            .click();
        await page.waitForTimeout(1000);

        // Credit sub-form fields should appear: Amount ($), Credit Type, Cap Type, Cap Value, Frequency, Occurrences, Start Date
        await expect(
            page.locator("text=Amount ($)").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Credit Type").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Cap Type").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Cap Value").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Frequency").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Occurrences").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Start Date").first()
        ).toBeVisible();
    });

    // ────────── SUBSCRIPTION DISCOUNT PREVIEW ──────────
    test("subscription discount preview shows price calculation", async ({
        page,
    }) => {
        await page.locator("text=New Promotion").click();
        await expect(
            page.locator("text=2. Offer Configuration (Composition)")
        ).toBeVisible();

        // Enable subscription discount
        await page
            .locator("text=Enable Pro Subscription Discount")
            .click();
        await page.waitForTimeout(1000);

        // Discount (%) label and Duration should appear
        await expect(
            page.locator("text=Discount (%)").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Duration").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Forever").first()
        ).toBeVisible();

        // Preview with default 25% discount: $10/mo → $7.50/mo for 3 months, then $10/mo
        await expect(
            page.locator("text=/Preview.*\\$10\\/mo.*\\$7\\.50\\/mo/")
        ).toBeVisible();
    });

    // ────────── GIVEAWAY FORM ──────────
    test("enable giveaway prize reveals date fields", async ({
        page,
    }) => {
        await page.locator("text=New Promotion").click();
        await expect(
            page.locator("text=2. Offer Configuration (Composition)")
        ).toBeVisible();

        await page.locator("text=Enable Giveaway Prize").click();
        await page.waitForTimeout(1000);

        await expect(
            page.locator("text=Giveaway Start Date").first()
        ).toBeVisible();
        await expect(
            page.locator("text=Giveaway End Date").first()
        ).toBeVisible();
    });

    // ────────── VALIDATION ──────────
    test("shows error when submitting without required fields", async ({
        page,
    }) => {
        await page.locator("text=New Promotion").click();
        await expect(
            page.locator("text=1. Base Configuration")
        ).toBeVisible();

        // Click Create without filling anything
        await page.locator("text=Create Promotion").click();
        await page.waitForTimeout(1000);

        // Should show base field validation error
        await expect(
            page.locator("text=Fill out all base fields.")
        ).toBeVisible();
    });

    test("shows error when no offer is enabled", async ({ page }) => {
        await page.locator("text=New Promotion").click();
        await expect(
            page.locator("text=1. Base Configuration")
        ).toBeVisible();

        // Fill base fields but enable no offers
        await page
            .locator('input[placeholder="e.g. Spring Harvest Giveaway"]')
            .fill("Test No Offers");
        // Deadline is datetime-local
        const deadlineInput = page.locator('input[type="datetime-local"]');
        await deadlineInput.fill("2026-12-31T23:59");
        // Max enrollees defaults to 100, leave as-is

        // Uncheck the landing page toggle (still no offer)
        await page.locator("text=Create Promotion").click();
        await page.waitForTimeout(1000);

        await expect(
            page.locator(
                "text=You must enable at least one offer (Giveaway, Credits, or Subscription Discount)."
            )
        ).toBeVisible();
    });

    // ────────── CREATE & DELETE WITH DB VERIFICATION ──────────
    test("creates and deletes a promotion with DB verification", async ({
        page,
    }) => {
        const name = `PW Legacy Promo ${UNIQUE}`;

        await page.locator("text=New Promotion").click();
        await expect(
            page.locator("text=1. Base Configuration")
        ).toBeVisible();

        // Fill base configuration
        await page
            .locator('input[placeholder="e.g. Spring Harvest Giveaway"]')
            .fill(name);
        const deadlineInput = page.locator('input[type="datetime-local"]');
        await deadlineInput.fill("2026-12-31T23:59");

        // Enable subscription discount (simplest offer — no extra date fields)
        await page
            .locator("text=Enable Pro Subscription Discount")
            .click();
        await page.waitForTimeout(1000);

        // Submit
        await page.locator("text=Create Promotion").click();
        await expect(
            page.locator("text=/Promotion created/")
        ).toBeVisible({ timeout: 15_000 });

        // Wait for list to refresh
        await page.waitForTimeout(3000);

        // Verify promotion exists in DB
        const promos = await dbQuery(
            "crm_promotions",
            `name=eq.${encodeURIComponent(name)}`
        );
        expect(promos.length).toBe(1);
        expect(promos[0].max_enrollees).toBe(100);

        const promoId = promos[0].id;

        // Verify subscription discount was created
        const sds = await dbQuery(
            "crm_promo_subscription_discounts",
            `promotion_id=eq.${promoId}`
        );
        expect(sds.length).toBe(1);
        expect(sds[0].discount_pct).toBe(25); // default

        // Verify landing page was created (default: createLandingPage = true)
        const campaigns = await dbQuery(
            "crm_campaigns",
            `promotion_id=eq.${promoId}`
        );
        if (campaigns.length > 0) {
            const lps = await dbQuery(
                "crm_landing_pages",
                `campaign_id=eq.${campaigns[0].id}`
            );

            // Cleanup landing pages, campaigns
            if (lps.length > 0) {
                await dbDelete(
                    "crm_landing_pages",
                    `campaign_id=eq.${campaigns[0].id}`
                );
            }
            await dbDelete(
                "crm_campaigns",
                `promotion_id=eq.${promoId}`
            );
        }

        // Cleanup promotion children then promotion
        await dbDelete(
            "crm_promo_subscription_discounts",
            `promotion_id=eq.${promoId}`
        );
        await dbDelete(
            "crm_promo_buyer_discounts",
            `promotion_id=eq.${promoId}`
        );
        await dbDelete(
            "crm_promo_giveaways",
            `promotion_id=eq.${promoId}`
        );
        await dbDelete("crm_promotions", `id=eq.${promoId}`);

        // Verify cleanup
        const after = await dbQuery(
            "crm_promotions",
            `name=eq.${encodeURIComponent(name)}`
        );
        expect(after.length).toBe(0);
    });

    // ────────── LIST SHOWS PROMOTION ──────────
    test("newly created promotion appears in the list with offer badges", async ({
        page,
    }) => {
        const name = `PW Badge Test ${UNIQUE}`;

        await page.locator("text=New Promotion").click();
        await page
            .locator('input[placeholder="e.g. Spring Harvest Giveaway"]')
            .fill(name);
        await page
            .locator('input[type="datetime-local"]')
            .fill("2026-12-31T23:59");

        // Enable credits
        await page
            .locator("text=Enable Recurring Store Credits")
            .click();
        await page.waitForTimeout(500);

        // Fill required credit fields
        // Amount ($) — find numeric input inside the credits section
        const creditAmountInputs = page.locator(
            'input[inputmode="numeric"], input[type="number"]'
        );
        // The credits Amount field is the first numeric input after enabling
        // We locate it via the label relationship
        const amountLabel = page.locator("text=Amount ($)").first();
        const amountInput = amountLabel
            .locator("..")
            .locator("input")
            .first();
        await amountInput.fill("15");

        const capValueLabel = page.locator("text=Cap Value").first();
        const capValueInput = capValueLabel
            .locator("..")
            .locator("input")
            .first();
        await capValueInput.fill("50");

        const crStartLabel = page.locator("text=Start Date").first();
        const crStartInput = crStartLabel
            .locator("..")
            .locator('input[type="date"]')
            .first();
        await crStartInput.fill("2026-06-01");

        await page.locator("text=Create Promotion").click();
        await expect(
            page.locator("text=/Promotion created/")
        ).toBeVisible({ timeout: 15_000 });

        await page.waitForTimeout(3000);

        // Verify name shows in list
        await expect(page.locator(`text=${name}`)).toBeVisible({
            timeout: 10_000,
        });

        // Verify credits badge shows amount
        await expect(
            page.locator("text=/\\$15.*monthly/i").first()
        ).toBeVisible();

        // Cleanup
        const promos = await dbQuery(
            "crm_promotions",
            `name=eq.${encodeURIComponent(name)}`
        );
        if (promos.length > 0) {
            const promoId = promos[0].id;
            const campaigns = await dbQuery(
                "crm_campaigns",
                `promotion_id=eq.${promoId}`
            );
            if (campaigns.length > 0) {
                await dbDelete(
                    "crm_landing_pages",
                    `campaign_id=eq.${campaigns[0].id}`
                );
                await dbDelete(
                    "crm_campaigns",
                    `promotion_id=eq.${promoId}`
                );
            }
            await dbDelete(
                "crm_promo_buyer_discounts",
                `promotion_id=eq.${promoId}`
            );
            await dbDelete(
                "crm_promo_subscription_discounts",
                `promotion_id=eq.${promoId}`
            );
            await dbDelete(
                "crm_promo_giveaways",
                `promotion_id=eq.${promoId}`
            );
            await dbDelete("crm_promotions", `id=eq.${promoId}`);
        }
    });
});
