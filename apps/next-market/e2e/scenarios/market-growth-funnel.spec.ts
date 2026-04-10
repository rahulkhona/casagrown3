/**
 * Market Growth Funnel Interactions
 *
 * Scenarios:
 * 1. Zero-State Search (Empty Feed Growth Hook)
 * 2. Visual Emoji Injection
 * 3. Social Share Copy/Paste Instructional Modal Behavior
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateToMarket,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Market Growth Funnel Interactions', () => {

  test('Search triggers contextual empty state & dynamic emoji', async ({ browser }) => {
    // 1. Authenticate and enter market
    const page = await loginAsUser(browser, 'beth')
    await navigateToMarket(page)
    
    // 2. Perform search with zero results
    const searchInput = page.locator('input[placeholder*="Search products"]')
    await searchInput.fill('sugarcane')
    
    // 3. Verify Empty State rendering handles zero-state correctly with exact phrasing
    await expect(page.locator('body')).toContainText("Know a neighbor who might have sugarcane?", { timeout: 15000 })
    
    // 4. Verify Emoji injection resolves correctly (sugarcane -> 🎋)
    await expect(page.locator('body')).toContainText("🎋", { timeout: 5000 })
    
    await page.context().close()
  })

  test('Social sharing modal provides copy-paste instructions', async ({ browser, context }) => {
    // Grant clipboard permissions for navigator.clipboard.writeText
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    
    const page = await loginAsUser(browser, 'beth')
    await navigateToMarket(page)
    
    // 1. Force Empty State again
    const searchInput = page.locator('input[placeholder*="Search products"]')
    await searchInput.fill('dragonfruit')
    await expect(page.locator('body')).toContainText("Know a neighbor who might have dragonfruit?", { timeout: 15000 })

    // 2. Open Share Modal from Zero-State Action Button
    // We target the button via its text to simulate user click
    const inviteBtn = page.locator('button', { hasText: 'Invite Neighbors' }).first()
    await inviteBtn.click()

    // 3. Verify Share Modal successfully opens
    const fbBtn = page.getByRole('button', { name: /Share on Facebook/i })
    await expect(fbBtn).toBeVisible({ timeout: 5000 })
    
    // 4. Verify explicit instructional tip is visible to users regarding Paste UI
    await expect(page.getByText(/block auto-filled text.*click Paste/i)).toBeVisible()

    // 5. Trigger the social click and assert the dynamic Toast UI flips state, replacing native alerts.
    // We use Promise.all to catch the popup if one opens, though our primary assert is the toast.
    
    // Click button 
    await fbBtn.click()

    // 6. Assert UI gracefully informs user it was copied to clipboard!
    await expect(page.getByText(/Copied.*Paste on Facebook/i)).toBeVisible({ timeout: 5000 })
    
    await page.context().close()
  })
})
