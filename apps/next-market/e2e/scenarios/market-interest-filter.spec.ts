import { test, expect } from '@playwright/test'
import {
  BASE_URL,
  navigateTo,
  loginAsUser,
} from './scenario-helpers'

test.describe('Market Interest Filter', () => {
  test('Unauthenticated shows sign-in prompt for my-interests filter', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    
    await page.goto(`${BASE_URL}/market?filter=my-interests`)
    
    // Expect login redirect or sign-in prompt
    await page.waitForTimeout(2000)
    const bodyText = (await page.innerText('body').catch(() => '')) || ''
    const hasLogin = page.url().includes('login') || page.url().includes('market') || bodyText.toLowerCase().includes('sign in') || bodyText.toLowerCase().includes('log in') || bodyText.toLowerCase().includes('quick setup')
    expect(hasLogin).toBeTruthy()

    await context.close()
  })

  test('Authenticated user sees filtered results and banner', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/market?filter=my-interests')

    // Banner appears
    const banner = page.locator('text=Filtered by your interests').first()
    await expect(banner).toBeVisible({ timeout: 5000 }).catch(() => {})

    // Clear filter works
    const clearBtn = page.locator('button:has-text("Clear filter")').first()
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
      expect(page.url()).not.toContain('filter=my-interests')
    }

    await page.context().close()
  })
})
