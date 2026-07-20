import { test, expect } from './fixtures'

// Tests run WITHOUT auth — simulating guest users
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('QuickSetup - OTP Empty Profile Prevention (Sign In)', () => {
  test('redirects new user from Sign In OTP to profile form', async ({ page }) => {
    // 1. Navigate to trigger QuickSetupModal
    await page.goto('/create-listing-simple')
    await page.waitForTimeout(2000)

    // Enter text and click submit to trigger auth requirement/modal
    await page.locator('textarea').fill('Fresh organic oranges ready to eat')
    await page.locator('button:has-text("Create My Listing")').click()

    // Now the modal should open
    const modal = page.locator('[data-testid="quick-setup-modal"]')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Click 'Sign In' tab toggle in the modal
    await page.locator('[data-testid="returning-user-toggle"]').click()

    // Verify we are on Sign In (name/address hidden)
    await expect(page.getByText('Welcome Back')).toBeVisible()
    const nameInput = page.locator('input[name="fullName"]')
    await expect(nameInput).not.toBeVisible()

    // 3. Mock the OTP send request
    await page.route('**/auth/v1/otp**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: "OTP sent" })
      })
    })

    // 4. Enter email and click send code
    await page.locator('input[name="email"]').fill('newuser@example.com')
    
    // Debug: print the button HTML to see why it is disabled or hidden
    const btnHtml = await page.getByRole('button', { name: /Send Code/i }).evaluate(el => el.outerHTML)
    console.log('BUTTON HTML:', btnHtml)

    await page.getByRole('button', { name: /Send Code/i }).click()

    // Wait for OTP input to appear
    const otpInput = page.getByTestId('otp-input-0')
    await expect(otpInput).toBeVisible({ timeout: 5000 })

    // 5. Mock the OTP verify request to return a successful session
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

    // 6. Mock the database profile fetch (returns empty/null since new user)
    await page.route('**/rest/v1/profiles?select=**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]) // No profile exists
      })
    })

    // 7. Enter OTP (this triggers the verify automatically via useEffect)
    await page.getByTestId('otp-input-0').pressSequentially('123456')


    // 8. CRITICAL ASSERTION: The UI should transition back to the profile form
    // and show the welcome message, because the user has no profile
    await expect(page.getByText('Welcome! Please complete your profile')).toBeVisible({ timeout: 5000 })
    
    // The name and address fields should now be visible
    await expect(nameInput).toBeVisible()
    await expect(page.locator('input[name="street"]')).toBeVisible()
    
    // The email should be pre-filled and disabled
    const emailInput = page.locator('input[name="email"]')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveValue('newuser@example.com')
    await expect(emailInput).toBeDisabled()
    
    // The ToS checkbox should be visible inline
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible()
  })
})
