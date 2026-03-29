import { test, expect } from '@playwright/test'
import { loginAsUser, navigateToMarket } from './scenario-helpers'

const BASE = process.env.BASE_URL || 'http://localhost:3001'

test.describe('Toast Notifications for Success and Error Handling', () => {
  test.use({ permissions: ['notifications'] })

  test('displays an error toast on action failure', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')

    // Force closed market and PROVIDE A SCHEDULE so nextOpenDate is not null!
    await page.route('**/rest/v1/market_settings*', async (route) => {
      await route.fulfill({ json: [{ market_never_closes: false, products_never_expire: false, enable_cart: false }] })
    })
    await page.route('**/rest/v1/market_schedule_policies*', async (route) => {
      // Return a schedule so it calculates a nextOpenDate
      await route.fulfill({ json: [{ day_of_week: 6, open_time: '08:00', close_time: '11:00' }] })
    })
    
    // navigateToMarket handles alpha banner and location prompt logic reliably
    await navigateToMarket(page)
    
    // Intercept profile fetch for community to force a failure
    await page.route('**/rest/v1/profiles*select=home_community_h3_index*', async route => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Intercepted profile error"}' })
    })

    // Navigate to community where it will fetch the profile on mount
    await page.goto(`${BASE}/community`)
    
    // Look for the ErrorToast container which has the ❌ icon
    const errorIcon = page.locator('text=❌').first()
    await expect(errorIcon).toBeVisible({ timeout: 5000 })
    
    // Check that we see the error message in the toast
    const toastMessage = page.locator('p', { hasText: /error|failed/i }).first()
    await expect(toastMessage).toBeVisible()
    
    // Dismiss
    const dismissBtn = page.locator('button:has-text("✕")').first()
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click()
      await expect(errorIcon).not.toBeVisible()
    }
  })

  test('displays a success toast when action is successful', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')

    // Force closed market to ensure "Invite Neighbors" button is present
    await page.route('**/rest/v1/market_settings*', async (route) => {
      await route.fulfill({ json: [{ market_never_closes: false, products_never_expire: false, enable_cart: false }] })
    })
    await page.route('**/rest/v1/market_schedule_policies*', async (route) => {
      await route.fulfill({ json: [] })
    })

    await navigateToMarket(page)

    const inviteBtn = page.locator('button:has-text("Invite Neighbors")').first()
    await expect(inviteBtn).toBeVisible({ timeout: 10000 })
    await inviteBtn.click()

    const toastIcon = page.locator('text=✅').first()
    await expect(toastIcon).toBeVisible({ timeout: 5000 })
    
    const dismissBtn = page.locator('button:has-text("✕")').first()
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click()
      await expect(toastIcon).not.toBeVisible()
    }
  })
})
