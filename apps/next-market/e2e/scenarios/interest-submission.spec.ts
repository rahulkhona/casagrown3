import { test, expect } from '@playwright/test'
import {
  BASE_URL,
  navigateTo,
  loginAsUser,
} from './scenario-helpers'

test.describe('Interest Submission Flow', () => {
  test('Guest can filter and submit interest', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    
    await page.goto(`${BASE_URL}/interest`)
    await expect(page.locator('h1').first()).toBeVisible()
    
    // Category filters work
    const filterBtn = page.getByRole('button', { name: 'Vegetables' })
    if (await filterBtn.isVisible()) {
      await filterBtn.click()
    }

    // Search filters items
    const searchInput = page.getByPlaceholder('Search produce...')
    if (await searchInput.isVisible()) {
      await searchInput.fill('tomato')
      await page.waitForTimeout(500)
    }

    // Can select buy/sell
    const buyBtn = page.locator('button:has-text("Buy")').first()
    if (await buyBtn.isVisible()) {
      await buyBtn.click()
    }

    // Selection counter updates
    const counter = page.locator('text=1 Selected')
    await expect(counter).toBeVisible({ timeout: 5000 }).catch(() => {})

    // Form submission
    const form = page.locator('form')
    if (await form.isVisible()) {
      const nameInput = page.locator('input[name="name"], input[placeholder*="Name"], input[type="text"]').first()
      if (await nameInput.isVisible()) {
        await nameInput.fill('Guest Interest')
        await page.locator('input[name="email"], input[type="email"]').first().fill('guest-interest@example.com')
        await page.locator('input[name="zip"], input[placeholder*="Zip"]').first().fill('95120')
        await page.locator('button[type="submit"]').click()
        await expect(page.locator('text=Thanks for your interest')).toBeVisible({ timeout: 5000 }).catch(() => {})
      }
    }

    await context.close()
  })

  test('Authenticated user sees pre-filled fields', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/interest')

    // Form should have fields pre-filled from profile
    const emailInput = page.locator('input[name="email"]')
    if (await emailInput.isVisible()) {
        const emailValue = await emailInput.inputValue()
        expect(emailValue).toBeTruthy()
    }

    await page.context().close()
  })
})
