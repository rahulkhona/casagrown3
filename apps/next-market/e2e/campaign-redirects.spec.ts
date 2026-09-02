import { test, expect } from './fixtures';

test.describe('Ad Campaign Landing Pages & URL Redirects', () => {

  test('should redirect /fresh to /check-nutrition-loss and preserve query parameters', async ({ page }) => {
    await page.goto('/fresh?geo=97206&utm_source=audiogo&utm_medium=audio&utm_campaign=franklin_w1_nutrition');
    await page.waitForURL(/.*check-nutrition-loss.*/);
    expect(page.url()).toContain('/check-nutrition-loss');
    expect(page.url()).toContain('geo=97206');
    expect(page.url()).toContain('utm_source=audiogo');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should redirect /nutrition to /check-nutrition-loss', async ({ page }) => {
    await page.goto('/nutrition?geo=97206');
    await page.waitForURL(/.*check-nutrition-loss.*/);
    expect(page.url()).toContain('/check-nutrition-loss');
    expect(page.url()).toContain('geo=97206');
  });

  test('should redirect /loss to /check-nutrition-loss', async ({ page }) => {
    await page.goto('/loss');
    await page.waitForURL(/.*check-nutrition-loss.*/);
    expect(page.url()).toContain('/check-nutrition-loss');
  });

  test('should load /check-nutrition-loss calculator page properly', async ({ page }) => {
    await page.goto('/check-nutrition-loss?geo=97206');
    await expect(page.locator('body')).toBeVisible();
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/nutrition|fresh|harvest|vegetable|fruit|loss/);
  });

  test('should load /sell harvest earnings calculator with UTM tracking', async ({ page }) => {
    await page.goto('/sell?geo=97206&utm_source=vibeco&utm_medium=ctv&utm_campaign=franklin_w2_sellcalc');
    await expect(page.locator('body')).toBeVisible();
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/sell|harvest|calculator|value|earnings|booth|stand/);
  });

  test('should load /market marketplace page properly', async ({ page }) => {
    await page.goto('/market?geo=97206');
    await expect(page.locator('body')).toBeVisible();
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/market|harvest|produce|local|booth|browse/);
  });
});
