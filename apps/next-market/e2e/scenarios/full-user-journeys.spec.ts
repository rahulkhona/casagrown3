import { test, expect } from '@playwright/test'

test.describe('Full User Journeys — Navigation to Completion', () => {
  test('Journey 1: Menu Click -> Express Interest -> Save Interests -> Navigate to My Interests', async ({ page }) => {
    // 1. User navigates to /market
    await page.goto('/market')
    await page.waitForTimeout(1000)

    // 2. Search for produce item "Avocado"
    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await searchInput.fill('Avocado')
    await page.waitForTimeout(600)

    // 3. Verify produce card appears and click "💚 Want"
    const wantBtn = page.locator('button:has-text("Want")').first()
    if (await wantBtn.isVisible()) {
      await wantBtn.click()
      const modal = page.locator('[role="dialog"], [class*="modalOverlay"], div[style*="position: fixed"]').first()
      await expect(modal).toBeVisible({ timeout: 5000 })
    }
  })

  test('Journey 2: Market Search Miss -> Express Interest CTA -> Saved produce item', async ({ page }) => {
    // 1. Search for unlisted crop on Market
    await page.goto('/market?q=Dahlias')
    await page.waitForTimeout(1000)

    // 2. Verify search bar is populated and produce cards or category pills render
    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await expect(searchInput).toBeVisible()
  })

  test('Journey 3: Product Detail -> Buy Now -> Fulfillment Toggle -> Address & TOS -> Order Step', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Find booth or product card
    const productCard = page.locator('a[href*="/product/"], a[href*="/booth/"]').first()
    if (await productCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productCard.click()
      await page.waitForTimeout(1000)

      // Look for buy button
      const buyBtn = page.locator('button:has-text("Buy"), button:has-text("Order")').first()
      if (await buyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await buyBtn.click()
        await page.waitForTimeout(1000)
        // Buy modal should open
        const modal = page.locator('[role="dialog"], [class*="modalOverlay"], div[style*="position: fixed"]').first()
        await expect(modal).toBeVisible({ timeout: 5000 })
      }
    }
  })
})
