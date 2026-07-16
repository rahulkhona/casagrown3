import { test, expect } from '@playwright/test';

test.describe('Multi-Arm Bandit Router E2E', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should route to standard variant when override=standard is present', async ({ page }) => {
    await page.goto('/create-listing?variant_override=standard');
    await page.waitForLoadState('networkidle');

    // Verify it renders the standard listing wizard steps
    await expect(page.locator('text=Basics')).toBeVisible();
    await expect(page.locator('text=Fulfillment')).toBeVisible();
  });

  test('should route to simple variant when override=simple is present', async ({ page }) => {
    await page.goto('/create-listing?variant_override=simple');
    await page.waitForLoadState('networkidle');

    // Verify it renders the simple wizard free-form entry
    await expect(page.locator('textarea[placeholder*="Describe what you\'d like to sell"]')).toBeVisible();
  });

  test('should retain query parameters on render', async ({ page }) => {
    await page.goto('/create-listing?variant_override=simple&utm_source=bandit_test&email=test@example.com');
    await page.waitForLoadState('networkidle');

    // Verify query parameters are still in the URL
    const url = page.url();
    expect(url).toContain('utm_source=bandit_test');
    expect(url).toContain('email=test@example.com');
  });
});
