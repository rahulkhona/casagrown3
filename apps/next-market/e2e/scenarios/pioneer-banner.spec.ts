import { test, expect } from '@playwright/test'
import { loginAsUser, navigateToMarket } from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Pioneer Banner E2E', () => {
  test('banner appears for communities with <= 20 members and can be dismissed', async ({ browser }) => {
    // Beth is in 89283470c2fffff, which has ~5 members in seed data
    const page = await loginAsUser(browser, 'beth')
    
    // Clear localStorage to ensure banner hasn't been dismissed by a previous test
    await page.evaluate(() => localStorage.clear())
    
    await navigateToMarket(page)
    
    // Banner has a 500ms delay before animating in
    await page.waitForTimeout(1000)
    
    // Assert the banner text is visible
    const bannerHeading = page.getByText(/Welcome to CasaGrown!/i)
    await expect(bannerHeading).toBeVisible()
    
    const countText = page.getByText(/founding members/i)
    await expect(countText).toBeVisible()
    
    // Assert the Invite and Buzz buttons exist
    await expect(page.getByRole('button', { name: /Invite Neighbors/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Visit Buzz/i })).toBeVisible()
    
    // Dismiss the banner
    const dismissButton = page.getByRole('button', { name: '✕' })
    await dismissButton.click()
    
    // Wait for dismiss animation (300ms)
    await page.waitForTimeout(500)
    
    // Assert it is no longer visible
    await expect(bannerHeading).not.toBeVisible()
    
    // Refresh the page
    await page.reload()
    await page.waitForTimeout(1000)
    
    // Verify it stays dismissed (localStorage check)
    await expect(bannerHeading).not.toBeVisible()
    
    await page.context().close()
  })
})
