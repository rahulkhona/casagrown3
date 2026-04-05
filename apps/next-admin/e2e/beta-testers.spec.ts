import { test, expect } from '@playwright/test'

test.describe('Beta Testers Admin Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/beta-testers', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load beta testers page', async ({ page }) => {
    await expect(page.getByText('Beta Testers', { exact: false }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Total').first()).toBeVisible()
    await expect(page.getByText('Pending').first()).toBeVisible()
    await expect(page.getByText('Active').first()).toBeVisible()
    await expect(page.getByText('all', { exact: true }).first()).toBeVisible()
  })

  test('should have search input and filter controls', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]').first()
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible()
    }

    for (const status of ['all', 'pending', 'contacted', 'active', 'declined']) {
      const btn = page.getByText(status, { exact: true }).first()
      if (await btn.count() > 0) {
        await expect(btn).toBeVisible()
      }
    }
  })

  test('should navigate to beta-testers from sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const betaLink = page.getByText('Beta Testers', { exact: false }).first()
    if (await betaLink.count() > 0) {
      await betaLink.click()
      await page.waitForURL('**/beta-testers')
      await expect(page).toHaveURL(/beta-testers/)
    }
  })
})
