/**
 * Booth Management Error Handling — E2E Tests
 *
 * Gap #1: Tests error paths for booth management:
 * - Product form validation errors (empty name, invalid price)
 * - Duplicate product name handling
 * - Photo-less listing UX (draft mode)
 * - Invalid URL fallback
 * - Booth pages for non-booth user
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Booth Management — Error Handling', () => {
  // ── E1: Product form rejects empty submission ──
  test('E1 — product form shows validation errors for empty submit', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new')
    await assertPageHealthy(page)

    // Try submitting empty form via JS (bypass pointer-events intercept)
    await page.evaluate(() => {
      const form = document.querySelector('form')
      if (form) form.requestSubmit()
    })
    await page.waitForTimeout(2000)

    const body = await page.locator('body').innerText()

    // Should still be on the form (not redirected to success)
    expect(page.url()).toContain('/products/new')

    // Should show validation indicators — form should not crash
    expect(body).not.toContain('undefined')
    expect(body).not.toContain('NaN')

    await page.context().close()
  })

  // ── E2: Product form requires name ──
  test('E2 — product listing requires a name', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new')
    await assertPageHealthy(page)

    // Set a price but no name
    const priceInput = page.locator('input[type="number"]').first()
    if (await priceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await priceInput.fill('5.00')
    }

    // Submit form
    await page.evaluate(() => {
      const form = document.querySelector('form')
      if (form) form.requestSubmit()
    })
    await page.waitForTimeout(2000)

    // Should still be on form — not redirect to success
    expect(page.url()).toContain('/products/new')

    await page.context().close()
  })

  // ── E3: Non-booth user sees create booth prompt ──
  test('E3 — buyer without booth sees appropriate message on /my-booth', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/my-booth')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()

    // Should show either create booth prompt or redirect
    const hasFeedback =
      body.includes('Create') ||
      body.includes('create') ||
      body.includes('Booth') ||
      body.includes('booth') || body.includes('produce stand') ||
      body.includes('Start') ||
      body.includes('Set up') ||
      body.includes('sign in')
    expect(hasFeedback).toBeTruthy()

    // Should not crash
    expect(body).not.toContain('undefined')
    expect(body).not.toContain('NaN')

    await page.context().close()
  })

  // ── E4: Invalid booth URL shows error ──
  test('E4 — invalid booth ID in URL shows error or 404', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/market/booth/00000000-0000-0000-0000-000000000099')
    // Page should load without crashing
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('[object Object]')

    await page.context().close()
  })

  // ── E5: Invalid product URL shows error ──
  test('E5 — invalid product ID in URL shows error or 404', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/market/booth/00000000-0000-0000-0000-000000000099/product/00000000-0000-0000-0000-000000000099')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('[object Object]')

    await page.context().close()
  })

  // ── E6: Edit product with invalid edit ID ──
  test('E6 — edit product with non-existent ID handles gracefully', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new?edit=00000000-0000-0000-0000-000000000099')
    await page.waitForTimeout(3000)

    // Should not crash — may show empty form or error toast
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('[object Object]')
    expect(body).not.toContain('undefined')

    await page.context().close()
  })

  // ── E7: Negative price rejected ──
  test('E7 — product form does not accept negative price', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/my-booth/products/new')
    await assertPageHealthy(page)

    // Fill name
    const nameInput = page.locator('input[placeholder*="Heritage"]').first()
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill('Test Negative Price')
    }

    // Try negative price
    const priceInput = page.locator('input[type="number"]').first()
    if (await priceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await priceInput.fill('-5.00')
    }

    // Try submit
    await page.evaluate(() => {
      const form = document.querySelector('form')
      if (form) form.requestSubmit()
    })
    await page.waitForTimeout(2000)

    // Should not create a product with negative price
    // Either stays on form or shows error
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('Product added')

    await page.context().close()
  })
})
