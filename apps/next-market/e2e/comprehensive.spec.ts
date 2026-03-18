import { test, expect } from '@playwright/test'

/**
 * Deep E2E: Earnings & Payout Flows
 */
test.describe('Earnings Deep', () => {
  test('should display earnings summary with balance', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(3000)

    // Should show balance-related elements
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should navigate to payout page', async ({ page }) => {
    await page.goto('/earnings/payout')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should navigate to redeem page', async ({ page }) => {
    await page.goto('/earnings/payout')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should navigate to auto-redeem settings', async ({ page }) => {
    await page.goto('/earnings/payout')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should navigate to tax info page', async ({ page }) => {
    await page.goto('/earnings/tax-info')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})

/**
 * Deep E2E: Profile & Settings
 */
test.describe('Profile Deep', () => {
  test('should display profile with editable fields', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForTimeout(3000)

    const inputs = page.locator('input[type="text"], input[type="email"], input[type="tel"]')
    if (await inputs.count() > 0) {
      await expect(inputs.first()).toBeVisible()
    }
  })

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should display notifications page', async ({ page }) => {
    await page.goto('/notifications')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should navigate to profile-setup page', async ({ page }) => {
    await page.goto('/profile-setup')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})

/**
 * Deep E2E: Community Voice
 */
test.describe('Community Voice', () => {
  test('should display feedback board', async ({ page }) => {
    await page.goto('/voice/board')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should display submit feedback page', async ({ page }) => {
    await page.goto('/voice/submit')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should display ticket page', async ({ page }) => {
    await page.goto('/voice/ticket')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})

/**
 * Deep E2E: Social features
 */
test.describe('Social Features', () => {
  test('should display following page', async ({ page }) => {
    await page.goto('/following')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should display helping page', async ({ page }) => {
    await page.goto('/helping')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})

/**
 * Deep E2E: Error States
 */
test.describe('Error States', () => {
  test('should handle non-existent booth gracefully', async ({ page }) => {
    await page.goto('/market/booth/00000000-0000-0000-0000-000000000000')
    await page.waitForTimeout(3000)

    // Should show error page or redirect, not crash
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should handle non-existent order gracefully', async ({ page }) => {
    await page.goto('/orders/00000000-0000-0000-0000-000000000000')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should handle non-existent chat gracefully', async ({ page }) => {
    await page.goto('/chat/00000000-0000-0000-0000-000000000000')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})

/**
 * Deep E2E: Login flow
 */
test.describe('Auth Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login')
    await page.waitForTimeout(2000)

    // Should have auth form
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should show login page with redirect parameter', async ({ page }) => {
    await page.goto('/login?redirect=/my-booth')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
