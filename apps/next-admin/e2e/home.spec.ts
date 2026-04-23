import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('should load without client-side errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = msg.text();
        errors.push(text);
        if (text.includes('title element received an array') || text.includes('Hydration')) {
          console.log(`[TARGET_LOG]: ${text}`);
          console.log(`[TARGET_LOC]: ${msg.location().url}:${msg.location().lineNumber}`);
        }
      }
    })
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log(`[PAGE_ERROR] ${error.message}\n${error.stack}`);
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await expect(page.getByText('CasaGrown Admin').first()).toBeVisible({ timeout: 15000 })

    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
      && !e.includes('EXPO_OS') && !e.includes('Service Worker')
      && !e.includes('VAPID')
    )
    expect(criticalErrors).toEqual([])
  })

  test('should navigate to Members page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('CasaGrown Admin').first()).toBeVisible({ timeout: 15000 })

    // Verify Members link exists in sidebar
    const membersLink = page.getByRole('link', { name: /Members/i }).first()
    await expect(membersLink).toBeVisible({ timeout: 5000 })
    
    // Navigate to /members and verify it loads
    await page.goto('/members', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/members/)
    // Verify the page has meaningful content (not a blank error page)
    await expect(page.locator('body')).toContainText(/Members|member|User/i, { timeout: 10000 })
  })
})
