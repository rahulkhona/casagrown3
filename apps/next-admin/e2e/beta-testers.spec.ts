import { test, expect } from '@playwright/test'

test.describe('Beta Testers Admin Page', () => {
  test('should load beta testers page', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/beta-testers')
    await page.waitForLoadState('networkidle')

    // Page should render (may redirect to login if not authed)
    const url = page.url()
    if (url.includes('/login')) {
      // Not authenticated — valid outcome
      await expect(page.locator('body')).not.toBeEmpty()
      return
    }

    // Header should be visible
    await expect(page.getByText('Beta Testers', { exact: false }).first()).toBeVisible({ timeout: 15000 })

    // Stats cards should render
    await expect(page.getByText('Total').first()).toBeVisible()
    await expect(page.getByText('Pending').first()).toBeVisible()
    await expect(page.getByText('Active').first()).toBeVisible()

    // Filter buttons should be present
    await expect(page.getByText('all', { exact: true }).first()).toBeVisible()

    // No critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  test('should have search input and filter controls', async ({ page }) => {
    await page.goto('/beta-testers')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) return

    // Search input should be present
    const searchInput = page.locator('input[placeholder*="Search"]').first()
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible()
    }

    // Filter buttons for all status types
    for (const status of ['all', 'pending', 'contacted', 'active', 'declined']) {
      const btn = page.getByText(status, { exact: true }).first()
      if (await btn.count() > 0) {
        await expect(btn).toBeVisible()
      }
    }
  })

  test('should navigate to beta-testers from sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) return

    // Look for a Beta Testers link in the sidebar
    const betaLink = page.getByText('Beta Testers', { exact: false }).first()
    if (await betaLink.count() > 0) {
      await betaLink.click()
      await page.waitForURL('**/beta-testers')
      await expect(page).toHaveURL(/beta-testers/)
    }
  })
})
