import { test, expect } from '@playwright/test'
import { loginAsUser, navigateToMarket } from './scenario-helpers'

const BASE = process.env.BASE_URL || 'http://localhost:3001'

test.describe('Market Schedule Banner and Transactions', () => {

  // Test 1: Market is Closed
  test('shows banner when market is closed, but still allows transactions', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')

    // Mock settings: market is NOT override-open, cart is enabled
    await page.route('**/rest/v1/market_settings*', async (route) => {
      await route.fulfill({ json: [{ market_never_closes: false, products_never_expire: false, enable_cart: true }] })
    })

    // Mock schedule: return ONE valid future schedule so the banner actually shows up
    await page.route('**/rest/v1/market_schedule_policies*', async (route) => {
      const now = new Date()
      const futureDow = (now.getDay() + 2) % 7
      await route.fulfill({ json: [{
        day_of_week: futureDow,
        day_name: 'Future Day',
        open_time: '08:00',
        close_time: '12:00',
        is_enabled: true
      }] })
    })

    // Navigate to market
    await navigateToMarket(page)

    // 1. Verify Banner Shows (Next Market Day...)
    const banner = page.locator('text=Next Market Day is')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Market days result in more variety')).toBeVisible()

    // 2. Verify we can click into a booth
    const boothCard = page.locator('.card').first()
    await expect(boothCard).toBeVisible({ timeout: 15000 })
    await boothCard.click()
    
    // 3. Verify we can click into a product
    const productLink = page.locator('a[href*="/product/"]').first()
    await expect(productLink).toBeVisible({ timeout: 15000 })
    await productLink.click()
    // The banner should also be visible on PDP
    await expect(banner).toBeVisible({ timeout: 10000 })

    // Add to cart should still be enabled
    const addToCartBtn = page.locator('button', { hasText: /Add to Cart/i })
    await expect(addToCartBtn).toBeEnabled()
    await addToCartBtn.click()

    // Toast should appear indicating it was added
    await expect(page.locator('text=Added to cart')).toBeVisible({ timeout: 5000 })
  })

  // Test 2: Market is Open
  test('hides banner when market is open, allows transactions', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    


    // Mock settings: cart is enabled
    await page.route('**/rest/v1/market_settings*', async (route) => {
      await route.fulfill({ json: [{ market_never_closes: false, products_never_expire: false, enable_cart: true }] })
    })

    // Mock schedule: return a schedule that makes it OPEN right now
    await page.route('**/rest/v1/market_schedule_policies*', async (route) => {
      const now = new Date()
      const day = now.getDay()
      await route.fulfill({ 
        json: [{ 
          day_of_week: day, 
          open_time: '00:00:00', // start of day
          close_time: '23:59:59', // end of day
          is_enabled: true 
        }] 
      })
    })

    // Navigate to market
    await navigateToMarket(page)

    // 1. Verify Banner does NOT show
    const banner = page.locator('text=The Market is Currently Closed')
    await expect(banner).toBeHidden({ timeout: 5000 })

    // 2. Verify we can click into a booth
    const boothCard = page.locator('.card').first()
    await expect(boothCard).toBeVisible({ timeout: 15000 })
    await boothCard.click()
    
    // 3. Verify we can click into a product
    const productLink = page.locator('a[href*="/product/"]').first()
    await expect(productLink).toBeVisible({ timeout: 15000 })
    await productLink.click()
    // Add to cart should still be enabled
    const addToCartBtn = page.locator('button', { hasText: /Add to Cart/i })
    await expect(addToCartBtn).toBeEnabled()
    await addToCartBtn.click()

    // Toast should appear indicating it was added
    await expect(page.locator('text=Added to cart')).toBeVisible({ timeout: 5000 })
  })

})
