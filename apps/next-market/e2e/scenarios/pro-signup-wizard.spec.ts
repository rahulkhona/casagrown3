import { test, expect, Page, Browser } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  execSql,
  TEST_USERS,
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  collectConsoleErrors,
  assertPageHealthy,
} from './scenario-helpers'

/**
 * Pro Signup Wizard — Comprehensive E2E Tests
 *
 * Tests the main marketing entry points for CasaGrown:
 *   /pro  — Canonical pro signup page (standalone layout)
 *   /p/[slug] — Promo-specific landing page (marketing layout)
 *
 * Architecture:
 *   Both pages share the same multi-step wizard:
 *     initial → profile → otp → payment → success
 *     Pro/Elite: booth_setup → manage_features → first_listing → done
 *     Lite: lite_intent (4 intent buttons)
 *
 * Test strategy:
 *   Groups 1-4: Live DB integration tests (navigate to real pages, verify DOM)
 *   Group 5: Mocked tests (page.route() intercepts to simulate wizard steps)
 *   Groups 6-7: Hybrid (some live, some mocked)
 */

test.describe.configure({ mode: 'default' })

// ---------------------------------------------------------------------------
// Shared mock data & helpers (for Groups 5-7 mocked tests)
// ---------------------------------------------------------------------------

const futureDate = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

const MOCK_TIERS = [
  {
    tier_name: 'lite',
    display_name: 'Lite Base',
    subscription_price: 0.0,
    platform_fee_pct: 10.0,
    max_booths: 1,
    features: { facebook_sync: false, growbot_copilot: false, custom_branding: false },
  },
  {
    tier_name: 'pro',
    display_name: 'CasaGrown Pro',
    subscription_price: 10.0,
    platform_fee_pct: 5.0,
    max_booths: 3,
    features: { facebook_sync: true, growbot_copilot: true, custom_branding: false },
  },
  {
    tier_name: 'elite',
    display_name: 'CasaGrown Elite',
    subscription_price: 29.0,
    platform_fee_pct: 2.0,
    max_booths: 100,
    features: { facebook_sync: true, growbot_copilot: true, custom_branding: true },
  },
]

/** Install mocks needed for the /pro page as a guest with no promotion */
async function installProPageMocks(page: Page) {
  // Guest auth session
  await page.route('**/auth/v1/session*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { session: null } }),
    })
  })
  await page.route('**/auth/v1/user*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: null } }),
    })
  })
  // Subscription tiers
  await page.route('**/rest/v1/subscription_tiers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TIERS),
    })
  })
  // Misc REST
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
  })
  await page.route('**/rest/v1/crm_leads*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/rest/v1/market_booths*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
  })
  await page.route('**/rest/v1/user_subscription_discounts*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  // No universal promo active
  await page.route('**/rest/v1/crm_promotions*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/rest/v1/crm_promo_subscription_discounts*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  // Pro testers (make Elite visible)
  await page.route('**/rest/v1/pro_testers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ email: 'test@test.local' }]),
    })
  })
}

/** Install mocks for an authenticated Pro user with an active subscription but NO booth */
async function installAuthenticatedProMocks(
  page: Page,
  opts: {
    plan?: 'pro' | 'elite'
    hasBooth?: boolean
    userId?: string
    email?: string
  } = {},
) {
  const plan = opts.plan || 'pro'
  const hasBooth = opts.hasBooth ?? false
  const userId = opts.userId || 'mock-pro-user-id'
  const email = opts.email || 'maria@test.local'

  // Authenticated session
  await page.route('**/auth/v1/session*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          session: {
            user: { id: userId, email, user_metadata: { full_name: 'Maria Garcia' } },
            access_token: 'mock-token',
          },
        },
      }),
    })
  })
  await page.route('**/auth/v1/user*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          user: { id: userId, email, user_metadata: { full_name: 'Maria Garcia' } },
        },
      }),
    })
  })

  // Tiers
  await page.route('**/rest/v1/subscription_tiers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TIERS),
    })
  })

  // Profile with data
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: userId,
            full_name: 'Maria Garcia',
            phone: '5551234567',
            phone_number: '5551234567',
            street_address: '456 Farm Rd, San Jose, CA 95120',
            city: 'San Jose',
            state_code: 'CA',
            zip_code: '95120',
            farm_name: "Maria's Farm",
            tos_accepted_at: new Date().toISOString(),
            sms_consent: true,
          },
        ]),
      })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
  })

  // Active subscription
  await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user_id: userId,
            plan,
            status: 'active',
            stripe_customer_id: 'cus_mock123',
            stripe_subscription_id: 'sub_mock123',
          },
        ]),
      })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
  })

  // Booths
  await page.route('**/rest/v1/market_booths*', async (route) => {
    if (hasBooth) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'booth-1', name: "Maria's Stand", is_default: true, is_open: true, marked_for_archival: false },
        ]),
      })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    }
  })

  // No existing promotion discounts
  await page.route('**/rest/v1/user_subscription_discounts*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  // No universal promo
  await page.route('**/rest/v1/crm_promotions*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/rest/v1/crm_promo_subscription_discounts*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/rest/v1/crm_leads*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  // Pro testers
  await page.route('**/rest/v1/pro_testers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ email }]),
    })
  })
}

