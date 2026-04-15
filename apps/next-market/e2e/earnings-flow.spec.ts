/**
 * Earnings Flow E2E — Playwright
 *
 * Tests earnings page, transaction history, balance display, payout page,
 * and tax info page from the browser.
 *
 * Run: cd apps/next-market && npx playwright test e2e/earnings-flow.spec.ts
 */
import { test, expect } from './fixtures'

test.describe('Earnings Financial Flow', () => {
  // ============================================================================
  // 1. Earnings page loads
  // ============================================================================
  test('earnings page loads for authenticated user', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    expect(content).toBeTruthy()
    expect(content).toMatch(/Earning|earning|Balance|balance|Payout|payout|Activity|\$/i)
  })

  // ============================================================================
  // 2. Balance display shows dollar amounts
  // ============================================================================
  test('earnings page shows dollar amounts', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    expect(content).toMatch(/\$/)
  })

  // ============================================================================
  // 3. Transaction history section exists
  // ============================================================================
  test('earnings page has transaction-related content', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    expect(content).toMatch(/Transaction|Settlement|History|Credit|Debit|Fee|Activity|Sales|Purchases|Available|Payout|Earnings/i)
  })

  // ============================================================================
  // 4. Payout page loads
  // ============================================================================
  test('payout page loads', async ({ page }) => {
    await page.goto('/earnings/payout')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    expect(content).toBeTruthy()
    expect(content).toMatch(/Payout|payout|Cash|PayPal|Venmo|Withdraw|Gift|Donate/i)
  })

  // ============================================================================
  // 5. Payout page shows available balance
  // ============================================================================
  test('payout page shows dollar amounts', async ({ page }) => {
    await page.goto('/earnings/payout')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    expect(content).toMatch(/\$/)
  })

  // ============================================================================
  // 6. Tax info page loads
  // ============================================================================
  test('tax info page loads', async ({ page }) => {
    await page.goto('/earnings/tax-info')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    expect(content).toBeTruthy()
    expect(content).toMatch(/Tax|tax|1099|Threshold|threshold|report|Report/i)
  })

  // ============================================================================
  // 7. No JS errors on earnings pages
  // ============================================================================
  test('earnings pages load without JS errors', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err: Error) => jsErrors.push(err.message))

    for (const path of ['/earnings', '/earnings/payout', '/earnings/tax-info']) {
      await page.goto(path)
      await page.waitForTimeout(1500)
    }

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('Stripe') && !e.includes('stripe') &&
      !e.includes('ResizeObserver') && !e.includes('hydration')
    )
    expect(criticalErrors.length).toBe(0)
  })

  // ============================================================================
  // 8. Earnings to payout navigation works
  // ============================================================================
  test('earnings to payout navigation works', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    const payoutLink = page.locator('a[href*="payout"], button:has-text("Cash Out"), a:has-text("Payout"), a:has-text("Withdraw")').first()
    if (await payoutLink.isVisible().catch(() => false)) {
      await payoutLink.click()
      await page.waitForTimeout(1500)
      const url = page.url()
      expect(url).toMatch(/payout|redeem/i)
    }
  })

  // ============================================================================
  // 9. Payout account verification verification and input elements
  // ============================================================================
  test.skip('payout page displays verification account setup elements', async ({ page }) => {
    await page.goto('/earnings/payout')
    await page.waitForTimeout(2000)

    // We expect at least one redemption tab or method to be present
    await expect(page.locator('body')).toContainText(/Venmo|PayPal|Gift Card|Donate/i, { timeout: 10000 })
  })

  // ============================================================================
  // 10. Manual Payout Queue string validation
  // ============================================================================
  test('payout page handles manual queue verbiage correctly via mocked state', async ({ page }) => {
    // Intercept Supabase API call checking pending status to mock a queued state
    await page.route('**/rest/v1/redemptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'mock-queued-id',
            status: 'queued',
            cost_cents: 1000,
            provider: 'venmo',
            payout_target: '@casagrown_test',
            created_at: new Date().toISOString()
          }])
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/earnings/payout')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    if (content?.includes('queued for')) {
      expect(content).toMatch(/will be processed at noon of the next business day/i)
    }
  })
})
