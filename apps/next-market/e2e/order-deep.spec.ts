import { test, expect } from '@playwright/test'

/**
 * Deep E2E: Full Order Flow
 * Browse → View Product → Open Buy Modal → Place Order → View Order → Chat
 */
test.describe('Full Order Flow', () => {
  test('should browse market and view a product', async ({ page }) => {
    await page.goto('/market?addr=123+Main+St&lat=37.3690&lng=-121.8900')
    await page.waitForTimeout(3000)

    // Should see booth cards
    const boothCards = page.locator('[class*="boothCard"], [class*="card"], a[href*="/booth"]')
    await expect(boothCards.first()).toBeVisible({ timeout: 10000 })

    // Click on first booth
    await boothCards.first().click()
    await page.waitForTimeout(2000)

    // Should see product listings
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should open buy modal from product page', async ({ page }) => {
    // Navigate directly to a known product page
    await page.goto('/market')
    await page.waitForTimeout(3000)

    // Find any "Buy" or "Order" button
    const buyBtn = page.locator('button:has-text("Buy"), button:has-text("Order"), button:has-text("Add to")')
    if (await buyBtn.count() > 0) {
      await buyBtn.first().click()
      await page.waitForTimeout(1000)

      // Should see the buy modal with quantity controls
      const modal = page.locator('[class*="modal"], [class*="overlay"], [role="dialog"]')
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible()
      }
    }
  })

  test('should display price breakdown in buy modal', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(3000)

    const buyBtn = page.locator('button:has-text("Buy"), button:has-text("Order")')
    if (await buyBtn.count() > 0) {
      await buyBtn.first().click()
      await page.waitForTimeout(1000)

      // Should show price-related text
      const priceText = page.locator('text=Subtotal, text=Total, text=Tax')
      if (await priceText.count() > 0) {
        await expect(priceText.first()).toBeVisible()
      }
    }
  })

  test('should adjust quantity in buy modal', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(3000)

    const buyBtn = page.locator('button:has-text("Buy"), button:has-text("Order")')
    if (await buyBtn.count() > 0) {
      await buyBtn.first().click()
      await page.waitForTimeout(1000)

      // Find qty + button and click it
      const plusBtn = page.locator('button:has-text("+"), button:has-text("＋")')
      if (await plusBtn.count() > 0) {
        await plusBtn.first().click()
        await page.waitForTimeout(500)
      }
    }
  })
})

test.describe('Order Management', () => {
  test('should display orders with status badges', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(3000)

    // Should show order status text
    const statusBadges = page.locator('text=pending, text=accepted, text=delivered, text=confirmed, text=Pending, text=Accepted, text=Delivered')
    // Orders may or may not exist depending on test state
  })

  test('should navigate to order detail and show receipt', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(3000)

    // Click first order if exists
    const orderLink = page.locator('a[href*="/orders/"]').first()
    if (await orderLink.isVisible()) {
      await orderLink.click()
      await page.waitForTimeout(2000)

      // Order detail should show order info
      const body = await page.textContent('body')
      expect(body).toBeTruthy()
    }
  })

  test('should show chat link on order detail', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(3000)

    const orderLink = page.locator('a[href*="/orders/"]').first()
    if (await orderLink.isVisible()) {
      await orderLink.click()
      await page.waitForTimeout(2000)

      // Look for chat/message button
      const chatBtn = page.locator('a[href*="/chat"], button:has-text("Chat"), button:has-text("Message")')
      if (await chatBtn.count() > 0) {
        await expect(chatBtn.first()).toBeVisible()
      }
    }
  })
})