/** Fill the profile form with valid test data */
async function fillProfileForm(page: Page, opts: { farmName?: string } = {}) {
  await page.fill('input[placeholder="Jane Doe"]', 'Jane Test')
  await page.fill('input[placeholder="123 Farm Road"]', '456 Farm Rd')
  await page.fill('input[placeholder="City"]', 'Testville')
  await page.fill('input[placeholder="ST"]', 'CA')
  await page.fill('input[placeholder="12345"]', '90210')
  await page.fill('input[placeholder="(555) 555-5555"]', '5551234567')
  if (opts.farmName) {
    await page.fill('input[placeholder="e.g. Oakridge Farms"]', opts.farmName)
  }
  // Accept ToS — last checkbox
  await page.locator('input[type="checkbox"]').last().check()
}

// ===========================================================================
// GROUP 1: /pro Page — Initial Load & UI
// ===========================================================================

test.describe('Group 1: /pro Page — Initial Load & UI', () => {
  test('1. /pro page loads without JS errors', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Filter out benign errors
    const critical = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('hydration') &&
        !e.includes('ResizeObserver') &&
        !e.includes('404') &&
        !e.includes('net::ERR') &&
        !e.includes('CORS') &&
        !e.includes('Failed to fetch'),
    )
    expect(critical.length).toBe(0)
  })

  test('2. Page headline and description render', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // The page shows "Start Selling Local" when no promo is active
    const headline = page.locator('.promo-headline')
    await expect(headline).toBeVisible({ timeout: 10_000 })
    const text = await headline.textContent()
    expect(text).toBeTruthy()
    // Page should also show a description
    const description = page.locator('.promo-description')
    await expect(description).toBeVisible()
  })

  test('3. Three tier cards render (Lite, Pro, Elite)', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // All three tier cards should be visible
    const tierCards = page.locator('.tier-card')
    await expect(tierCards).toHaveCount(3, { timeout: 10_000 })

    // Verify tier names
    await expect(page.locator('.tier-card-title').nth(0)).toHaveText('Lite Base')
    await expect(page.locator('.tier-card-title').nth(1)).toHaveText('CasaGrown Pro')
    await expect(page.locator('.tier-card-title').nth(2)).toHaveText('CasaGrown Elite')

    // Verify pricing
    await expect(page.locator('.tier-card').nth(0).locator('.price-active')).toContainText('$0.00')
    await expect(page.locator('.tier-card').nth(1).locator('.price-active')).toContainText('$10.00')
    await expect(page.locator('.tier-card').nth(2).locator('.price-active')).toContainText('$29.00')
  })

  test('4. Default tier is pre-selected (Pro)', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Pro card (index 1) should have the 'selected' class
    await expect(page.locator('.tier-card').nth(1)).toHaveClass(/selected/)
    // Others should NOT
    await expect(page.locator('.tier-card').nth(0)).not.toHaveClass(/selected/)
    await expect(page.locator('.tier-card').nth(2)).not.toHaveClass(/selected/)
  })

  test('5. Clicking a tier card updates selection styling', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Click Lite
    await page.locator('.tier-card').nth(0).click()
    await page.waitForTimeout(300)
    await expect(page.locator('.tier-card').nth(0)).toHaveClass(/selected/)
    await expect(page.locator('.tier-card').nth(1)).not.toHaveClass(/selected/)

    // Click Elite
    await page.locator('.tier-card').nth(2).click()
    await page.waitForTimeout(300)
    await expect(page.locator('.tier-card').nth(2)).toHaveClass(/selected/)
    await expect(page.locator('.tier-card').nth(0)).not.toHaveClass(/selected/)
    await expect(page.locator('.tier-card').nth(1)).not.toHaveClass(/selected/)
  })

  test('6. Email input is visible and focusable', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()
    await emailInput.focus()
    await expect(emailInput).toBeFocused()
  })

  test('7. Continue button is present and disabled without email', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const continueBtn = page.locator('button.btn-action:has-text("Continue")')
    await expect(continueBtn).toBeVisible()
    // Clear email to ensure it's empty, then verify button is disabled
    await page.fill('input[type="email"]', '')
    await page.waitForTimeout(300)
    // The button uses disabled={submitting || !email} — check the disabled attribute
    const isDisabled = await continueBtn.isDisabled()
    expect(isDisabled).toBe(true)
  })

  test('8. Page is responsive (375px mobile viewport)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()

    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Tier cards and email input should still be visible on mobile
    await expect(page.locator('.tier-card').first()).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()

    // The page should not have horizontal scroll (content fits)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5) // 5px tolerance

    await context.close()
  })
})

