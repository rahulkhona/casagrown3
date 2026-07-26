import { test, expect } from './fixtures'

// Tests run WITHOUT auth — simulating guest users
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('QuickSetup - OTP Empty Profile Prevention', () => {
  test('redirects new user from OTP verification to name & TOS form', async ({ page }) => {
    // 1. Navigate to trigger QuickSetupModal
    await page.goto('/create-listing-simple')
    await page.waitForTimeout(2000)

    // Enter text and click submit to trigger auth requirement/modal
    await page.locator('textarea').fill('Fresh organic oranges ready to eat')
    await page.locator('button:has-text("Create My Listing")').click()

    // Now the modal should open
    const modal = page.locator('[data-testid="quick-setup-modal"]')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Verify Step 1 is rendered (Email input)
    const emailInput = page.locator('input[name="email"]')
    await expect(emailInput).toBeVisible()

    // 2. Mock the OTP send request
    await page.route('**/auth/v1/otp**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: "OTP sent" })
      })
    })

    // 3. Enter email and click Continue →
    await emailInput.fill('newuser@example.com')
    await page.getByRole('button', { name: 'Continue →' }).click()

    // Wait for OTP input to appear
    const otpInput = page.getByTestId('otp-input-0')
    await expect(otpInput).toBeVisible({ timeout: 5000 })

    // 4. Mock the OTP verify request to return a successful session
    await page.route('**/auth/v1/verify**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          refresh_token: 'mock-refresh',
          expires_in: 3600,
          user: {
            id: 'mock-new-user-123',
            email: 'newuser@example.com',
            aud: 'authenticated',
            role: 'authenticated'
          }
        })
      })
    })

    // 5. Mock the database profile fetch (returns empty/null since new user)
    await page.route('**/rest/v1/profiles?select=**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]) // No profile exists
      })
    })

    // 6. Enter OTP
    await page.getByTestId('otp-input-0').pressSequentially('123456')

    // 7. CRITICAL ASSERTION: The UI should transition to Step 3 (Almost Done / Name & TOS)
    await expect(page.getByText('🌱 Almost Done!')).toBeVisible({ timeout: 5000 })

    // Name field and SMS/TOS options should be visible
    const nameInput = page.locator('input[name="fullName"]')
    await expect(nameInput).toBeVisible()

    // TOS checkbox should be visible
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible()
  })
})
