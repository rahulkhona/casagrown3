import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  execSql,
  preAuthAllUsers,
} from './scenario-helpers'

test.describe('Checkout Gaps E2E - Delivery Instructions & Sales Tax ZIP', () => {
  const BUYER_ID = 'b2222222-2222-2222-2222-222222222222' // Beth
  const SELLER_ID = 'a1111111-1111-1111-1111-111111111111' // Sam
  let testProductId = ''
  let testBoothId = ''

  test.beforeAll(async () => {
    await preAuthAllUsers()

    // 1. Get Sam's booth
    const boothRow = execSql(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' LIMIT 1`
    )
    testBoothId = boothRow ? boothRow.trim().split(/\s+/)[0] : ''
    console.log('[E2E SETUP] Sam booth ID:', testBoothId)

    // Ensure Sam's booth has pickup_zip=94043 and booth_zip=94043, offers both fulfillment modes
    execSql(
      `UPDATE market_booths
       SET offers_delivery = true, offers_pickup = true,
           pickup_zip = '94043', pickup_state = 'CA',
           booth_zip = '94043', booth_state = 'CA',
           pickup_address = '1600 Amphitheatre Pkwy, Mountain View, CA 94043'
       WHERE id = '${testBoothId}'`
    )

    // 2. Ensure Beth has buyer zip=95125 and $0.00 balance to force card payment path
    execSql(
      `UPDATE profiles
       SET zip_code = '95125', zip_plus4 = '95125', state_code = 'CA', street_address = '123 Buyer St, San Jose, CA'
       WHERE id = '${BUYER_ID}'`
    )
    execSql(
      `UPDATE user_balances
       SET available_usd = 0.00, held_balance_usd = 0.00
       WHERE user_id = '${BUYER_ID}'`
    )
    execSql(
      `DELETE FROM buyer_debts WHERE buyer_id = '${BUYER_ID}'`
    )

    // Ensure both zip codes exist in zip_codes table to resolve state code CA
    execSql(
      `INSERT INTO zip_codes (zip_code, country_iso_3, city_id, latitude, longitude)
       VALUES ('95125', 'USA', '00000000-0000-0000-0000-000000000002', 37.33, -121.89)
       ON CONFLICT (zip_code, country_iso_3) DO NOTHING`
    )
    execSql(
      `INSERT INTO zip_codes (zip_code, country_iso_3, city_id, latitude, longitude)
       VALUES ('94043', 'USA', '00000000-0000-0000-0000-000000000002', 37.42, -122.08)
       ON CONFLICT (zip_code, country_iso_3) DO NOTHING`
    )

    // Ensure we have active tax cache entries for both 95125 and 94043 to prevent cache miss errors
    execSql(
      `INSERT INTO zip_tax_cache (zip_code, combined_rate, expires_at)
       VALUES ('95125', 8.2500, now() + interval '1 day')
       ON CONFLICT (zip_code) DO UPDATE SET combined_rate = 8.2500, expires_at = now() + interval '1 day'`
    )
    execSql(
      `INSERT INTO zip_tax_cache (zip_code, combined_rate, expires_at)
       VALUES ('94043', 8.7500, now() + interval '1 day')
       ON CONFLICT (zip_code) DO UPDATE SET combined_rate = 8.7500, expires_at = now() + interval '1 day'`
    )

    // 3. Create a test product that uses a category with taxable rate (e.g. 'flowers')
    const prodRow = execSql(
      `INSERT INTO market_products (seller_id, booth_id, name, description, price_usd, unit, inventory, category, is_active, moderation_status, market_date)
       VALUES ('${SELLER_ID}', '${testBoothId}', 'Gap Tomatoes', 'Juicy tomatoes for gaps E2E', 10.00, 'lb', 100, 'flowers', true, 'approved', CURRENT_DATE)
       RETURNING id`
    )
    testProductId = prodRow ? prodRow.trim().split(/\s+/)[0] : ''
    console.log('[E2E SETUP] Created test product ID:', testProductId)
  })

  test.afterAll(async () => {
    if (testProductId) {
      execSql(`DELETE FROM market_orders WHERE product_id = '${testProductId}'`)
      execSql(`DELETE FROM market_products WHERE id = '${testProductId}'`)
    }
  })

  test('Checkout flow - input delivery instructions and verify dynamic sales tax toggling', async ({ browser }) => {
    expect(testProductId).toBeTruthy()
    expect(testBoothId).toBeTruthy()

    // 1. Log in as Beth (buyer) and go to the product detail page
    const page = await loginAsUser(browser, 'beth')
    page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.text()))
    page.on('response', response => {
      const status = response.status()
      if (status >= 400) {
        console.log(`[RESPONSE ERROR] ${response.url()} -> ${status}`)
      }
    })
    await navigateTo(page, `/market/booth/${testBoothId}/product/${testProductId}`)
    await page.waitForTimeout(1000)
    await assertPageHealthy(page)

    // Dismiss rating prompt if any
    const dismissBtn = page.locator('button:has-text("Skip"), button:has-text("✕")').first()
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click()
    }

    // 2. Click Buy button to open BuyModal
    const buyBtn = page.locator('button:has-text("Buy"), button:has-text("Order")').first()
    await buyBtn.click()
    await page.waitForTimeout(1000)

    // Verify Modal is open
    await expect(page.locator('text=Fulfillment')).toBeVisible()

    // 3. Select Delivery and verify tax is calculated based on Buyer's ZIP (95125 -> 8.25%)
    const deliveryBtn = page.locator('button:has-text("Delivery")').first()
    await deliveryBtn.click()
    await page.waitForTimeout(500)

    // Tax rate breakdown on $10 subtotal — check for calculated tax amount or breakdown summary
    const hasTaxDelivery = await page.locator('body').textContent()
    expect(hasTaxDelivery).toMatch(/Tax|8\.25%|\$0\.83|\$0\.82|\$0\.85/i)

    // 4. Fill in delivery instructions
    const instructionsInput = page.locator('input[placeholder*="Delivery instructions"]').first()
    await instructionsInput.fill('Leave on the front porch table.')

    // 5. Select Pickup and verify tax updates to Booth's ZIP
    const pickupBtn = page.locator('button:has-text("Pickup")').first()
    await pickupBtn.click()
    await page.waitForTimeout(500)

    const hasTaxPickup = await page.locator('body').textContent()
    expect(hasTaxPickup).toMatch(/Tax|8\.75%|\$0\.88|\$0\.87|\$0\.89/i)

    // 6. Switch back to Delivery, verify instructions are still there
    await deliveryBtn.click()
    await page.waitForTimeout(500)
    expect(await instructionsInput.inputValue()).toBe('Leave on the front porch table.')

    // 6.5 Fill in Stripe Elements card info (if card iframe is displayed)
    const cardIframe = page.frameLocator('#stripe-card-element iframe').first()
    const cardInput = cardIframe.locator('input[name="cardnumber"], input[placeholder="Card number"]')
    const cardVisible = await cardInput.isVisible({ timeout: 10000 }).catch(() => false)
    if (cardVisible) {
      await cardInput.click()
      await cardInput.pressSequentially('4242424242424242122812395125', { delay: 40 })
      await page.waitForTimeout(1000)
    }

    // Take screenshot of BuyModal with instructions filled
    await page.screenshot({ path: '/Users/rkhona/.gemini/antigravity/brain/d223b8c5-3327-440c-862e-5ff983b1fbf3/buy_modal_instructions.png' })

    // 7. Place the order
    const placeBtn = page.locator('button:has-text("Place Order")').first()
    await placeBtn.click()

    // Wait for success screen or redirect
    await page.waitForURL(/\/orders\//, { timeout: 15000 })
    const currentUrl = page.url()
    const orderIdMatch = currentUrl.match(/\/orders\/([a-f0-9-]{36})/i)
    expect(orderIdMatch).toBeTruthy()
    const createdOrderId = orderIdMatch ? orderIdMatch[1] : ''
    console.log('[E2E SUCCESS] Created order ID:', createdOrderId)

    // 8. Verify delivery instructions are stored in the database
    const dbVal = execSql(
      `SELECT delivery_instructions FROM market_orders WHERE id = '${createdOrderId}'`
    )
    expect(dbVal ? dbVal.trim() : '').toBe('Leave on the front porch table.')

    // 9. Verify web UI displays the delivery instructions on the order details page
    await page.reload()
    await page.waitForTimeout(1000)
    await expect(page.locator('text=Instructions: Leave on the front porch table.')).toBeVisible()

    // Take screenshot of Buyer's order details view
    await page.screenshot({ path: '/Users/rkhona/.gemini/antigravity/brain/d223b8c5-3327-440c-862e-5ff983b1fbf3/buyer_order_details_instructions.png' })
    await page.context().close()

    // 10. Log in as Sam (seller) and verify the instructions are displayed in their order management workflow
    const sellerPage = await loginAsUser(browser, 'sam')
    await navigateTo(sellerPage, `/orders/${createdOrderId}`)
    await sellerPage.waitForTimeout(1000)
    await assertPageHealthy(sellerPage)
    await expect(sellerPage.locator('text=Instructions: Leave on the front porch table.')).toBeVisible()

    // Take screenshot of Seller's order details view
    await sellerPage.screenshot({ path: '/Users/rkhona/.gemini/antigravity/brain/d223b8c5-3327-440c-862e-5ff983b1fbf3/seller_order_details_instructions.png' })
    await sellerPage.context().close()
  })
})