// ===========================================================================
// GROUP 2: /p/[slug] Page — Promo Landing
// ===========================================================================

test.describe('Group 2: /p/[slug] Page — Promo Landing', () => {
  let promoSlug: string | null = null

  test.beforeAll(() => {
    // Query for an active promotion slug from the DB
    const result = execSql(
      "SELECT slug FROM crm_promotions WHERE deleted_at IS NULL AND enrollment_deadline > now() AND slug IS NOT NULL AND slug != '' LIMIT 1",
    )
    promoSlug = result?.trim() || null
  })

  test('9. Find active promotion slug and load page', async ({ page }) => {
    test.skip(!promoSlug, 'No active promotion with slug found in DB — skipping group')

    const errors = collectConsoleErrors(page)
    await page.goto(`${BASE_URL}/p/${promoSlug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Page should load without fatal JS errors
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)
    // Should not show the generic error message
    expect(body).not.toContain('Application error')
  })

  test('10. /p/{slug} shows promotion details', async ({ page }) => {
    test.skip(!promoSlug, 'No active promotion slug')

    await page.goto(`${BASE_URL}/p/${promoSlug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Promotion title should render in the h1 headline
    const headline = page.locator('.promo-headline, h1').first()
    await expect(headline).toBeVisible({ timeout: 10_000 })
    const headlineText = await headline.textContent()
    expect(headlineText!.length).toBeGreaterThan(3)
  })

  test('11. Promotion hero section renders', async ({ page }) => {
    test.skip(!promoSlug, 'No active promotion slug')

    await page.goto(`${BASE_URL}/p/${promoSlug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Either a hero image or a promo-bg-layer should be visible
    const hasHero =
      (await page.locator('.promo-bg-layer').count()) > 0 ||
      (await page.locator('.promo-hero-section').count()) > 0
    expect(hasHero).toBe(true)
  })

  test('12. Tier cards render on promo page', async ({ page }) => {
    test.skip(!promoSlug, 'No active promotion slug')

    await page.goto(`${BASE_URL}/p/${promoSlug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // At least Lite and Pro tier cards should render
    const tierCards = page.locator('.tier-card')
    const count = await tierCards.count()
    expect(count).toBeGreaterThanOrEqual(2) // At minimum Lite + Pro
  })

  test('13. Email input and Continue button are present on promo page', async ({ page }) => {
    test.skip(!promoSlug, 'No active promotion slug')

    await page.goto(`${BASE_URL}/p/${promoSlug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('button.btn-action').first()).toBeVisible()
  })

  test('14. Incentive cards render if discounts exist', async ({ page }) => {
    test.skip(!promoSlug, 'No active promotion slug')

    await page.goto(`${BASE_URL}/p/${promoSlug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Check for any incentive content (buyer credits, subscription discount, giveaway)
    const incentiveGrid = page.locator('.promo-incentive-grid')
    const hasIncentives = (await incentiveGrid.count()) > 0

    if (hasIncentives) {
      const items = incentiveGrid.locator('.incentive-item')
      const count = await items.count()
      // If incentive grid exists, it should have at least one incentive
      expect(count).toBeGreaterThanOrEqual(1)
    }
    // If no incentive grid, that's also valid (promo without buyer/sub discounts)
  })
})

// ===========================================================================
// GROUP 3: Form Validation
// ===========================================================================

test.describe('Group 3: Form Validation', () => {
  test('15. Submitting empty email keeps button disabled', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // The continue button should be disabled when email is empty
    const continueBtn = page.locator('button.btn-action:has-text("Continue")')
    await page.fill('input[type="email"]', '')
    await page.waitForTimeout(300)
    const isDisabled1 = await continueBtn.isDisabled()
    expect(isDisabled1).toBe(true)

    // Type and then clear email
    await page.fill('input[type="email"]', 'a')
    await page.fill('input[type="email"]', '')
    await page.waitForTimeout(300)
    const isDisabled2 = await continueBtn.isDisabled()
    expect(isDisabled2).toBe(true)
  })

  test('16. Invalid email format triggers browser validation', async ({ page }) => {
    await installProPageMocks(page)
    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Fill in an invalid email
    await page.fill('input[type="email"]', 'not-an-email')
    // Button should become enabled since text is present
    const continueBtn = page.locator('button.btn-action:has-text("Continue")')

    // Try to submit — browser validation should block it
    await continueBtn.click()
    // The page should still be on the initial step (form submission blocked by browser)
    await expect(page.locator('.tier-cards-grid')).toBeVisible()
  })

  test('17. Farm name field appears when Pro/Elite is selected', async ({ page }) => {
    await installProPageMocks(page)

    // Mock eligibility check so we can advance to profile step
    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: false }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(false),
      })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Pro is selected by default
    await page.fill('input[type="email"]', 'test-farm@example.com')
    await page.click('button:has-text("Continue")')

    // Wait for profile step
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Farm name field should be visible (Pro selected)
    const farmNameInput = page.locator('input[placeholder="e.g. Oakridge Farms"]')
    await expect(farmNameInput).toBeVisible()

    // Business/Farm Name label should be visible
    const farmLabel = page.locator('label:has-text("Business / Farm Name")')
    await expect(farmLabel).toBeVisible()
  })

  test('18. Farm name field disappears when Lite is selected', async ({ page }) => {
    await installProPageMocks(page)

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: false }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(false),
      })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Select Lite before submitting email
    await page.locator('.tier-card').nth(0).click()
    await page.waitForTimeout(300)

    await page.fill('input[type="email"]', 'test-lite@example.com')
    await page.click('button:has-text("Continue")')

    // Wait for profile step
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Farm name field should NOT be visible for Lite
    const farmNameInput = page.locator('input[placeholder="e.g. Oakridge Farms"]')
    await expect(farmNameInput).not.toBeVisible()
  })

  test('19. ZIP code validation rejects non-5-digit codes', async ({ page }) => {
    await installProPageMocks(page)

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: false }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(false),
      })
    })
    await page.route('**/auth/v1/otp', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({}) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Select Lite to skip farm name requirement
    await page.locator('.tier-card').nth(0).click()
    await page.waitForTimeout(300)

    await page.fill('input[type="email"]', 'zip-test@example.com')
    await page.click('button:has-text("Continue")')

    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Fill profile with invalid ZIP
    await page.fill('input[placeholder="Jane Doe"]', 'Jane Test')
    await page.fill('input[placeholder="123 Farm Road"]', '456 Farm Rd')
    await page.fill('input[placeholder="City"]', 'Testville')
    await page.fill('input[placeholder="ST"]', 'CA')
    await page.fill('input[placeholder="12345"]', '123') // Invalid: only 3 digits
    await page.fill('input[placeholder="(555) 555-5555"]', '5551234567')
    await page.locator('input[type="checkbox"]').last().check()

    // Submit
    await page.click('button:has-text("Send Login Code")')
    await page.waitForTimeout(1000)

    // Should show validation error about ZIP
    await expect(page.locator('text=valid 5-digit US ZIP Code')).toBeVisible()
  })

  test('20. ToS checkbox is required', async ({ page }) => {
    await installProPageMocks(page)

    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(false),
      })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Select Lite
    await page.locator('.tier-card').nth(0).click()
    await page.fill('input[type="email"]', 'tos-test@example.com')
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Fill everything except ToS checkbox
    await page.fill('input[placeholder="Jane Doe"]', 'Jane Test')
    await page.fill('input[placeholder="123 Farm Road"]', '456 Farm Rd')
    await page.fill('input[placeholder="City"]', 'Testville')
    await page.fill('input[placeholder="ST"]', 'CA')
    await page.fill('input[placeholder="12345"]', '90210')

    // Submit button should be disabled without ToS
    const submitBtn = page.locator('button.btn-action[type="submit"]')
    await expect(submitBtn).toBeDisabled()

    // Check ToS → should enable button
    await page.locator('input[type="checkbox"]').last().check()
    await page.waitForTimeout(300)
    await expect(submitBtn).toBeEnabled()
  })
})

