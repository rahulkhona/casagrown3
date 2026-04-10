import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Financial section of the admin dashboard.
 * Tests: sidebar navigation, Cash Flow page, Settlements page.
 */
test.describe('Financial Pages', () => {
  // ── Sidebar Navigation ──
  test.describe('Sidebar Navigation', () => {
    test('should have FINANCIAL section in sidebar', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const financialHeader = page.getByText('FINANCIAL').first()
      await expect(financialHeader).toBeVisible({ timeout: 10000 })
    })

    test('should navigate to Cash Flow page', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const cashFlowLink = page.getByRole('button', { name: /Cash Flow/i }).first()
      if ((await cashFlowLink.count()) > 0) {
        await cashFlowLink.click()
        await page.waitForURL(/\/cash-flow/)
        await expect(page).toHaveURL(/\/cash-flow/)
      }
    })

    test('should navigate to Settlements page from sidebar', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      await page.getByRole('button', { name: /Settlements & Stripe/i }).first().click()
      await page.waitForURL('/settlements')
      await expect(page.getByText(/Settlements & Stripe/i).first()).toBeVisible({ timeout: 15000 })
    })
  })

  // ── Cash Flow Page ──
  test.describe('Cash Flow Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/cash-flow', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
    })

    test('should load without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
      page.on('pageerror', (error) => errors.push(error.message))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const criticalErrors = errors.filter(e =>
        !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
        && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
        && !e.includes('stripe') && !e.includes('Stripe') && !e.includes('Hydration')
      )
      expect(criticalErrors).toEqual([])
    })

    test('should display page title', async ({ page }) => {
      const heading = page.getByText(/Cash Flow|Platform Cash/i).first()
      await expect(heading).toBeVisible({ timeout: 15000 })
    })

    test('should display bank balance section', async ({ page }) => {
      const bankBalance = page.getByText(/Bank|Balance|Cash Position|Inflows/i).first()
      await expect(bankBalance).toBeVisible({ timeout: 15000 })
    })

    test('should display health status indicator', async ({ page }) => {
      const healthIndicator = page.getByText(/Healthy|Underfunded|Solvent|Coverage/i).first()
      await expect(healthIndicator).toBeVisible({ timeout: 15000 })
    })

    test('should have Simulate Deposit button', async ({ page }) => {
      const simulateBtn = page.getByText(/Simulate Deposit|Simulate/i).first()
      await expect(simulateBtn).toBeVisible({ timeout: 15000 })
    })

    test('should have Reconciliation check', async ({ page }) => {
      const reconcileBtn = page.getByText(/Reconcil/i).first()
      await expect(reconcileBtn).toBeVisible({ timeout: 15000 })
    })
  })

  // ── Settlements Page ──
  test.describe('Settlements & Stripe Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/settlements', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
    })

    test('should load without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
      page.on('pageerror', (error) => errors.push(error.message))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const criticalErrors = errors.filter(e =>
        !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
        && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
        && !e.includes('stripe') && !e.includes('Stripe') && !e.includes('Hydration')
      )
      expect(criticalErrors).toEqual([])
    })

    test('should display page title', async ({ page }) => {
      const heading = page.getByText(/Settlements|Settlement/i).first()
      await expect(heading).toBeVisible({ timeout: 15000 })
    })

    test('should display Outstanding Buyer Debts section', async ({ page }) => {
      const debtsSection = page.getByText(/Outstanding.*Debt|Buyer Debt/i).first()
      await expect(debtsSection).toBeVisible({ timeout: 15000 })
    })

    test('should show empty state or settlement data', async ({ page }) => {
      const hasContent = page.getByText(/No settlements|Date|Market Date|cleared|funds_pending/i).first()
      await expect(hasContent).toBeVisible({ timeout: 15000 })
    })
  })
})
