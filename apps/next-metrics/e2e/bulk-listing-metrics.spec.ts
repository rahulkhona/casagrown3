import { test, expect } from '@playwright/test'

test.describe('Next-Metrics — Bulk Listing Wizard Metrics', () => {
  test('Wizard Drop-offs view contains /list_bulk in wizard selector and loads without error', async ({ page }) => {
    await page.goto('/?tab=wizard')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1')).toContainText('Wizard Drop-offs')

    // Find the wizard dropdown selector uniquely by its option value
    const wizardSelect = page.locator('select:has(option[value="/list_bulk"])')
    await expect(wizardSelect).toBeVisible()

    const options = await wizardSelect.locator('option').allInnerTexts()
    const hasBulkOption = options.some(opt => opt.includes('/list_bulk'))
    expect(hasBulkOption).toBe(true)

    // Select /list_bulk and verify selector updates and funnel container renders
    await wizardSelect.selectOption('/list_bulk')
    await expect(wizardSelect).toHaveValue('/list_bulk')
    await expect(page.locator('body')).toContainText('Step-by-Step Funnel Completion')
  })
})
