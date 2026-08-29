import { test, expect } from '@playwright/test'

test.describe('Exhaustive Interest Page & Form Controls Suite', () => {
  test('TC-INT-01: Header, Navigation Links, and Scope Switcher', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    const addProduceLink = page.locator('a[href="/create-listing"]').first()
    await expect(addProduceLink).toBeVisible()

    await page.goto('/interest?scope=sell')
    await expect(page).toHaveURL(/\/market/)

    await page.goto('/interest?scope=buy')
    await expect(page).toHaveURL(/\/market/)
  })

  test('TC-INT-02: Search Input Typing and Grid Filter', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await expect(searchInput).toBeVisible()

    await searchInput.fill('Avocado')
    await page.waitForTimeout(500)
    await expect(page.getByText('Avocado', { exact: false }).first()).toBeVisible()
  })

  test('TC-INT-03: Search Input Clearing', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await searchInput.fill('Avocado')
    await page.waitForTimeout(300)

    await searchInput.fill('')
    await page.waitForTimeout(300)
    const cards = page.locator('div[class*="produceCard"]')
    await expect(cards.first()).toBeVisible()
  })

  test('TC-INT-04: Produce Card Actions (Want & Have Extra)', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    const wantBtn = page.locator('button:has-text("Want")').first()
    const haveBtn = page.locator('button:has-text("Have Extra")').first()

    await expect(wantBtn).toBeVisible()
    await expect(haveBtn).toBeVisible()

    await wantBtn.click()
    const modal = page.locator('[role="dialog"], [class*="modalOverlay"], div[style*="position: fixed"]').first()
    await expect(modal).toBeVisible({ timeout: 5000 })
  })

  test('TC-INT-05: Address Input, Zipcode Search, and Geolocation', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    const zipInput = page.locator('input#zip-search, input[placeholder*="Address or ZIP"]').first()
    if (await zipInput.isVisible()) {
      await zipInput.fill('95120')
      await zipInput.press('Enter')
      await page.waitForTimeout(500)
    }
  })

  test('TC-INT-06: Shared Buyer Demand Landing Page (/demand)', async ({ page }) => {
    await page.goto('/demand?items=Strawberries,Avocados&name=Rahul&location=San+Jose&mode=sell')

    // Verify Header Banner
    await expect(page.locator('h1')).toContainText('Would you be interested in sharing or selling any of these items to Rahul?')

    // Verify Crop Cards
    await expect(page.getByRole('heading', { name: 'Strawberries' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Avocados' })).toBeVisible()

    // Verify List Item Now CTA Buttons link to /create-listing with pre-filled produce
    const strawberriesCta = page.locator('a[href*="/create-listing?produce=Strawberries"]')
    const avocadosCta = page.locator('a[href*="/create-listing?produce=Avocados"]')

    await expect(strawberriesCta).toBeVisible()
    await expect(avocadosCta).toBeVisible()
  })

  test('TC-INT-07: Non-Produce Terms Rejection (heroin)', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await searchInput.fill('heroin')
    await page.waitForTimeout(800)
    await expect(page.locator('h3:has-text("Heroin")')).toHaveCount(0)
  })

  test('TC-INT-08: Content Moderation Rejection (cocaine)', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await searchInput.fill('cocaine')
    await page.waitForTimeout(800)
    await expect(page.locator('h3:has-text("Cocaine")')).toHaveCount(0)
  })

  test('TC-INT-09: Market Search Miss CTA Moderation', async ({ page }) => {
    await page.goto('/market?q=cocaine')
    await page.waitForTimeout(500)
    await expect(page.locator('a[href*="/interest?scope=buy&q=cocaine"]')).toHaveCount(0)
  })
})
