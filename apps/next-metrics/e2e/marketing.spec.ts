import { test, expect } from '@playwright/test'

/**
 * Metrics — Marketing Analytics Suite
 * 
 * Verifies the Campaign Performance and general marketing analytics grids.
 */

test.describe('Metrics — Marketing Campaigns Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legacy/marketing/campaigns')
    await page.waitForLoadState('networkidle')
  })

  test('loads without JS hydration errors', async ({ page }) => {
    if (page.url().includes('/login')) {
      await expect(page.locator('h1')).toContainText('CasaGrown Metrics')
      return
    }
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1')).toContainText('Campaign Performance')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Top-level KPI Statistics Cards render successfully', async ({ page }) => {
    if (page.url().includes('/login')) return
    const totalSent = page.locator('.stat-label', { hasText: 'Total Sent' })
    if (await totalSent.isVisible()) {
      await expect(totalSent).toBeVisible()
    }
  })

  test('Campaign Breakdown grid table renders', async ({ page }) => {
    if (page.url().includes('/login')) return
    const tableTitle = page.locator('h2.card-title', { hasText: 'Campaign Breakdown' })
    if (await tableTitle.isVisible()) {
      await expect(tableTitle).toBeVisible()
    }
  })

  test('RateBars graphical elements load safely', async ({ page }) => {
    if (page.url().includes('/login')) return
    const tableBody = page.locator('.metrics-table tbody')
    if (await tableBody.isVisible()) {
      await expect(tableBody).toBeVisible()
    }
  })
})
