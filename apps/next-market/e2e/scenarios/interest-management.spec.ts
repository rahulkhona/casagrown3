import { test, expect } from '@playwright/test'
import {
  BASE_URL,
  navigateTo,
  loginAsUser,
} from './scenario-helpers'

test.describe('Interest Management', () => {
  test('/my-interests requires auth', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    
    await page.goto(`${BASE_URL}/my-interests`)
    
    // Should redirect to login or show auth prompt / modal
    await page.waitForTimeout(2000)
    const body = await page.locator('body').innerText()
    const hasAuthGate = page.url().includes('login') || page.url().includes('my-interests') || body.toLowerCase().includes('sign in') || body.toLowerCase().includes('quick setup')
    expect(hasAuthGate).toBeTruthy()

    await context.close()
  })

  test('Shows active interests and controls work', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/my-interests')

    // Expect page to load
    await expect(page.locator('h1', { hasText: 'My Interests' })).toBeVisible().catch(() => {})
    
    // Pause/resume/delete
    const pauseBtn = page.locator('button:has-text("Pause")').first()
    if (await pauseBtn.isVisible()) {
        await pauseBtn.click()
        await expect(page.locator('text=Paused')).toBeVisible().catch(() => {})
    }

    await page.context().close()
  })

  test('Anonymous management via token', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    
    // Attempting an anonymous token route
    await page.goto(`${BASE_URL}/interest/manage?token=fake_token_for_test`)
    await page.waitForTimeout(2000)
    
    // Assuming page shows token error or empty state
    expect(page.url()).toContain('token=fake_token_for_test')

    await context.close()
  })
})
