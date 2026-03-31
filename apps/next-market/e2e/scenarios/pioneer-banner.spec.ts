import { test, expect } from '@playwright/test'
import { loginAsUser, navigateToMarket } from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Pioneer Banner E2E', () => {
  test('banner appears for communities with <= 20 members and can be dismissed', async ({ browser }) => {
    // Beth is in 89283470c2fffff, which has ~5 members in seed data
    const page = await loginAsUser(browser, 'beth')
    
    // Remove the known dismiss key BEFORE navigating to market for the first time.
    // The PioneerBanner component auto-sets this key on mount (impression tracking),
    // so we need to ensure it's cleared before the first market visit.
    // Also remove it from the reload page that loginAsUser ends on.
    await page.evaluate(() => {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('pioneer_banner_dismissed_')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    })
    
    // Navigate to market — this is the FIRST market visit, so the PioneerBanner
    // should mount fresh, check localStorage (key is cleared), and start animating in
    await navigateToMarket(page)
    
    // Banner depends on: auth → profile fetch (home_community_h3_index) → community member
    // count RPC → React state update → PioneerBanner mount → 500ms animation delay.
    // Give it generous time for the full async chain.
    
    // Assert the banner text is visible (generous timeout for full async chain)
    const bannerHeading = page.getByText(/Welcome to CasaGrown!/i)
    await expect(bannerHeading).toBeVisible({ timeout: 15000 })
    
    const countText = page.getByText(/founding members/i)
    await expect(countText).toBeVisible({ timeout: 5000 })
    
    // Assert the Invite and Community buttons exist (use .first() since market closed section also has Invite button)
    await expect(page.getByRole('button', { name: /Invite Neighbors/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Visit Community/i }).first()).toBeVisible()
    
    // Dismiss the banner via the Dismiss button (aria-label)
    // Use force:true because the fixed navbar partially overlaps the banner
    const dismissButton = page.locator('button[aria-label="Dismiss"]')
    await dismissButton.click({ force: true })
    
    // Wait for full dismiss chain: slideOut animation (300ms) → setTimeout(onDismiss, 300ms)
    // → parent state update → React re-render removes element from DOM
    await page.waitForTimeout(1000)
    
    // Verify the dismiss key is set in localStorage
    const dismissed = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('pioneer_banner_dismissed_')) return key
      }
      return null
    })
    expect(dismissed).toBeTruthy()
    
    // Refresh the page and verify banner stays dismissed
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    // After reload, banner should NOT appear (dismiss key in localStorage)
    await expect(bannerHeading).not.toBeVisible({ timeout: 3000 })
    
    await page.context().close()
  })
})
