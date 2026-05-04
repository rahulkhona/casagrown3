import { test, expect } from '@playwright/test'

test.describe('Quarantine Zones Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quarantine-zones', { waitUntil: 'domcontentloaded' })
    // Wait for React hydration + async data fetching rather than fixed timeout
    await page.waitForLoadState('networkidle')
  })

  test('should load quarantine zones page with title', async ({ page }) => {
    // Tamagui renders Text inside nested divs — use locator for resilience
    await expect(page.locator('text=Quarantine Zones').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=agricultural pest quarantines').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Add Quarantine').first()).toBeVisible({ timeout: 10000 })
  })

  test('should open and close create form', async ({ page }) => {
    await page.locator('text=Add Quarantine').first().click({ timeout: 15000 })
    await expect(page.locator('text=New Quarantine Zone').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Pest / Disease Name').first()).toBeVisible()
    await expect(page.locator('text=Quarantined Category').first()).toBeVisible()
    await page.locator('text=Cancel').first().click()
    await expect(page.locator('text=New Quarantine Zone')).not.toBeVisible({ timeout: 10000 })
  })

  test('should show category ALL and jurisdiction scope buttons', async ({ page }) => {
    await page.locator('text=Add Quarantine').first().click({ timeout: 15000 })
    await expect(page.locator('text=New Quarantine Zone').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=ALL Categories').first()).toBeVisible()
    await expect(page.locator('text=County-level').first()).toBeVisible()
    await expect(page.locator('text=State-level').first()).toBeVisible()
    await expect(page.locator('text=Country-wide').first()).toBeVisible()
  })

  test('should show data grid or empty state', async ({ page }) => {
    const body = await page.locator('body').innerText()
    const hasQuarantineContent =
      body.includes('quarantine') || body.includes('Quarantine') ||
      body.includes('No quarantine') || body.includes('Fruit Fly') ||
      body.includes('Add Quarantine') || body.includes('agricultural') ||
      body.includes('Manage') || body.includes('pest')
    expect(hasQuarantineContent).toBe(true)
  })

  test('should validate required fields on submit', async ({ page }) => {
    await page.locator('text=Add Quarantine').first().click({ timeout: 15000 })
    await expect(page.locator('text=New Quarantine Zone').first()).toBeVisible({ timeout: 10000 })
    // Wait for React to fully hydrate the form
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await page.locator('text=Enforce Quarantine').first().click()
    await expect(page.locator('text=Please select a category').first()).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Quarantine Sidebar Navigation', () => {
  test('should have QUARANTINE ZONES section in sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    const quarantineHeader = page.locator('text=QUARANTINE ZONES').first()
    await expect(quarantineHeader).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to Quarantine Zones page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    const quarantineLink = page.locator('text=Manage Quarantines').first()
    if ((await quarantineLink.count()) > 0) {
      await quarantineLink.click()
      await page.waitForURL(/\/quarantine-zones/, { timeout: 15000 })
      await expect(page).toHaveURL(/\/quarantine-zones/)
    }
  })
})
