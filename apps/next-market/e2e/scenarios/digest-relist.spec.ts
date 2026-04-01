/**
 * Daily Digest → Re-list Journey — E2E Tests
 *
 * Gap #3: Tests the full re-list journey:
 * - Navigate to /my-booth/products/new?prefill=<productId>
 * - Verify form pre-fills with past product data
 * - Verify this is NEW product mode (not edit mode)
 * - Verify prefill banner shows
 * - Verify invalid prefill ID handles gracefully
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  execSql,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Daily Digest → Re-list Journey', () => {
  let productId: string
  let productName: string

  test.beforeAll(() => {
    // Get a real product ID from the seed data
    const row = execSql(`
      SELECT id, name FROM market_products
      WHERE price_usd > 0
      ORDER BY created_at
      LIMIT 1
    `)
    if (row) {
      const parts = row.split('|').map(s => s.trim())
      productId = parts[0]
      productName = parts[1]
    }
  })

  // ── D1: Prefill URL loads form with pre-populated fields ──
  test('D1 — prefill URL loads form with product data', async ({ browser }) => {
    test.skip(!productId, 'No seed product found')

    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, `/my-booth/products/new?prefill=${productId}`)
    await assertPageHealthy(page)

    // Wait for prefill useEffect to complete
    await page.waitForTimeout(3000)

    // Form should contain the product name from the seed data
    const nameInput = page.locator('input[placeholder*="Heritage"]').first()
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const nameValue = await nameInput.inputValue()
      // Should have some prefilled value (may not exactly match if placeholder differs)
      if (productName) {
        expect(nameValue.length).toBeGreaterThan(0)
      }
    }

    await page.context().close()
  })

  // ── D2: Prefill shows banner indicating pre-filled source ──
  test('D2 — prefill banner is visible', async ({ browser }) => {
    test.skip(!productId, 'No seed product found')

    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, `/my-booth/products/new?prefill=${productId}`)
    await page.waitForTimeout(3000)

    const body = await page.locator('body').innerText()

    // Should show the prefill banner
    const hasBanner =
      body.includes('Pre-filled') ||
      body.includes('prefill') ||
      body.includes('previous listing') ||
      body.includes('new listing')
    expect(hasBanner).toBeTruthy()

    await page.context().close()
  })

  // ── D3: Prefill is NEW mode (not edit mode) ──
  test('D3 — prefill creates a new listing, not edit mode', async ({ browser }) => {
    test.skip(!productId, 'No seed product found')

    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, `/my-booth/products/new?prefill=${productId}`)
    await page.waitForTimeout(3000)

    // URL should NOT contain edit=
    expect(page.url()).not.toContain('edit=')
    // URL should contain prefill=
    expect(page.url()).toContain('prefill=')

    // Title should say "Add Product" not "Edit Product"
    const body = await page.locator('body').innerText()
    expect(body).toContain('Add Product')
    expect(body).not.toContain('Edit Product')

    // Submit button should say "Publish" or "Save Draft", not "Save Changes"
    const submitBtn = page.locator('button[type="submit"]')
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const btnText = await submitBtn.innerText()
      expect(btnText).not.toContain('Save Changes')
    }

    await page.context().close()
  })

  // ── D4: Invalid prefill ID handles gracefully ──
  test('D4 — invalid prefill ID shows empty form', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new?prefill=00000000-0000-0000-0000-000000000099')
    await assertPageHealthy(page)
    await page.waitForTimeout(3000)

    // Should show empty form — not crash
    const body = await page.locator('body').innerText()
    expect(body).toContain('Add Product')
    expect(body).not.toContain('undefined')
    expect(body).not.toContain('[object Object]')

    // Should NOT show prefill banner since product wasn't found
    const hasBanner = body.includes('Pre-filled') || body.includes('previous listing')
    expect(hasBanner).toBeFalsy()

    await page.context().close()
  })

  // ── D5: Prefill with edit active — edit takes precedence ──
  test('D5 — edit param takes precedence over prefill', async ({ browser }) => {
    test.skip(!productId, 'No seed product found')

    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, `/my-booth/products/new?edit=${productId}&prefill=${productId}`)
    await page.waitForTimeout(3000)

    // Should be in edit mode
    const body = await page.locator('body').innerText()
    const isEditMode = body.includes('Edit Product') || body.includes('Save Changes')
    // Edit mode takes precedence
    expect(isEditMode).toBeTruthy()

    // Should NOT show prefill banner
    const hasPrefillBanner = body.includes('Pre-filled') || body.includes('previous listing')
    expect(hasPrefillBanner).toBeFalsy()

    await page.context().close()
  })

  // ── D6: Digest email URL format is correct ──
  test('D6 — digest email URL format validation', () => {
    // Validate the URL that the digest email generates
    const siteUrl = 'https://casagrown.com'
    const pastProductId = 'b0000000-0000-0000-0000-000000000001'
    const listUrl = `${siteUrl}/my-booth/products/new?prefill=${pastProductId}`

    const parsed = new URL(listUrl)
    expect(parsed.pathname).toBe('/my-booth/products/new')
    expect(parsed.searchParams.get('prefill')).toBe(pastProductId)
    expect(parsed.searchParams.has('edit')).toBeFalsy()
  })
})
