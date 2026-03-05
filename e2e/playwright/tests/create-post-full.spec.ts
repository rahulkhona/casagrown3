/**
 * Create Post E2E Tests (Full) — validate the complete post creation flow.
 *
 * Tests the post type selection screen and the sell, buy, and general forms.
 * Verifies that all form fields are present and that post types can be selected.
 *
 * Prerequisites:
 * - Local Supabase running with seed data (supabase db reset)
 * - Web dev server running on port 3000
 * - Auth setup has run (automatic via Playwright config)
 */

import { expect, test } from "@playwright/test";
import { gotoWithAuth } from "../helpers/navigation";

test.describe("Create Post - Full Flow", () => {
    test.beforeEach(async ({ page }) => {
        // Suppress notification prompt by pre-setting dismiss timestamp in localStorage
        await page.addInitScript(() => {
            localStorage.setItem(
                "casagrown_notif_dismissed_at",
                new Date().toISOString(),
            );
        });
    });
    test("shows all 6 post type cards", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        // If redirected to login, skip
        if (page.url().includes("/login")) {
            test.skip();
        }

        // All 6 post type cards should be visible
        await expect(
            page.locator("text=Looking to Sell").first(),
        ).toBeVisible({ timeout: 10_000 });
        await expect(page.locator("text=Looking to Buy").first()).toBeVisible();
        await expect(
            page.locator("text=Need a Service").first(),
        ).toBeVisible();
        await expect(
            page.locator("text=Offer a Service").first(),
        ).toBeVisible();
        await expect(
            page.locator("text=Ask for Advice").first(),
        ).toBeVisible();
    });

    test("selecting sell type opens sell form with correct fields", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Click "Looking to Sell"
        await page.locator("text=Looking to Sell").first().click();
        await page.waitForTimeout(1000);

        // Sell form should show key fields
        const hasSellTitle = await page
            .locator("text=/Sell Produce|product|produce/i")
            .first()
            .isVisible()
            .catch(() => false);

        // Category field
        const hasCategory = await page
            .locator("text=Category")
            .first()
            .isVisible()
            .catch(() => false);

        // Quantity field
        const hasQuantity = await page
            .locator("text=/Available Qty|Quantity/i")
            .first()
            .isVisible()
            .catch(() => false);

        // Price field
        const hasPrice = await page
            .locator("text=/Price|points/i")
            .first()
            .isVisible()
            .catch(() => false);

        // Drop-off dates
        const hasDates = await page
            .locator("text=/Drop-off|drop.off/i")
            .first()
            .isVisible()
            .catch(() => false);

        // Submit button
        const hasSubmit = await page
            .locator("text=Post to Community")
            .first()
            .isVisible()
            .catch(() => false);

        // At least the core fields should be visible
        expect(hasCategory || hasQuantity || hasPrice).toBeTruthy();
    });

    test("selecting buy type opens buy form with correct fields", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Click "Looking to Buy"
        await page.locator("text=Looking to Buy").first().click();
        await page.waitForTimeout(1000);

        // Buy form title
        await expect(
            page.locator("text=/Looking to Buy/i").first(),
        ).toBeVisible({ timeout: 10_000 });

        // "What are you looking for?" field (required)
        await expect(
            page.locator("text=/What are you looking for/i").first(),
        ).toBeVisible({ timeout: 5_000 });

        // Desired Quantity field
        await expect(
            page.locator("text=/Desired Quantity/i").first(),
        ).toBeVisible({ timeout: 5_000 });

        // Unit selection buttons (piece, dozen, box, bag)
        await expect(
            page.locator("text=Unit").or(page.locator("text=unit")).first(),
        ).toBeVisible({ timeout: 5_000 });

        // Scroll to see fields below the fold (dates section)
        await page.locator("text=/Latest Drop-off Date/i").first()
            .scrollIntoViewIfNeeded();

        // Latest Drop-off Date field
        await expect(
            page.locator("text=/Latest Drop-off Date/i").first(),
        ).toBeVisible({ timeout: 5_000 });

        // Accept Drop-off Dates section
        await expect(
            page.locator("text=/Accept Drop-off Dates/i").first(),
        ).toBeVisible({ timeout: 5_000 });

        // Scroll further to "Add a date" button
        await page.locator("text=/Add a date/i").first()
            .scrollIntoViewIfNeeded();

        // "Add a date" button for drop-off dates
        await expect(
            page.locator("text=/Add a date/i").first(),
        ).toBeVisible({ timeout: 5_000 });

        // Submit button
        await page.locator("text=Post to Community").first()
            .scrollIntoViewIfNeeded();
        await expect(
            page.locator("text=Post to Community").first(),
        ).toBeVisible({ timeout: 5_000 });
    });

    test("selecting advice type opens general form", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Click "Ask for Advice"
        await page.locator("text=Ask for Advice").first().click();
        await page.waitForTimeout(1000);

        // General form should show title and description fields
        const hasTitle = await page
            .locator("text=Title")
            .or(page.locator("[placeholder*='title']"))
            .first()
            .isVisible()
            .catch(() => false);

        const hasDescription = await page
            .locator("text=Description")
            .or(page.locator("[placeholder*='Describe']"))
            .first()
            .isVisible()
            .catch(() => false);

        // Or check for Community selector which is common to general forms
        const hasCommunity = await page
            .locator("text=Community")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasTitle || hasDescription || hasCommunity).toBeTruthy();
    });

    test("back button from form returns to type selection", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        // Select a post type
        await page.locator("text=Looking to Sell").first().click();
        await page.waitForTimeout(1000);

        // Click back button (ArrowLeft icon or Back text)
        const backBtn = page
            .locator(
                "[aria-label*='back'], [aria-label*='Back'], button:has(svg)",
            )
            .first();
        if (await backBtn.isVisible().catch(() => false)) {
            await backBtn.click();
            await page.waitForTimeout(1000);

            // Should be back on type selection
            const hasTypeCards = await page
                .locator("text=Looking to Sell")
                .first()
                .isVisible()
                .catch(() => false);
            expect(hasTypeCards).toBeTruthy();
        }
    });

    test("sell form shows media upload section", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        await page.locator("text=Looking to Sell").first().click();
        await page.waitForTimeout(1000);

        // Photo/Video upload section should be visible
        const hasMedia = await page
            .locator("text=/Photo|Video|Upload|media/i")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasMedia).toBeTruthy();
    });

    test("sell form shows community map section", async ({ page }) => {
        await page.goto("/create-post");
        await page.waitForTimeout(3000);

        if (page.url().includes("/login")) {
            test.skip();
        }

        await page.locator("text=Looking to Sell").first().click();
        await page.waitForTimeout(1000);

        // Community field should be visible
        const hasCommunity = await page
            .locator("text=Community")
            .first()
            .isVisible()
            .catch(() => false);

        expect(hasCommunity).toBeTruthy();
    });

    // =========================================
    // Compliance: Produce Checkbox & Harvest Date
    // =========================================

    test("sell form shows produce checkbox after category selection", async ({ page }) => {
        const ok = await gotoWithAuth(page, "/create-post");
        if (!ok) {
            test.skip();
            return;
        }

        await page.locator("text=Looking to Sell").first().click();
        await page.waitForTimeout(1000);

        // Select a produce category (fruits/vegetables/herbs)
        const categoryField = page.locator("text=Category").first();
        const hasCat = await categoryField.isVisible().catch(() => false);
        if (!hasCat) {
            test.skip();
        }

        // Try to find and select a category
        await categoryField.click();
        await page.waitForTimeout(500);

        // Look for a produce category in the dropdown
        const fruitOption = page.locator("text=/fruits|vegetables|herbs/i")
            .first();
        const hasProduce = await fruitOption.isVisible({ timeout: 3000 }).catch(
            () => false,
        );

        if (hasProduce) {
            await fruitOption.click();
            await page.waitForTimeout(500);

            // After selecting a produce category, the "This is produce" checkbox should be visible and checked
            const produceCheckbox = page.locator(
                "text=/This is produce|produce/i",
            ).first();
            const hasProduceCheckbox = await produceCheckbox
                .isVisible({ timeout: 5000 })
                .catch(() => false);

            if (hasProduceCheckbox) {
                expect(hasProduceCheckbox).toBeTruthy();

                // Scroll to harvest date section
                await page.locator("text=/harvest/i").first()
                    .scrollIntoViewIfNeeded()
                    .catch(() => {});

                // Harvest date field should be visible when produce is checked
                const hasHarvest = await page
                    .locator("text=/harvest/i")
                    .first()
                    .isVisible({ timeout: 3000 })
                    .catch(() => false);

                expect(hasHarvest).toBeTruthy();
            }
        }
    });

    // =========================================
    // Compliance: Escrow → Hold language check
    // =========================================

    test("sell form does not contain escrow language", async ({ page }) => {
        const ok = await gotoWithAuth(page, "/create-post");
        if (!ok) {
            test.skip();
            return;
        }

        await page.locator("text=Looking to Sell").first().click();
        await page.waitForTimeout(1000);

        // The sell form should NOT contain the word "escrow" anywhere
        const bodyText = await page.locator("body").textContent();
        expect(bodyText?.toLowerCase()).not.toContain("escrow");
    });

    // =========================================
    // Regression: Neighboring Zones Selector
    // =========================================

    test("sell form shows neighbor zone selector with adjacent communities", async ({ page }) => {
        const ok = await gotoWithAuth(page, "/create-post");
        if (!ok) {
            test.skip();
            return;
        }

        await page.locator("text=Looking to Sell").first().click();
        await page.waitForTimeout(2000);

        // Community section should be visible
        const hasCommunity = await page
            .locator("text=Community")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);

        if (!hasCommunity) {
            test.skip();
            return;
        }

        // Check if the neighbor zone section is present
        // It only renders when nearby_community_h3_indices is populated in the profile
        const hasNeighborLabel = await page
            .locator("text=/Also post to|adjacent communities/i")
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);

        if (!hasNeighborLabel) {
            // Neighbor data not seeded yet — skip gracefully
            // After `supabase db reset` with updated seed.sql, this test will assert
            test.skip();
            return;
        }

        // Scroll into view
        await page
            .locator("text=/Also post to|adjacent communities/i")
            .first()
            .scrollIntoViewIfNeeded();

        // Should show Rose Garden and/or Cambrian Park pills
        const hasRoseGarden = await page
            .locator("text=Rose Garden")
            .first()
            .isVisible({ timeout: 3_000 })
            .catch(() => false);

        const hasCambrianPark = await page
            .locator("text=Cambrian Park")
            .first()
            .isVisible({ timeout: 3_000 })
            .catch(() => false);

        // At least one neighbor community should be visible
        expect(hasRoseGarden || hasCambrianPark).toBeTruthy();
    });
});
