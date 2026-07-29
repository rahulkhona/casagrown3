import { test, expect } from '@playwright/test';

test.describe('Analytics & Chatbot Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legacy/activity');
  });

  test('should render UTM filters and apply them', async ({ page }) => {
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Page Analytics');
    
    const sourceInput = page.getByPlaceholder('utm_source');
    await expect(sourceInput).toBeVisible();
    await sourceInput.fill('newsletter');
    
    const mediumInput = page.getByPlaceholder('utm_medium');
    await expect(mediumInput).toBeVisible();
    await mediumInput.fill('email');
    
    // Verify inputs hold value
    await expect(sourceInput).toHaveValue('newsletter');
    await expect(mediumInput).toHaveValue('email');
  });

  test('should render Wizard Drop-off funnels', async ({ page }) => {
    await page.goto('/legacy/marketing/wizard');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Wizard Analytics');
  });
});
