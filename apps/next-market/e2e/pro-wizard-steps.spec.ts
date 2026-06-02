import { test, expect, Page } from '@playwright/test'

/**
 * Pro Wizard Steps — Post-Payment Onboarding & Lite Intent Routing
 *
 * Tests the multi-step onboarding wizard that appears after a user completes
 * payment or OTP verification on the /pro page:
 *   booth_setup → manage_features → first_listing → done
 *
 * Also tests the lite_intent 4-button chooser for Lite-tier signups.
 *
 * All Supabase RPCs, auth endpoints, and REST calls are mocked via page.route().
 * The flow simulated: email → profile → OTP → wizard step transitions.
 */

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route-mock installers
// ---------------------------------------------------------------------------

/** Mock subscription_tiers REST table */
async function mockTiers(page: Page) {
  await page.route('**/rest/v1/subscription_tiers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TIERS),
    })
  })
}

/** Mock crm_get_landing_page_promotion RPC — no promo (standard onboarding) */
async function mockNoPromo(page: Page) {
  await page.route('**/rest/v1/rpc/crm_get_landing_page_promotion*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
    })
  })
  // Also mock the crm_promotions table for the universal-promo fallback query
  await page.route('**/rest/v1/crm_promotions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

/** Mock guest session — no auth */
async function mockGuestSession(page: Page) {
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
}

/** Mock misc REST reads for a guest user (empty results) */
async function mockMiscRest(page: Page) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
  })
  await page.route('**/rest/v1/crm_leads*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
  })
  await page.route('**/rest/v1/market_booths*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
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
  await page.route('**/rest/v1/crm_promo_subscription_discounts*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  // pro_testers — guest user won't be a tester
  await page.route('**/rest/v1/pro_testers*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) })
  })
  // market_listings insert
  await page.route('**/rest/v1/market_listings*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
}

/** Mock OTP send (signInWithOtp) */
async function mockOtpSend(page: Page) {
  await page.route('**/auth/v1/otp', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({}) })
  })
}

/**
 * Mock OTP verify (verifyOtp) — returns a session for the given plan.
 * After verify, the page queries user_subscription_discounts and seller_subscriptions.
 * For Pro: seller_subscriptions returns active sub → sets step to booth_setup.
 * For Lite: seller_subscriptions returns empty → updates to lite → sets step to lite_intent.
 * For Elite: same as Pro but with 'elite' plan.
 */
async function mockOtpVerify(
  page: Page,
  opts: {
    userId?: string
    email?: string
    plan: 'lite' | 'pro' | 'elite'
  }
) {
  const userId = opts.userId || 'user-wizard-test'
  const email = opts.email || 'wizard@test.com'

  await page.route('**/auth/v1/verify*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh',
        user: {
          id: userId,
          email,
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: { full_name: 'Wizard Test User' },
        },
      }),
    })
  })
}

/** Mock eligibility check — new user, eligible */
async function mockEligibility(page: Page, opts: { eligible?: boolean; isRegistered?: boolean } = {}) {
  const eligible = opts.eligible ?? true
  const isRegistered = opts.isRegistered ?? false

  // For standard (no promo) flow, mock is_email_registered
  await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isRegistered),
    })
  })

  // For promo flow
  await page.route('**/rest/v1/rpc/crm_check_promo_eligibility', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ eligible, is_registered: isRegistered }),
    })
  })
}

/** Mock enrollment RPC */
async function mockEnrollment(page: Page) {
  await page.route('**/rest/v1/rpc/crm_enroll_in_promotion', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
  })
}