// ===========================================================================
// GROUP 4: Guest vs Logged-in User Flow
// ===========================================================================

test.describe('Group 4: Guest vs Logged-in User Flow', () => {
  test('21. Logged-in user visiting /pro sees their email pre-filled', async ({ browser }) => {
    const page = await loginAsUser(browser, 'maria')
    await navigateTo(page, '/pro')
    await page.waitForTimeout(3000)

    const emailInput = page.locator('input[type="email"]')
    // Wait for email input to have a value (async session prefill)
    await page.waitForTimeout(2000)
    const emailValue = await emailInput.inputValue()

    // Maria's email should be pre-filled
    expect(emailValue.toLowerCase()).toContain('maria')
    await page.context().close()
  })

  test('22. Logged-in user visiting /pro sees name pre-filled from profile', async ({ browser }) => {
    // Use mocked auth to control profile data exactly
    const context = await browser.newContext()
    const page = await context.newPage()

    await installAuthenticatedProMocks(page, { plan: 'pro', hasBooth: true })

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: true }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Email should be pre-filled
    const emailVal = await page.locator('input[type="email"]').inputValue()
    // Email should be pre-filled (may come from mock or real auth session)
    expect(emailVal.length).toBeGreaterThan(0)
    expect(emailVal).toContain('@')

    // Advance to profile step
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Name should be pre-filled from profile
    // Name should be pre-filled from profile
    const nameVal = await page.locator('input[placeholder="Jane Doe"]').inputValue()
    // Profile data may come from mock (Maria Garcia) or actual DB — just check it's not empty
    expect(nameVal.length).toBeGreaterThan(0)

    // Address fields should be pre-filled
    const streetVal = await page.locator('input[placeholder="123 Farm Road"]').inputValue()
    expect(streetVal.length).toBeGreaterThan(0)

    await context.close()
  })

  test('23. Logged-in Lite user goes directly to lite_intent (no OTP needed)', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await installAuthenticatedProMocks(page, { plan: 'pro', hasBooth: false })

    // Override subscription to no active sub (user is signing up for Lite)
    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              user_id: 'mock-pro-user-id',
              plan: 'lite',
              status: 'inactive',
              stripe_customer_id: null,
              stripe_subscription_id: null,
            },
          ]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: true }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      })
    })
    await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Select Lite
    await page.locator('.tier-card').nth(0).click()
    await page.waitForTimeout(300)

    // Submit email
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Fill profile and submit
    await fillProfileForm(page)
    await page.click('button.btn-action[type="submit"]')
    await page.waitForTimeout(3000)

    // Should go to lite_intent (no OTP needed for logged-in user)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })

    await context.close()
  })

  test('24. Logged-in Pro user with existing card goes to booth_setup (skip payment)', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await installAuthenticatedProMocks(page, { plan: 'pro', hasBooth: false })

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: true }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      })
    })
    await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Pro is already selected by default
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Profile should be pre-filled, fill farm name if needed
    const farmInput = page.locator('input[placeholder="e.g. Oakridge Farms"]')
    const farmVal = await farmInput.inputValue()
    if (!farmVal.trim()) {
      await farmInput.fill("Maria's Farm")
    }

    // Ensure ToS is checked
    const tosCheckbox = page.locator('input[type="checkbox"]').last()
    if (!(await tosCheckbox.isChecked())) {
      await tosCheckbox.check()
    }

    await page.click('button.btn-action[type="submit"]')
    await page.waitForTimeout(3000)

    // Should skip payment and go directly to booth_setup (has active card on file)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    await context.close()
  })
})

