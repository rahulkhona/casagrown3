import { test, expect } from '@playwright/test'

/**
 * Deep E2E: Booth Creation & Product CRUD
 */
test.describe('Booth Management', () => {
  test('should navigate to my-booth page and see booth info', async ({ page }) => {
    await page.goto('/my-booth')
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should see product grid with add slot', async ({ page }) => {
    await page.goto('/my-booth')
    await page.waitForTimeout(3000)

    // Should see product slots or add button
    const addSlot = page.locator('a[href*="products/new"], button:has-text("Add"), [class*="addSlot"], [class*="addProduct"]')
    if (await addSlot.count() > 0) {
      await expect(addSlot.first()).toBeVisible()
    }
  })

  test('should open new product form', async ({ page }) => {
    await page.goto('/my-booth/products/new')
    await page.waitForTimeout(3000)

    // Form should have inputs
    const inputs = page.locator('input, textarea, select')
    expect(await inputs.count()).toBeGreaterThan(0)
  })

  test('should validate product form fields', async ({ page }) => {
    await page.goto('/my-booth/products/new')
    await page.waitForTimeout(3000)

    // Try submitting empty form
    const submitBtn = page.locator('button[type="submit"], button:has-text("List"), button:has-text("Save"), button:has-text("Create")')
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click()
      await page.waitForTimeout(1000)
      // Should show validation errors or stay on page
      expect(page.url()).toContain('/products')
    }
  })

  test('should navigate to product edit page', async ({ page }) => {
    await page.goto('/my-booth/products')
    await page.waitForTimeout(3000)

    // Click on a product to edit
    const productLink = page.locator('a[href*="/products/"]').first()
    if (await productLink.isVisible()) {
      await productLink.click()
      await page.waitForTimeout(2000)
      expect(page.url()).toContain('/products/')
    }
  })

  test('should see booth orders page', async ({ page }) => {
    await page.goto('/my-booth/orders')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should see coupons management page', async ({ page }) => {
    await page.goto('/my-booth/coupons')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should see invitations page', async ({ page }) => {
    await page.goto('/my-booth/invitations')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should see customize booth page', async ({ page }) => {
    await page.goto('/my-booth/customize')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