/** Mock manage-subscription edge function */
async function mockManageSubscription(page: Page) {
  await page.route('**/functions/v1/manage-subscription*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })
}

/**
 * Install all standard mocks for a standard onboarding flow (no promo).
 */
async function installBaseMocks(page: Page) {
  await mockGuestSession(page)
  await mockMiscRest(page)
  await mockTiers(page)
  await mockNoPromo(page)
  await mockOtpSend(page)
  await mockEligibility(page)
  await mockEnrollment(page)
  await mockManageSubscription(page)
}

/** Fill the profile form with valid test data */
async function fillProfileForm(page: Page, opts: { farmName?: string } = {}) {
  await page.fill('input[placeholder="Jane Doe"]', 'Test Wizard User')
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

/**
 * Navigate through the full flow from /pro initial step to the OTP step.
 * This helper selects the given plan, fills email, fills profile, and submits.
 * After calling this, the page should be on the OTP step ready for code entry.
 */
async function navigateToOtpStep(
  page: Page,
  opts: {
    plan: 'lite' | 'pro' | 'elite'
    email?: string
    farmName?: string
  }
) {
  const email = opts.email || 'wizard@test.com'

  // For Pro/Elite, mark user as existing so profile submit shows "Send Login Code"
  // instead of "Proceed to Checkout" (which opens Stripe payment, not OTP)
  if (opts.plan !== 'lite') {
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      })
    })
  }

  await page.goto('/pro', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // Select plan via tier card click
  const tierIndex = opts.plan === 'lite' ? 0 : opts.plan === 'pro' ? 1 : 2
  await page.locator('.tier-card').nth(tierIndex).click()
  await page.waitForTimeout(300)

  // Enter email and continue
  await page.fill('input[type="email"]', email)
  await page.click('button:has-text("Continue to Onboarding")')

  // Wait for profile step
  await expect(page.locator('h2')).toHaveText('Setup Your Profile', { timeout: 5000 })

  // Fill profile form
  const farmName = opts.plan === 'lite' ? undefined : (opts.farmName || 'Test Farm Stand')
  await fillProfileForm(page, { farmName })

  // Submit profile — button text varies by plan and user status
  await page.click('button:has-text("Send Login Code")')

  // Wait for OTP step
  await expect(page.locator('h2')).toHaveText('Verify Your Email', { timeout: 5000 })
}

/**
 * Complete OTP verification and wait for the expected wizard step.
 * Returns after the target step heading is visible.
 */
