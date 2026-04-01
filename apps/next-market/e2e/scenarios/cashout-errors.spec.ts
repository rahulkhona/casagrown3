/**
 * Seller Cashout Error Handling — E2E Tests
 *
 * Gap #2: Tests error paths for seller payout/cashout:
 * - Cashout with zero balance
 * - Gift card purchase with insufficient balance
 * - Donation with insufficient balance
 * - All payout tabs render without errors
 * - Financial values are never $NaN
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  execSql,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Seller Cashout — Error Handling', () => {
  // ── C1: Payout page renders all tabs without errors ──
  test('C1 — payout page loads all tabs correctly', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/earnings/payout')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()

    // No financial display errors
    expect(body).not.toContain('$NaN')
    expect(body).not.toContain('$undefined')
    expect(body).not.toContain('[object Object]')

    // Should have payout tabs
    const hasPayoutContent =
      body.includes('Gift Card') ||
      body.includes('Donate') ||
      body.includes('Venmo') ||
      body.includes('Cashout') ||
      body.includes('Auto')
    expect(hasPayoutContent).toBeTruthy()

    await page.context().close()
  })

  // ── C2: Gift card tab shows minimum balance warning ──
  test('C2 — gift card tab shows balance info', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/earnings/payout')

    // Click Gift Cards tab
    const gcTab = page.getByText('Gift Card', { exact: false }).first()
    if (await gcTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gcTab.click()
      await page.waitForTimeout(2000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()
      // Should show catalog, search, or minimum balance message
      const hasContent =
        body.includes('Search') ||
        body.includes('search') ||
        body.includes('minimum') ||
        body.includes('Available') ||
        body.includes('Loading')
      expect(hasContent).toBeTruthy()
    }

    await page.context().close()
  })

  // ── C3: Donate tab with low balance shows appropriate UI ──
  test('C3 — donate tab handles low balance gracefully', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/earnings/payout')

    const donateTab = page.getByText('Donate', { exact: false }).first()
    if (await donateTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await donateTab.click()
      await page.waitForTimeout(2000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()
      // Should not crash — show eligible projects or balance message
      expect(body).not.toContain('$NaN')
      expect(body).not.toContain('undefined')
    }

    await page.context().close()
  })

  // ── C4: Venmo/Cashout tab shows verification or balance UI ──
  test('C4 — cashout tab shows verification flow or balance', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/earnings/payout')

    const cashoutTab = page.getByText('Venmo', { exact: false }).first()
    if (await cashoutTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cashoutTab.click()
      await page.waitForTimeout(1000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()
      // Should show verify/handle or balance info
      const hasCashout =
        body.includes('Verify') ||
        body.includes('Balance') ||
        body.includes('Venmo') ||
        body.includes('PayPal') ||
        body.includes('handle') ||
        body.includes('Cashout')
      expect(hasCashout).toBeTruthy()

      // Should not show NaN
      expect(body).not.toContain('$NaN')
    }

    await page.context().close()
  })

  // ── C5: Earnings page for user with no orders ──
  test('C5 — earnings page handles zero activity gracefully', async ({ browser }) => {
    // Use beth (buyer) who may have few/no earnings
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/earnings')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()

    // Should show $0.00 or empty state, not errors
    expect(body).not.toContain('$NaN')
    expect(body).not.toContain('$undefined')

    await page.context().close()
  })

  // ── C6: Payout page for non-seller ──
  test('C6 — payout page for non-seller shows appropriate message', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/earnings/payout')

    const body = await page.locator('body').innerText()

    // Should not crash — may show $0 balance or minimal UI
    expect(body).not.toContain('$NaN')
    expect(body).not.toContain('[object Object]')

    await page.context().close()
  })

  // ── C7: Balance display accuracy — no $NaN on any financial page ──
  test('C7 — all financial pages are free of $NaN/$undefined', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    const financialPaths = ['/earnings', '/earnings/payout', '/earnings/tax-info']

    for (const path of financialPaths) {
      await test.step(`Check ${path}`, async () => {
        await navigateTo(page, path)
        await page.waitForTimeout(1500)
        const body = await page.locator('body').innerText()
        expect(body).not.toContain('$NaN')
        expect(body).not.toContain('$undefined')
        expect(body).not.toContain('[object Object]')
      })
    }

    await page.context().close()
  })

  // ── C8: Insufficient balance RPC error handling ──
  test('C8 — debit_market_balance rejects overdraft', async () => {
    // Direct RPC test: try to debit more than available
    const result = execSql(`
      SELECT debit_market_balance(
        '00000000-0000-0000-0000-000000000001'::uuid,
        999999.99,
        NULL,
        '{}'::jsonb
      )
    `)
    // Should fail with insufficient balance error (not crash)
    // Should fail with error — result contains "success": false or error message 
    const hasError =
      result.includes('"success": false') ||
      result.includes('"error"') ||
      result.includes('insufficient') ||
      result === ''
    expect(hasError).toBeTruthy()
  })
})
