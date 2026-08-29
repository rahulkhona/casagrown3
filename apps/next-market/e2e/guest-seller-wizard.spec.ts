import { test, expect } from './fixtures'

// Login tests must run WITHOUT auth — clear any existing session
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Guest Seller Wizard - Step 1 (Basics)', () => {
  test('renders step 1 with email and product fields', async ({ page }) => {
    await page.goto('/create-listing')
    // Should start at step 1
    await expect(page.locator('h2:has-text("Create Your Product Listing")')).toBeVisible()

    // Inputs should be visible
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]')).toBeVisible()
    await expect(page.locator('textarea[placeholder="Tell buyers about your produce..."]')).toBeVisible()
    
    // Category select should be visible
    await expect(page.locator('select')).toBeVisible()

    // Continue button
    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
  })

  test('validates required fields in step 1', async ({ page }) => {
    await page.goto('/create-listing')
    await page.waitForTimeout(1000)

    // Click continue without filling anything
    await page.getByRole('button', { name: 'Next →' }).click()

    // Should show error messages
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Valid email is required')
    expect(bodyText).toContain('Name is required')
    expect(bodyText).toContain('Category is required')

    // Invalid email format
    await page.locator('input[type="email"]').fill('invalid-email')
    await page.getByRole('button', { name: 'Next →' }).click()
    const newBodyText = await page.textContent('body')
    expect(newBodyText).toContain('Valid email is required')
  })

  test('transitions to step 2 when step 1 is valid', async ({ page }) => {
    await page.goto('/create-listing')
    await page.waitForTimeout(1000)

    // Fill out the form
    await page.locator('input[type="email"]').fill('e2e-guest-seller@example.com')
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('Fresh Carrots')
    await page.locator('textarea[placeholder="Tell buyers about your produce..."]').fill('Very fresh')
    await page.locator('select').selectOption({ index: 1 })
    
    // Click continue
    await page.getByRole('button', { name: 'Next →' }).click()

    // Verify transition to step 2
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Guest Seller Wizard - Step 2 (Fulfillment)', () => {
  test('validates address requirement in step 2', async ({ page }) => {
    await page.goto('/create-listing')
    await page.waitForTimeout(1000)

    // Setup Step 1
    await page.locator('input[type="email"]').fill('e2e-guest-seller-2@example.com')
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('Fresh Carrots')
    await page.locator('textarea[placeholder="Tell buyers about your produce..."]').fill('Very fresh')
    await page.locator('select').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Next →' }).click()

    // Wait for Step 2
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 })

    // Try to continue without address
    await page.getByRole('button', { name: 'Next →' }).click()
    
    // Should show error
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Home/Farm address is required')
  })

  test('transitions to step 3 when step 2 is valid', async ({ page }) => {
    await page.goto('/create-listing')
    await page.waitForTimeout(1000)

    // Setup Step 1
    await page.locator('input[type="email"]').fill('e2e-guest-seller-3@example.com')
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('Fresh Carrots')
    await page.locator('textarea[placeholder="Tell buyers about your produce..."]').fill('Very fresh')
    await page.locator('select').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Next →' }).click()

    // Wait for Step 2
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 })

    // Fill Address
    await page.getByPlaceholder('Street Address').first().fill('100 Main St')
    await page.getByPlaceholder('City').first().fill('San Francisco')
    await page.getByPlaceholder('ST').first().fill('CA')
    await page.getByPlaceholder('ZIP').first().fill('94105')
    
    // Select window if custom or standard pill is present
    const todayPill = page.getByText(/^Today/i).first()
    if (await todayPill.isVisible({ timeout: 1000 }).catch(() => false)) {
      await todayPill.click()
    }

    // Click continue
    await page.getByRole('button', { name: 'Next →' }).click()

    // Wait for Step 3
    await expect(page.locator('h2:has-text("Set Your Price")')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Guest Seller Wizard - Step 3 (Pricing)', () => {
  test('requires price and transitions to step 4', async ({ page }) => {
    await page.goto('/create-listing')
    await page.waitForTimeout(1000)

    // Setup Step 1
    await page.locator('input[type="email"]').fill('e2e-guest-seller-4@example.com')
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('Fresh Carrots')
    await page.locator('textarea[placeholder="Tell buyers about your produce..."]').fill('Very fresh')
    await page.locator('select').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Next →' }).click()

    // Wait for Step 2
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 })
    await page.getByPlaceholder('Street Address').first().fill('100 Main St')
    await page.getByPlaceholder('City').first().fill('San Francisco')
    await page.getByPlaceholder('ST').first().fill('CA')
    await page.getByPlaceholder('ZIP').first().fill('94105')

    // Proceed to Step 3 (pre-selected schedule is already populated)
    await page.getByRole('button', { name: 'Next →' }).click()

    // Wait for Step 3
    await expect(page.locator('h2:has-text("Set Your Price")')).toBeVisible({ timeout: 15000 })
    
    // Try to continue without price
    await page.getByRole('button', { name: 'Next →' }).click()
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Price is required unless marked as free')

    // Fill Quantity and Price
    await page.locator('input[type="number"]').first().fill('10')
    await page.locator('input[type="number"]').last().fill('5.99')

    // Click continue
    await page.getByRole('button', { name: 'Next →' }).click()

    // Wait for Step 4
    await expect(page.locator('h2:has-text("Secure Your Listing")')).toBeVisible({ timeout: 15000 })
  })
})
