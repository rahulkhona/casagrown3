import { test, expect } from '@playwright/test'
import { loginAsUser, navigateTo, assertPageHealthy, execSql } from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Order Chat Shortcuts', () => {
  test('Quick replies and ETA picker work correctly', async ({ browser }) => {
    // 1. Setup Data - Find a pickup order where Sam is the seller
    // The "Ready for Pickup" shortcut only appears for sellers on pickup orders
    const orderId = execSql(`SELECT id FROM market_orders WHERE seller_id = 'a1111111-1111-1111-1111-111111111111' AND fulfillment_type = 'pickup' LIMIT 1`)
    if (!orderId) {
      console.log('No pickup orders found in database for Sam to test chat shortcuts. Skipping.')
      test.skip()
      return
    }

    // Login as Sam, who is the seller for this order
    const page = await loginAsUser(browser, 'sam')
    
    // 2. Navigate straight to the order details page
    await navigateTo(page, `/orders/${orderId.trim()}`)
    await assertPageHealthy(page)

    // 3. Open the chat panel if it's hidden
    const chatToggle = page.locator('button', { hasText: /Chat with/i })
    if (await chatToggle.isVisible()) {
      await chatToggle.click()
    }

    // Ensure the chat input area is visible
    const chatInput = page.locator('input[placeholder="Type a message..."]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })

    // 4. Test "Ready for Pickup" shortcut
    const pickupBtn = page.locator('button', { hasText: '✅ Ready for Pickup' })
    await expect(pickupBtn).toBeVisible()
    await pickupBtn.click()

    // It should immediately send the message "Your order is ready for pickup!"
    // and appear in the chat bubbles
    const readyMessage = page.locator('div', { hasText: 'Your order is ready for pickup!' }).last()
    await expect(readyMessage).toBeVisible()

    // 5. Now log in as Beth (the buyer) to test "On my way..." on this same pickup order
    const bethPage = await loginAsUser(browser, 'beth')
    await navigateTo(bethPage, `/orders/${orderId.trim()}`)
    await assertPageHealthy(bethPage)
    
    // Open chat panel for Beth
    const bethChatToggle = bethPage.locator('button', { hasText: /Chat with/i })
    if (await bethChatToggle.isVisible()) {
      await bethChatToggle.click()
    }
    await expect(bethPage.locator('input[placeholder="Type a message..."]')).toBeVisible({ timeout: 10000 })

    // Beth (Buyer on pickup) SHOULD see "On my way..." and should NOT see "Ready for Pickup"
    await expect(bethPage.locator('button', { hasText: '✅ Ready for Pickup' })).not.toBeVisible()

    const onMyWayBtn = bethPage.locator('button', { hasText: '🚗 On my way...' })
    await expect(onMyWayBtn).toBeVisible()
    await onMyWayBtn.click()

    // The ETA inline picker should appear
    const etaInput = bethPage.locator('input[placeholder="e.g. 15 mins"]')
    await expect(etaInput).toBeVisible()

    // Type the ETA and submit
    await etaInput.fill('10 mins')
    
    const sendEtaBtn = bethPage.locator('button', { hasText: 'Send' })
    await sendEtaBtn.click()

    // It should send the message "I'm on my way!\nETA: 10 mins"
    // Because white-space is pre-wrap, check main chat body text
    const mainChatBody = bethPage.locator('div[class*="messageList"]')
    await expect(mainChatBody).toContainText("I'm on my way!")
    await expect(mainChatBody).toContainText("10 mins")

    await page.context().close()
    await bethPage.context().close()
  })
})