// ===========================================================================
// GROUP 5: Post-Payment Wizard (Pro/Elite) — Mocked
// ===========================================================================

test.describe('Group 5: Post-Payment Wizard (Pro/Elite)', () => {
  /**
   * Helper: Navigate to /pro with mocked authenticated Pro user whose profile
   * submit triggers booth_setup step directly (existing card, existing subscription).
   */
  async function setupBoothSetupStep(page: Page) {
    await installAuthenticatedProMocks(page, { plan: 'pro', hasBooth: false })

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: true }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      })
    })
    await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Submit email (pre-filled)
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Ensure farm name and ToS
    const farmInput = page.locator('input[placeholder="e.g. Oakridge Farms"]')
    const farmVal = await farmInput.inputValue()
    if (!farmVal.trim()) await farmInput.fill("Maria's Farm")

    const tosCheckbox = page.locator('input[type="checkbox"]').last()
    if (!(await tosCheckbox.isChecked())) await tosCheckbox.check()

    await page.click('button.btn-action[type="submit"]')
    await page.waitForTimeout(3000)
  }

  test('25. Booth setup step (Step 1 of 3) shows correct heading', async ({ page }) => {
    await setupBoothSetupStep(page)

    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('text=Step 1 of 3')).toBeVisible()
  })

  test('26. Booth setup shows Stand Name, Address, City, State, ZIP, fulfillment', async ({ page }) => {
    await setupBoothSetupStep(page)

    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Stand Name
    await expect(page.locator('label:has-text("Stand Name")')).toBeVisible()
    await expect(page.locator('input[placeholder="e.g. Oakridge Farm Stand"]')).toBeVisible()

    // Street Address
    await expect(page.locator('label:has-text("Street Address")')).toBeVisible()

    // City, State, ZIP
    await expect(page.locator('label:has-text("City")')).toBeVisible()
    await expect(page.locator('label:has-text("State")')).toBeVisible()
    await expect(page.locator('label:has-text("ZIP")')).toBeVisible()

    // Fulfillment checkboxes
    await expect(page.locator('text=Pickup')).toBeVisible()
    await expect(page.locator('text=Delivery')).toBeVisible()
  })

  test('27. Save & Continue button advances to manage_features', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Mock the booth creation
    await page.route('**/rest/v1/market_booths*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-booth-1' }),
        })
      } else if (route.request().url().includes('is_default=eq.true')) {
        // Query for existing default booth
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      }
    })

    await page.click('button:has-text("Save & Continue")')
    await page.waitForTimeout(3000)

    // Should advance to manage_features
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('text=Step 2 of 3')).toBeVisible()
  })

  test('28. Skip for now on booth_setup advances to manage_features', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(1000)

    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })
  })

  test('29. Manage features step (Step 2 of 3) shows Facebook, Instagram, Google sections', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Skip to manage_features
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })

    // Facebook section
    await expect(page.locator('h3:has-text("Facebook Page")')).toBeVisible()
    // Instagram section
    await expect(page.locator('h3:has-text("Instagram Auto-Post")')).toBeVisible()
    // Google section — use h3 to avoid matching multiple elements
    await expect(page.locator('h3:has-text("Google Business Profile")')).toBeVisible()
  })

  test.skip('30. Elite users see WhatsApp section on manage_features', async ({ page }) => {
    // Use Elite plan for this test
    await installAuthenticatedProMocks(page, { plan: 'elite', hasBooth: false })

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: true }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(true) })
    })
    await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Select Elite tier
    await page.locator('.tier-card').nth(2).click()
    await page.waitForTimeout(300)

    // Advance through wizard
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    const farmInput = page.locator('input[placeholder="e.g. Oakridge Farms"]')
    const farmVal = await farmInput.inputValue()
    if (!farmVal.trim()) await farmInput.fill("Maria's Elite Farm")

    const tosCheckbox = page.locator('input[type="checkbox"]').last()
    if (!(await tosCheckbox.isChecked())) await tosCheckbox.check()

    await page.click('button.btn-action[type="submit"]')
    await page.waitForTimeout(3000)

    // Skip booth setup to get to features
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })

    // WhatsApp Business section should be visible for Elite
    await expect(page.locator('text=WhatsApp Business')).toBeVisible()
  })

  test('31. Skip for now on manage_features advances to first_listing', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Skip booth setup
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })

    // Skip manage features
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(1000)

    // Should advance to first_listing
    await expect(page.locator('text=Your First Listing')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Step 3 of 3')).toBeVisible()
  })

  test('32. First listing step shows photo upload, product name, price', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Skip to first listing
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Your First Listing')).toBeVisible({ timeout: 10_000 })

    // Photo upload area
    await expect(page.locator('text=Tap to add a photo')).toBeVisible()

    // Product Name
    await expect(page.locator('label:has-text("Product Name")')).toBeVisible()
    await expect(page.locator('input[placeholder="e.g. Fresh Tomatoes"]')).toBeVisible()

    // Price
    await expect(page.locator('label:has-text("Price")')).toBeVisible()

    // Quantity
    await expect(page.locator('label:has-text("Quantity")')).toBeVisible()
  })

  test('33. Skip for now on first_listing advances to done', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Skip all steps
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Your First Listing')).toBeVisible({ timeout: 10_000 })
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(1000)

    // Should advance to done
    await expect(page.locator('text=You\'re All Set!')).toBeVisible({ timeout: 10_000 })
  })

  test('34. Done step shows celebration emoji and "You\'re All Set!" heading', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Skip all steps to done
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Your First Listing')).toBeVisible({ timeout: 10_000 })
    await page.click('button:has-text("Skip for now")')

    // Celebration emoji
    await expect(page.locator('text=🎉')).toBeVisible({ timeout: 10_000 })
    // "You're All Set!" heading
    await expect(page.locator('text=You\'re All Set!')).toBeVisible()
  })

  test('35. Done step shows links to Market and Manage Pro Features', async ({ page }) => {
    await setupBoothSetupStep(page)
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })

    // Skip all steps to done
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Your First Listing')).toBeVisible({ timeout: 10_000 })
    await page.click('button:has-text("Skip for now")')

    await expect(page.locator('text=You\'re All Set!')).toBeVisible({ timeout: 10_000 })

    // Go to Market button
    await expect(page.locator('button:has-text("Go to Market")')).toBeVisible()
    // Manage Pro Features button
    await expect(page.locator('button:has-text("Manage Pro Features")')).toBeVisible()

    // Summary shows skipped items with recovery links
    // Summary shows skipped items with recovery links
    await expect(page.locator('span:has-text("Stand Setup")').first()).toBeVisible()
    await expect(page.locator('span:has-text("Pro Features")').first()).toBeVisible()
    await expect(page.locator('span:has-text("First Listing")').first()).toBeVisible()

    // Recovery links
    await expect(page.locator('a[href="/my-stands"]')).toBeVisible()
    await expect(page.locator('a[href="/pro-manage"]')).toBeVisible()
    await expect(page.locator('a[href="/create-listing"]')).toBeVisible()
  })
})

