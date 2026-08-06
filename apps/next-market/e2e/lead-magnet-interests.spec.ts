import { test, expect } from '@playwright/test'

test.describe('Lead Magnet Interest Auto-Registration E2E', () => {
  test('LM-01: /sell lead capture auto-creates sell produce interest', async ({ page }) => {
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

    // Verify results / queued view and produce prefilled CTA button
    const ctaLink = page.locator('a[href*="/create-listing"]').first()
    await expect(ctaLink).toBeVisible({ timeout: 15000 })
    const href = await ctaLink.getAttribute('href')
    expect(href).toContain('/create-listing')

    // Verify secondary demand alerts CTA
    const demandCta = page.locator('a[href*="/interest?scope=sell"]').first()
    await expect(demandCta).toBeVisible({ timeout: 5000 })
    await expect(demandCta).toContainText('Get Notified When Buyers Want Your Produce')
  })

  test('LM-02: /check-nutrition-loss lead capture auto-creates buy produce interest', async ({ page }) => {
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

    // Set up response interception BEFORE clicking submit
    const interestApiPromise = page.waitForResponse(
      res => res.url().includes('/api/interest/submit') && res.status() === 200
    )

    // Submit via "Continue with email" button (this IS the submit button)
    await page.getByRole('button', { name: /Continue with email/i }).click()

    const interestResponse = await interestApiPromise
    expect(interestResponse.ok()).toBeTruthy()

    // Verify the new CTA: 'Set Up Your Produce Alerts'
    const marketCta = page.getByRole('link', { name: /Set Up Your Produce Alerts/i })
    await expect(marketCta).toBeVisible({ timeout: 15000 })
    expect(await marketCta.getAttribute('href')).toContain('/interest?scope=buy')
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
