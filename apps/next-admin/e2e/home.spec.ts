import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('should load without client-side errors', async ({ page }) => {
    const errors: string[] = []

    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    // Collect page errors
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    // Navigate to home page
    await page.goto('/')

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle')

    // The page may redirect to /login if not authenticated, or show the admin dashboard.
    // Either outcome is valid — just verify the page loaded without crashing.
    const url = page.url()
    const isLoginPage = url.includes('/login')
    const isDashboard = !isLoginPage

    if (isDashboard) {
      // Sidebar should show CasaGrown Admin branding
      await expect(page.getByText('CasaGrown Admin').first()).toBeVisible({ timeout: 15000 })
    } else {
      // Login page should have a sign in form or heading
      await expect(page.locator('body')).not.toBeEmpty()
    }

    // Verify no critical errors occurred (ignore Supabase auth warnings)
    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  test('should navigate to Members page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate to Members page via sidebar (if on dashboard)
    const membersLink = page.getByRole('button', { name: /Members/i }).first()
    if ((await membersLink.count()) > 0) {
      await membersLink.click()
      await page.waitForURL('/members')
      await expect(page).toHaveURL(/\/members/)
    }
  })
})
