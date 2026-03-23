import { test, expect } from '../fixtures'

/**
 * E2E tests for order grouping by buyer (b)
 * Tests the seller's orders page to verify buyer grouping UX
 * Uses the stored auth state from the setup project (seller@test.local)
 */

test.describe('Order Grouping by Buyer', () => {
  test.describe.configure({ mode: 'serial' })

  test('OG1 — seller pickup tab groups pending orders by buyer name', async ({ page }) => {
    await page.goto('/orders?role=selling')
    await page.waitForLoadState('networkidle')

    // Click Pickup tab
    const pickupTab = page.locator('button', { hasText: /Pickup/i })
    if (await pickupTab.isVisible()) {
      await pickupTab.click()
      await page.waitForTimeout(500)

      // If there are orders, they should be grouped by buyer name
      const groupHeaders = page.locator('[style*="green-50"]')
      const orderCards = page.locator('[class*="orderCard"]')

      const hasOrders = await orderCards.count() > 0
      if (hasOrders) {
        expect(await groupHeaders.count()).toBeGreaterThanOrEqual(1)
        const headerText = await groupHeaders.first().textContent()
        expect(headerText).toMatch(/item/i)
      }
    }
  })

  test('OG2 — delivery tab groups by buyer for sellers', async ({ page }) => {
    await page.goto('/orders?role=selling')
    await page.waitForLoadState('networkidle')

    const deliveryTab = page.locator('button', { hasText: /Delivery/i })
    if (await deliveryTab.isVisible()) {
      await deliveryTab.click()
      await page.waitForTimeout(500)

      const orderCards = page.locator('[class*="orderCard"]')
      if (await orderCards.count() > 0) {
        const groupHeaders = page.locator('[style*="green-50"]')
        expect(await groupHeaders.count()).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('OG3 — buyer view does NOT group orders', async ({ page }) => {
    await page.goto('/orders?role=buying')
    await page.waitForLoadState('networkidle')

    const groupHeaders = page.locator('[style*="green-50"]')
    expect(await groupHeaders.count()).toBe(0)
  })

  test('OG4 — each order in a group is individually clickable', async ({ page }) => {
    await page.goto('/orders?role=selling')
    await page.waitForLoadState('networkidle')

    const pickupTab = page.locator('button', { hasText: /Pickup/i })
    if (await pickupTab.isVisible()) {
      await pickupTab.click()
      await page.waitForTimeout(500)

      const orderCards = page.locator('[class*="orderCard"]')
      if (await orderCards.count() > 0) {
        // Each order card should be a link to order detail
        const firstCard = orderCards.first()
        const href = await firstCard.getAttribute('href')
        if (href) {
          expect(href).toMatch(/\/orders\//)
        }
      }
    }
  })
})
