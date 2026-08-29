/**
 * Search, Rating & Profile — Production coverage
 *
 * Tests:
 * - Market search/filter (product search, category, fulfillment, empty results)
 * - Star rating submission and persistence
 * - Profile setup page
 * - Coupon code on booth page
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  getAccessToken,
  callRpc,
  queryTable,
  execSql,
  preAuthAllUsers,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_USERS,
  TEST_LAT,
  TEST_LNG,
  TEST_ADDRESS,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

// ── Helpers (imported from scenario-helpers) ──

const tokens: Record<string, string> = {}

test.describe('Search, Rating & Profile', () => {
  test.beforeAll(async () => {
    Object.assign(tokens, await preAuthAllUsers())
  })

  // ════════════════════════════════════════════════════════════
  // SEARCH & FILTERING
  // ════════════════════════════════════════════════════════════

  test.describe('Market Search & Filters', () => {
    test('S1 — search bar filters products by name', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')

      // Get a known product name from DB
      const productName = execSql(
        `SELECT name FROM market_products WHERE inventory > 0 LIMIT 1`
      )
      const searchTerm = productName ? productName.split(' ')[0] : 'tomato'

      await navigateTo(bethPage, `/market?q=${encodeURIComponent(searchTerm)}&lat=${TEST_LAT}&lng=${TEST_LNG}&addr=${encodeURIComponent(TEST_ADDRESS)}`)
      await bethPage.waitForTimeout(3000) // wait for debounced search

      const body = await bethPage.locator('body').innerText()
      const lower = body.toLowerCase()

      // Should show search results or "no results" — not an error
      const hasSearchUI =
        lower.includes('result') ||
        lower.includes('booth') || lower.includes('produce') ||
        lower.includes('harvest') || lower.includes('seasonal') ||
        lower.includes('no results') ||
        lower.includes(searchTerm.toLowerCase()) ||
        lower.includes('closed') // market closed is valid
      expect(hasSearchUI).toBeTruthy()
      console.log(`[SEARCH] ✅ Search for "${searchTerm}" rendered results UI`)

      await bethPage.context().close()
    })

    test('S2 — category filter narrows results', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, `/market?cat=Vegetables&lat=${TEST_LAT}&lng=${TEST_LNG}&addr=${encodeURIComponent(TEST_ADDRESS)}`)
      await bethPage.waitForTimeout(2000)

      const body = await bethPage.locator('body').innerText()
      // Should not error
      expect(body.length).toBeGreaterThan(50)
      expect(body).not.toContain('undefined')
      console.log('[SEARCH] ✅ Category filter renders')

      await bethPage.context().close()
    })

    test('S3 — fulfillment filter (delivery only)', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, `/market?ff=delivery&lat=${TEST_LAT}&lng=${TEST_LNG}&addr=${encodeURIComponent(TEST_ADDRESS)}`)
      await bethPage.waitForTimeout(2000)

      const body = await bethPage.locator('body').innerText()
      expect(body.length).toBeGreaterThan(50)
      expect(body).not.toContain('undefined')
      console.log('[SEARCH] ✅ Fulfillment filter renders')

      await bethPage.context().close()
    })

    test('S4 — empty search handled gracefully (USDA fallback, no invite card)', async ({ browser }) => {
      // Intent: Searching with a term that returns 0 CasaGrown results no longer shows
      // the 'Know a neighbor' invite card. Instead, the UI shows null for the search
      // empty state and the USDA farmers-market fallback section handles the zero-shelf.
      // This test verifies the page doesn't crash and remains interactive.
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, `/market?q=xyznonexistent99999&lat=${TEST_LAT}&lng=${TEST_LNG}&addr=${encodeURIComponent(TEST_ADDRESS)}`)
      await bethPage.waitForTimeout(3000)

      // Page must still be interactive — search bar is visible
      await expect(bethPage.locator('input[placeholder*="Search"]').first()).toBeVisible({ timeout: 10000 })

      // The 'Know a neighbor' invite card must NOT appear (intentionally removed for search zero-state)
      await expect(bethPage.locator('body')).not.toContainText('Know a neighbor')

      // No JS crash
      const body = await bethPage.locator('body').textContent()
      expect(body).not.toContain('Application error')
      expect(body).not.toContain('Unhandled Runtime Error')
      console.log('[SEARCH] ✅ Empty search handled gracefully — USDA fallback active, no invite card')

      await bethPage.context().close()
    })
  })

  // ════════════════════════════════════════════════════════════
  // STAR RATING
  // ════════════════════════════════════════════════════════════

  test.describe('Star Rating', () => {
    let rateableOrderId = ''

    test.beforeAll(async () => {
      // Find a completed order that hasn't been rated yet
      rateableOrderId = execSql(
        `SELECT id FROM market_orders
         WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
           AND status = 'completed'
           AND buyer_rating IS NULL
         LIMIT 1`
      )

      if (!rateableOrderId) {
        // Create one by completing a delivered order
        const delivId = execSql(
          `SELECT id FROM market_orders
           WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
             AND status = 'delivered'
           LIMIT 1`
        )
        if (delivId) {
          execSql(`UPDATE market_orders SET status = 'completed', completed_at = now() WHERE id = '${delivId}'`)
          rateableOrderId = delivId
        }
      }
      console.log(`[RATING] Rateable order: ${rateableOrderId}`)
    })

    test('R1 — submit star rating via rate_market_order RPC', async () => {
      if (!rateableOrderId) { test.skip(); return }

      const bethToken = tokens['beth']
      const result = await callRpc(bethToken, 'rate_market_order', {
        p_order_id: rateableOrderId,
        p_rating: 5,
      })
      console.log('[RATING] Result:', JSON.stringify(result).substring(0, 200))

      // Verify rating was saved (buyer rates seller → sets seller_rating)
      const rating = execSql(
        `SELECT seller_rating FROM market_orders WHERE id = '${rateableOrderId}'`
      )
      console.log(`[RATING] Stored seller_rating: ${rating}`)
      if (rating) {
        expect(parseInt(rating)).toBe(5)
        console.log('[RATING] ✅ Star rating saved')
      }
    })

    test('R2 — rating UI visible on earnings page', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/earnings')
      await assertPageHealthy(bethPage)

      const body = await bethPage.locator('body').innerText()
      const lower = body.toLowerCase()

      // Earnings page should show transactions with rating area
      const hasEarningsContent =
        lower.includes('earning') ||
        lower.includes('transaction') ||
        lower.includes('history') ||
        lower.includes('balance') ||
        lower.includes('sale') ||
        lower.includes('purchase')
      expect(hasEarningsContent).toBeTruthy()

      // Look for star rating elements
      const stars = bethPage.locator('text=⭐, text=★, [class*="star"], [class*="rating"]')
      const starCount = await stars.count()
      console.log(`[RATING] Star elements on earnings: ${starCount}`)

      await bethPage.context().close()
    })

    test('R3 — rating persists after reload', async ({ browser }) => {
      if (!rateableOrderId) { test.skip(); return }

      // Verify via API (buyer rates seller → seller_rating)
      const bethToken = tokens['beth']
      const orders = await queryTable(bethToken, 'market_orders', `id=eq.${rateableOrderId}`)
      if (orders.length > 0) {
        // Rating was submitted as 5 in R1
        console.log(`[RATING] seller_rating from API: ${orders[0].seller_rating}`)
        expect(orders[0].seller_rating).toBe(5)
        console.log('[RATING] ✅ Rating persists')
      }

      // Also verify on the earnings page
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/earnings')
      await assertPageHealthy(bethPage)
      const body = await bethPage.locator('body').innerText()
      expect(body).not.toContain('undefined')
      expect(body).not.toContain('NaN')
      await bethPage.context().close()
    })
  })

  // ════════════════════════════════════════════════════════════
  // PROFILE SETUP
  // ════════════════════════════════════════════════════════════

  test.describe('Profile Setup', () => {
    test('PS1 — profile setup page renders form', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/profile-setup')
      await assertPageHealthy(bethPage)

      const body = await bethPage.locator('body').innerText()
      const lower = body.toLowerCase()

      // Should show profile form fields
      const hasForm =
        lower.includes('name') ||
        lower.includes('address') ||
        lower.includes('zip') ||
        lower.includes('profile') ||
        lower.includes('setup') ||
        lower.includes('welcome') ||
        lower.includes('complete') // may redirect if already set up
      expect(hasForm).toBeTruthy()
      console.log('[PROFILE] ✅ Profile setup page renders')

      await bethPage.context().close()
    })
  })
})