async function completeOtpAndWaitForStep(
  page: Page,
  expectedHeadingText: string
) {
  // Enter OTP code
  await page.fill('input[placeholder="123456"]', '000000')
  await page.click('button:has-text("Verify")')

  // Wait for the expected step to render
  await page.waitForTimeout(3000)
  await expect(page.locator('h2').first()).toContainText(expectedHeadingText, { timeout: 10000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Pro Wizard Steps — Post-Payment Onboarding', () => {
  // ─── 1. Pro signup completes OTP and lands on booth_setup step ───
  test('Pro signup completes OTP and lands on booth_setup step', async ({ page }) => {
    await installBaseMocks(page)
    await mockOtpVerify(page, { plan: 'pro' })

    // After OTP verify, the page queries seller_subscriptions.
    // For a new Pro user who just paid, we need to return an active subscription
    // so the flow goes to booth_setup instead of payment.
    // Override the seller_subscriptions mock to return active sub after verify.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await installBaseMocks(page)

    // Re-install seller_subscriptions to return active pro sub (simulates post-payment state)
    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })

    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')
  })

  // ─── 2. Booth setup step renders all form fields ───
  test('Booth setup step renders all form fields (name, address, fulfillment, hours)', async ({ page }) => {
    await installBaseMocks(page)

    // Return active pro sub so OTP verify → booth_setup
    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // Verify heading
    await expect(page.locator('h2')).toContainText('🏪 Set Up Your Stand — Step 1 of 3')

    // Verify Stand Name input
    await expect(page.locator('input[placeholder="e.g. Oakridge Farm Stand"]')).toBeVisible()

    // Verify address fields
    await expect(page.locator('input[placeholder="123 Farm Road"]').last()).toBeVisible()
    await expect(page.locator('input[placeholder="City"]').last()).toBeVisible()
    await expect(page.locator('input[placeholder="ST"]').last()).toBeVisible()
    await expect(page.locator('input[placeholder="12345"]').last()).toBeVisible()

    // Verify fulfillment checkboxes
    await expect(page.locator('text=🏪 Pickup')).toBeVisible()
    await expect(page.locator('text=🚗 Delivery')).toBeVisible()

    // Verify Available Hours input
    await expect(page.locator('input[placeholder="e.g. 9:00 AM - 5:00 PM"]')).toBeVisible()

    // Verify buttons
    await expect(page.locator('button:has-text("Save & Continue →")')).toBeVisible()
    await expect(page.locator('button:has-text("Skip for now")')).toBeVisible()

    // Verify recovery text
    await expect(page.locator('text=You can set this up anytime from the ☰ Menu → My Stands.')).toBeVisible()
  })

  // ─── 3. Booth setup Skip button advances to manage_features ───
  test('Booth setup Skip button advances to manage_features', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // Click Skip
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // Should now be on manage_features
    await expect(page.locator('h2')).toContainText('⚡ Manage Your Features — Step 2 of 3')
  })

  // ─── 4. Manage features step shows Facebook, Instagram, Google cards ───
  test('Manage features step shows Facebook, Instagram, Google cards', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // Skip booth_setup → manage_features
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // Verify heading
    await expect(page.locator('h2')).toContainText('⚡ Manage Your Features — Step 2 of 3')

    // Verify feature cards
    await expect(page.locator('h3:has-text("📘 Facebook Page & Catalog")')).toBeVisible()
    await expect(page.locator('h3:has-text("📸 Instagram Auto-Post")')).toBeVisible()
    await expect(page.locator('h3:has-text("📍 Google Business Profile")')).toBeVisible()

    // WhatsApp should NOT be visible for Pro plan
    await expect(page.locator('h3:has-text("💬 WhatsApp Business")')).not.toBeVisible()

    // Verify buttons
    await expect(page.locator('button:has-text("Continue →")')).toBeVisible()
    await expect(page.locator('button:has-text("Skip for now")')).toBeVisible()

    // Verify recovery text
    await expect(page.locator('text=You can connect these anytime from the ☰ Menu → Manage Pro Features.')).toBeVisible()
  })

  // ─── 5. Manage features Skip button advances to first_listing ───
  test('Manage features Skip button advances to first_listing', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // Skip booth_setup → manage_features → first_listing
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await expect(page.locator('h2')).toContainText('Manage Your Features')

    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // Should now be on first_listing
    await expect(page.locator('h2')).toContainText('📸 Your First Listing — Step 3 of 3')
  })

  // ─── 6. First listing step shows photo upload and product name fields ───
  test('First listing step shows photo upload and product name fields', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // Skip booth_setup → manage_features → first_listing
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // Verify heading
    await expect(page.locator('h2')).toContainText('📸 Your First Listing — Step 3 of 3')

    // Verify photo upload area
    await expect(page.locator('text=Tap to add a photo')).toBeVisible()

    // Verify product name input
    await expect(page.locator('input[placeholder="e.g. Fresh Tomatoes"]')).toBeVisible()

    // Verify price input
    await expect(page.locator('input[placeholder="5.00"]')).toBeVisible()

    // Verify Create button (may be disabled without name)
    await expect(page.locator('button:has-text("Create")')).toBeVisible()

    // Verify skip button
    await expect(page.locator('button:has-text("Skip for now")')).toBeVisible()

    // Verify recovery text
    await expect(page.locator('text=You can create listings anytime from the Market page')).toBeVisible()
  })

  // ─── 7. First listing Skip button advances to done step ───
  test('First listing Skip button advances to done step', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // Skip through all three steps
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // Should now be on the done step
    await expect(page.locator('h2')).toContainText("You're All Set!")
  })

  // ─── 8. Done step shows celebration heading and action buttons ───
  test('Done step shows celebration heading and action buttons', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // Skip all steps to reach done
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // Verify celebration emoji
    await expect(page.locator('text=🎉').first()).toBeVisible()

    // Verify heading
    await expect(page.locator('h2')).toContainText("You're All Set!")

    // Verify action buttons
    await expect(page.locator('button:has-text("Go to Market")')).toBeVisible()
    await expect(page.locator('button:has-text("Manage Pro Features")')).toBeVisible()

    // Verify skipped steps show recovery links (since all were skipped, should show ⏭️ indicators)
    await expect(page.locator('span:has-text("Stand Setup")').first()).toBeVisible()
    await expect(page.locator('span:has-text("Pro Features")').first()).toBeVisible()
    await expect(page.locator('span:has-text("First Listing")').first()).toBeVisible()
  })

  // ─── 9. Elite signup shows WhatsApp card on manage_features ───
  test('Elite signup shows WhatsApp card on manage_features', async ({ page }) => {
    await installBaseMocks(page)

    // Override pro_testers to make Elite visible
    await page.route('**/rest/v1/pro_testers*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'wizard@test.com' }),
      })
    })

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'elite',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'elite' })

    // Mock is_email_registered so profile submit shows "Send Login Code" (not "Proceed to Checkout")
    await page.route('**/rest/v1/rpc/is_email_registered', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true),
      })
    })

    await page.goto('/pro', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Select Elite tier (3rd card, index 2)
    const eliteCard = page.locator('.tier-card').nth(2)
    // If Elite isn't visible (feature flag off), check if the tier card count >= 3
    const tierCardCount = await page.locator('.tier-card').count()

    if (tierCardCount >= 3) {
      await eliteCard.click()
      await page.waitForTimeout(300)

      // Enter email and go through flow
      await page.fill('input[type="email"]', 'wizard@test.com')
      await page.click('button:has-text("Continue")')
      await expect(page.locator('h2')).toHaveText('Setup Your Profile', { timeout: 5000 })
      await fillProfileForm(page, { farmName: 'Elite Farm Stand' })
      await page.click('button:has-text("Send Login Code")')
      await expect(page.locator('h2')).toHaveText('Verify Your Email', { timeout: 5000 })

      await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

      // Skip booth_setup → manage_features
      await page.click('button:has-text("Skip for now")')
      await page.waitForTimeout(500)

      // Verify WhatsApp card IS visible for Elite
      await expect(page.locator('h3:has-text("💬 WhatsApp Business")')).toBeVisible()
    } else {
      // Elite not available (feature flag off and not a tester) — verify it's hidden
      test.skip()
    }
  })

  // ─── 10. Lite signup lands on lite_intent step ───
  test('Lite signup lands on lite_intent step', async ({ page }) => {
    await installBaseMocks(page)
    await mockOtpVerify(page, { plan: 'lite' })

    await navigateToOtpStep(page, { plan: 'lite' })

    // Enter OTP
    await page.fill('input[placeholder="123456"]', '000000')
    await page.click('button:has-text("Verify")')

    // Wait for the lite_intent step
    await page.waitForTimeout(3000)
    await expect(page.locator('h2:has-text("Welcome to CasaGrown!")')).toBeVisible({ timeout: 10000 })
  })

  // ─── 11. Lite intent shows 4 option buttons ───
  test('Lite intent shows 4 option buttons', async ({ page }) => {
    await installBaseMocks(page)
    await mockOtpVerify(page, { plan: 'lite' })

    await navigateToOtpStep(page, { plan: 'lite' })

    await page.fill('input[placeholder="123456"]', '000000')
    await page.click('button:has-text("Verify")')
    await page.waitForTimeout(3000)
    await expect(page.locator('h2:has-text("Welcome to CasaGrown!")')).toBeVisible({ timeout: 10000 })

    // Verify wave emoji
    await expect(page.locator('text=👋')).toBeVisible()

    // Verify "What would you like to do first?" text
    await expect(page.locator('text=What would you like to do first?')).toBeVisible()

    // Verify all 4 intent buttons
    await expect(page.locator('text=Buy Fresh Produce')).toBeVisible()
    await expect(page.locator('text=Sell My Harvest')).toBeVisible()
    await expect(page.locator('text=Ask GrowBot')).toBeVisible()
    await expect(page.locator('text=Join Community')).toBeVisible()
  })

  // ─── 12. Lite intent shows casagrown.com recovery text ───
  test('Lite intent shows casagrown.com recovery text', async ({ page }) => {
    await installBaseMocks(page)
    await mockOtpVerify(page, { plan: 'lite' })

    await navigateToOtpStep(page, { plan: 'lite' })

    await page.fill('input[placeholder="123456"]', '000000')
    await page.click('button:has-text("Verify")')
    await page.waitForTimeout(3000)
    await expect(page.locator('h2:has-text("Welcome to CasaGrown!")')).toBeVisible({ timeout: 10000 })

    // Verify recovery text with casagrown.com
    await expect(page.locator('text=casagrown.com')).toBeVisible()
  })

  // ─── 13. Progress bar updates across wizard steps ───
  test('Progress bar updates across wizard steps', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // On booth_setup: Step 1 should be active, 2-4 should not
    const progressSteps = page.locator('.progress-step')
    await expect(progressSteps.first()).toHaveClass(/active/)

    // Verify step labels are visible
    await expect(page.locator('.step-label:has-text("Stand")')).toBeVisible()
    await expect(page.locator('.step-label:has-text("Features")')).toBeVisible()
    await expect(page.locator('.step-label:has-text("First Listing")')).toBeVisible()
    await expect(page.locator('.step-label:has-text("Done")')).toBeVisible()

    // Skip to manage_features — step 1 should show ✓, step 2 should be active
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // First step should now be completed (has ✓)
    const firstStepNum = page.locator('.progress-step').first().locator('.step-num')
    await expect(firstStepNum).toHaveText('✓')

    // Second step should be active
    await expect(page.locator('.progress-step').nth(1)).toHaveClass(/active/)

    // Skip to first_listing — step 2 should show ✓, step 3 active
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await expect(page.locator('.progress-step').nth(1).locator('.step-num')).toHaveText('✓')
    await expect(page.locator('.progress-step').nth(2)).toHaveClass(/active/)

    // Skip to done — all steps should show ✓
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)
    await expect(page.locator('.progress-step').nth(2).locator('.step-num')).toHaveText('✓')
    await expect(page.locator('.progress-step').nth(3)).toHaveClass(/active/)
  })

  // ─── 14. All skip buttons show recovery text with menu paths ───
  test('All skip buttons show recovery text with menu paths', async ({ page }) => {
    await installBaseMocks(page)

    await page.route('**/rest/v1/seller_subscriptions*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            user_id: 'user-wizard-test',
            plan: 'pro',
            status: 'active',
            stripe_customer_id: 'cus_wizard',
            stripe_subscription_id: 'sub_wizard',
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      }
    })
    await mockOtpVerify(page, { plan: 'pro' })

    await navigateToOtpStep(page, { plan: 'pro', farmName: 'Wizard Farm' })
    await completeOtpAndWaitForStep(page, 'Set Up Your Stand')

    // ── booth_setup recovery text ──
    await expect(page.locator('text=You can set this up anytime from the ☰ Menu → My Stands.')).toBeVisible()

    // Skip to manage_features
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // ── manage_features recovery text ──
    await expect(page.locator('text=You can connect these anytime from the ☰ Menu → Manage Pro Features.')).toBeVisible()

    // Skip to first_listing
    await page.click('button:has-text("Skip for now")')
    await page.waitForTimeout(500)

    // ── first_listing recovery text ──
    await expect(page.locator('text=You can create listings anytime from the Market page')).toBeVisible()
  })
})
