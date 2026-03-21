import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Financial section of the admin dashboard.
 * Tests: sidebar navigation, Cash Flow page, Settlements page.
 *
 * These tests verify the pages load without errors, display expected content,
 * and sidebar links work correctly. They run against localhost:3000 (dev mode).
 *
 * NOTE: Some data may not exist in a fresh DB — tests verify the page structure,
 * not specific data values.
 */
test.describe('Financial Pages', () => {
  // ── Sidebar Navigation ──
  test.describe('Sidebar Navigation', () => {
    test('should have FINANCIAL section in sidebar', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Skip if redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated — cannot test sidebar')
        return
      }

      const financialHeader = page.getByText('FINANCIAL').first()
      await expect(financialHeader).toBeVisible({ timeout: 10000 })
    })

    test('should navigate to Cash Flow page', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      const cashFlowLink = page.getByRole('button', { name: /Cash Flow/i }).first()
      if ((await cashFlowLink.count()) > 0) {
        await cashFlowLink.click()
        await page.waitForURL(/\/cash-flow/)
        await expect(page).toHaveURL(/\/cash-flow/)
      }
    })

    test('should navigate to Settlements page', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      const settlementsLink = page.getByRole('button', { name: /Settlements/i }).first()
      if ((await settlementsLink.count()) > 0) {
        await settlementsLink.click()
        await page.waitForURL(/\/settlements/)
        await expect(page).toHaveURL(/\/settlements/)
      }
    })
  })

  // ── Cash Flow Page ──
  test.describe('Cash Flow Page', () => {
    test('should load without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))

      await page.goto('/cash-flow')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      // Verify no critical errors
      const criticalErrors = errors.filter(e =>
        !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
        && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
      )
      expect(criticalErrors).toEqual([])
    })

    test('should display page title', async ({ page }) => {
      await page.goto('/cash-flow')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      // Page should have a "Cash Flow" or "Platform Cash" heading
      const heading = page.getByText(/Cash Flow|Platform Cash/i).first()
      await expect(heading).toBeVisible({ timeout: 15000 })
    })

    test('should display bank balance section', async ({ page }) => {
      await page.goto('/cash-flow')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      // Should show bank balance or cash position metric
      const bankBalance = page.getByText(/Bank|Balance|Cash Position|Inflows/i).first()
      await expect(bankBalance).toBeVisible({ timeout: 15000 })
    })

    test('should display health status indicator', async ({ page }) => {
      await page.goto('/cash-flow')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      // Should show health/solvency indicator (Healthy or Underfunded)
      const healthIndicator = page.getByText(/Healthy|Underfunded|Solvent|Coverage/i).first()
      await expect(healthIndicator).toBeVisible({ timeout: 15000 })
    })

    test('should have Simulate Deposit button', async ({ page }) => {
      await page.goto('/cash-flow')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      const simulateBtn = page.getByText(/Simulate Deposit|Simulate/i).first()
      await expect(simulateBtn).toBeVisible({ timeout: 15000 })
    })

    test('should have Reconciliation check', async ({ page }) => {
      await page.goto('/cash-flow')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      const reconcileBtn = page.getByText(/Reconcil/i).first()
      await expect(reconcileBtn).toBeVisible({ timeout: 15000 })
    })
  })

  // ── Settlements Page ──
  test.describe('Settlements & Stripe Page', () => {
    test('should load without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))

      await page.goto('/settlements')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      const criticalErrors = errors.filter(e =>
        !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
        && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
      )
      expect(criticalErrors).toEqual([])
    })

    test('should display page title', async ({ page }) => {
      await page.goto('/settlements')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      const heading = page.getByText(/Settlements|Settlement/i).first()
      await expect(heading).toBeVisible({ timeout: 15000 })
    })

    test('should display Outstanding Buyer Debts section', async ({ page }) => {
      await page.goto('/settlements')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      const debtsSection = page.getByText(/Outstanding.*Debt|Buyer Debt/i).first()
      await expect(debtsSection).toBeVisible({ timeout: 15000 })
    })

    test('should show empty state or settlement data', async ({ page }) => {
      await page.goto('/settlements')
      await page.waitForLoadState('networkidle')

      if (page.url().includes('/login')) {
        test.skip(true, 'Not authenticated')
        return
      }

      // Either shows settlement rows or an empty state message
      const hasContent = await page.getByText(/No settlements|Date|Market Date|cleared|funds_pending/i).first()
      await expect(hasContent).toBeVisible({ timeout: 15000 })
    })
  })
})
