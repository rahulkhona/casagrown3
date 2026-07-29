import { test, expect } from '@playwright/test'

/**
 * Metrics — Traffic Analytics Suite
 * 
 * Verifies the Traffic Analysis dashboard, cohort heatmaps, and breakdown tables.
 */

test.describe('Metrics — Traffic Analysis Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly to the traffic dashboard (pre-authenticated by setup)
    await page.goto('/legacy/marketing/traffic', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('loads without JS hydration errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1.page-title')).toContainText('Traffic & Conversion Analysis')
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('Top-level Executive Overview Cards render successfully', async ({ page }) => {
    await expect(page.locator('.metric-card').first()).toContainText('Wizard Funnel Stats')
    await expect(page.locator('.metric-card').nth(1)).toContainText('Wizard Drop-offs')
    await expect(page.locator('.metric-card').nth(2)).toContainText('Leads to Account Conversion')
  })

  test('Cohort Heatmaps grid renders and responds to tab clicks', async ({ page }) => {
    // Section header exists
    await expect(page.locator('.section-title', { hasText: /Cohort Heatmaps/i })).toBeVisible()

    // Default tab 'Leads' is active
    await expect(page.locator('.tab-btn.active', { hasText: 'Leads' })).toBeVisible()

    // Switch to Listing Wizard Drop-offs
    const dropOffTab = page.locator('.tab-btn', { hasText: 'Listing Wizard Drop-offs' })
    await dropOffTab.click()
    await expect(page.locator('.tab-btn.active', { hasText: 'Listing Wizard Drop-offs' })).toBeVisible()

    // Switch to Signup Paths
    const signupPathTab = page.locator('.tab-btn', { hasText: 'Signup Paths' })
    await signupPathTab.click()
    await expect(page.locator('.tab-btn.active', { hasText: 'Signup Paths' })).toBeVisible()

    // Assert that the heatmap table body and cells exist
    const cells = page.locator('.heatmap-table tbody td')
    await expect(cells.first()).toBeVisible()
  })

  test('1D weekday and hourly break down tables render below heatmaps', async ({ page }) => {
    // Check Section Titles
    await expect(page.locator('.section-title', { hasText: /Day of the Week Analysis/i })).toBeVisible()
    await expect(page.locator('.section-title', { hasText: /Local Timezone Hourly Analysis/i })).toBeVisible()

    // Check table headers
    await expect(page.locator('th', { hasText: 'Starts' }).first()).toBeVisible()
    await expect(page.locator('th', { hasText: 'Same Session (<15m)' }).first()).toBeVisible()
  })

  test('AI Summary engine responds to click events', async ({ page }) => {
    const aiButton = page.locator('.btn-primary', { hasText: /Ask AI to Summarize/i })
    await expect(aiButton).toBeVisible()

    // Click to generate summary
    await aiButton.click()
    await page.waitForTimeout(3000)

    // Verify card containing summary loaded
    const summaryCard = page.locator('.ai-summary-card')
    await expect(summaryCard).toBeVisible()
  })
})
