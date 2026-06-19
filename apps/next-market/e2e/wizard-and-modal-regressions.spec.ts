import { test, expect } from './fixtures'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Buyer user ID from seed.sql
const BUYER_ID = 'b2222222-2222-2222-2222-222222222222'

/** Reset buyer@test.local's profile to known-good state via service-role DB patch */
async function resetBuyerProfile() {
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${BUYER_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      full_name: 'Beth Buyer',
      street_address: '1247 Minnesota Ave',
      city: 'San Jose',
      state_code: 'CA',
      zip_code: '95125',
      profile_completed_at: new Date().toISOString(),
      tos_accepted_at: new Date().toISOString(),
    }),
  })
}

/** Set up Beth Buyer's booth defaults for E2E testing */
async function setupTestBooth() {
  // 0. Truncate all orders cascade to avoid foreign key constraints across multiple tables
  const { execSync } = require('child_process')
  try {
    execSync('docker exec -i supabase_db_casagrown3 psql -U postgres -c "TRUNCATE TABLE market_orders CASCADE;"', { stdio: 'ignore' })
  } catch (err) {
    console.error('Failed to truncate market_orders:', err)
  }

  // 1. Delete any existing products for BUYER_ID to avoid foreign key constraints
  const deleteProductsRes = await fetch(`${SUPABASE_URL}/rest/v1/market_products?seller_id=eq.${BUYER_ID}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  })
  if (!deleteProductsRes.ok) {
    const errText = await deleteProductsRes.text()
    throw new Error(`Failed to delete products: ${deleteProductsRes.status} ${errText}`)
  }

  // 2. Delete any existing booth for BUYER_ID
  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/market_booths?owner_id=eq.${BUYER_ID}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  })
  if (!deleteRes.ok) {
    const errText = await deleteRes.text()
    throw new Error(`Failed to delete booth: ${deleteRes.status} ${errText}`)
  }

  // 2. Insert fresh booth defaults
  const postRes = await fetch(`${SUPABASE_URL}/rest/v1/market_booths`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      owner_id: BUYER_ID,
      name: 'Beth Garden Stand',
      offers_delivery: true,
      offers_pickup: true,
      delivery_radius_miles: 10,
      pickup_address: '1247 Minnesota Ave, San Jose, CA 95125',
      weekly_delivery_windows: {
        Saturday: [{ id: '10-12', label: '10–12p' }]
      },
      weekly_pickup_windows: {
        Sunday: [{ id: '12-14', label: '12–2p' }]
      }
    }),
  })
  if (!postRes.ok) {
    const errText = await postRes.text()
    throw new Error(`Failed to insert booth: ${postRes.status} ${errText}`)
  }
}

test.describe.serial('Wizard and Modal Regression Tests (Authed)', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test.beforeEach(async ({ page }) => {
    // Force mobile viewport to test BottomNav responsive behavior and layout spacing
    await page.setViewportSize({ width: 375, height: 812 })
  })

  test('logged-in user has profile address pre-populated and web bottom nav visible', async ({ page }) => {
    // Reset profile before this specific test to ensure address fields are populated
    await resetBuyerProfile()

    await page.goto('/create-listing')
    await expect(page.locator('h2:has-text("Create Your Product Listing")')).toBeVisible({ timeout: 15000 })

    // 1. Check that web BottomNav is visible on mobile (padding prevents overlap with wizard buttons)
    await expect(page.locator('nav[class*="bottomNav"]')).toBeVisible()

    // 2. Fill Step 1 Basics — wait for full hydration and auth resolution
    await page.waitForLoadState('networkidle')
    await expect(page.locator('input[type="email"]')).toBeDisabled({ timeout: 15000 })

    const nameInput = page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('E2E Prepopulated Tomatoes')

    // Wait for categories to load from DB before selecting
    const categorySelect = page.locator('select', { has: page.locator('option:has-text("Select Category")') })
    await expect(categorySelect.locator('option')).not.toHaveCount(1, { timeout: 15000 })

    // Get the first real category value (not the empty "Select Category" option)
    const firstCategoryValue = await categorySelect.locator('option:not([value=""])').first().getAttribute('value')
    expect(firstCategoryValue).toBeTruthy()

    // Select by value — more reliable than index for React controlled components
    await categorySelect.selectOption(firstCategoryValue!)
    await page.waitForTimeout(300) // Let React state settle

    // Verify the category actually got selected
    await expect(categorySelect).not.toHaveValue('', { timeout: 5000 })

    // Click Next with retry loop — under heavy load, React onChange can lag behind DOM
    const step2Heading = page.locator('h2:has-text("How will buyers get it?")')
    const nextButton = page.getByRole('button', { name: 'Next →' })

    for (let attempt = 0; attempt < 3; attempt++) {
      await nextButton.click()
      if (await step2Heading.isVisible({ timeout: 5000 }).catch(() => false)) break

      // Re-fill and re-select to recover from React state timing issue
      await nameInput.fill('E2E Prepopulated Tomatoes')
      await categorySelect.selectOption(firstCategoryValue!)
      // Force native change event in case React didn't pick up selectOption
      await categorySelect.dispatchEvent('change')
      await page.waitForTimeout(500)
    }

    // 3. Verify Step 2 Fulfillment pre-population
    await expect(step2Heading).toBeVisible({ timeout: 15000 })

    // Check that street, city, zip are automatically pre-populated from seeded profile
    await expect(page.locator('input[placeholder="Street Address"]').first()).not.toHaveValue('', { timeout: 10000 })
    await expect(page.locator('input[placeholder="City"]').first()).not.toHaveValue('', { timeout: 10000 })
    await expect(page.locator('input[placeholder="ZIP"]').first()).not.toHaveValue('', { timeout: 10000 })

    // 4. Select a delivery day and a pickup day to satisfy fulfillment validation
    await page.locator('button:has-text("Today")').first().click()
    await page.locator('button:has-text("Today")').nth(1).click()

    // 5. Verify that the Next button is clickable and not obscured
    const nextBtn2 = page.getByRole('button', { name: 'Next →' })
    await expect(nextBtn2).toBeVisible()
    await nextBtn2.click()

    // Verify we proceed to Step 3
    await expect(page.locator('h2:has-text("Set Your Price")')).toBeVisible({ timeout: 10000 })
  })

  test('fulfillment step loads pre-configured booth weekly defaults on subsequent listing flows', async ({ page }) => {
    // 1. Setup booth defaults
    await setupTestBooth()

    await page.goto('/create-listing')
    await expect(page.locator('h2:has-text("Create Your Product Listing")')).toBeVisible({ timeout: 15000 })

    // Wait for full hydration and auth resolution
    await page.waitForLoadState('networkidle')
    await expect(page.locator('input[type="email"]')).toBeDisabled({ timeout: 15000 })

    // 2. Fill Step 1 Basics
    const nameInput = page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Fulfillment Defaults Tomatoes')

    const categorySelect = page.locator('select', { has: page.locator('option:has-text("Select Category")') })
    await expect(categorySelect.locator('option')).not.toHaveCount(1, { timeout: 15000 })
    const firstCategoryValue = await categorySelect.locator('option:not([value=""])').first().getAttribute('value')
    await categorySelect.selectOption(firstCategoryValue!)

    // Click Next
    await page.getByRole('button', { name: 'Next →' }).click()

    // 3. Verify Step 2 Fulfillment shows default days selected
    const step2Heading = page.locator('h2:has-text("How will buyers get it?")')
    await expect(step2Heading).toBeVisible({ timeout: 15000 })

    // Check that default Saturday and Sunday buttons are automatically selected (contain checkbox/emoji or state checks)
    const satBtn = page.getByTestId('delivery-box').locator('button:has-text("Sat")').first()
    await expect(satBtn).toContainText('✅')

    const sunBtn = page.getByTestId('pickup-box').locator('button:has-text("Sun")').first()
    await expect(sunBtn).toContainText('✅')
  })

  test('native-app class hiding bottom nav test on other routes', async ({ page }) => {
    // Navigate to /market (where bottom nav is normally visible)
    await page.goto('/market')
    
    // Web bottom nav should be visible by default on mobile viewport
    const bottomNav = page.locator('nav[class*="bottomNav"]')
    await expect(bottomNav).toBeVisible()

    // Inject native-app class to simulate Expo WebView wrapper
    await page.evaluate(() => {
      document.documentElement.classList.add('native-app')
    })

    // In this app, we still want web bottom nav visible inside the native wrapper
    // since there is no native tab bar. Let's make sure it remains visible.
    await expect(bottomNav).toBeVisible()
  })
})

test.describe('QuickSetupModal Tab Switcher (Guest)', () => {
  // Clear authenticated state to trigger onboarding modal
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
  })

  test('onboarding gate triggers QuickSetupModal with tabbed switcher', async ({ page }) => {
    // Navigate to a protected route to trigger the onboarding modal
    await page.goto('/orders')

    // QuickSetupModal should open
    const modal = page.locator('[data-testid="quick-setup-step-1"]')
    await expect(modal).toBeVisible({ timeout: 10000 })

    // Tab switcher should be visible
    const signUpTab = page.getByRole('button', { name: 'Sign Up' })
    const signInTab = page.getByRole('button', { name: 'Sign In' })
    await expect(signUpTab).toBeVisible()
    await expect(signInTab).toBeVisible()

    // Verify Sign Up fields are displayed by default (Full Name, Street Address, etc.)
    await expect(page.locator('input[name="fullName"]')).toBeVisible()
    await expect(page.locator('input[name="street"]')).toBeVisible()

    // Click Sign In tab
    await signInTab.click()

    // Verify Name and Address fields are hidden, leaving only Email
    await expect(page.locator('input[name="fullName"]')).not.toBeVisible()
    await expect(page.locator('input[name="street"]')).not.toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()

    // Click Sign Up tab back
    await signUpTab.click()
    await expect(page.locator('input[name="fullName"]')).toBeVisible()
  })
})
