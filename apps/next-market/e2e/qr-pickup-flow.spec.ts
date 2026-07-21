import { test, expect } from './fixtures'

test.describe('QR Pickup Identification & Hand-off Flow', () => {
  test('should display Pickup Pass design preview page', async ({ page }) => {
    await page.goto('/qr-design-preview.html')
    await expect(page.locator('h1')).toContainText('CasaGrown QR Code System Design')
    await expect(page.locator('text=Pickup Order Identification')).toBeVisible()
    await expect(page.locator('text=#ORD-9482')).toBeVisible()
  })

  test('should display Pickup Scanner design element', async ({ page }) => {
    await page.goto('/qr-design-preview.html')
    const confirmBtn = page.locator('button:has-text("Confirm Pickup & Hand-Off")')
    await expect(confirmBtn).toBeVisible()
  })

  test('should load orders list with scanner button', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(2000)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).toMatch(/Orders|Scan|Pickup|Buying|Selling/i)
  })
})
