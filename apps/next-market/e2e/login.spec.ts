import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test('renders email input form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /send login code/i })
    ).toBeVisible()
    await expect(page.getByText('CasaGrown Market')).toBeVisible()
  })

  test('shows OTP step after entering email', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'test@example.com')
    await page.click('button[type="submit"]')

    // Should transition to OTP step
    await expect(page.locator('#otp')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('test@example.com')).toBeVisible()
    await expect(page.getByText('Change email')).toBeVisible()
  })

  test('change email button returns to email step', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'test@example.com')
    await page.click('button[type="submit"]')
    await expect(page.locator('#otp')).toBeVisible({ timeout: 10000 })

    await page.click('text=Change email')
    await expect(page.locator('#email')).toBeVisible()
  })

  test('OTP input only accepts digits', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'test@example.com')
    await page.click('button[type="submit"]')
    await expect(page.locator('#otp')).toBeVisible({ timeout: 10000 })

    await page.fill('#otp', 'abc123')
    // Should only contain digits
    const value = await page.inputValue('#otp')
    expect(value).toBe('123')
  })

  test('verify button is disabled with short OTP', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', 'test@example.com')
    await page.click('button[type="submit"]')
    await expect(page.locator('#otp')).toBeVisible({ timeout: 10000 })

    await page.fill('#otp', '123')
    const verifyBtn = page.getByRole('button', { name: /verify/i })
    await expect(verifyBtn).toBeDisabled()
  })
})
