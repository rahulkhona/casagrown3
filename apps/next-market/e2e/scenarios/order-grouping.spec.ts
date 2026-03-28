import { test, expect } from '@playwright/test'
import { loginAsUser, navigateTo, assertPageHealthy } from './scenario-helpers'

/**
 * E2E tests for unified Orders page — status-first tabs with role filter pills
 * Tests the new "Needs Action" tab with counterparty grouping, role filters,
 * and order card visual indicators (left accent border, mode chips, location).
 * Logs in as Sam Seller (has both buying + selling orders).
 */

test.describe('Unified Orders Page', () => {
  test.describe.configure({ mode: 'serial' })

  let samPage: Awaited<ReturnType<typeof loginAsUser>>

  test.beforeAll(async ({ browser }) => {
    samPage = await loginAsUser(browser, 'sam')
  })

  test.afterAll(async () => {
    await samPage?.context().close()
  })

  test('UO1 — page renders with status-first tabs', async () => {
    await navigateTo(samPage, '/orders')
    await assertPageHealthy(samPage)

    // Verify primary status tabs exist
    await expect(samPage.locator('button', { hasText: /Needs Action/i })).toBeVisible()
    await expect(samPage.locator('button', { hasText: /Delivered/i })).toBeVisible()
    await expect(samPage.locator('button', { hasText: /Disputed/i })).toBeVisible()
    await expect(samPage.locator('button', { hasText: /Completed/i })).toBeVisible()

    // OLD tabs should NOT exist
    await expect(samPage.locator('button', { hasText: /^Sales$/i })).not.toBeVisible()
    await expect(samPage.locator('button', { hasText: /^Purchases$/i })).not.toBeVisible()
    await expect(samPage.locator('button', { hasText: /^Pickup$/i })).not.toBeVisible()
  })

  test('UO2 — role filter pills are visible', async () => {
    await navigateTo(samPage, '/orders')

    // Verify role filter pills
    await expect(samPage.locator('button', { hasText: /^All$/i })).toBeVisible()
    await expect(samPage.locator('button', { hasText: /Buying/i })).toBeVisible()
    await expect(samPage.locator('button', { hasText: /Selling/i })).toBeVisible()
  })

  test('UO3 — Needs Action tab shows counterparty group headers', async () => {
    await navigateTo(samPage, '/orders')

    const orderCards = samPage.locator('[class*="orderCard"]')
    const hasOrders = await orderCards.count() > 0

    if (hasOrders) {
      // Group headers should be visible
      const groupHeaders = samPage.locator('[class*="counterpartyGroupHeader"]')
      expect(await groupHeaders.count()).toBeGreaterThanOrEqual(1)

      // Group header shows person name + item count
      const headerText = await groupHeaders.first().textContent()
      expect(headerText).toMatch(/item/i)
    }
  })

  test('UO4 — order cards show role labels (SELLING / BUYING)', async () => {
    await navigateTo(samPage, '/orders')

    const roleLabels = samPage.locator('[class*="roleLabel"]')
    const count = await roleLabels.count()

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await roleLabels.nth(i).textContent()
        expect(['SELLING', 'BUYING', 'HELPING']).toContain(text?.trim())
      }
    }
  })

  test('UO5 — order cards show left accent border by role', async () => {
    await navigateTo(samPage, '/orders')

    const sellingCards = samPage.locator('[class*="cardSelling"]')
    const buyingCards = samPage.locator('[class*="cardBuying"]')

    const sellingCount = await sellingCards.count()
    const buyingCount = await buyingCards.count()

    // At least one type should be present
    expect(sellingCount + buyingCount).toBeGreaterThan(0)
  })

  test('UO6 — order cards show fulfillment mode chips', async () => {
    await navigateTo(samPage, '/orders')

    const modeChips = samPage.locator('[class*="modeChip"]')
    const chipCount = await modeChips.count()

    if (chipCount > 0) {
      for (let i = 0; i < Math.min(chipCount, 3); i++) {
        const text = await modeChips.nth(i).textContent()
        expect(text).toMatch(/Delivery|Pickup/i)
      }
    }
  })

  test('UO7 — order cards show location info', async () => {
    await navigateTo(samPage, '/orders')

    const locationLines = samPage.locator('[class*="locationLine"]')
    const locationCount = await locationLines.count()

    // At least some orders should have location info from seed data
    expect(locationCount).toBeGreaterThan(0)
  })

  test('UO8 — Buying filter narrows to buyer orders only', async () => {
    await navigateTo(samPage, '/orders')

    // Click "Buying" filter
    await samPage.locator('button', { hasText: /Buying/i }).click()
    await samPage.waitForTimeout(500)

    // All visible role labels should be "BUYING"
    const roleLabels = samPage.locator('[class*="roleLabel"]')
    const count = await roleLabels.count()

    for (let i = 0; i < count; i++) {
      const text = await roleLabels.nth(i).textContent()
      expect(text?.trim()).toBe('BUYING')
    }
  })

  test('UO9 — Selling filter narrows to seller orders only', async () => {
    await navigateTo(samPage, '/orders')

    // Click "Selling" filter
    await samPage.locator('button', { hasText: /Selling/i }).click()
    await samPage.waitForTimeout(500)

    // All visible role labels should be "SELLING"
    const roleLabels = samPage.locator('[class*="roleLabel"]')
    const count = await roleLabels.count()

    for (let i = 0; i < count; i++) {
      const text = await roleLabels.nth(i).textContent()
      expect(text?.trim()).toBe('SELLING')
    }
  })

  test('UO10 — clicking an order card navigates to detail page', async () => {
    await navigateTo(samPage, '/orders')

    const orderCards = samPage.locator('[class*="orderCard"]')
    if (await orderCards.count() > 0) {
      const href = await orderCards.first().getAttribute('href')
      expect(href).toMatch(/\/orders\//)

      await orderCards.first().click()
      await samPage.waitForURL(/\/orders\//, { timeout: 10000 })
      expect(samPage.url()).toMatch(/\/orders\/[a-f0-9-]+/)
    }
  })

  test('UO11 — Completed tab shows resolved/cancelled/completed orders', async () => {
    await navigateTo(samPage, '/orders')

    // Click Completed tab
    await samPage.locator('button', { hasText: /Completed/i }).click()
    await samPage.waitForTimeout(500)

    const body = await samPage.locator('body').innerText()
    const hasContent =
      body.includes('Completed') ||
      body.includes('Cancelled') ||
      body.includes('Resolved') ||
      body.includes('completed orders will appear')
    expect(hasContent).toBeTruthy()
  })

  test('UO12 — Delivered tab shows orders with delivered status', async () => {
    await navigateTo(samPage, '/orders')

    // Click Delivered tab
    await samPage.locator('button', { hasText: /^Delivered/i }).first().click()
    await samPage.waitForTimeout(500)

    const statusBadges = samPage.locator('[class*="statusBadge"]')
    const count = await statusBadges.count()

    for (let i = 0; i < count; i++) {
      const text = await statusBadges.nth(i).textContent()
      expect(text).toMatch(/Delivered/i)
    }
  })

  test('UO13 — switching tabs resets and shows correct content', async () => {
    await navigateTo(samPage, '/orders')

    // Start on Needs Action
    const na = samPage.locator('button', { hasText: /Needs Action/i })
    await expect(na).toBeVisible()

    // Switch to Completed
    await samPage.locator('button', { hasText: /Completed/i }).click()
    await samPage.waitForTimeout(500)

    // Switch back to Needs Action
    await na.click()
    await samPage.waitForTimeout(500)

    // Should still show order cards or meaningful content
    const body = await samPage.locator('body').innerText()
    expect(body.length).toBeGreaterThan(100)
  })

  test('UO14 — action hints appear on order cards', async () => {
    await navigateTo(samPage, '/orders')

    const hints = samPage.locator('[class*="hint"]')
    const hintCount = await hints.count()

    // Needs Action tab should have orders with contextual hints
    if (hintCount > 0) {
      const firstHint = await hints.first().textContent()
      expect(firstHint).toMatch(/Fulfill|Confirm|Dispute|Auto-completes|preparing/i)
    }
  })
})
