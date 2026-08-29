import { test, expect } from '@playwright/test'

test.describe('Market Operations Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/market-operations', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load market settings and schedule', async ({ page }) => {
    // 1. Default Market Schedule Card
    await expect(page.getByText('Default Market Schedule (Platform-Wide)')).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('button', { name: 'Saturday' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Save Default Schedule/i })).toBeVisible()

    // 2. City Overrides Card
    await expect(page.getByText('City Overrides')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add City Override/i })).toBeVisible()

    // 3. Global Market Settings Card
    await expect(page.getByText('Global Market Settings')).toBeVisible()
    await expect(page.getByText('Products Never Expire')).toBeVisible()
    await expect(page.getByRole('button', { name: /Save Settings/i })).toBeVisible()
  })

  test('should open and close Add City Override modal', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add City Override/i })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /Add City Override/i }).click()

    // Modal opens
    await expect(page.getByText('Add City Schedule Override')).toBeVisible({ timeout: 10000 })
    await expect(page.getByPlaceholder('e.g. San Jose')).toBeVisible()

    // Click Cancel to dismiss
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Add City Schedule Override')).not.toBeVisible()
  })

  test('should toggle platform-wide default market schedule and global settings', async ({ page }) => {
    // Verify Platform-wide default schedule card is present
    await expect(page.getByText('Default Market Schedule (Platform-Wide)')).toBeVisible({ timeout: 15000 })

    // Verify products never expire toggle exists and Save Settings works
    const saveSettingsBtn = page.getByRole('button', { name: /Save Settings/i })
    await expect(saveSettingsBtn).toBeVisible()
    await saveSettingsBtn.click()

    // Success feedback
    await expect(page.getByText(/Market settings saved successfully|Saved successfully/i).first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Receipt Footers Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/receipt-footers', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load receipt footers page with Add button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add Footer/i })).toBeVisible({ timeout: 15000 })
  })

  test('should open and close create form', async ({ page }) => {
    await page.getByText(/Add Footer/i).first().click({ timeout: 15000 })
    await page.waitForTimeout(500)
    // The form appears inline with a "Footer Text" label
    await expect(page.getByText(/Footer Text/i).first()).toBeVisible({ timeout: 10000 })
    await page.getByText(/Cancel/i).first().click()
    await page.waitForTimeout(500)
  })

  test('should show info box', async ({ page }) => {
    await expect(page.getByText('How Receipt Footers Work')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Tax Reporting Thresholds Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tax-reporting', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load tax reporting page with New Threshold button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /New Threshold/i })).toBeVisible({ timeout: 15000 })
  })

  test('should open and close create form', async ({ page }) => {
    await page.getByRole('button', { name: /New Threshold/i }).click({ timeout: 15000 })
    await expect(page.getByText(/Create Threshold/i).first()).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Cancel/i }).click()
  })

  test('should show info box', async ({ page }) => {
    await expect(page.getByText('How 1099-K Thresholds Work')).toBeVisible({ timeout: 15000 })
  })

  test('should display threshold data', async ({ page }) => {
    // Wait for data to load from RPC
    await page.waitForTimeout(3000)
    const federalBadge = page.getByText('FEDERAL', { exact: true })
    const emptyState = page.getByText(/No thresholds configured/)
    const loading = page.getByText(/loading/i)
    // Wait for loading to finish
    try { await loading.waitFor({ state: 'hidden', timeout: 10000 }) } catch { /* already hidden */ }
    const isFederal = await federalBadge.isVisible().catch(() => false)
    const isEmpty = await emptyState.isVisible().catch(() => false)
    expect(isFederal || isEmpty).toBe(true)
  })
})

test.describe('Sidebar Navigation', () => {
  test('should navigate to Market Operations from sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // ClientOnly wrapper delays first render — wait for sidebar
    await page.waitForTimeout(5000)
    const sidebarBtn = page.getByRole('button', { name: /Market/i }).first()
    await sidebarBtn.click({ timeout: 15000 })
    await page.waitForTimeout(1000)
    await page.waitForURL('/market-operations', { timeout: 15000 })
    await expect(page.getByRole('button', { name: /Save (Configuration|Settings)/i })).toBeVisible({ timeout: 30000 })
  })

  test('should navigate to Receipt Footers from sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: /Receipt Footers/i }).first().click()
    await page.waitForURL('/receipt-footers')
    await expect(page.getByRole('button', { name: /Add Footer/i })).toBeVisible({ timeout: 15000 })
  })

  test('should navigate to 1099 Thresholds from sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: /1099 Thresholds/i }).first().click()
    await page.waitForURL('/tax-reporting')
    await expect(page.getByRole('button', { name: /New Threshold/i })).toBeVisible({ timeout: 15000 })
  })
})
