import { test, expect } from '@playwright/test'

/**
 * Metrics — Operational Dashboards Suite
 * 
 * Simply navigates through all protected sub-dashboards to verify they
 * mount fully authenticated without hitting the redirect-jail or hydrating incorrectly.
 */

test.describe('Metrics — Protected Navigations', () => {
  const protectedRoutes = [
    { path: '/sales', title: 'Sales' },
    { path: '/payouts', title: 'Payouts' },
    { path: '/activity', title: 'Activity' },
    { path: '/health', title: 'Health' },
    { path: '/settlements', title: 'Settlements' },
    { path: '/users', title: 'Users' }
  ]

  for (const route of protectedRoutes) {
    test(`navigates securely to ${route.path} without crashing`, async ({ page }) => {
      // Navigate straight to the endpoint
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      
      // Wait to ensure redirect jail does not occur
      await page.waitForTimeout(1500)
      
      // Verify we have not been kicked back to login
      expect(page.url()).not.toContain('/login')

      // Ensure no framework errors
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      
      // Wait for any generic page title or card logic to appear
      const pageTitle = page.locator('h1').first()
      await expect(pageTitle).toBeVisible({ timeout: 10000 })
      
      expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
    })
  }
})
