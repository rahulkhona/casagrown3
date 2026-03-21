import { test, expect } from './fixtures'

// Login tests must run WITHOUT auth — clear any existing session
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login Page', () => {
  test('renders email input form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /send login code/i })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'CasaGrown Market' })).toBeVisible()
  })

  test('shows OTP step after entering email', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible({ timeout: 5000 })
    await page.fill('#email', 'otp-test-1@example.com')
    await page.click('button[type="submit"]')

    // Should transition to OTP step
    await expect(page.locator('#otp')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('otp-test-1@example.com')).toBeVisible()
    await expect(page.getByText('Change email')).toBeVisible()
  })

  test('change email button returns to email step', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible({ timeout: 5000 })
    await page.fill('#email', 'otp-test-2@example.com')
    await page.click('button[type="submit"]')
    await expect(page.locator('#otp')).toBeVisible({ timeout: 15000 })

    await page.click('text=Change email')
    await expect(page.locator('#email')).toBeVisible()
  })

  test('OTP input only accepts digits', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible({ timeout: 5000 })
    await page.fill('#email', 'otp-test-3@example.com')
    await page.click('button[type="submit"]')
    await expect(page.locator('#otp')).toBeVisible({ timeout: 15000 })

    // Use pressSequentially to simulate real keystrokes so onChange filter runs
    await page.locator('#otp').pressSequentially('abc123')
    // The onChange handler strips non-digits: only '123' should remain
    const value = await page.inputValue('#otp')
    expect(value).toBe('123')
  })

  test('verify button is disabled with short OTP', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible({ timeout: 5000 })
    await page.fill('#email', 'otp-test-4@example.com')
    await page.click('button[type="submit"]')
    await expect(page.locator('#otp')).toBeVisible({ timeout: 15000 })

    // Use pressSequentially so onChange fires per keystroke
    await page.locator('#otp').pressSequentially('123')
    const verifyBtn = page.getByRole('button', { name: /verify/i })
    await expect(verifyBtn).toBeDisabled()
  })
})
