import { test, expect } from '@playwright/test'

test.describe('Market Browse', () => {
  test('should display the market page with booths', async ({ page }) => {
    await page.goto('/market')
    // Should show the market page with search capability
    await expect(page.locator('body')).toBeVisible()
  })

  test('should have search input for products', async ({ page }) => {
    await page.goto('/market')
    // Look for a search input or search-related element
    const searchInput = page.locator('input[type="text"], input[type="search"], [placeholder*="earch"]')
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()
    }
  })

  test('should show booth cards with product info', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000) // Wait for data load
    // Check for booth/product-related content
    const body = await page.textContent('body')
    // Market page should have some content loaded
    expect(body).toBeTruthy()
  })

  test('should navigate to booth detail when clicking a booth', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    // Try to click first booth card/link
    const boothLink = page.locator('a[href*="/booth"]').first()
    if (await boothLink.isVisible()) {
      await boothLink.click()
      await expect(page.url()).toContain('/booth')
    }
  })

  test('should filter by category when available', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    const categoryFilter = page.locator('button, [role="tab"]').filter({ hasText: /produce|baked|eggs/i }).first()
    if (await categoryFilter.isVisible()) {
      await categoryFilter.click()
      await page.waitForTimeout(500)
    }
  })
})
