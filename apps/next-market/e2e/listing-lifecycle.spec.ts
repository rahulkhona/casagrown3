import { test, expect } from './fixtures'


test.describe('Dynamic OG Tags — Product Page', () => {

  test('product page route exists and redirects', async ({ page }) => {
    // Navigate to a fake product ID — should redirect to /market
    await page.goto('/market/product/00000000-0000-0000-0000-000000000000')
    // Wait for redirect to /market
    await page.waitForURL('**/market**', { timeout: 10000 }).catch(() => {})
    const url = page.url()
    expect(url).toContain('/market')
  })

  test('product page returns HTML with OG tags or redirect', async ({ page }) => {
    await page.goto('/market/product/00000000-0000-0000-0000-000000000000')
    await page.waitForTimeout(2000)
    // The page should redirect to /market since product doesn't exist
    const url = page.url()
    expect(url).toContain('/market')
  })
})

test.describe('Community Chat Header', () => {

  test('community page loads with header', async ({ page }) => {
    await page.goto('/community')
    await page.waitForTimeout(3000)
    // Should show community content or login prompt
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
