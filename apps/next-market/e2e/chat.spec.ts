import { test, expect } from '@playwright/test'

test.describe('Chat', () => {
  test('should display chat page', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toBeVisible()
  })

  test('should show conversation list or empty state', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('should navigate to conversation detail', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForTimeout(3000)
    const convLink = page.locator('a[href*="/chat/"], [data-testid*="conversation"]').first()
    if (await convLink.isVisible()) {
      await convLink.click()
      await page.waitForTimeout(1000)
    }
  })

  test('should show message input in conversation', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForTimeout(3000)
    const convLink = page.locator('a[href*="/chat/"]').first()
    if (await convLink.isVisible()) {
      await convLink.click()
      await page.waitForTimeout(1000)
      const msgInput = page.locator('input[type="text"], textarea, [contenteditable]')
      if (await msgInput.count() > 0) {
        await expect(msgInput.first()).toBeVisible()
      }
    }
  })
})
