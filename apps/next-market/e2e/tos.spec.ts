import { test, expect } from './fixtures'

test.describe('Terms of Service Page', () => {
  test('renders terms and privacy tabs', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForSelector('text=Legal Agreements', { timeout: 15000 })
    const body = await page.locator('body').textContent()
    expect(body).toContain('Legal Agreements')
    expect(body).toContain('Terms of Use')
    expect(body).toContain('Privacy Policy')
  })

  test('switching tabs shows different content', async ({ page }) => {
    await page.goto('/terms')
    // Wait for page content to fully hydrate before interacting
    await page.waitForSelector('text=Seller Representations', { timeout: 15000 })
    // Terms tab should show amendments or seller representations
    await expect(
      page.getByText('Seller Representations')
    ).toBeVisible()

    // Switch to privacy tab
    await page.click('text=Privacy Policy')
    await expect(
      page.getByText('Information Collection')
    ).toBeVisible({ timeout: 10000 })
  })

  test('terms page is viewable as read-only without login', async ({ page }) => {
    // Terms page should render content for anonymous visitors (crawlers, footer links)
    await page.goto('/terms')
    await page.waitForSelector('text=Legal Agreements', { timeout: 15000 })
    const body = await page.locator('body').textContent()
    expect(body).toContain('Legal Agreements')
    // No acceptance bar for anonymous visitors
    const acceptBtn = page.getByRole('button', { name: /accept.*continue/i })
    expect(await acceptBtn.count()).toBe(0)
  })
})
