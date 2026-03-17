import { test, expect } from '@playwright/test'

test.describe('Market Operations Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/market-operations')
    await page.waitForLoadState('networkidle')
  })

  test('should load market settings and schedule', async ({ page }) => {
    // Wait for Tamagui to render — check for Save Settings button
    await expect(page.getByRole('button', { name: /Save Settings/i })).toBeVisible({ timeout: 15000 })
    // Verify schedule day shows up
    await expect(page.getByText('Saturday')).toBeVisible()
  })

  test('should show info box', async ({ page }) => {
    await expect(page.getByText('How Market Hours Work')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Receipt Footers Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/receipt-footers')
    await page.waitForLoadState('networkidle')
  })

  test('should load receipt footers page with Add button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add Footer/i })).toBeVisible({ timeout: 15000 })
  })

  test('should open and close create form', async ({ page }) => {
    await page.getByRole('button', { name: /Add Footer/i }).click({ timeout: 15000 })
    await expect(page.getByText('Add Receipt Footer')).toBeVisible()
    await page.getByRole('button', { name: /Cancel/i }).click()
    await expect(page.getByText('Add Receipt Footer')).not.toBeVisible()
  })

  test('should show info box', async ({ page }) => {
    await expect(page.getByText('How Receipt Footers Work')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Tax Reporting Thresholds Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tax-reporting')
    await page.waitForLoadState('networkidle')
  })

  test('should load tax reporting page with New Threshold button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /New Threshold/i })).toBeVisible({ timeout: 15000 })
  })

  test('should open and close create form', async ({ page }) => {
    await page.getByRole('button', { name: /New Threshold/i }).click({ timeout: 15000 })
    // The form renders with heading "Create Threshold" — use exact match
    await expect(page.getByText('Create Threshold', { exact: true }).first()).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Cancel/i }).click()
  })

  test('should show info box', async ({ page }) => {
    await expect(page.getByText('How 1099-K Thresholds Work')).toBeVisible({ timeout: 15000 })
  })

  test('should display threshold data', async ({ page }) => {
    // Use exact match for "FEDERAL" badge text
    const federalBadge = page.getByText('FEDERAL', { exact: true })
    const emptyState = page.getByText(/No thresholds configured/)
    // Check that at least one of these is visible
    const isFederal = await federalBadge.isVisible().catch(() => false)
    const isEmpty = await emptyState.isVisible().catch(() => false)
    expect(isFederal || isEmpty).toBe(true)
  })
})

test.describe('Sidebar Navigation', () => {
  test('should navigate to Market Operations from sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The sidebar has menu items — use .first() since mobile/desktop render duplicates
    await page.getByRole('button', { name: /Market Settings & Hours/i }).first().click()
    await page.waitForURL('/market-operations')
    await expect(page.getByRole('button', { name: /Save Settings/i })).toBeVisible({ timeout: 15000 })
  })

  test('should navigate to Receipt Footers from sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /Receipt Footers/i }).first().click()
    await page.waitForURL('/receipt-footers')
    await expect(page.getByRole('button', { name: /Add Footer/i })).toBeVisible({ timeout: 15000 })
  })

  test('should navigate to 1099 Thresholds from sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /1099 Thresholds/i }).first().click()
    await page.waitForURL('/tax-reporting')
    await expect(page.getByRole('button', { name: /New Threshold/i })).toBeVisible({ timeout: 15000 })
  })
})