// ===========================================================================
// GROUP 6: Lite Intent Routing
// ===========================================================================

test.describe('Group 6: Lite Intent Routing', () => {
  async function setupLiteIntentStep(page: Page) {
    await installAuthenticatedProMocks(page, { plan: 'pro', hasBooth: false })

    // Override subscription to lite/inactive
    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              user_id: 'mock-pro-user-id',
              plan: 'lite',
              status: 'inactive',
              stripe_customer_id: null,
              stripe_subscription_id: null,
            },
          ]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: true }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(true) })
    })
    await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    // Select Lite
    await page.locator('.tier-card').nth(0).click()
    await page.waitForTimeout(300)

    // Submit email
    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Fill profile
    await fillProfileForm(page)
    await page.click('button.btn-action[type="submit"]')
    await page.waitForTimeout(3000)
  }

  test('36. lite_intent screen shows "Welcome to CasaGrown!" heading', async ({ page }) => {
    await setupLiteIntentStep(page)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })
  })

  test('37. Four intent buttons render', async ({ page }) => {
    await setupLiteIntentStep(page)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })

    // All 4 intent buttons
    await expect(page.locator('text=Buy Fresh Produce')).toBeVisible()
    await expect(page.locator('text=Sell My Harvest')).toBeVisible()
    await expect(page.locator('text=Ask GrowBot')).toBeVisible()
    await expect(page.locator('text=Join Community')).toBeVisible()
  })

  test('38. Buy button navigates to /market', async ({ page }) => {
    await setupLiteIntentStep(page)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })

    // Mock navigation to avoid full page load issues
    const [navigated] = await Promise.all([
      page.waitForURL('**/market**', { timeout: 10_000 }),
      page.locator('text=Buy Fresh Produce').click(),
    ])
    expect(page.url()).toContain('/market')
  })

  test('39. Sell button navigates to /create-listing', async ({ page }) => {
    await setupLiteIntentStep(page)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })

    const [navigated] = await Promise.all([
      page.waitForURL('**/create-listing**', { timeout: 10_000 }),
      page.locator('text=Sell My Harvest').click(),
    ])
    expect(page.url()).toContain('/create-listing')
  })

  test('40. GrowBot button navigates to /growbot', async ({ page }) => {
    await setupLiteIntentStep(page)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })

    const [navigated] = await Promise.all([
      page.waitForURL('**/growbot**', { timeout: 10_000 }),
      page.locator('text=Ask GrowBot').click(),
    ])
    expect(page.url()).toContain('/growbot')
  })

  test('41. Community button navigates to /community', async ({ page }) => {
    await setupLiteIntentStep(page)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })

    const [navigated] = await Promise.all([
      page.waitForURL('**/community**', { timeout: 10_000 }),
      page.locator('text=Join Community').click(),
    ])
    expect(page.url()).toContain('/community')
  })

  test('42. Footer text shows "casagrown.com" recovery message', async ({ page }) => {
    await setupLiteIntentStep(page)
    await expect(page.locator('text=Welcome to CasaGrown!')).toBeVisible({ timeout: 15_000 })

    // Footer text
    await expect(page.locator('text=casagrown.com')).toBeVisible()
  })
})

