import { test, expect } from './fixtures'

// Run with clean guest state (unauthenticated)
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Bulk Produce Listing Lead Magnet (/list_bulk)', () => {
  test('renders empty state and headline when visited directly, and allows adding item', async ({ page }) => {
    await page.goto('/list_bulk')

    await expect(page.locator('h1')).toContainText('List Your Backyard Harvest')
    await expect(page.locator('text=No produce items added yet')).toBeVisible()

    // Add first produce item
    await page.locator('button:has-text("Add Produce Item")').click()
    const nameInputs = page.locator('input[placeholder="e.g. Meyer Lemons"]')
    await expect(nameInputs).toHaveCount(1)

    // Delivery toggle should be present
    const deliveryToggle = page.locator('text=I can deliver to neighbors')
    await expect(deliveryToggle).toBeVisible()
  })

  test('redirects from alias /list-bulk to /list_bulk preserving query parameters', async ({ page }) => {
    await page.goto('/list-bulk?produce=avocados,sweet_corn&utm_source=meta_ad')
    await expect(page).toHaveURL(/.*\/list_bulk\?produce=avocados%2Csweet_corn&utm_source=meta_ad/)
    await expect(page.locator('input[value="Avocados"]')).toBeVisible()
    await expect(page.locator('input[value="Sweet Corn"]')).toBeVisible()
  })

  test('pre-populates produce rows from URL search parameters', async ({ page }) => {
    await page.goto('/list_bulk?produce=meyer_lemons,heirloom_tomatoes,fresh_basil&utm_source=facebook&utm_campaign=spring_harvest')

    await expect(page.locator('input[value="Meyer Lemons"]')).toBeVisible()
    await expect(page.locator('input[value="Heirloom Tomatoes"]')).toBeVisible()
    await expect(page.locator('input[value="Fresh Basil"]')).toBeVisible()
  })

  test('supports adding and deleting produce rows dynamically', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes,lemons')

    // Click Add Another Produce
    const addBtn = page.locator('button:has-text("Add Another Produce")')
    await addBtn.click()

    // 3 rows should exist now
    const nameInputs = page.locator('input[placeholder="e.g. Meyer Lemons"]')
    await expect(nameInputs).toHaveCount(3)

    // Type a name in the new row
    await nameInputs.nth(2).fill('Rosemary')
    await expect(nameInputs.nth(2)).toHaveValue('Rosemary')

    // Delete the first row
    const deleteBtns = page.locator('button[title="Remove item"]')
    await deleteBtns.first().click()

    await expect(nameInputs).toHaveCount(2)
  })

  test('toggles Free Giveaway status on item', async ({ page }) => {
    await page.goto('/list_bulk?produce=lemons')

    const makeFreeCheckbox = page.locator('text=Make Free').first()
    await makeFreeCheckbox.click()

    await expect(page.locator('text=FREE').first()).toBeVisible()
  })

  test('blocks prohibited terms with inline content moderation error badge', async ({ page }) => {
    await page.goto('/list_bulk?produce=lemons')

    const firstNameInput = page.locator('input[placeholder="e.g. Meyer Lemons"]').first()
    await firstNameInput.fill('Backyard Weed & Marijuana')

    await expect(page.locator('text=Cannabis and related topics are not allowed on CasaGrown')).toBeVisible()
  })

  test('configures delivery schedule presets and toggles pickup', async ({ page }) => {
    await page.goto('/list_bulk?produce=lemons')

    // Select Weekend Mornings preset
    const weekendPreset = page.locator('text=Weekend mornings')
    await weekendPreset.click()

    // Toggle Pickup
    const pickupToggle = page.locator('text=Buyers can pick up from me')
    await pickupToggle.click()

    await expect(page.locator('text=Pickup Address *')).toBeVisible()
  })

  test('auto-selects row when both quantity and price are entered', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    const firstRowCheckbox = page.locator('input[type="checkbox"]').first()
    await expect(firstRowCheckbox).not.toBeChecked()

    // Fill price and quantity
    await page.locator('input[placeholder="0.00"]').first().fill('3.50')
    await page.locator('input[placeholder="e.g. 5"]').first().fill('10')

    // Should be automatically selected
    await expect(firstRowCheckbox).toBeChecked()
  })

  test('validates 5-digit zipcode for delivery', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Setup valid row
    await page.locator('input[placeholder="0.00"]').first().fill('3.50')
    await page.locator('input[placeholder="e.g. 5"]').first().fill('10')

    // Default is zipcode delivery, let's enter an invalid zip
    const zipInput = page.locator('input[placeholder="e.g. 94024"]')
    await zipInput.fill('123')

    const publishBtn = page.locator('button:has-text("Publish")')
    await expect(publishBtn).toBeDisabled()
    await expect(page.locator('text=Please enter a 5-digit delivery ZIP code')).toBeVisible()

    // Enter valid 5-digit zip
    await zipInput.fill('95125')
    await expect(publishBtn).toBeEnabled()

    await publishBtn.click()
    await expect(page.locator('text=Save & Publish Your Listings')).toBeVisible()
  })

  test('validates complete address for address_radius delivery mode', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Setup valid row
    await page.locator('input[placeholder="0.00"]').first().fill('3.50')
    await page.locator('input[placeholder="e.g. 5"]').first().fill('10')

    // Switch to address radius mode
    await page.locator('text=Base Address + Delivery Radius').click()

    const publishBtn = page.locator('button:has-text("Publish")')
    await expect(publishBtn).toBeDisabled()
    await expect(page.locator('text=Please enter your complete home/farm address')).toBeVisible()

    // Fill address
    await page.locator('input[placeholder="Base Street Address for deliveries"]').fill('123 Farm Ln')
    await page.locator('input[placeholder="City"]').first().fill('San Jose')
    await page.locator('input[placeholder="ST"]').first().fill('CA')
    await page.locator('input[placeholder="ZIP"]').first().fill('95125')

    await expect(publishBtn).toBeEnabled()
    await publishBtn.click()
    await expect(page.locator('text=Save & Publish Your Listings')).toBeVisible()
  })

  test('validates complete address for pickup fulfillment mode', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Setup valid row
    await page.locator('input[placeholder="0.00"]').first().fill('3.50')
    await page.locator('input[placeholder="e.g. 5"]').first().fill('10')

    // Turn off delivery, turn on pickup
    await page.locator('text=I can deliver to neighbors').click()
    await page.locator('text=Buyers can pick up from me').click()

    const publishBtn = page.locator('button:has-text("Publish")')
    await expect(publishBtn).toBeDisabled()
    await expect(page.locator('text=Please enter your complete pickup address')).toBeVisible()

    // Fill pickup address
    await page.locator('input[placeholder="Street Address for pickup"]').fill('456 Market St')
    await page.locator('input[placeholder="City"]').last().fill('San Jose')
    await page.locator('input[placeholder="ST"]').last().fill('CA')
    await page.locator('input[placeholder="ZIP"]').last().fill('95125')

    await expect(publishBtn).toBeEnabled()
    await publishBtn.click()
    await expect(page.locator('text=Save & Publish Your Listings')).toBeVisible()
  })

  test('opens quick sign-in & TOS modal when guest clicks Publish', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Enter quantity & price for first item to make it valid
    await page.locator('input[placeholder="e.g. 5"]').first().fill('6')
    await page.locator('input[placeholder="0.00"]').first().fill('2.00')

    // Enter valid delivery zip to pass validation
    await page.locator('input[placeholder="e.g. 94024"]').fill('95125')

    // Click Publish
    const publishBtn = page.locator('button:has-text("Publish")')
    await expect(publishBtn).toBeEnabled()
    await publishBtn.click()

    // Auth modal should open
    await expect(page.locator('text=Save & Publish Your Listings')).toBeVisible()
    await expect(page.locator('text=Continue with Google')).toBeVisible()
    await expect(page.locator('text=Continue with Apple')).toBeVisible()
    await expect(page.locator('input[placeholder="sarah@example.com"]')).toBeVisible()
  })
})
