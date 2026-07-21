import { test, expect } from './fixtures'

test.describe('QR Helper Invite Flow', () => {
  test('should display helper invite section in design showcase', async ({ page }) => {
    await page.goto('/qr-design-preview.html')
    await expect(page.locator('text=Hiring Booth Helpers')).toBeVisible()
    await expect(page.locator('text=50% Revenue Split')).toBeVisible()
  })

  test('should load join booth route with code', async ({ page }) => {
    await page.goto('/join-booth/BOOTHS-7890')
    await page.waitForTimeout(2000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
