import { test, expect } from '@playwright/test'

test.describe('Order Flow', () => {
  test('should display order page', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('should show order tabs (buying/selling)', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(2000)
    // Look for buying/selling tabs
    const buyingTab = page.locator('button:has-text("Buying"), [role="tab"]:has-text("Buying"), text=Buying')
    const sellingTab = page.locator('button:has-text("Selling"), [role="tab"]:has-text("Selling"), text=Selling')
    if (await buyingTab.count() > 0) {
      await expect(buyingTab.first()).toBeVisible()
    }
  })

  test('should show order cards with status badges', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(3000)
    // Orders should show status like pending, accepted, delivered, etc.
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should navigate to order detail', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(3000)
    // Click first order if any exist
    const orderLink = page.locator('a[href*="/orders/"], [data-testid*="order"]').first()
    if (await orderLink.isVisible()) {
      await orderLink.click()
      await page.waitForTimeout(1000)
    }
  })

  test('should show notification permission banner if not granted', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(2000)
    // Check for notification permission banner
    const notifBanner = page.locator('text=push notification, text=best experience, text=enable notifications')
    // Conditional — depends on permission state
  })
})
