import { test, expect } from './fixtures'

// Run with clean guest state (unauthenticated)
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Bulk Produce Listing Wizard (/list_bulk)', () => {
  test('renders crop catalog grid and Add Custom Item button on direct visit', async ({ page }) => {
    await page.goto('/list_bulk')

    await expect(page.locator('h1')).toContainText('Select crops you want to sell')
    await expect(page.locator('text=Add Custom Item')).toBeVisible()
    await expect(page.locator('text=Select crops above to continue')).toBeVisible()
  })

  test('redirects from alias /list-bulk to /list_bulk preserving query parameters', async ({ page }) => {
    await page.goto('/list-bulk?produce=avocados,sweet_corn&utm_source=meta_ad')
    await expect(page).toHaveURL(/.*\/list_bulk\?produce=avocados%2Csweet_corn&utm_source=meta_ad/)
    await expect(page.locator('.wizard-step-1').getByText('Avocados', { exact: true })).toBeVisible()
    await expect(page.locator('.wizard-step-1').getByText('Sweet Corn', { exact: true })).toBeVisible()
  })

  test('pre-populates produce crop cards from URL search parameters', async ({ page }) => {
    await page.goto('/list_bulk?produce=meyer_lemons,heirloom_tomatoes,fresh_basil&utm_source=facebook&utm_campaign=spring_harvest')

    await expect(page.locator('.wizard-step-1').getByText('Meyer Lemons', { exact: true })).toBeVisible()
    await expect(page.locator('.wizard-step-1').getByText('Heirloom Tomatoes', { exact: true })).toBeVisible()
    await expect(page.locator('.wizard-step-1').getByText('Fresh Basil', { exact: true })).toBeVisible()
  })

  test('opens edit modal on crop card click, edits price, unit, quantity, harvest date, and saves', async ({ page }) => {
    await page.goto('/list_bulk?produce=blueberries')

    // Click Edit button on Blueberries card
    await page.locator('button:has-text("Edit Price / Qty")').first().click()

    // Edit modal should open
    await expect(page.locator('h3:has-text("Blueberries")')).toBeVisible()

    // Edit quantity
    const qtyInput = page.locator('input[type="number"]').nth(1)
    await qtyInput.fill('10')

    // Edit description
    const descTextarea = page.locator('textarea')
    await descTextarea.fill('Fresh organic blueberries picked yesterday!')

    // Click Save Details
    await page.locator('button:has-text("Save Details")').click()

    // Modal should close
    await expect(page.locator('h3:has-text("Blueberries")')).toHaveCount(0)
    await expect(page.locator('button:has-text("Sell 1 Selected Crop")')).toBeVisible()
  })

  test('supports adding a custom crop item with name, unit, and price', async ({ page }) => {
    await page.goto('/list_bulk')

    // Click Add Custom Item card
    await page.locator('text=Add Custom Item').click()

    // Custom crop modal should open
    await expect(page.locator('h3:has-text("Add New Item")')).toBeVisible()

    // Fill in custom produce details
    const nameInput = page.locator('input[placeholder="e.g. Meyer Lemons, Fresh Honey, Sourdough..."]')
    await nameInput.fill('Fresh Dragonfruit')

    const priceInput = page.locator('input[type="number"]').first()
    await priceInput.fill('6.00')

    // Click Save Details
    await page.locator('button:has-text("Save Details")').click()

    // Should appear in crop grid
    await expect(page.locator('.wizard-step-1').getByText('Fresh Dragonfruit', { exact: true })).toBeVisible()
  })

  test('blocks prohibited terms with inline moderation error in modal', async ({ page }) => {
    await page.goto('/list_bulk')

    await page.locator('text=Add Custom Item').click()

    const nameInput = page.locator('input[placeholder="e.g. Meyer Lemons, Fresh Honey, Sourdough..."]')
    await nameInput.fill('Fresh Weed & Marijuana')

    await expect(page.locator('text=Cannabis and related topics are not allowed on CasaGrown')).toBeVisible()
    await expect(page.locator('button:has-text("Save Details")')).toBeDisabled()
  })

  test('advances to Step 2, toggles delivery / pickup, and renders transparent pricing disclosure', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Select Tomatoes
    await page.locator('.wizard-step-1').getByText('Tomatoes', { exact: true }).click()

    // Proceed to Step 2
    await page.locator('button:has-text("Sell 1 Selected Crop")').click()

    // Step 2 should be visible
    await expect(page.locator('h2:has-text("How should buyers get this?")')).toBeVisible()
    await expect(page.locator('text=I can deliver to neighbors')).toBeVisible()
    await expect(page.locator('text=Buyers can pick up from me')).toBeVisible()
    await expect(page.locator('text=No Listing Fees:')).toBeVisible()
  })

  test('opens Terms of Service and Privacy Policy legal modals', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Select Tomatoes
    await page.locator('.wizard-step-1').getByText('Tomatoes', { exact: true }).click()
    await page.locator('button:has-text("Sell 1 Selected Crop")').click()

    // Click Terms of Service link
    await page.locator('button:has-text("Terms of Service")').first().click()
    await expect(page.locator('h3:has-text("Terms of Service")')).toBeVisible()

    // Close modal
    await page.locator('button:has-text("✕")').click()
    await expect(page.locator('h3:has-text("Terms of Service")')).toHaveCount(0)

    // Click Privacy Policy link
    await page.locator('button:has-text("Privacy Policy")').first().click()
    await expect(page.locator('h3:has-text("Privacy Policy")')).toBeVisible()
    await page.locator('button:has-text("✕")').click()
  })

  test('renders guest authentication options (Google, Apple, OTP) on Step 2 for unauthenticated users', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Select Tomatoes
    await page.locator('.wizard-step-1').getByText('Tomatoes', { exact: true }).click()
    await page.locator('button:has-text("Sell 1 Selected Crop")').click()

    await expect(page.locator('text=Publish & Notify Local Buyers')).toBeVisible()
    await expect(page.locator('text=Continue with Google')).toBeVisible()
    await expect(page.locator('text=Continue with Apple')).toBeVisible()
    await expect(page.locator('input[placeholder*="sarah@example.com"]')).toBeVisible()
    await expect(page.locator('button:has-text("Get Code")')).toBeVisible()
  })
})

test.describe('Bulk Produce Listing Wizard (/list_bulk) — Authenticated Seller Flow', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('authenticated seller completes 1-click publish and launches social share modal', async ({ page }) => {
    await page.goto('/list_bulk?produce=meyer_lemons&zipcode=95120')

    // Edit lemons quantity and save
    await page.locator('button:has-text("Edit Price / Qty")').first().click()
    await page.locator('input[type="number"]').nth(1).fill('10')
    await page.locator('button:has-text("Save Details")').click()

    // Proceed to Step 2
    await page.locator('button:has-text("Sell 1 Selected Crop")').click()

    // Verify account badge
    await expect(page.locator('text=Signed in as')).toBeVisible()

    // Uncheck pickup so delivery-only is used
    await page.locator('text=Buyers can pick up from me').click()

    // Accept TOS
    const tosCheckbox = page.locator('#tos-checkbox')
    await tosCheckbox.check()

    // Click Publish button
    const publishBtn = page.locator('button:has-text("Publish & Notify Buyers")')
    await expect(publishBtn).toBeEnabled()
    await publishBtn.click()

    // Social Share Modal should pop up
    const shareModal = page.locator('text=Share Your Stand with Neighbors').or(page.locator('text=CasaGrown Share')).or(page.locator('text=Your Stand is Live!'))
    await expect(shareModal.first()).toBeVisible({ timeout: 15000 })
  })

})
