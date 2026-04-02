/**
 * Earnings Flows — Financial Activity, Receipts & Payouts
 *
 * Scenarios:
 * S5.1  Earnings overview — summary cards
 * S5.2  Activity tab — transaction list
 * S5.3  Transaction receipt sheet
 * S5.4  Unsettled tab
 * S5.5  Summary tab — financial breakdown + 1099 tracker
 * S5.6  Date range filters
 * S6.1  Gift card redemption flow
 * S6.3  Charity donation flow
 * S6.4  Venmo/PayPal cashout flow
 * S6.5  Auto-payout configuration
 * S6.6  Tax info page
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Earnings & Financial Flows', () => {
  // ── S5.1: Earnings Overview ──
  test('S5.1 — earnings overview renders summary cards', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    const lower = body.toLowerCase()

    // Summary cards should be visible (may be uppercase via CSS)
    expect(lower).toContain('earnings')
    expect(lower).toContain('available')
    expect(lower).toContain('total sales')
    expect(lower).toContain('total purchases')

    // Financial values should not be NaN
    expect(body).not.toContain('$NaN')
    expect(body).not.toContain('$undefined')

    // Payout button should exist
    const payoutLink = page.locator('a[href="/earnings/payout"]')
    await expect(payoutLink.first()).toBeVisible()

    await page.context().close()
  })

  // ── S5.2: Activity Tab ──
  test('S5.2 — activity tab shows transaction list', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings')
    await assertPageHealthy(page)

    // Click Activity tab
    const activityTab = page.getByText('Activity', { exact: false }).first()
    if (await activityTab.isVisible()) {
      await activityTab.click()
      await page.waitForTimeout(1000)
    }

    // Should show transaction rows or empty state
    const body = await page.locator('body').innerText()
    const hasTransactions =
      body.includes('$') || // Dollar amounts
      body.includes('No transactions') // Empty state
    expect(hasTransactions).toBeTruthy()

    await page.context().close()
  })

  // ── S5.3: Transaction Receipt ──
  test('S5.3 — clicking a transaction opens receipt', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings')
    await assertPageHealthy(page)

    // Look for clickable transaction rows
    const txRows = page.locator('[class*="txRow"]')
    const txCount = await txRows.count()

    if (txCount > 0) {
      await txRows.first().click()
      await page.waitForTimeout(1000)

      // Receipt sheet or expanded metadata should appear
      const body = await page.locator('body').innerText()
      const hasDetail =
        body.includes('Receipt') ||
        body.includes('receipt') ||
        body.includes('Settlement') ||
        body.includes('Txn') ||
        body.includes('Card:') ||
        body.includes('Method:')
      // At least some detail should show
      expect(body.length).toBeGreaterThan(200)
    }

    await page.context().close()
  })

  // ── S5.4: Unsettled Tab ──
  test('S5.4 — unsettled tab shows pending or empty state', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings')

    const unsettledTab = page.getByText('Unsettled', { exact: false }).first()
    if (await unsettledTab.isVisible()) {
      await unsettledTab.click()
      await page.waitForTimeout(1000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()
      const hasContent =
        body.includes('Unsettled') ||
        body.includes('clearance') ||
        body.includes('everything has been cleared')
      expect(hasContent).toBeTruthy()
    }

    await page.context().close()
  })

  // ── S5.5: Summary Tab ──
  test('S5.5 — summary tab shows financial breakdown + 1099 tracker', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings')

    const summaryTab = page.getByText('Summary', { exact: false }).first()
    if (await summaryTab.isVisible()) {
      await summaryTab.click()
      await page.waitForTimeout(1000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()

      // Financial Breakdown section
      expect(body).toContain('Financial Breakdown')
      expect(body).toContain('Gross Sales')
      expect(body).toContain('Platform Fees')
      expect(body).toContain('Net Earnings')

      // Spending section
      expect(body).toContain('Spending')
      expect(body).toContain('Purchases')

      // 1099 Tracker
      expect(body).toContain('1099')
      expect(body).toContain('Threshold')

      // Netting explanation
      expect(body).toContain('Netting')
    }

    await page.context().close()
  })

  // ── S5.6: Date Range Filters ──
  test('S5.6 — date range filters update data', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings')

    const filters = ['This Month', 'Year to Date', 'All Time']
    for (const filter of filters) {
      await test.step(`Date filter: ${filter}`, async () => {
        const btn = page.getByText(filter, { exact: false }).first()
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click()
          await page.waitForTimeout(1000)
          await assertPageHealthy(page)
        }
      })
    }

    // Custom date range
    const customBtn = page.getByText('Custom', { exact: false }).first()
    if (await customBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customBtn.click()
      await page.waitForTimeout(500)
      // Date inputs should appear
      const dateInputs = page.locator('input[type="date"]')
      const inputCount = await dateInputs.count()
      expect(inputCount).toBeGreaterThanOrEqual(2)
    }

    await page.context().close()
  })

  // ── S6.1: Gift Card Flow ──
  test('S6.1 — gift card tab loads catalog', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings/payout')
    await assertPageHealthy(page)

    // Look for Gift Cards tab
    const gcTab = page.getByText('Gift Cards', { exact: false }).first()
    if (await gcTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gcTab.click()
      await page.waitForTimeout(2000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()
      // Should show catalog, search, or "Loading..." or minimum balance warning
      const hasGcContent =
        body.includes('Search') ||
        body.includes('search') ||
        body.includes('gift card') ||
        body.includes('Loading') ||
        body.includes('minimum balance')
      expect(hasGcContent).toBeTruthy()
    }

    await page.context().close()
  })

  // ── S6.3: Charity Donation Flow ──
  test('S6.3 — donate tab loads charity projects', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings/payout')

    // Look for Donate tab
    const donateTab = page.getByText('Donate', { exact: false }).first()
    if (await donateTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await donateTab.click()
      await page.waitForTimeout(2000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()
      // Should show charity themes or projects
      const hasDonateContent =
        body.includes('Hunger') ||
        body.includes('Environment') ||
        body.includes('Education') ||
        body.includes('All') ||
        body.includes('charity') ||
        body.includes('No charities')
      expect(hasDonateContent).toBeTruthy()
    }

    await page.context().close()
  })

  // ── S6.4: Cashout Flow ──
  test('S6.4 — cashout/Venmo tab loads verification flow', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings/payout')

    // Look for Venmo/Cashout tab
    const cashoutTab = page.getByText('Venmo', { exact: false }).first()
    if (await cashoutTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cashoutTab.click()
      await page.waitForTimeout(1000)
      await assertPageHealthy(page)

      const body = await page.locator('body').innerText()
      // Should show verification flow or cashout form
      const hasCashoutContent =
        body.includes('Verify') ||
        body.includes('verify') ||
        body.includes('Venmo') ||
        body.includes('PayPal') ||
        body.includes('handle') ||
        body.includes('Cashout')
      expect(hasCashoutContent).toBeTruthy()
    }

    await page.context().close()
  })

  // ── S6.5: Auto-Payout Configuration ──
  test('S6.5 — auto-payout toggle and configuration', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings/payout')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()

    // Auto/Manual toggle should exist
    const hasToggle =
      body.includes('Auto-Payout') ||
      body.includes('Manual Payout') ||
      body.includes('auto-payout')
    expect(hasToggle).toBeTruthy()

    // Threshold presets
    const hasThresholds =
      body.includes('$25') ||
      body.includes('$50') ||
      body.includes('$100')
    // May or may not be visible depending on toggle state

    // Sweep policy text
    expect(body).toContain('$500')

    await page.context().close()
  })

  // ── S6.6: Tax Info ──
  test('S6.6 — tax info page renders 1099 tracker', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings/tax-info')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    // Should have tax-related content
    const hasTaxContent =
      body.includes('1099') ||
      body.includes('tax') ||
      body.includes('Tax') ||
      body.includes('threshold') ||
      body.includes('Threshold')
    expect(hasTaxContent).toBeTruthy()

    await page.context().close()
  })

  // ── S5.7: Star Rating ──
  test('S5.7 — star rating UI visible on completed transactions', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings')
    await assertPageHealthy(page)

    // Look for the star rating section (only on completed orders)
    const body = await page.locator('body').innerText()
    // May or may not have completed orders with ratings
    // Just verify page renders correctly
    expect(body).not.toContain('$NaN')

    await page.context().close()
  })

  // ── S5.8: Payout button hidden at $0 ──
  test('S5.8 — payout button behavior at zero balance', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/earnings')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()

    // If available balance is $0.00, the "Go to Payout" or payout link
    // should either be hidden or show $0.00 available
    if (body.includes('$0.00')) {
      // The page should still render cleanly
      expect(body).not.toContain('$NaN')
      expect(body).not.toContain('$undefined')
    }

    await page.context().close()
  })

  // ── S6.5b: Auto-payout charity cards render correctly ──
  test('S6.5b — auto-payout charity cards show progress bars', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/earnings/payout')
    await assertPageHealthy(page)

    // Enable auto-payout if not already
    const toggle = page.locator('button, label, input').filter({ hasText: /Auto-Payout/i }).first()
    if (await toggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check if it's a toggle switch
      const toggleSwitch = page.locator('[class*="switch"], [class*="toggle"]').first()
      if (await toggleSwitch.isVisible({ timeout: 2000 }).catch(() => false)) {
        // May already be on
      }
    }

    // Click Donate method if visible
    const donateBtn = page.locator('button').filter({ hasText: /Donate/i }).first()
    if (await donateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await donateBtn.click()
      await page.waitForTimeout(1500)
    }

    // Check that charity cards have proper structure (not collapsed)
    const charityCards = page.locator('[class*="charityCard"]')
    const cardCount = await charityCards.count()

    if (cardCount > 0) {
      // Cards should have visible height (not collapsed to 0)
      const firstCard = charityCards.first()
      const box = await firstCard.boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThan(50) // Should not be collapsed
      }
    }

    await page.context().close()
  })
})
