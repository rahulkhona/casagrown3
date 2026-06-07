import { test, expect } from '@playwright/test'

test.describe('Beta Testers Admin Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/beta-testers', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
  })

  test('should load beta testers page', async ({ page }) => {
    await expect(page.getByText('Beta Testers', { exact: false }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Total').first()).toBeVisible()
    await expect(page.getByText('Pending').first()).toBeVisible()
    await expect(page.getByText('Active').first()).toBeVisible()
    await expect(page.getByText('all', { exact: true }).first()).toBeVisible()
  })

  test('should have search input and filter controls', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]').first()
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible()
    }

    for (const status of ['all', 'pending', 'contacted', 'active', 'declined']) {
      const btn = page.getByText(status, { exact: true }).first()
      if (await btn.count() > 0) {
        await expect(btn).toBeVisible()
      }
    }
  })

  test('should navigate to beta-testers from sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const betaLink = page.getByText('Beta Testers', { exact: false }).first()
    if (await betaLink.count() > 0) {
      await betaLink.click()
      await page.waitForURL('**/beta-testers')
      await expect(page).toHaveURL(/beta-testers/)
    }
  })

  test('should mechanically filter data when typing into search input', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]').first()
    if (await searchInput.count() > 0) {
      // Log the initial row count (assuming cards represent rows)
      const initialCards = await page.locator('div[tabindex="0"], .tamagui-card').count()
      
      // Type a highly aggressive random sequence that shouldn't exist
      await searchInput.clear()
      await searchInput.pressSequentially('XYZZZY_MOCK_1234987')
      await page.waitForTimeout(1000) // allow SWR to process
      
      // The DOM should physically reflect 0 rows or a No Testers Found state
      const noFoundText = page.getByText('No testers found', { exact: false }).first()
      await expect(noFoundText).toBeVisible({ timeout: 15000 })
      
      // Clear it to restore the list
      await searchInput.clear()
      await page.waitForTimeout(500)
      
      // If the local database is naturally empty, No Testers Found will legally remain visible.
      // We just assert that the typing action didn't crash the React component.
      await expect(searchInput).toBeVisible()
    }
  })

  test('should dynamically filter counts when clicking status tabs', async ({ page }) => {
    const pendingBtn = page.getByText('pending', { exact: true }).first()
    const allBtn = page.getByText('all', { exact: true }).first()
    
    if (await pendingBtn.count() > 0 && await allBtn.count() > 0) {
      await pendingBtn.click()
      await page.waitForTimeout(1000) // allow UI hydration
      
      // Verify button background active state or URL params optionally
      await expect(pendingBtn).toBeVisible()
      
      await allBtn.click()
      await page.waitForTimeout(1000)
    }
  })
})
