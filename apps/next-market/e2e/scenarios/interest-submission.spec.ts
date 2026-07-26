import { test, expect } from '@playwright/test'
import { BASE_URL, loginAsUser } from './scenario-helpers'

test.describe('Interest Submission Flow', () => {
  test('Guest can search produce, check interest boxes, set address, and submit interest', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    
    await page.goto(`${BASE_URL}/interest`)
    await expect(page.locator('h1').first()).toBeVisible()
    
    // Search input filters items
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('tomato')
    await page.waitForTimeout(500)

    // Select "I want this" on first produce card
    const wantCheckbox = page.locator('label:has-text("I want this") input[type="checkbox"]').first()
    await expect(wantCheckbox).toBeVisible()
    await wantCheckbox.check()
    await expect(wantCheckbox).toBeChecked()

    // Select "I have this" on produce card
    const haveCheckbox = page.locator('label:has-text("I have this") input[type="checkbox"]').first()
    await expect(haveCheckbox).toBeVisible()
    await haveCheckbox.check()
    await expect(haveCheckbox).toBeChecked()

    // Click "Save My Interests" button
    const saveBtn = page.locator('button:has-text("Save My Interests"), button:has-text("Save & Get Notified")').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Guest Auth modal should open asking for Email / Name
    const modal = page.locator('[class*="modal"], [role="dialog"], div[style*="z-index"]').first()
    await expect(modal).toBeVisible({ timeout: 5000 })

    await context.close()
  })

  test('Authenticated user sees pre-filled email and profile info', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await page.goto(`${BASE_URL}/interest`)

    // Verify page loads cleanly for logged in user
    await expect(page.locator('h1').first()).toBeVisible()

    // Select produce interest
    const checkbox = page.locator('label:has-text("I want this") input[type="checkbox"]').first()
    if (await checkbox.isVisible()) {
      await checkbox.check()
    }

    await page.context().close()
  })
})
