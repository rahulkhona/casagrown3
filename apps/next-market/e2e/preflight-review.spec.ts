import { test, expect } from './fixtures';

test.describe('Seller Dashboard - Pre-Flight Shelf Review Modal', () => {

  test('forces sellers to review expired & inactive products before opening booth', async ({ page }) => {
    await page.goto('/my-booth');
    
    // Attempt to open the booth
    const openToggle = page.locator('label:has-text("Booth is currently")'); // Adjust locator based on actual toggle text
    
    // We assume the seller has at least 1 expired or inactive product seeded in the test DB
    // Or we will just check if the modal organically appears
    
    // Wait for network idle to ensure products load
    await page.waitForLoadState('networkidle');

    // Click the toggle
    await openToggle.click();

    // Verify the Pre-Flight review modal appears
    const modalHeading = page.locator('text=Pre-Flight Shelf Review');
    await expect(modalHeading).toBeVisible();

    // Verify it contains instruction text
    await expect(page.locator('text=preventing your storefront from opening')).toBeVisible();

    // If an item is non-perishable, it should have a 'Refresh' button
    // If it is perishable, it should have a 'Remove' button
    // We check that at least one of these restorative buttons rendered successfully
    const refreshBtn = page.locator('button:has-text("🔄 Refresh")').first();
    const removeBtn = page.locator('button:has-text("🗑️ Remove")').first();

    // The test environment might have either, so we just check if one is attached to the DOM
    const hasRefresh = await refreshBtn.isVisible();
    const hasRemove = await removeBtn.isVisible();
    expect(hasRefresh || hasRemove).toBeTruthy();
    
    // Verify soft-delete action works
    if (hasRemove) {
      await removeBtn.click();
      // The item should disappear from the list immediately
      await expect(removeBtn).toBeHidden();
    }
  });
});
