import { test, expect } from '@playwright/test';

test.describe('Multi-Arm Bandit Router E2E — Full User Journey Across Variants', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Standard Variant (variant_override=standard) — Full Multi-Step Listing Journey', async ({ page }) => {
    await page.goto('/create-listing?variant_override=standard');
    await page.waitForLoadState('networkidle');

    // 1. Step 1: Basics
    await expect(page.locator('h2:has-text("Create Your Product Listing")')).toBeVisible();
    await page.locator('input[type="email"]').fill('e2e-mab-standard@example.com');
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('MAB Heirloom Tomatoes');
    await page.locator('textarea[placeholder="Tell buyers about your produce..."]').fill('Fresh picked daily');
    await page.locator('select').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Next →' }).click();

    // 2. Step 2: Fulfillment
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('Street Address').first().fill('500 Howard St');
    await page.getByPlaceholder('City').first().fill('San Francisco');
    await page.getByPlaceholder('ST').first().fill('CA');
    await page.getByPlaceholder('ZIP').first().fill('94105');
    
    // Select day window or toggle pickup off to satisfy step 2 validation
    const todayBtn = page.getByText(/^Today/i).first();
    if (await todayBtn.isVisible().catch(() => false)) {
      await todayBtn.click().catch(() => {});
    }
    const pickupToggle = page.getByText('Pickup Available').first();
    if (await pickupToggle.isVisible().catch(() => false)) {
      await pickupToggle.click().catch(() => {});
    }
    await page.getByRole('button', { name: 'Next →' }).click();

    // 3. Step 3: Pricing
    await expect(page.locator('h2:has-text("Set Your Price")')).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="number"]').first().fill('15');
    await page.locator('input[type="number"]').last().fill('4.50');
    await page.getByRole('button', { name: 'Next →' }).click();

    // 4. Step 4: Verification / Secure Step
    await expect(page.locator('h2:has-text("Secure Your Listing")')).toBeVisible({ timeout: 15000 });
  });

  test('Simple Variant (variant_override=simple) — Full Quick Entry Listing Journey', async ({ page }) => {
    await page.goto('/create-listing?variant_override=simple');
    await page.waitForLoadState('networkidle');

    // 1. Fill Free-Form Entry Text
    const textarea = page.locator('textarea[placeholder*="Meyer lemons"]').first();
    await expect(textarea).toBeVisible();
    await textarea.fill('Organic Meyer Lemons — $6 / lb. Fresh from San Jose garden.');

    // 2. Verify Submit Button is enabled & visible
    const submitBtn = page.getByRole('button', { name: /Create My Listing|List Item Now/i }).first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test('Query Parameters Retained Across MAB Routing', async ({ page }) => {
    await page.goto('/create-listing?variant_override=simple&utm_source=bandit_test&email=test@example.com');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('utm_source=bandit_test');
    expect(url).toContain('email=test@example.com');
  });
});
