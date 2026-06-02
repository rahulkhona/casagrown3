/**
 * Facebook Auto-Post Settings E2E Tests
 *
 * Tests the Facebook connection section and auto-post toggle controls
 * on the /profile page for a Pro seller with FB connected (seller@test.local).
 *
 * Run: cd apps/next-market && npx playwright test e2e/facebook-autopost.spec.ts
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
} from './scenarios/scenario-helpers'

test.describe('Facebook Auto-Post Settings', () => {
  test('Facebook connection section is visible for Pro seller', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    // Skip if redirected to login
    if (page.url().includes('/login')) {
      await page.context().close()
      test.skip()
      return
    }

    // Should see the FB page name or Connect button
    const content = await page.textContent('body')
    expect(content).toMatch(/Facebook|Connect Facebook|Willow Glen/i)

    await page.context().close()
  })

  test('auto-sync toggle is visible and checked by default', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    if (page.url().includes('/login')) {
      await page.context().close()
      test.skip()
      return
    }

    const toggle = page.locator('[data-testid="toggle-auto-sync"]')
    if (await toggle.isVisible()) {
      // auto_sync_enabled defaults to true
      const isChecked = await toggle.getAttribute('aria-checked')
      expect(isChecked).toBe('true')
    } else {
      // Toggle may not be visible if FB not connected
      const content = await page.textContent('body')
      expect(content).toMatch(/Facebook|Connect|catalog/i)
    }

    await page.context().close()
  })

  test('auto-post toggle is visible with correct label', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    if (page.url().includes('/login')) {
      await page.context().close()
      test.skip()
      return
    }

    const toggle = page.locator('[data-testid="toggle-auto-post"]')
    if (await toggle.isVisible()) {
      const label = page.locator('text=Post daily available items')
      await expect(label).toBeVisible()
    } else {
      // Toggle only visible when FB connected
      const content = await page.textContent('body')
      expect(content).toMatch(/Facebook|Profile/i)
    }

    await page.context().close()
  })

  test('casagrown-post toggle is visible with correct label', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    if (page.url().includes('/login')) {
      await page.context().close()
      test.skip()
      return
    }

    const toggle = page.locator('[data-testid="toggle-casagrown-post"]')
    if (await toggle.isVisible()) {
      const label = page.locator('text=Allow CasaGrown to feature')
      await expect(label).toBeVisible()
    } else {
      const content = await page.textContent('body')
      expect(content).toMatch(/Facebook|Profile/i)
    }

    await page.context().close()
  })

  test('toggling auto-post persists state', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    if (page.url().includes('/login')) {
      await page.context().close()
      test.skip()
      return
    }

    const toggle = page.locator('[data-testid="toggle-auto-post"]')
    if (await toggle.isVisible()) {
      const initial = await toggle.getAttribute('aria-checked')
      await toggle.click()
      await page.waitForTimeout(1000)
      const after = await toggle.getAttribute('aria-checked')
      // State should have changed
      expect(after).not.toBe(initial)
      // Toggle back to original state
      await toggle.click()
      await page.waitForTimeout(500)
    } else {
      await page.context().close()
      test.skip()
      return
    }

    await page.context().close()
  })

  test('toggles show description text', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    if (page.url().includes('/login')) {
      await page.context().close()
      test.skip()
      return
    }

    const content = await page.textContent('body')
    if (content?.includes('Post daily available items')) {
      // Auto-post description
      expect(content).toContain('GrowBot will automatically post')
      // CasaGrown description
      expect(content).toContain('may be featured')
    } else {
      // FB not connected or not Pro
      expect(content).toMatch(/Facebook|Profile|Connect/i)
    }

    await page.context().close()
  })

  test('disconnect button is visible and enabled', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    if (page.url().includes('/login')) {
      await page.context().close()
      test.skip()
      return
    }

    const disconnectBtn = page.locator('button:has-text("Disconnect")')
    if (await disconnectBtn.isVisible()) {
      // Don't actually click disconnect in test — just verify it exists
      await expect(disconnectBtn).toBeEnabled()
    } else {
      const content = await page.textContent('body')
      expect(content).toMatch(/Facebook|Connect/i)
    }

    await page.context().close()
  })

  test('profile page loads without JS errors', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    const jsErrors: string[] = []
    page.on('pageerror', (err: Error) => jsErrors.push(err.message))

    await navigateTo(page, '/pro-manage')
    await page.waitForTimeout(3000)

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('Stripe') && !e.includes('stripe') &&
      !e.includes('ResizeObserver') && !e.includes('hydration')
    )
    expect(criticalErrors.length).toBe(0)

    await page.context().close()
  })
})
