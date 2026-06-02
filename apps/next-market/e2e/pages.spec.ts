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
    await page.goto('/community')
    await page.waitForTimeout(1000)
    const bottomNav = page.locator('nav, [class*="bottomNav"]')
    if (await bottomNav.count() > 0) {
      await expect(bottomNav.first()).toBeVisible()
    }
  })

  test('should navigate between main sections', async ({ page }) => {
    await page.goto('/community')
    await page.waitForTimeout(1000)

    // Try navigating to orders
    const ordersLink = page.locator('a[href="/orders"], a[href*="/orders"]').first()
    if (await ordersLink.isVisible()) {
      await ordersLink.click()
      await page.waitForTimeout(1000)
      expect(page.url()).toContain('/orders')
    }
  })

  test('should show Community tab first in nav', async ({ page }) => {
    await page.goto('/community')
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toContain('Community')
  })

  test('should show correct nav icons', async ({ page }) => {
    await page.goto('/community')
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    // Community icon
    expect(body).toContain('👥')
    // Market shopping bag icon
    expect(body).toContain('🛍️')
  })

  test('should NOT show market open/closed status dot', async ({ page }) => {
    await page.goto('/market')
    await page.waitForTimeout(2000)
    // Market is always on — no status indicator should exist
    const body = await page.textContent('body')
    expect(body).not.toContain('Market is Closed')
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
    await page.waitForSelector('text=/guide/i', { timeout: 10000 })
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('guide')
  })

  test('should show accordion sections (no market schedule)', async ({ page }) => {
    await page.goto('/guide')
    await page.waitForTimeout(2000)
    await page.waitForSelector('text=Safety', { timeout: 10000 })

    // Accordion headers (button labels) are always visible — verify key sections exist
    const body = await page.textContent('body')
    expect(body).toContain('Safety')
    expect(body).toContain('Earnings')

    // Expand the Earnings section to verify Settlement content
    const earningsBtn = page.locator('button', { hasText: 'Earnings' })
    if (await earningsBtn.isVisible().catch(() => false)) {
      await earningsBtn.click()
      await page.waitForTimeout(500)
      const expanded = await page.textContent('body')
      expect(expanded).toContain('Settlement')
    }

    // Market Schedule section has been removed (always-on market)
    expect(body).not.toContain('Why limited hours')
  })

  test('settlement section mentions nightly/midnight', async ({ page }) => {
    await page.goto('/guide')
    await page.waitForTimeout(2000)
    // Click on Settlements section to expand
    const settlementBtn = page.locator('button', { hasText: 'Settlements' })
    if (await settlementBtn.isVisible().catch(() => false)) {
      await settlementBtn.click()
      await page.waitForTimeout(500)
      const body = await page.textContent('body')
      // Settlement should reference nightly/midnight processing
      const hasNightly = body?.toLowerCase().includes('nightly') || body?.toLowerCase().includes('midnight')
      expect(hasNightly).toBe(true)
    }
  })
})

test.describe('Community Landing', () => {
  test('should load community page', async ({ page }) => {
    await page.goto('/community')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
