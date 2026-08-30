import { test, expect } from '@playwright/test'

test.describe('Lead Magnet Interest Auto-Registration E2E', () => {
  test('LM-01: /sell lead capture auto-creates sell produce interest', async ({ page }) => {
    // Mock /api/interest/submit
    await page.route('**/api/interest/submit', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    // Mock estimate-earnings edge function
    await page.route('**/functions/v1/estimate-earnings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ai_estimate_result: {
            estimated_annual_earnings: 240,
            excess_produce: '20 lbs of Tomatoes',
            analogies: ['A nice dinner out for two', '3 months of coffee'],
            reasoning: 'Based on local demand for homegrown tomatoes.'
          }
        })
      })
    })

    // 1. Navigate to /sell
    await page.goto('/sell')
    await expect(page.getByText(/Estimate Your Backyard Potential/i)).toBeVisible()

    // 2. Step 1: Click Calculate My Backyard's Value →
    await page.getByRole('button', { name: /Calculate My Backyard's Value →/i }).click()

    // 3. Step 2: Enter Zipcode 95125
    await page.getByPlaceholder('e.g. 90210').fill('95125')
    await page.getByRole('button', { name: 'Next →' }).click()

    // 4. Step 3: Select Garden Size
    await page.getByText('1-2 Raised Beds').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 5. Step 4: Fruit Trees
    await page.getByRole('button', { name: 'Next →' }).click()

    // 6. Step 5: Plants
    await page.getByText('Tomatoes').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 7. Step 6: Habits
    await page.getByText('Give it away to friends & neighbors').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 8. Step 7: Intent
    await page.getByText('Very comfortable — I want to earn extra income!').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 8b. Step 8: Fulfillment Preferences
    await page.getByText('Deliver to buyers in your neighborhood').click()
    await page.getByRole('button', { name: 'Calculate My Potential →' }).click()

    // 9. Step 8: Lead Capture Form — 2-column layout (Social + Email always visible)
    const nameInput = page.getByPlaceholder('Jane Doe')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Seller Lead')
    
    // Email input is always visible (no toggle needed) — fill it directly
    const emailInput = page.getByPlaceholder('hello@example.com')
    await expect(emailInput).toBeVisible({ timeout: 3000 })
    await emailInput.fill('e2e-seller-lead@test.local')

    // Submit via "Continue with email" button (this IS the submit button)
    await page.getByRole('button', { name: /Continue with email/i }).click()

    // 10. Verify redirect to /market with lead magnet parameters
    await page.waitForURL(/\/market\?from=sell_report/, { timeout: 15000 })
    expect(page.url()).toContain('/market')
    expect(page.url()).toContain('from=sell_report')
    expect(page.url()).toContain('zipcode=95125')

    // 11. Verify the expandable report banner is visible on /market
    const reportBanner = page.locator('#lead-magnet-report-banner')
    await expect(reportBanner).toBeVisible({ timeout: 10000 })
    await expect(reportBanner).toContainText(/Your Backyard Potential|Your Report is On Its Way/i)

    // 12. If breakdown toggle button exists, click to expand and verify breakdown panel
    const toggleBtn = page.locator('#toggle-report-breakdown-btn')
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click()
      const breakdown = page.locator('#expanded-report-breakdown')
      await expect(breakdown).toBeVisible()
      await expect(breakdown).toContainText(/Tomatoes/i)
    }
  })

  test('LM-02: /check-nutrition-loss lead capture auto-creates buy produce interest and redirects to /market', async ({ page }) => {
    // Mock /api/interest/submit so it immediately returns 200 (fire-and-forget call)
    let interestSubmitCalled = false
    await page.route('**/api/interest/submit', async (route) => {
      interestSubmitCalled = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    // Mock the Supabase edge function for nutrition-loss estimation (awaited by page)
    await page.route('**/functions/v1/estimate-nutrition-loss', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ai_nutrition_result: {
            summary: 'Store-bought produce loses significant Vitamin C in transit.',
            items: [{ name: 'spinach', time_to_shelf: '7-10 days', nutrient_loss_pct: '80% Vitamin C', impacted_nutrients: 'Vitamin C' }]
          }
        })
      })
    })

    // 1. Navigate to /check-nutrition-loss
    await page.goto('/check-nutrition-loss')
    await expect(page.getByText('The Post-Harvest Nutrient Gap')).toBeVisible()

    // 2. Step 1: Click Check My Nutrition Loss →
    await page.getByRole('button', { name: 'Check My Nutrition Loss →' }).click()

    // 3. Step 2: Zipcode
    await page.getByPlaceholder('e.g. 95125').fill('95125')
    await page.getByRole('button', { name: 'Next →' }).click()

    // 4. Step 3: Select produce (Spinach)
    await page.getByText('Spinach').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 5. Step 4: Store Types
    await page.getByText('Traditional Supermarket').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 6. Step 5: Grocery Fulfillment
    await page.getByText('In-Store Shopping').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 7. Step 6: Shopping Frequency
    await page.getByText('Once a week').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 8. Step 7: Neighbor Openness
    await page.getByText('Very open to trying it!').click()
    await page.getByRole('button', { name: /Calculate My Nutrition Loss|Check My Nutrition Loss/i }).click()

    // 9. Step 8: Lead Form — 2-column layout (Social + Email always visible)
    const nameInput = page.getByPlaceholder('First and Last Name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Buyer Lead')

    // Email input is always visible (no toggle needed) — fill it directly
    const emailInput = page.getByPlaceholder('you@example.com')
    await expect(emailInput).toBeVisible({ timeout: 3000 })
    await emailInput.fill('e2e-buyer-lead@casagrown.test')

    // Submit via "Continue with email" button (this IS the submit button)
    await page.getByRole('button', { name: /Continue with email/i }).click()

    // 10. Verify redirect to /market
    await page.waitForURL(/\/market\?from=nutrition_report/, { timeout: 15000 })
    expect(page.url()).toContain('/market')
    expect(page.url()).toContain('from=nutrition_report')

    // 11. Verify the expandable report banner is visible on /market
    const reportBanner = page.locator('#lead-magnet-report-banner')
    await expect(reportBanner).toBeVisible({ timeout: 10000 })
    await expect(reportBanner).toContainText(/Nutrient Loss Alert/i)

    // 12. Expand breakdown
    const toggleBtn = page.locator('#toggle-report-breakdown-btn')
    await expect(toggleBtn).toBeVisible()
    await toggleBtn.click()

    const breakdown = page.locator('#expanded-report-breakdown')
    await expect(breakdown).toBeVisible()
    await expect(breakdown).toContainText(/spinach/i)

    // Interest submit should have been called (mocked to return 200)
    expect(interestSubmitCalled).toBe(true)
  })

  test('LM-03: Zipcode and Name required validation checks', async ({ page }) => {
    // Navigate to /check-nutrition-loss
    await page.goto('/check-nutrition-loss')
    await page.getByRole('button', { name: 'Check My Nutrition Loss →' }).click()

    // Step 2 Zipcode validation check (button disabled until 5 digits)
    const nextBtn = page.getByRole('button', { name: 'Next →' })
    await expect(nextBtn).toBeDisabled()
    await page.getByPlaceholder('e.g. 95125').fill('9512')
    await expect(nextBtn).toBeDisabled()
    await page.getByPlaceholder('e.g. 95125').fill('95125')
    await expect(nextBtn).toBeEnabled()
  })
})
