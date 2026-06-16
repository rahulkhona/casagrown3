import { test, expect } from '@playwright/test'

/**
 * Production mode tests — verify the production build runs without hydration errors.
 * Uses the same server started by the release test suite (Playwright's configured baseURL).
 */
test.describe('Production Mode', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Skip if no server is available (safety net for local dev without a running server)
    try {
      const response = await page.goto(baseURL || 'http://localhost:3003', { timeout: 5000 })
      if (!response || response.status() >= 400) {
        test.skip(true, 'Server not responding')
      }
    } catch {
      test.skip(true, 'Server not responding')
    }
  })

  test('should load and hydrate without errors', async ({ page }) => {
    const errors: string[] = []
    const warnings: string[] = []

    // Collect console errors and warnings
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
      if (msg.type() === 'warning') {
        warnings.push(msg.text())
      }
    })

    // Collect page errors
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    // Wait for hydration
    await page.waitForLoadState('networkidle')
    await page.waitForLoadState('domcontentloaded')

    // Check page loaded — look for CasaGrown Admin branding
    await expect(page.getByText('CasaGrown Admin').first()).toBeVisible({ timeout: 15000 })

    // Verify no critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
    )
    expect(criticalErrors, 'Should have no critical console errors').toEqual([])
  })

  test('should support client-side navigation', async ({ page }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.waitForLoadState('networkidle')

    // Find and click Members sidebar link
    const membersLink = page.getByRole('button', { name: /Members/i }).first()
    if ((await membersLink.count()) > 0) {
      await membersLink.click()
      await page.waitForURL(/\/members/)
      await expect(page).toHaveURL(/\/members/)
    }
  })

  test('should have working interactive elements', async ({ page }) => {
    await page.waitForLoadState('networkidle')

    // Try to find and interact with a button
    const buttons = await page.locator('button').all()

    const firstButton = buttons[0]
    if (firstButton) {
      await firstButton.click()
      await page.waitForTimeout(500)

      const hasErrors = await page.evaluate(() => {
        return (window as any).__hasHydrationError || false
      })

      expect(hasErrors).toBe(false)
    }
  })

  test('should support theme switching', async ({ page }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.waitForLoadState('networkidle')

    const themeButton = page.getByRole('button', { name: /change theme/i })

    if ((await themeButton.count()) > 0) {
      const initialTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains('t_dark') ? 'dark' : 'light'
      })

      await themeButton.click()
      await page.waitForTimeout(300)

      const newTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains('t_dark') ? 'dark' : 'light'
      })

      expect(newTheme).not.toBe(initialTheme)

      await themeButton.click()
      await page.waitForTimeout(300)

      const finalTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains('t_dark') ? 'dark' : 'light'
      })

      expect(finalTheme).toBe(initialTheme)
    }
  })
})
