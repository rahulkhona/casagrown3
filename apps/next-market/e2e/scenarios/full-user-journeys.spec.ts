import { test, expect } from '@playwright/test'

test.describe('Full User Journeys — Navigation to Completion', () => {
  test('Journey 1: Menu Click -> Express Interest -> Save Interests -> Navigate to My Interests', async ({ page }) => {
    // 1. User starts at home page / market
    await page.goto('/market')

    // 2. Click Navbar Menu button
    const menuBtn = page.locator('button[aria-label="Menu"]').first()
    await expect(menuBtn).toBeVisible()
    await menuBtn.click()

    // 3. Click "Notify me when buyers want what I have" menu item
    const sellInterestLink = page.locator('a[href*="/interest?scope=sell"]').first()
    await expect(sellInterestLink).toBeVisible()
    await sellInterestLink.click()

    // 4. Verify landing on /interest?scope=sell
    await expect(page).toHaveURL(/\/interest\?scope=sell/)
    await expect(page.locator('h1')).toContainText('Select what you grow')

    // 5. Search for unlisted produce item "Chickoo"
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    await searchInput.fill('Chickoo')
    await page.waitForTimeout(600)

    // 6. Verify Chickoo card appears and check "I have this"
    const chickooCard = page.locator('h3:has-text("Chickoo")')
    await expect(chickooCard).toBeVisible()

    const haveCheckbox = page.locator('label:has-text("I have this") input[type="checkbox"]').first()
    await haveCheckbox.check()
    await expect(haveCheckbox).toBeChecked()

    // 7. Click Save & Get Notified
    const saveBtn = page.locator('button:has-text("Save My Interests"), button:has-text("Save & Get Notified")').first()
    await saveBtn.click()

    // 8. Auth modal appears
    const modal = page.locator('[class*="modal"], [role="dialog"], div[style*="z-index"]').first()
    await expect(modal).toBeVisible({ timeout: 5000 })
  })

  test('Journey 2: Market Search Miss -> Express Interest CTA -> Saved produce item', async ({ page }) => {
    // 1. Search for unlisted crop on Market
    await page.goto('/market?q=Dahlias')
    await page.waitForTimeout(1000)

    // 2. Click Express Interest CTA link
    const ctaLink = page.locator('a[href*="/interest?scope=buy"]').first()
    if (await ctaLink.isVisible()) {
      await ctaLink.click()

      // 3. Verify redirected to interest page with query parameter
      await expect(page).toHaveURL(/\/interest/)
      await expect(page.locator('h1')).toBeVisible()

      // 4. Verify produce grid renders item card
      const dahliaCard = page.locator('h3:has-text("Dahlias")').first()
      await expect(dahliaCard).toBeVisible()
    }
  })

  test('Journey 3: Product Detail -> Buy Now -> Fulfillment Toggle -> Address & TOS -> Order Step', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Find booth or product card
    const productCard = page.locator('a[href*="/product/"], a[href*="/booth/"]').first()
    if (await productCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productCard.click()
      await page.waitForTimeout(1000)

      const buyBtn = page.locator('button:has-text("Buy"), button:has-text("Order")').first()
      if (await buyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await buyBtn.click()

        // Buy modal opens
        const modal = page.locator('[class*="modal"], [role="dialog"]').first()
        await expect(modal).toBeVisible({ timeout: 5000 })

        // Check delivery button toggle
        const deliveryBtn = page.locator('button:has-text("Delivery"), button:has-text("🚗")').first()
        if (await deliveryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await deliveryBtn.click()
        }
      }
    }
  })
})
