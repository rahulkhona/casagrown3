import { test, expect } from '@playwright/test'

test.describe('Exhaustive Interest Page & Form Controls Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/interest')
  })

  test('TC-INT-01: Header, Navigation Links, and Scope Switcher', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible()

    const manageLink = page.locator('a:has-text("Manage My Interests")')
    await expect(manageLink).toBeVisible()
    await expect(manageLink).toHaveAttribute('href', '/my-interests')

    await page.goto('/interest?scope=sell')
    await expect(page.locator('h1')).toContainText('Select what you grow')

    await page.goto('/interest?scope=buy')
    await expect(page.locator('h1')).toContainText('Select what you need')
  })

  test('TC-INT-02: Search Input Typing and Grid Filter', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    await expect(searchInput).toBeVisible()

    await searchInput.fill('Avocado')
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Avocado', exact: true })).toBeVisible()
  })

  test('TC-INT-03: Search Input Clearing', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    await searchInput.fill('Avocado')
    await page.waitForTimeout(300)

    await searchInput.fill('')
    await page.waitForTimeout(300)
    const cards = page.locator('[data-testid="produce-card"]')
    await expect(cards.first()).toBeVisible()
  })

  test('TC-INT-04: Produce Card Checkboxes (I have this / I want this)', async ({ page }) => {
    const haveCheckbox = page.locator('label:has-text("I have this") input[type="checkbox"]').first()
    const wantCheckbox = page.locator('label:has-text("I want this") input[type="checkbox"]').first()

    await expect(haveCheckbox).toBeVisible()
    await expect(wantCheckbox).toBeVisible()

    await haveCheckbox.check()
    await expect(haveCheckbox).toBeChecked()

    await wantCheckbox.check()
    await expect(wantCheckbox).toBeChecked()

    const saveBtn = page.locator('button:has-text("Save My Interests"), button:has-text("Save & Get Notified")').first()
    await expect(saveBtn).toBeVisible()
  })

  test('TC-INT-05: Address Input, Zipcode Tags, and Radius Range Slider', async ({ page }) => {
    const zipInput = page.locator('input[placeholder*="zipcode" i], input[placeholder*="Zip" i]').first()
    if (await zipInput.isVisible()) {
      await zipInput.fill('95120')
      const addZipBtn = page.locator('button:has-text("+ Add"), button:has-text("Add")').first()
      if (await addZipBtn.isVisible()) {
        await addZipBtn.click()
      }
    }

    const radiusSlider = page.locator('input[type="range"]').first()
    if (await radiusSlider.isVisible()) {
      await radiusSlider.fill('15')
      await expect(page.locator('text=15 miles')).toBeVisible()
    }
  })

  test('TC-INT-06: Unlisted Category Custom Items (Chickoo, Microgreens, Dahlias)', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')

    await searchInput.fill('Chickoo')
    await page.waitForTimeout(800)

    const chickooCard = page.locator('h3:has-text("Chickoo")')
    await expect(chickooCard).toBeVisible()

    const chickooWant = page.locator('label:has-text("I want this") input[type="checkbox"]').first()
    await chickooWant.check()
    await expect(chickooWant).toBeChecked()
  })

  test('TC-INT-07: Non-Produce Terms Rejection (chocobar)', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    await searchInput.fill('chocobar')
    await page.waitForTimeout(800)
    await expect(page.locator('h3:has-text("Chocobar")')).toHaveCount(0)
    await expect(page.locator('text=No produce or garden items found')).toBeVisible()
  })

  test('TC-INT-08: Content Moderation Rejection (cocaine)', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search produce"]')
    await searchInput.fill('cocaine')
    await page.waitForTimeout(800)
    await expect(page.locator('h3:has-text("Cocaine")')).toHaveCount(0)
    await expect(page.locator('text=No produce or garden items found')).toBeVisible()
  })

  test('TC-INT-09: Save Interests & Guest Auth Modal', async ({ page }) => {
    const wantCheckbox = page.locator('label:has-text("I want this") input[type="checkbox"]').first()
    await wantCheckbox.check()

    const saveBtn = page.locator('button:has-text("Save My Interests"), button:has-text("Save & Get Notified")').first()
    await saveBtn.click()

    const modal = page.locator('[class*="modal"], [role="dialog"], div[style*="z-index"]').first()
    await expect(modal).toBeVisible({ timeout: 5000 })
  })

  test('TC-INT-10: Market Search Miss CTA Moderation', async ({ page }) => {
    await page.goto('/market?q=cocaine')
    await page.waitForTimeout(500)
    await expect(page.locator('a[href*="/interest?scope=buy&q=cocaine"]')).toHaveCount(0)
  })
})
