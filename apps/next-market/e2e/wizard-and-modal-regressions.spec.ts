import { test, expect } from './fixtures'

test.describe('Wizard and Modal Regression Tests (Authed)', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test.beforeEach(async ({ page }) => {
    // Force mobile viewport to test BottomNav responsive behavior and layout spacing
    await page.setViewportSize({ width: 375, height: 812 })
  })

  test('logged-in user has profile address pre-populated and web bottom nav visible', async ({ page }) => {
    // 1. Check that web BottomNav is visible on /create-listing (padding prevents overlap with wizard buttons)
    await page.goto('/create-listing')
    await expect(page.locator('h2:has-text("Create Your Product Listing")')).toBeVisible()
    await expect(page.locator('nav[class*="bottomNav"]')).toBeVisible()

    // 2. Fill Step 1 Basics
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('E2E Prepopulated Tomatoes')
    
    // Wait for categories to load from DB before selecting
    const categorySelect = page.locator('select', { has: page.locator('option:has-text("Select Category")') })
    await expect(categorySelect.locator('option')).not.toHaveCount(1, { timeout: 10000 })
    await categorySelect.selectOption({ index: 1 })
    
    // Click Next
    await page.getByRole('button', { name: 'Next →' }).click()

    // 3. Verify Step 2 Fulfillment pre-population
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 })

    // Check that street, city, zip are automatically pre-populated from seeded profile
    const streetVal = await page.locator('input[placeholder="Street Address"]').first().inputValue()
    const cityVal = await page.locator('input[placeholder="City"]').first().inputValue()
    const zipVal = await page.locator('input[placeholder="ZIP"]').first().inputValue()

    expect(streetVal).toBeTruthy()
    expect(cityVal).toBeTruthy()
    expect(zipVal).toBeTruthy()

    // 4. Select a delivery day and a pickup day to satisfy fulfillment validation
    // (since the seeded stand has no weekly defaults set, we must select them manually)
    await page.locator('button:has-text("Today")').first().click()
    await page.locator('button:has-text("Today")').nth(1).click()

    // 5. Verify that the Next button is clickable and not obscured
    const nextBtn = page.getByRole('button', { name: 'Next →' })
    await expect(nextBtn).toBeVisible()
    await nextBtn.click()

    // Verify we proceed to Step 3
    await expect(page.locator('h2:has-text("Set Your Price")')).toBeVisible({ timeout: 10000 })
  })

  test('native-app class hiding bottom nav test on other routes', async ({ page }) => {
    // Navigate to /market (where bottom nav is normally visible)
    await page.goto('/market')
    
    // Web bottom nav should be visible by default on mobile viewport
    const bottomNav = page.locator('nav[class*="bottomNav"]')
    await expect(bottomNav).toBeVisible()

    // Inject native-app class to simulate Expo WebView wrapper
    await page.evaluate(() => {
      document.documentElement.classList.add('native-app')
    })

    // In this app, we still want web bottom nav visible inside the native wrapper
    // since there is no native tab bar. Let's make sure it remains visible.
    await expect(bottomNav).toBeVisible()
  })
})

test.describe('QuickSetupModal Tab Switcher (Guest)', () => {
  // Clear authenticated state to trigger onboarding modal
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
  })

  test('onboarding gate triggers QuickSetupModal with tabbed switcher', async ({ page }) => {
    // Navigate to a protected route to trigger the onboarding modal
    await page.goto('/orders')

    // QuickSetupModal should open
    const modal = page.locator('[data-testid="quick-setup-step-1"]')
    await expect(modal).toBeVisible({ timeout: 10000 })

    // Tab switcher should be visible
    const signUpTab = page.getByRole('button', { name: 'Sign Up' })
    const signInTab = page.getByRole('button', { name: 'Sign In' })
    await expect(signUpTab).toBeVisible()
    await expect(signInTab).toBeVisible()

    // Verify Sign Up fields are displayed by default (Full Name, Street Address, etc.)
    await expect(page.locator('input[name="fullName"]')).toBeVisible()
    await expect(page.locator('input[name="street"]')).toBeVisible()

    // Click Sign In tab
    await signInTab.click()

    // Verify Name and Address fields are hidden, leaving only Email
    await expect(page.locator('input[name="fullName"]')).not.toBeVisible()
    await expect(page.locator('input[name="street"]')).not.toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()

    // Click Sign Up tab back
    await signUpTab.click()
    await expect(page.locator('input[name="fullName"]')).toBeVisible()
  })
})
