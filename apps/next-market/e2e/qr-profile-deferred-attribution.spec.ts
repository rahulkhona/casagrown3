import { test, expect } from './fixtures'

test.describe('QR Profile & Deferred App Store Attribution Flow', () => {
  test('should display Profile QR Pass section in design showcase', async ({ page }) => {
    await page.goto('/qr-design-preview.html')
    await expect(page.locator('text=App Store Install & Seller Follow')).toBeVisible()
    await expect(page.locator('text=casagrown.com/u/sarah')).toBeVisible()
  })

  test('should handle referral redirect route /u/sarah_gardens', async ({ page }) => {
    await page.goto('/u/sarah_gardens?ref=usr_123&intent=follow')
    await page.waitForTimeout(2000)
    // Assert page loads correctly without crashing
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('should query attribution API endpoint', async ({ request }) => {
    const res = await request.get('/api/referrals/attribute?ref=usr_999&intent=follow')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.referrerId).toBe('usr_999')
  })
})
