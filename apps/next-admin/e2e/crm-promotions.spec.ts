import { test, expect } from '@playwright/test'

test.describe('Admin — CRM Promotions Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/promotions', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('loads without JS errors and shows header', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await expect(page.locator('h1').or(page.locator('text=Public Promotions'))).toBeVisible()
    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('New Promotion form toggles correctly', async ({ page }) => {
    const newBtn = page.locator('button:has-text("Launch New Promo")')
    await expect(newBtn).toBeVisible()
    await newBtn.click()

    // Base form fields should be visible (section 1 heading)
    await expect(page.locator('text=1. Campaign')).toBeVisible()
    await expect(page.locator('input[placeholder="e.g. Summer Kickoff"]')).toBeVisible()

    // Toggle buttons (crm-toggle) expand additional sections
    const giveawayToggle = page.locator('button.crm-toggle').nth(1)
    await giveawayToggle.click()
    await expect(page.locator('text=Giveaway Item Name')).toBeVisible()

    const creditsToggle = page.locator('button.crm-toggle').nth(2)
    await creditsToggle.click()
    await expect(page.locator('text=Credit Type')).toBeVisible()
    
    // Test cancel
    await page.locator('button:has-text("Cancel")').click()
    await expect(page.locator('text=1. Campaign')).not.toBeVisible()
  })

  test('Delete promotion asks for confirmation', async ({ page }) => {
    let dialogHandled = false
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('WARNING: Deleting this promotion will immediately cancel any recurring credits')
      await dialog.dismiss()
      dialogHandled = true
    })

    await page.waitForSelector('.crm-table')
    const deleteBtns = page.locator('.crm-btn-danger-icon')
    
    // If there are existing promotions, test the delete flow
    if (await deleteBtns.count() > 0) {
      await deleteBtns.first().click()
      expect(dialogHandled).toBe(true)
    }
  })
})
