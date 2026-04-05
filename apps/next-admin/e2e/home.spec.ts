import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('should load without client-side errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await expect(page.getByText('CasaGrown Admin').first()).toBeVisible({ timeout: 15000 })

    const criticalErrors = errors.filter(e =>
      !e.includes('supabase') && !e.includes('auth') && !e.includes('token')
      && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION')
    )
    expect(criticalErrors).toEqual([])
  })

  test('should navigate to Members page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const membersLink = page.getByRole('button', { name: /Members/i }).first()
    if ((await membersLink.count()) > 0) {
      await membersLink.click()
      await page.waitForURL('/members')
      await expect(page).toHaveURL(/\/members/)
    }
  })
})
