import { test, expect } from '@playwright/test'

test.describe('Lead Magnet Interest Auto-Registration E2E', () => {
  test('LM-01: /sell lead capture auto-creates sell produce interest', async ({ page }) => {
    // 1. Navigate to /sell
    await page.goto('/sell')
    await expect(page.getByText('Estimate My Potential')).toBeVisible()

    // 2. Step 1: Click Get My Estimate →
    await page.getByRole('button', { name: 'Get My Estimate →' }).click()

    // 3. Step 2: Enter Zipcode 95125
    await page.getByPlaceholder('e.g. 90210').fill('95125')
    await page.getByRole('button', { name: 'Next →' }).click()

    // 4. Step 3: Select Garden Size
    await page.getByText('1-2 Raised Beds').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 5. Step 4: Fruit Trees
    await page.getByText('Avocados').click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // 6. Step 5: Plants
    await page.getByText('Tomatoes').click()
    await page.getByRole('button', { name: 'Estimate My Potential' }).click()

    // 7. Step 6: Lead Capture Form
    const nameInput = page.getByPlaceholder('Jane Doe')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Seller Lead')
    await page.getByPlaceholder('hello@example.com').fill('e2e-seller-lead@casagrown.test')
    
    // Consent checkbox
    await page.locator('input[type="checkbox"]').check()

    // Intercept interest submission API call
    const interestApiPromise = page.waitForResponse(
      res => res.url().includes('/api/interest/submit') && res.status() === 200
    )

    await page.getByRole('button', { name: 'Send My Report →' }).click()

    const interestResponse = await interestApiPromise
    expect(interestResponse.ok()).toBeTruthy()

    // Verify results / queued view and produce prefilled CTA button
    const ctaLink = page.getByRole('link', { name: /Create Your First Listing Now/i })
    await expect(ctaLink).toBeVisible({ timeout: 10000 })
    const href = await ctaLink.getAttribute('href')
    expect(href).toContain('/create-listing')
    expect(href).toContain('produce=Tomatoes')
  })

  test('LM-02: /check-nutrition-loss lead capture auto-creates buy produce interest', async ({ page }) => {
    // 1. Navigate to /check-nutrition-loss
    await page.goto('/check-nutrition-loss')
    await expect(page.getByText('The Post-Harvest Nutrient Gap')).toBeVisible()

    // 2. Step 1: Click Check My Nutrition Loss →
    await page.getByRole('button', { name: 'Check My Nutrition Loss →' }).click()

    // 3. Step 2: Select produce (Spinach)
    await page.getByText('Spinach').click()

    // Intercept interest submission API call
    const interestApiPromise = page.waitForResponse(
      res => res.url().includes('/api/interest/submit') && res.status() === 200
    )

    await page.getByRole('button', { name: 'Calculate Loss' }).click()

    // 4. Step 3: Lead Capture Form
    const nameInput = page.getByPlaceholder('Jane Doe')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('E2E Buyer Lead')
    await page.getByPlaceholder('hello@example.com').fill('e2e-buyer-lead@casagrown.test')
    
    // Consent checkbox
    await page.locator('input[type="checkbox"]').check()

    await page.getByRole('button', { name: 'Send My Report →' }).click()

    const interestResponse = await interestApiPromise
    expect(interestResponse.ok()).toBeTruthy()

    // Verify notification badge and browse market CTA button
    await expect(page.getByText(/We'll notify you at/i)).toBeVisible({ timeout: 10000 })
    const marketCta = page.getByRole('link', { name: '🛒 Browse Fresh Local Produce Nearby →' })
    await expect(marketCta).toBeVisible()
    expect(await marketCta.getAttribute('href')).toBe('/market')
  })
})
