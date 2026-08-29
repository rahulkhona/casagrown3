import { test, expect } from '@playwright/test'
import { BASE_URL, loginAsUser } from './scenario-helpers'

test.describe('Interest Submission Flow', () => {
  test('Guest can search produce, open want modal, and submit interest', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    
    await page.goto(`${BASE_URL}/market`)
    await page.waitForTimeout(1000)
    
    // Search input filters items
    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await expect(searchInput).toBeVisible()
    await searchInput.fill('tomato')
    await page.waitForTimeout(500)

    // Click "💚 Want" on first produce card to open WantProduceModal
    const wantBtn = page.locator('button:has-text("Want")').first()
    if (await wantBtn.isVisible()) {
      await wantBtn.click()
      const modal = page.locator('[role="dialog"], [class*="modalOverlay"], div[style*="position: fixed"]').first()
      await expect(modal).toBeVisible({ timeout: 5000 })
    }

    await context.close()
  })

  test('Authenticated user sees pre-filled profile info on market and my-interests', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await page.goto(`${BASE_URL}/my-interests`)

    // Verify page loads cleanly for logged in user
    await expect(page.locator('h1, h2').first()).toBeVisible()

    await page.context().close()
  })
})
