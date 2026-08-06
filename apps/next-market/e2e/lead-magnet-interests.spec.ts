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

    // 9. Step 8: Lead Capture Form
    const nameInput = page.getByPlaceholder('Jane Doe')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Seller Lead')
    const emailInput = page.locator('input[type="email"]').first()
    if (await emailInput.isVisible()) {
      await emailInput.fill('e2e-seller-lead@test.local')
    }
    // Check required marketing consent checkbox
    const consentCheckbox = page.locator('input[type="checkbox"]').first()
    if (await consentCheckbox.isVisible()) {
      await consentCheckbox.check()
    }

    // Submit lead capture form
    await page.getByRole('button', { name: /Send My Report|Send|Get My Report|Submit/i }).first().click()

    // Verify results / queued view and produce prefilled CTA button
    const ctaLink = page.locator('a[href*="/create-listing"]').first()
    await expect(ctaLink).toBeVisible({ timeout: 15000 })
    const href = await ctaLink.getAttribute('href')
    expect(href).toContain('/create-listing')
  })

  test('LM-02: /check-nutrition-loss lead capture auto-creates buy produce interest', async ({ page }) => {
    // 1. Navigate to /check-nutrition-loss
    await page.goto('/check-nutrition-loss')
    await expect(page.getByText('The Post-Harvest Nutrient Gap')).toBeVisible()

    // 2. Step 1: Click Check My Nutrition Loss →
    await page.getByRole('button', { name: 'Check My Nutrition Loss →' }).click()

    // 3. Step 2: Zipcode
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

    // Intercept interest submission API call
    const interestApiPromise = page.waitForResponse(
      res => res.url().includes('/api/interest/submit') && res.status() === 200
    )

    // 9. Step 8: Lead Form
    const nameInput = page.getByPlaceholder('First and Last Name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Buyer Lead')
    await page.getByPlaceholder('you@example.com').fill('e2e-buyer-lead@casagrown.test')

    await page.getByRole('button', { name: 'Get My Free Nutrition Report →' }).click()

    const interestResponse = await interestApiPromise
    expect(interestResponse.ok()).toBeTruthy()

    // Verify notification badge and browse market CTA button
    const marketCta = page.getByRole('link', { name: /Notify me when local sellers have what I want/i })
    await expect(marketCta).toBeVisible()
    expect(await marketCta.getAttribute('href')).toBe('/interest?scope=buy')
  })
})
