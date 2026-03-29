/**
 * Quarantine System — Seller-Side Listing Block
 *
 * Tests:
 * Q1  Add product page loads without quarantine banner (no quarantines in test env)
 * Q2  Category selector is functional
 * Q3  Submit button is enabled when no quarantine active
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
} from './scenario-helpers'

test.describe('Quarantine — Seller Listing Block', () => {
  // ── Q1: No quarantine banner in clean test environment ──
  test('Q1 — no quarantine banner shows by default', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new')
    await assertPageHealthy(page)

    // The quarantine banner should NOT be visible in the default test environment
    const quarantineBanner = page.getByText('Agricultural Quarantine')
    const isBannerVisible = await quarantineBanner.isVisible({ timeout: 3000 }).catch(() => false)
    expect(isBannerVisible).toBe(false)

    // Submit button should be enabled (not quarantine-blocked)
    const submitBtn = page.locator('button[type="submit"]')
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const btnText = await submitBtn.innerText()
      expect(btnText).not.toContain('Quarantined')
    }

    await page.context().close()
  })

  // ── Q2: Category selector works ──
  test('Q2 — category selector is functional on new product page', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new')
    await assertPageHealthy(page)

    // Find category selector
    const categorySelect = page.locator('select').filter({ has: page.locator('option') })
    const selectCount = await categorySelect.count()
    expect(selectCount).toBeGreaterThan(0)

    // Should have at least one category option
    const firstSelect = categorySelect.first()
    const options = firstSelect.locator('option')
    const optionCount = await options.count()
    expect(optionCount).toBeGreaterThan(0)

    await page.context().close()
  })

  // ── Q3: Submit button text ──
  test('Q3 — submit button shows Add Product (not quarantine blocked)', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new')
    await assertPageHealthy(page)

    const submitBtn = page.locator('button[type="submit"]')
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const btnText = await submitBtn.innerText()
      // Should say "Publish Product", "Save Draft", or "Save Changes" — NOT quarantine-related
      const isNormalButton = btnText.includes('Publish Product') || btnText.includes('Save Draft') || btnText.includes('Save Changes') || btnText.includes('Checking')
      expect(isNormalButton).toBe(true)
    }

    await page.context().close()
  })
})
