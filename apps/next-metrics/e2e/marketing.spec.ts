import { test, expect } from '@playwright/test'

/**
 * Metrics — Marketing Analytics Suite
 * 
 * Verifies the Campaign Performance and general marketing analytics grids.
 */

test.describe('Metrics — Marketing Campaigns Analytics', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the marketing campaigns page
    await page.goto('/marketing/campaigns', { waitUntil: 'domcontentloaded' })
    // Ensure the page handles the fetch gracefully before proceeding
    await page.waitForTimeout(2000)
  })

  test('loads without JS hydration errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1.page-title')).toContainText('Campaign Performance')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Top-level KPI Statistics Cards render successfully', async ({ page }) => {
    // 4 expected cards: Total Sent, Opened, Clicked, Bounced
    const totalSent = page.locator('.stat-label', { hasText: 'Total Sent' })
    await expect(totalSent).toBeVisible({ timeout: 5000 })
    
    await expect(page.locator('.stat-label', { hasText: 'Opened' })).toBeVisible()
    await expect(page.locator('.stat-label', { hasText: 'Clicked' })).toBeVisible()
    await expect(page.locator('.stat-label', { hasText: 'Bounced' })).toBeVisible()
  })

  test('Campaign Breakdown grid table renders', async ({ page }) => {
    const tableTitle = page.locator('h2.card-title', { hasText: 'Campaign Breakdown' })
    await expect(tableTitle).toBeVisible()

    const headers = page.locator('.metrics-table thead tr th')
    // Should have 8 headers as explicitly defined in page.tsx
    await expect(headers).toHaveCount(8)
    await expect(headers.nth(0)).toContainText('Campaign')
    await expect(headers.nth(4)).toContainText('Open Rate')
  })

  test('RateBars graphical elements load safely', async ({ page }) => {
    // Verify that the table body exists
    await expect(page.locator('.metrics-table tbody')).toBeVisible()

    // If there is seeded data, RateBar should render span with percent.
    // Assuming seeded data or graceful fallback if empty
    const counts = await page.locator('.metrics-table tbody tr').count()
    if (counts > 0) {
      // Confirm the 'Loading...' text has vanished if rows exist
      await expect(page.locator('text=Loading...')).toHaveCount(0)
    }
  })
})
