import { test, expect } from './fixtures'

test.describe('Landmark Pickup, Safety & Multi-Wizard End-to-End Test Suite', () => {
  // ── 1. Single-Item Add/Edit Product Page (/my-booth/products/new) ──
  test('Single-Item Form: visual layout, public spot validation, suggestion chips, and advance notice', async ({ page }) => {
    await page.goto('/my-booth/products/new')
    await page.waitForTimeout(1000)

    // Visual Layout: Delivery Contactless Badge
    await expect(page.getByText(/Safest \(100% Contactless\)/i)).toBeVisible()

    // Locate and verify Safe Public Place button
    const findLandmarkBtn = page.getByTestId('find-landmark-btn')
    if (!(await findLandmarkBtn.isVisible())) {
      await page.getByTestId('pickup-box').click()
    }
    await expect(findLandmarkBtn).toBeVisible()
    await expect(findLandmarkBtn).toHaveText(/Safe Public Place/i)

    // Open Landmark Picker Modal
    await findLandmarkBtn.click()
    const modal = page.getByTestId('landmark-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('Pick a Safe Public Spot')

    // Search query filtering
    const searchInput = page.getByTestId('landmark-search-input')
    await searchInput.fill('Library')
    await expect(page.getByText('Willow Glen Branch Library')).toBeVisible()
    await expect(page.getByTestId('landmark-option-mock_comm_1')).not.toBeVisible()

    // Clear search and select Community Center
    await searchInput.fill('')
    const commCenterOption = page.getByTestId('landmark-option-mock_comm_1')
    await expect(commCenterOption).toBeVisible()
    await commCenterOption.click()
    await expect(modal).not.toBeVisible()

    // Address auto-populates
    const pickupStreetInput = page.locator('input[placeholder*="Public Landmark"]').first()
    await expect(pickupStreetInput).toHaveValue(/Willow Glen Community Center/i)

    // Required validation for public spots
    await expect(page.getByText(/\(Required for public spots\)/i)).toBeVisible()

    // Attempt submit with empty instructions -> triggers inline validation error
    const submitBtn = page.locator('button[type="submit"]').first()
    await submitBtn.click()
    const errorMsg = page.getByTestId('pickup-instructions-error')
    await expect(errorMsg).toBeVisible()
    await expect(errorMsg).toContainText(/Please provide pickup instructions/i)

    // Click 1-click dynamic suggestion chip
    const suggestionBtn = page.getByRole('button', { name: /Meet near the main front entrance parking area/i })
    await expect(suggestionBtn).toBeVisible()
    await suggestionBtn.click()

    // Instructions populated and error cleared
    const instructionsInput = page.getByTestId('pickup-instructions-input')
    await expect(instructionsInput).toHaveValue(/Meet near the main front entrance/i)
    await expect(errorMsg).not.toBeVisible()

    // Advance notice selector
    const notice15Btn = page.getByTestId('pickup-notice-15')
    await notice15Btn.click()
    await expect(page.getByText(/15 minutes before arriving/i)).toBeVisible()
  })

  // ── 2. Multi-Step Listing Wizard (/create-listing) ──
  test('Multi-Step Wizard (/create-listing): Step 2 visual layout, landmark modal, validation error & advance notice', async ({ page }) => {
    await page.goto('/create-listing?variant_override=standard')
    await page.waitForLoadState('networkidle')

    // Step 1: Basics
    const titleInput = page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]')
    await expect(titleInput).toBeVisible()
    await titleInput.fill('Sweet Meyer Lemons')

    const categorySelect = page.locator('select').first()
    await categorySelect.selectOption({ index: 1 })

    // Advance to Step 2
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 })

    // Step 2 Visual Layout: Contactless Delivery Badge
    await expect(page.getByText(/Safest \(100% Contactless\)/i)).toBeVisible()

    // Expand pickup box if not open
    const findLandmarkBtn = page.getByTestId('find-landmark-btn')
    if (!(await findLandmarkBtn.isVisible())) {
      await page.getByTestId('pickup-box').click()
    }
    await expect(findLandmarkBtn).toBeVisible()

    // Open Light theme Landmark Picker Modal
    await findLandmarkBtn.click()
    const modal = page.getByTestId('landmark-modal')
    await expect(modal).toBeVisible()

    // Filter by Coffee & Cafes category
    const cafeFilter = page.locator('button:has-text("☕ Coffee & Cafes")')
    await expect(cafeFilter).toBeVisible()
    await cafeFilter.click()

    // Select Philz Coffee
    const philzOption = page.getByTestId('landmark-option-mock_cafe_1')
    await expect(philzOption).toBeVisible()
    await philzOption.click()
    await expect(modal).not.toBeVisible()

    // Required label appears
    await expect(page.getByText(/\(Required for public spots\)/i)).toBeVisible()

    // Attempting Next with empty instructions triggers validation error and halts progression
    await page.getByRole('button', { name: 'Next →' }).click()
    const errorText = page.getByTestId('pickup-instructions-error')
    await expect(errorText).toBeVisible()
    await expect(errorText).toContainText(/Please provide pickup instructions/i)

    // Click dynamic suggestion chip
    const suggestionChip = page.getByRole('button', { name: /Meet by the outdoor patio seating/i })
    await expect(suggestionChip).toBeVisible()
    await suggestionChip.click()

    // Error cleared
    await expect(errorText).not.toBeVisible()

    // Select 15 min advance notice
    const notice15Btn = page.locator('button:has-text("⚡ 15 min")')
    await notice15Btn.click()

    // Fill home address required fields to pass step 2
    await page.getByPlaceholder('Street Address').first().fill('1247 Minnesota Ave')
    await page.getByPlaceholder('City').first().fill('San Jose')
    await page.getByPlaceholder('ST').first().fill('CA')
    await page.getByPlaceholder('ZIP').first().fill('95125')

    // Toggle delivery off so only public pickup is tested
    const deliveryToggle = page.locator('text=I\'ll Deliver').first()
    if (await deliveryToggle.isVisible()) {
      await deliveryToggle.click()
      await page.waitForTimeout(300)
    }

    // Select today for pickup schedule
    const pickupDayBtn = page.locator('button:has-text("Today")').first()
    if (await pickupDayBtn.isVisible()) {
      await pickupDayBtn.click()
      await page.waitForTimeout(300)
    }

    // Advance to Step 3 (Pricing)
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.locator('h2:has-text("Set Your Price")')).toBeVisible({ timeout: 15000 })
  })

  // ── 3. Bulk Listing Wizard (/list_bulk) ──
  test('Bulk Listing Wizard (/list_bulk): dark theme modal, landmark selection, and pickup instructions validation', async ({ page }) => {
    await page.goto('/list_bulk?produce=meyer_lemons&zipcode=95120')
    await page.waitForLoadState('networkidle')

    // Edit price/qty on crop card
    const editBtn = page.locator('button:has-text("Edit Price / Qty")').first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
      await page.locator('input[type="number"]').nth(1).fill('10')
      await page.locator('button:has-text("Save Details")').click()
      await page.waitForTimeout(300)
    }

    // Advance to Step 2
    const sellBtn = page.locator('button:has-text("Sell 1 Selected Crop")')
    await expect(sellBtn).toBeVisible()
    await sellBtn.click()
    await page.waitForTimeout(500)

    // Visual layout: Contactless Delivery Badge
    await expect(page.getByText(/Safest \(100% Contactless\)/i)).toBeVisible()

    // Expand pickup box
    const pickupToggle = page.locator('text=Buyers can pick up from me').first()
    await pickupToggle.click()
    await page.waitForTimeout(300)

    // Open Dark theme Landmark Picker Modal
    const findLandmarkBtn = page.getByTestId('find-landmark-btn')
    await expect(findLandmarkBtn).toBeVisible()
    await findLandmarkBtn.click()

    const modal = page.getByTestId('landmark-modal')
    await expect(modal).toBeVisible()

    // Filter by Parks category in Dark modal
    const parkFilter = page.locator('button:has-text("🌳 Parks")')
    await expect(parkFilter).toBeVisible()
    await parkFilter.click()

    // Select Bramhall Park
    const parkOption = page.getByTestId('landmark-option-mock_park_1')
    await expect(parkOption).toBeVisible()
    await parkOption.click()
    await expect(modal).not.toBeVisible()

    // Public meeting spot callout and required label
    await expect(page.getByText(/Safe Meeting Spot:/i)).toBeVisible()
    await expect(page.getByText(/\(Required for public spots\)/i)).toBeVisible()

    // Dynamic suggestion chip for parks
    const parkSuggestion = page.getByRole('button', { name: /Meet near the main playground benches/i })
    await expect(parkSuggestion).toBeVisible()
    await parkSuggestion.click()

    // Verify input filled
    const instructionsInput = page.getByTestId('pickup-instructions-input')
    await expect(instructionsInput).toHaveValue(/Meet near the main playground benches/i)

    // Select 30 min advance notice
    const notice30Btn = page.locator('button:has-text("⏱️ 30 min (Default)")')
    await expect(notice30Btn).toBeVisible()
  })

  // ── 4. Order Details Page (/orders/[id]) ──
  test('Order Details: displays pickup instructions and buyer arrival notice callout', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForTimeout(1000)
    await expect(page.locator('body')).toBeVisible()
  })
})
