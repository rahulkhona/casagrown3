import { test, expect } from '@playwright/test'

test.describe('CRM Bulk Listing Integrations', () => {
  test('Link Generator presets include /list_bulk', async ({ page }) => {
    await page.goto('/crm/link-generator', { waitUntil: 'networkidle' })
    await expect(page.locator('h1').first()).toContainText('Link Generator')

    // Find the base URL select dropdown in TrackingUrlBuilder
    const select = page.locator('select').first()
    await expect(select).toBeVisible()

    const options = await select.locator('option').allInnerTexts()
    const hasBulkOption = options.some(opt => opt.includes('/list_bulk'))
    expect(hasBulkOption).toBe(true)
  })

  test('Produce Demand Ad Creator modal supports /list_bulk preset', async ({ page }) => {
    await page.goto('/crm/produce-demand', { waitUntil: 'networkidle' })
    await page.waitForSelector('h1', { state: 'visible', timeout: 10000 })

    // Open ad creator if produce card exists
    const createAdBtns = page.locator('button:has-text("Create Ad"), button:has-text("Create Post")')
    if (await createAdBtns.first().isVisible({ timeout: 4000 }).catch(() => false)) {
      await createAdBtns.first().click()
      await expect(page.locator('text=Bulk Listing (/list_bulk)').first()).toBeVisible({ timeout: 5000 })
    }
  })
})
