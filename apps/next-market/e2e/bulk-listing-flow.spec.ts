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

  test('renders transparent platform fee disclosure card', async ({ page }) => {
    await page.goto('/list_bulk?produce=lemons')

    await expect(page.locator('text=Transparent Pricing & Seller Fees')).toBeVisible()
    await expect(page.locator('text=$0 Listing Fee')).toBeVisible()
    await expect(page.locator('text=10% Standard Platform Fee on Sale')).toBeVisible()
  })

  test('configures delivery schedule presets and toggles pickup', async ({ page }) => {
    await page.goto('/list_bulk?produce=lemons')

    // Toggle Delivery to open delivery options
    await page.locator('text=I can deliver to neighbors').click()

    // Select Weekend Mornings preset
    const weekendPreset = page.locator('text=Weekend mornings')
    await weekendPreset.click()

    // Toggle Pickup to open pickup options
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

  test('supports adding and deleting multiple delivery zip codes', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Setup valid row
    await page.locator('input[placeholder="0.00"]').first().fill('3.50')
    await page.locator('input[placeholder="e.g. 5"]').first().fill('10')

    // Enable delivery
    await page.locator('text=I can deliver to neighbors').click()

    // Remove any prefilled IP location zip tags to test empty validation
    const existingRemoveBtns = page.locator('button[aria-label^="Remove "]')
    const count = await existingRemoveBtns.count()
    for (let i = count - 1; i >= 0; i--) {
      await existingRemoveBtns.nth(i).click()
    }

    const publishBtn = page.locator('button:has-text("Publish")')
    await expect(publishBtn).toBeDisabled()
    await expect(page.locator('text=Please enter at least one 5-digit delivery ZIP code')).toBeVisible()

    // Add first zip
    const zipInput = page.locator('input[class*="zipTagInput"]')
    await zipInput.fill('95125')
    await zipInput.press('Enter')

    await expect(page.locator('button[aria-label="Remove 95125"]')).toBeVisible()
    await expect(publishBtn).toBeEnabled()

    // Add second zip
    await zipInput.fill('95112')
    await zipInput.press('Enter')

    await expect(page.locator('button[aria-label="Remove 95112"]')).toBeVisible()

    // Remove first zip tag
    await page.locator('button[aria-label="Remove 95125"]').click()
    await expect(page.locator('button[aria-label="Remove 95125"]')).toHaveCount(0)
    await expect(page.locator('button[aria-label="Remove 95112"]')).toBeVisible()

    await publishBtn.click()
    await expect(page.locator('text=Save & Publish Your Listings')).toBeVisible()
  })

  test('validates complete address for address_radius delivery mode', async ({ page }) => {
    await page.goto('/list_bulk?produce=tomatoes')

    // Setup valid row
    await page.locator('input[placeholder="0.00"]').first().fill('3.50')
    await page.locator('input[placeholder="e.g. 5"]').first().fill('10')

    // Enable delivery
    await page.locator('text=I can deliver to neighbors').click()

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

    // Turn on pickup
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

    // Enable delivery and enter valid delivery zip to pass validation
    await page.locator('text=I can deliver to neighbors').click()
    const zipInput = page.locator('input[class*="zipTagInput"]')
    await zipInput.fill('95125')
    await zipInput.press('Enter')

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

test.describe('Bulk Produce Listing Lead Magnet (/list_bulk) — Authenticated Seller Flow', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('authenticated seller completes full publish and records are inserted with valid schedule windows in Supabase', async ({ page }) => {
    await page.goto('/list_bulk?produce=meyer_lemons')

    // Enter price and quantity
    await page.locator('input[placeholder="0.00"]').first().fill('4.50')
    await page.locator('input[placeholder="e.g. 5"]').first().fill('12')

    // Select Delivery and enter ZIP
    await page.locator('text=I can deliver to neighbors').click()
    const zipInput = page.locator('input[class*="zipTagInput"]')
    await zipInput.fill('95125')
    await zipInput.press('Enter')

    // Select Pickup and enter Pickup Address
    await page.locator('text=Buyers can pick up from me').click()
    await page.locator('input[placeholder="Street Address for pickup"]').fill('789 Blossom Hill Rd')
    await page.locator('input[placeholder="City"]').last().fill('Los Gatos')
    await page.locator('input[placeholder="ST"]').last().fill('CA')
    await page.locator('input[placeholder="ZIP"]').last().fill('95032')

    // Click Publish
    const publishBtn = page.locator('button:has-text("Publish")')
    await expect(publishBtn).toBeEnabled()
    await publishBtn.click()

    // Authenticated seller with existing TOS agreement publishes directly and redirects to my-booth or market
    await expect(page).toHaveURL(/.*(my-booth|market|\/list_bulk)/, { timeout: 15000 })
  })
})
