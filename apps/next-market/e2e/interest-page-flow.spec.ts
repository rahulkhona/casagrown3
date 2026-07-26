import { test, expect } from '@playwright/test'

test.describe('Interest Page & Produce Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to interest page
    await page.goto('/interest')
  })

  test('renders top 100 produce catalog items cleanly without custom badges', async ({ page }) => {
    // Verify header title and search input exist
    await expect(page.locator('h1')).toContainText('produce notifications')
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    await expect(searchInput).toBeVisible()

    // Verify grid cards are present
    const cards = page.locator('[data-testid="produce-card"]')
    await expect(cards.first()).toBeVisible()

    // Ensure no UNLISTED ITEM or CUSTOM badges are rendered
    await expect(page.locator('text=✨ UNLISTED ITEM')).toHaveCount(0)
    await expect(page.locator('text=CUSTOM')).toHaveCount(0)
  })

  test('allows selecting I have this and I want this on produce cards', async ({ page }) => {
    // Locate the first item card and its checkboxes
    const firstHaveInput = page.locator('label:has-text("I have this") input[type="checkbox"]').first()
    await expect(firstHaveInput).toBeVisible()

    // Check "I have this"
    await firstHaveInput.check()
    await expect(firstHaveInput).toBeChecked()
  })

  test('allows searching valid garden/produce items (e.g. Chickoo, Microgreens, Dahlias)', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    
    // Search for Chickoo
    await searchInput.fill('Chickoo')
    await page.waitForTimeout(500) // Wait for debounce / custom item resolution

    // Verify Chickoo card appears in search results with checkboxes
    const chickooHeader = page.locator('h3:has-text("Chickoo")')
    await expect(chickooHeader).toBeVisible()

    const haveCheckbox = page.locator('label:has-text("I have this") input[type="checkbox"]').first()
    await expect(haveCheckbox).toBeVisible()
  })

  test('filters out non-produce terms (e.g. chocobar, computer)', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')

    // Search for chocobar
    await searchInput.fill('chocobar')
    await page.waitForTimeout(800)

    // Verify no item cards render and empty state notice is displayed
    await expect(page.locator('h3:has-text("Chocobar")')).toHaveCount(0)
    await expect(page.locator('text=No produce or garden items found')).toBeVisible()
  })

  test('enforces content moderation on banned/inappropriate search terms', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')

    // Search for a banned term
    await searchInput.fill('cocaine')
    await page.waitForTimeout(500)

    // Verify no cards render
    await expect(page.locator('h3:has-text("Cocaine")')).toHaveCount(0)
    await expect(page.locator('text=No produce or garden items found')).toBeVisible()
  })

  test('hides express interest CTA on market page when searching banned terms', async ({ page }) => {
    await page.goto('/market?q=cocaine')
    await page.waitForTimeout(500)

    // Verify express interest CTA is hidden for banned search terms
    await expect(page.locator('a[href*="/interest?scope=buy&q=cocaine"]')).toHaveCount(0)
  })
})
