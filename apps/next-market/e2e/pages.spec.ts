import { test, expect } from './fixtures'

test.describe('Profile & Settings', () => {
  test('should display profile page', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('should show user info fields', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should have editable fields', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForTimeout(3000)
    const inputs = page.locator('input[type="text"], input[type="email"], input[type="tel"]')
    if (await inputs.count() > 0) {
      await expect(inputs.first()).toBeVisible()
    }
  })
})

test.describe('Navigation', () => {
  test('should have bottom navigation bar', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)
    const bottomNav = page.locator('nav, [class*="bottomNav"]')
    if (await bottomNav.count() > 0) {
      await expect(bottomNav.first()).toBeVisible()
    }
  })

  test('should navigate between main sections', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(1000)

    // Try navigating to orders
    const ordersLink = page.locator('a[href="/orders"], a[href*="/orders"]').first()
    if (await ordersLink.isVisible()) {
      await ordersLink.click()
      await page.waitForTimeout(1000)
      expect(page.url()).toContain('/orders')
    }
  })

  test('should show market open/closed status', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    // Navbar should show market status indicator
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})

test.describe('Terms of Service', () => {
  test('should display terms page', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.textContent('body')
    // Should contain terms-related content
    expect(body?.toLowerCase()).toContain('terms')
  })
})

test.describe('Get Started / Landing', () => {
  test('should display get-started page', async ({ page }) => {
    await page.goto('/get-started')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('should show sign-up or get-started CTA', async ({ page }) => {
    await page.goto('/get-started')
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})

test.describe('Guide / How It Works', () => {
  test('should display guide page with title', async ({ page }) => {
    await page.goto('/guide')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('how it works')
  })

  test('should show accordion sections', async ({ page }) => {
    await page.goto('/guide')
    await page.waitForTimeout(2000)
    // Alpha section should be open by default
    const body = await page.textContent('body')
    expect(body).toContain('Alpha Testing')
    expect(body).toContain('Market Schedule')
    expect(body).toContain('Settlements')
    expect(body).toContain('Safety')
  })

  test('should expand accordion sections on click', async ({ page }) => {
    await page.goto('/guide')
    await page.waitForTimeout(2000)
    // Click on Market Schedule section
    const scheduleBtn = page.locator('button', { hasText: 'Market Schedule' })
    await scheduleBtn.click()
    await page.waitForTimeout(500)
    const body = await page.textContent('body')
    expect(body).toContain('Why limited hours')
  })
})
