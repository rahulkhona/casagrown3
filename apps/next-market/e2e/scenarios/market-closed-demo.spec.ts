import { test, expect } from '@playwright/test'
import { loginAsUser, navigateToMarket } from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Market Closed Demo Booths E2E', () => {
  test('displays demo booths when the market is closed', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    
    // Intercept the market_settings to ensure market_never_closes is false
    await page.route('**/rest/v1/market_settings*', async (route) => {
      await route.fulfill({ json: [{ market_never_closes: false, products_never_expire: false, enable_cart: false }] })
    })

    // Intercept the schedule policies to return an empty schedule, forcing the market closed
    await page.route('**/rest/v1/market_schedule_policies*', async (route) => {
      await route.fulfill({ json: [] })
    })

    await navigateToMarket(page)
    
    // Wait for the "Market is Closed" box to appear
    const closedBox = page.getByText(/Market is Closed/i)
    await expect(closedBox).toBeVisible()
    
    // Assert the status text shows demo booths count
    const demoStatusText = page.getByText(/demo/i)
    await expect(demoStatusText.first()).toBeVisible()
    
    // Wait for booths to load
    await page.waitForTimeout(2000)
    
    // We should see DEMO badges on the cards
    // The Demo booths come from the nearby_booths RPC, which we don't need to mock because 
    // it automatically returns the 50 demo booths seeded in the DB.
    const demoBadges = page.getByText('Demo', { exact: false })
    
    // Assert at least one DEMO badge is visible
    expect(await demoBadges.count()).toBeGreaterThan(0)
    
    await page.context().close()
  })
})
