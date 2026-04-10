import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Manual Payout Queue page in admin dashboard.
 *
 * Auth: Handled by setup project storageState (OTP via Mailpit).
 *
 * Run: cd apps/next-admin && npx playwright test e2e/payout-queue.spec.ts
 */

test.describe('Manual Payout Queue Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/payouts', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load payout queue page without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  test('should display Payout Queue heading and help text', async ({ page }) => {
    const heading = page.getByText('Payout Queue').first()
    const subtitle = page.getByText(/Manual human-review for corporate cashouts/i).first()
    await expect(heading).toBeVisible({ timeout: 15000 })
    await expect(subtitle).toBeVisible({ timeout: 15000 })
  })

  test('should display total pending limit and selection metrics', async ({ page }) => {
    const totalPending = page.getByText(/Total Pending Limit/i).first()
    const selectedExecution = page.getByText(/Selected for Execution/i).first()
    await expect(totalPending).toBeVisible({ timeout: 15000 })
    await expect(selectedExecution).toBeVisible({ timeout: 15000 })
  })

  test('should display execution controls including fast selection', async ({ page }) => {
    const fastSelectionHeading = page.getByText(/Fast Selection \(Strict FIFO\)/i).first()
    const selectOldestText = page.getByText(/Select Oldest up to:/i).first()
    const autoSelectBtn = page.getByRole('button', { name: /Auto-Select/i }).first()
    
    await expect(fastSelectionHeading).toBeVisible({ timeout: 15000 })
    await expect(selectOldestText).toBeVisible({ timeout: 15000 })
    await expect(autoSelectBtn).toBeVisible({ timeout: 15000 })
  })

  test('should have an Execute Selected button', async ({ page }) => {
    const executeBtn = page.getByRole('button', { name: /Execute Selected/i }).first()
    await expect(executeBtn).toBeVisible({ timeout: 15000 })
    // It should be disabled by default since 0 items are selected
    await expect(executeBtn).toBeDisabled()
  })

  test('should display the queue table with expected columns', async ({ page }) => {
    const dateHeader = page.getByText('DATE').first()
    const userHeader = page.getByText('USER').first()
    const providerHeader = page.getByText('PROVIDER').first()
    const amountHeader = page.getByText('AMOUNT').first()
    const statusHeader = page.getByText('STATUS').first()

    await expect(dateHeader).toBeVisible({ timeout: 15000 })
    await expect(userHeader).toBeVisible({ timeout: 15000 })
    await expect(providerHeader).toBeVisible({ timeout: 15000 })
    await expect(amountHeader).toBeVisible({ timeout: 15000 })
    await expect(statusHeader).toBeVisible({ timeout: 15000 })
  })
})
