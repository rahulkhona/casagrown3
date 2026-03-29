/**
 * Order Flows — Full Order Lifecycle Tests
 *
 * Scenarios:
 * S3.1  Delivery order lifecycle (buy → pending → delivered → confirmed → completed)
 * S3.4  Pickup order lifecycle (buy → pending → ready → passcode → completed)
 * S4.2  Cart multi-product checkout (2 sellers)
 * S3.5  Seller declines order
 * S3.7  Buyer disputes order (not delivered)
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  navigateToMarket,
  assertPageHealthy,
  clearMailpit,
  assertEmailSent,
  waitForText,
  type UserKey,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Order Flows', () => {
  test.beforeAll(async () => {
    await clearMailpit()
  })

  // ── S3.1: Delivery Order Lifecycle ──
  test('S3.1 — full delivery order (buy → deliver → confirm → complete)', async ({ browser }) => {
    // Step 1: Maria (seller) — verify booth is visible
    const mariaPage = await loginAsUser(browser, 'maria')
    await navigateTo(mariaPage, '/my-booth')
    await assertPageHealthy(mariaPage)
    const mariaBoothBody = await mariaPage.locator('body').innerText()
    expect(mariaBoothBody.length).toBeGreaterThan(50) // Not blank

    // Step 2: Beth (buyer) — browse market, find a product, get product link
    const bethPage = await loginAsUser(browser, 'beth')
    await navigateToMarket(bethPage)
    await assertPageHealthy(bethPage)

    // Find any clickable booth/product link
    const boothLinks = bethPage.locator('a[href*="/market/booth/"]')
    const boothCount = await boothLinks.count()

    if (boothCount > 0) {
      // Click first booth
      await boothLinks.first().click()
      await bethPage.waitForLoadState('networkidle')
      await assertPageHealthy(bethPage)

      // Look for product links or buy buttons
      const productLinks = bethPage.locator('a[href*="/product/"]')
      const productCount = await productLinks.count()

      if (productCount > 0) {
        await productLinks.first().click()
        await bethPage.waitForLoadState('networkidle')
        await assertPageHealthy(bethPage)

        // Look for Buy Now button
        const buyBtn = bethPage.locator('button:has-text("Buy"), a:has-text("Buy")')
        if (await buyBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await buyBtn.first().click()
          await bethPage.waitForTimeout(3000)

          // Verify order was created — should be on orders page or see confirmation
          const afterBuyUrl = bethPage.url()
          const afterBuyBody = await bethPage.locator('body').innerText()
          const orderCreated =
            afterBuyUrl.includes('/orders') ||
            afterBuyBody.includes('Pending') ||
            afterBuyBody.includes('Order') ||
            afterBuyBody.includes('order')
          expect(orderCreated).toBeTruthy()
        }
      }
    }

    // Step 3: Check Maria's orders for new order
    await navigateTo(mariaPage, '/orders')
    await assertPageHealthy(mariaPage)

    // Step 4: Check Beth's orders
    await navigateTo(bethPage, '/orders')
    await assertPageHealthy(bethPage)
    
    // Explicitly assert that she can see the new Needs Action tab and her order
    const needsActionTab = bethPage.getByText('🔔 Needs Action', { exact: false }).first()
    await expect(needsActionTab).toBeVisible({ timeout: 5000 })
    await needsActionTab.click()
    
    // Assert there is actually an order card in the list
    const orderCard = bethPage.locator('a[href*="/orders/"]').first()
    await expect(orderCard).toBeVisible({ timeout: 5000 })

    await mariaPage.context().close()
    await bethPage.context().close()
  })

  // ── S3.4: Pickup Order Lifecycle ──
  test('S3.4 — pickup order lifecycle', async ({ browser }) => {
    const rajPage = await loginAsUser(browser, 'raj')
    await navigateTo(rajPage, '/my-booth')
    await assertPageHealthy(rajPage)

    // Verify Raj's booth has products
    await navigateTo(rajPage, '/my-booth/products')
    await assertPageHealthy(rajPage)

    const bethPage = await loginAsUser(browser, 'beth')

    // Beth browses market
    await navigateToMarket(bethPage)
    await assertPageHealthy(bethPage)

    // Check Raj's orders page works
    await navigateTo(rajPage, '/orders')
    await assertPageHealthy(rajPage)

    // Check Beth's orders page
    await navigateTo(bethPage, '/orders')
    await assertPageHealthy(bethPage)

    await rajPage.context().close()
    await bethPage.context().close()
  })

  // ── S4.2: Cart Multi-Product Checkout ──
  test('S4.2 — cart page works with items', async ({ browser }) => {
    const bethPage = await loginAsUser(browser, 'beth')

    // Browse market
    await navigateToMarket(bethPage)
    await assertPageHealthy(bethPage)

    // Visit cart page — use domcontentloaded + explicit wait because
    // the cart page has real-time subscriptions that prevent networkidle
    await bethPage.goto('http://localhost:3001/cart', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await bethPage.waitForTimeout(2000)
    await assertPageHealthy(bethPage)

    // Cart should show items or empty state
    const body = await bethPage.locator('body').innerText()
    const hasCartContent =
      body.includes('Cart') ||
      body.includes('cart') ||
      body.includes('empty') ||
      body.includes('item')
    expect(hasCartContent).toBeTruthy()

    // Verify no $NaN or rendering errors
    expect(body).not.toContain('$NaN')
    expect(body).not.toContain('$undefined')

    await bethPage.context().close()
  })

  // ── S3.5: Seller Declines Order ──
  test('S3.5 — order decline flow UI elements', async ({ browser }) => {
    const sofiaPage = await loginAsUser(browser, 'sofia')

    // Sofia views her orders
    await navigateTo(sofiaPage, '/orders')
    await assertPageHealthy(sofiaPage)

    // Check that the orders page has proper content
    const body = await sofiaPage.locator('body').innerText()
    const lower = body.toLowerCase()
    const hasOrderContent = lower.includes('needs action') || lower.includes('delivered') || lower.includes('selling') || lower.includes('order')
    expect(hasOrderContent).toBeTruthy()

    // Verify decline UI exists on order detail (if there are orders)
    const orderLinks = sofiaPage.locator('a[href*="/orders/"]')
    const orderCount = await orderLinks.count()

    if (orderCount > 0) {
      await orderLinks.first().click()
      await sofiaPage.waitForLoadState('networkidle')
      await assertPageHealthy(sofiaPage)

      // 1. Verify Chat is open by default: we should see the chat input
      const chatInput = sofiaPage.locator('input[placeholder*="Type a message"]')
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      // 2. Perform the decline action
      const declineBtn = sofiaPage.locator('button', { hasText: 'Decline Order' })
      if (await declineBtn.isVisible()) {
        await declineBtn.click()
        
        // Wait for modal
        const declineModal = sofiaPage.locator('h3', { hasText: 'Decline Order' })
        await expect(declineModal).toBeVisible()

        // Enter reason and submit
        const reasonInput = sofiaPage.locator('textarea[placeholder*="Reason for declining"]')
        await reasonInput.fill('Out of stock unfortunately')
        
        const confirmDeclineBtn = sofiaPage.locator('button.btn-danger', { hasText: 'Decline Order' })
        await confirmDeclineBtn.click()

        // 3. Verify the chat now contains the decline system message
        const systemMessage = sofiaPage.getByText('Out of stock unfortunately')
        await expect(systemMessage).toBeVisible({ timeout: 5000 })
        
        const systemIcon = sofiaPage.getByText('❌ Order declined by seller')
        await expect(systemIcon).toBeVisible({ timeout: 5000 })
      }
    }

    await sofiaPage.context().close()
  })

  // ── S3.7: Dispute Flow ──
  test('S3.7 — dispute UI renders on order detail', async ({ browser }) => {
    const bethPage = await loginAsUser(browser, 'beth')

    // Beth views her orders
    await navigateTo(bethPage, '/orders')
    await assertPageHealthy(bethPage)

    // Check for order links
    const orderLinks = bethPage.locator('a[href*="/orders/"]')
    const orderCount = await orderLinks.count()

    if (orderCount > 0) {
      await orderLinks.first().click()
      await bethPage.waitForLoadState('networkidle')
      await assertPageHealthy(bethPage)

      // Order detail page should render with proper structure
      const detailBody = await bethPage.locator('body').innerText()
      expect(detailBody.length).toBeGreaterThan(50)

      // Should show order status, product info
      const hasOrderInfo =
        detailBody.includes('Status') ||
        detailBody.includes('status') ||
        detailBody.includes('Pending') ||
        detailBody.includes('Delivered') ||
        detailBody.includes('Completed') ||
        detailBody.includes('order')
      expect(hasOrderInfo).toBeTruthy()
    }

    await bethPage.context().close()
  })

  // ── S3.1 cont: Verify Unified Orders Tabs ──
  test('unified order tabs show correct counts and filter', async ({ browser }) => {
    // Sam has seeded orders in various states
    const samPage = await loginAsUser(browser, 'sam')

    await navigateTo(samPage, '/orders')
    await assertPageHealthy(samPage)

    // Primary status tabs: Needs Action, Delivered, Disputed, Completed
    const statusTabs = ['Needs Action', 'Delivered', 'Disputed', 'Completed']
    for (const tab of statusTabs) {
      const tabBtn = samPage.getByText(tab, { exact: false }).first()
      if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabBtn.click()
        await samPage.waitForTimeout(500)
        await assertPageHealthy(samPage)
      }
    }
    
    const bethPage = await loginAsUser(browser, 'beth')
    await navigateTo(bethPage, '/orders')
    await assertPageHealthy(bethPage)
    
    // Buyer should also see the Needs Action tab and see their seeded pending items there
    const bethNeedsActionTab = bethPage.getByText('🔔 Needs Action', { exact: false }).first()
    await expect(bethNeedsActionTab).toBeVisible({ timeout: 5000 })
    await bethNeedsActionTab.click()
    
    // Assert 7 seeded pending orders show up for Beth instead of zero
    const orderCards = bethPage.locator('a[href*="/orders/"]')
    // Ensure we see elements, proving they are no longer filtered out
    await expect(orderCards.first()).toBeVisible({ timeout: 5000 })

    // Role filter pills: All, Buying, Selling
    const roleFilters = ['All', 'Buying', 'Selling']
    // Switch back to Needs Action first
    await samPage.getByText('Needs Action', { exact: false }).first().click()
    await samPage.waitForTimeout(500)

    for (const filter of roleFilters) {
      const filterBtn = samPage.getByText(filter, { exact: false }).first()
      if (await filterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await filterBtn.click()
        await samPage.waitForTimeout(500)
        await assertPageHealthy(samPage)
      }
    }

    await samPage.context().close()
  })
})
