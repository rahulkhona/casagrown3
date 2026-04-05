import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Settlements & Payout Events page in admin dashboard.
 *
 * Auth: Handled by setup project storageState (OTP via Mailpit).
 *
 * Run: cd apps/next-admin && npx playwright test e2e/settlements-payouts.spec.ts
 */

test.describe('Settlements & Payout Events Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settlements', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load settlements page without errors', async ({ page }) => {
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

  test('should display Settlements & Stripe heading', async ({ page }) => {
    const heading = page.getByText(/Settlements.*Stripe/i).first()
    await expect(heading).toBeVisible({ timeout: 15000 })
  })

  test('should display Settlements table headers', async ({ page }) => {
    const dateHeader = page.getByText('DATE').first()
    const statusHeader = page.getByText('STATUS').first()
    const ordersHeader = page.getByText('ORDERS').first()
    await expect(dateHeader).toBeVisible({ timeout: 15000 })
    await expect(statusHeader).toBeVisible({ timeout: 15000 })
    await expect(ordersHeader).toBeVisible({ timeout: 15000 })
  })

  test('should show empty state or settlement data', async ({ page }) => {
    const hasContent = page.getByText(/No settlements|Settlements|DATE|cleared|funds_pending/i).first()
    await expect(hasContent).toBeVisible({ timeout: 15000 })
  })

  test('should display Stripe Payout Events section', async ({ page }) => {
    const payoutSection = page.getByText('Stripe Payout Events').first()
    await expect(payoutSection).toBeVisible({ timeout: 15000 })
  })

  test('should show payout events table headers', async ({ page }) => {
    const payoutIdHeader = page.getByText('PAYOUT ID').first()
    const settlementsHeader = page.getByText('SETTLEMENTS').first()
    const usersHeader = page.getByText('USERS').first()
    await expect(payoutIdHeader).toBeVisible({ timeout: 15000 })
    await expect(settlementsHeader).toBeVisible({ timeout: 15000 })
    await expect(usersHeader).toBeVisible({ timeout: 15000 })
  })

  test('should show empty payout events state or event data', async ({ page }) => {
    const hasContent = page.getByText(/No payout events recorded|payout.paid|payout.failed|Paid|Failed|PAID/i).first()
    await expect(hasContent).toBeVisible({ timeout: 15000 })
  })

  test('should show Paid/Failed badge counts', async ({ page }) => {
    const paidBadge = page.getByText(/\d+ Paid/).first()
    const failedBadge = page.getByText(/\d+ Failed/).first()
    await expect(paidBadge).toBeVisible({ timeout: 15000 })
    await expect(failedBadge).toBeVisible({ timeout: 15000 })
  })

  test('should have a Refresh button', async ({ page }) => {
    const refreshBtn = page.getByText('Refresh').first()
    await expect(refreshBtn).toBeVisible({ timeout: 15000 })
  })
})
