import { test, expect } from '@playwright/test'

test.describe('Admin — CRM Create Listing Bandits Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the bandit experiments page
    await page.goto('/crm/create-listing-bandits', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors and displays header', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    // Assert main header is visible
    await expect(page.locator('h1:has-text("Create Listing Bandits")')).toBeVisible()
    
    // Assert sub-text is visible
    await expect(page.locator('text=Configure Thompson Sampling parameters')).toBeVisible()

    // Expect no hydration or general runtime JS errors
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('MAB variants table displays correct elements and is editable', async ({ page }) => {
    // Verify variants table is loaded
    const table = page.locator('.crm-table')
    await expect(table).toBeVisible()

    // Assert both variants slugs are displayed
    await expect(page.locator('text=/create-listing-wizard')).toBeVisible()
    await expect(page.locator('text=/create-listing-simple')).toBeVisible()

    // Find and modify success prior input for the first variant (wizard)
    const inputs = page.locator('input[type="number"]')
    await expect(inputs.first()).toBeVisible()
    
    // Clear and fill a new value (e.g. 15)
    await inputs.first().click()
    await inputs.first().fill('15')

    // Find and toggle the active status toggle button for the first variant
    const toggleBtn = page.locator('.crm-toggle').first()
    await expect(toggleBtn).toBeVisible()
    
    // Get initial class list or state
    const isInitiallyActive = await toggleBtn.evaluate(el => el.classList.contains('active'))
    
    // Toggle it
    await toggleBtn.click()
    
    // Assert the class changed
    const isNowActive = await toggleBtn.evaluate(el => el.classList.contains('active'))
    expect(isNowActive).not.toBe(isInitiallyActive)
  })

  test('Save Configuration triggers success toast', async ({ page }) => {
    // Click the Save button
    const saveBtn = page.locator('button:has-text("Save Configuration")')
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Check for success toast popup
    const toast = page.locator('.crm-toast.success')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('Configuration saved successfully!')
  })

  test('Reset stats triggers confirmation dialog', async ({ page }) => {
    let dialogHandled = false
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Are you sure you want to reset all Views and Conversions stats back to 0')
      await dialog.dismiss() // Cancel the reset to prevent database state disruption
      dialogHandled = true
    })

    // Click the Reset stats button
    const resetBtn = page.locator('button:has-text("Reset Views & Conversions")')
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()

    // Assert that the dialog handler intercepted the native browser confirm
    expect(dialogHandled).toBe(true)
  })

  test('Traffic Allocation Simulator calculates and renders results', async ({ page }) => {
    // Locate the simulator run button
    const simBtn = page.locator('button:has-text("Run Assignment Simulation")')
    await expect(simBtn).toBeVisible()
    await simBtn.click()

    // Verify simulation results header becomes visible
    const resultsHeader = page.locator('text=Estimated Traffic Distribution:')
    await expect(resultsHeader).toBeVisible({ timeout: 5000 })

    // Verify progress bars or results are rendered
    await expect(page.locator('.crm-form-card >> text=Standard step-by-step listing wizard')).toBeVisible()
    await expect(page.locator('.crm-form-card >> text=Simple text and photo wizard')).toBeVisible()
  })
})