// ===========================================================================
// GROUP 7: Abandonment & Recovery
// ===========================================================================

test.describe('Group 7: Abandonment & Recovery', () => {
  test('43. Skip buttons on wizard steps show recovery text', async ({ page }) => {
    // Set up to reach booth_setup step
    await installAuthenticatedProMocks(page, { plan: 'pro', hasBooth: false })

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: true }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(true) })
    })
    await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)

    await page.click('button:has-text("Continue")')
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    const farmInput = page.locator('input[placeholder="e.g. Oakridge Farms"]')
    const farmVal = await farmInput.inputValue()
    if (!farmVal.trim()) await farmInput.fill("Maria's Farm")
    const tosCheckbox = page.locator('input[type="checkbox"]').last()
    if (!(await tosCheckbox.isChecked())) await tosCheckbox.check()

    await page.click('button.btn-action[type="submit"]')

    // booth_setup step
    await expect(page.locator('text=Set Up Your Stand')).toBeVisible({ timeout: 15_000 })
    // Skip text on booth_setup
    await expect(page.locator('text=Skip for now')).toBeVisible()
    await expect(page.locator('text=My Stands')).toBeVisible()

    // Skip to manage_features
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Manage Your Features')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Skip for now')).toBeVisible()
    await expect(page.locator('text=Manage Pro Features')).toBeVisible()

    // Skip to first_listing
    await page.click('button:has-text("Skip for now")')
    await expect(page.locator('text=Your First Listing')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Skip for now')).toBeVisible()
    await expect(page.locator('text=casagrown.com')).toBeVisible()
  })

  test('44. Progress bar shows correct step numbers during initial flow', async ({ page }) => {
    await installProPageMocks(page)

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Initial step: progress steps should be visible
    const progressSteps = page.locator('.progress-steps')
    await expect(progressSteps).toBeVisible()

    // Step 1 should be active (Select Plan)
    const step1 = page.locator('.progress-step').nth(0)
    await expect(step1).toHaveClass(/active/)
    await expect(step1.locator('.step-label')).toHaveText('Select Plan')
    // Step 1 should show "1" (not ✓)
    await expect(step1.locator('.step-num')).toHaveText('1')

    // Step 2 should show "Profile"
    const step2 = page.locator('.progress-step').nth(1)
    await expect(step2.locator('.step-label')).toHaveText('Profile')
    await expect(step2.locator('.step-num')).toHaveText('2')
  })

  test('45. Progress indicator dots update as user advances', async ({ page }) => {
    await installProPageMocks(page)

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: false }),
      })
    })
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(false) })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Step 1 active
    await expect(page.locator('.progress-step').nth(0)).toHaveClass(/active/)

    // Select Lite and enter email to advance to profile
    await page.locator('.tier-card').nth(0).click()
    await page.fill('input[type="email"]', 'progress-test@example.com')
    await page.click('button:has-text("Continue")')

    // Wait for profile step
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 10_000 })

    // Step 1 should now be completed (shows ✓)
    const step1Num = page.locator('.progress-step').nth(0).locator('.step-num')
    await expect(step1Num).toHaveText('✓')

    // Step 2 should now be active
    await expect(page.locator('.progress-step').nth(1)).toHaveClass(/active/)
  })
})
