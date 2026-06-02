import { test, expect } from '@playwright/test'

/**
 * Promo Landing Page – Tier Display & Incentive Rendering Tests
 *
 * All Supabase RPC and REST calls are mocked via page.route() so the tests
 * are fully deterministic and don't rely on a running backend.
 */

// ---------------------------------------------------------------------------
// Shared mock data factories
// ---------------------------------------------------------------------------

const futureDate = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

const pastDate = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
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

const MOCK_PROMO_DISCOUNTS = [
  {
    plan: 'pro',
    discount_pct: 50,
    platform_fee_reduction_pct: 2,
    stripe_fee_handling_override: 'keep_tier',
    promotion_id: 'promo-tiers-test',
  },
  {
    plan: 'elite',
    discount_pct: 30,
    platform_fee_reduction_pct: 1,
    stripe_fee_handling_override: 'keep_tier',
    promotion_id: 'promo-tiers-test',
  },
]

function buildPromoPayload(overrides: Record<string, any> = {}) {
  return {
    id: 'promo-tiers-test',
    name: 'Tier Display Test Promo',
    description_html: '<p>Test promo for tier rendering</p>',
    enrollment_deadline: futureDate(),
    allow_existing_users: true,
    is_capacity_reached: false,
    hero_image_url: 'https://example.com/hero.jpg',
    giveaway: null,
    buyer_discounts: null,
    sub_discount: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helpers — install common route mocks
// ---------------------------------------------------------------------------

async function mockTiers(page: any) {
  await page.route('**/rest/v1/subscription_tiers*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TIERS),
    })
  })
}

async function mockPromoDiscountsTable(page: any, discounts = MOCK_PROMO_DISCOUNTS) {
  await page.route('**/rest/v1/crm_promo_subscription_discounts*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(discounts),
    })
  })
}

async function mockPromoRPC(page: any, payload: Record<string, any>) {
  await page.route('**/rest/v1/rpc/crm_get_landing_page_promotion*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

async function mockAuthSession(page: any) {
  // Return empty session so the page behaves as a guest
  await page.route('**/auth/v1/session*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { session: null } }),
    })
  })
}

// Catch-all for misc Supabase REST reads that might fire (profiles, leads, etc.)
async function mockMiscRest(page: any) {
  await page.route('**/rest/v1/profiles*', async (route: any) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    } else {
      await route.continue()
    }
  })
  await page.route('**/rest/v1/crm_leads*', async (route: any) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/rest/v1/market_booths*', async (route: any) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  // Mock pro_testers to make Elite tiers visible (bypasses ENABLE_ELITE=false)
  await page.route('**/rest/v1/pro_testers*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ email: 'test@test.local' }]),
    })
  })
}

const SLUG = 'tier-test-farm'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Promo Landing Page — Tier & Incentive Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockMiscRest(page)
  })

  // 1. Tier cards render with correct pricing
  test('Tier cards render with correct pricing from mocked subscription_tiers', async ({ page }) => {
    const promo = buildPromoPayload()
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page, []) // no discounts

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // All three tier cards should be visible
    await expect(page.locator('.tier-card')).toHaveCount(3)

    // Check tier names
    await expect(page.locator('.tier-card-title').nth(0)).toHaveText('Lite Base')
    await expect(page.locator('.tier-card-title').nth(1)).toHaveText('CasaGrown Pro')
    await expect(page.locator('.tier-card-title').nth(2)).toHaveText('CasaGrown Elite')

    // Check prices (no discounts active, so show regular prices)
    await expect(page.locator('.tier-card').nth(0).locator('.price-active')).toContainText('$0.00')
    await expect(page.locator('.tier-card').nth(1).locator('.price-active')).toContainText('$10.00')
    await expect(page.locator('.tier-card').nth(2).locator('.price-active')).toContainText('$29.00')
  })

  // 2. Clicking tier card updates selected plan styling
  test('Clicking a tier card updates the selected plan styling', async ({ page }) => {
    const promo = buildPromoPayload()
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page, [])

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Pro should be selected by default
    await expect(page.locator('.tier-card').nth(1)).toHaveClass(/selected/)

    // Click Lite
    await page.locator('.tier-card').nth(0).click()
    await expect(page.locator('.tier-card').nth(0)).toHaveClass(/selected/)
    await expect(page.locator('.tier-card').nth(1)).not.toHaveClass(/selected/)

    // Click Elite
    await page.locator('.tier-card').nth(2).click()
    await expect(page.locator('.tier-card').nth(2)).toHaveClass(/selected/)
    await expect(page.locator('.tier-card').nth(0)).not.toHaveClass(/selected/)
  })

  // 3. Discount badge shows 'X% Off' on discounted tiers
  test('Discount badge shows percentage off for discounted tiers', async ({ page }) => {
    const promo = buildPromoPayload()
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page) // uses MOCK_PROMO_DISCOUNTS (50% Pro, 30% Elite)

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Pro tier discount badge
    const proBadge = page.locator('.tier-card').nth(1).locator('.tier-discount-badge')
    await expect(proBadge).toBeVisible()
    await expect(proBadge).toHaveText('50% Off')

    // Elite tier discount badge
    const eliteBadge = page.locator('.tier-card').nth(2).locator('.tier-discount-badge')
    await expect(eliteBadge).toBeVisible()
    await expect(eliteBadge).toHaveText('30% Off')

    // Lite should have no discount badge
    await expect(page.locator('.tier-card').nth(0).locator('.tier-discount-badge')).toHaveCount(0)
  })

  // 4. Struck-through regular price + discounted price displayed
  test('Discounted tiers show struck-through regular price and discounted price', async ({ page }) => {
    const promo = buildPromoPayload()
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page)

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Pro: regular $10.00 struck-through, discounted $5.00
    const proCard = page.locator('.tier-card').nth(1)
    await expect(proCard.locator('.price-strike')).toHaveText('$10.00')
    await expect(proCard.locator('.price-active')).toContainText('$5.00')

    // Elite: regular $29.00 struck-through, discounted $20.30
    const eliteCard = page.locator('.tier-card').nth(2)
    await expect(eliteCard.locator('.price-strike')).toHaveText('$29.00')
    await expect(eliteCard.locator('.price-active')).toContainText('$20.30')
  })

  // 5. Platform fee display shows reduced rate when promo has platform_fee_reduction_pct
  test('Platform fee is reduced when promo discount includes fee reduction', async ({ page }) => {
    const promo = buildPromoPayload()
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page) // Pro: 5% - 2% = 3%, Elite: 2% - 1% = 1%

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Pro tier: platform fee should be 3% (5% base - 2% reduction)
    const proDetails = page.locator('.tier-card').nth(1).locator('.tier-card-details')
    await expect(proDetails).toContainText('platform fee:')
    await expect(proDetails).toContainText('3%')

    // Elite tier: platform fee should be 1% (2% base - 1% reduction)
    const eliteDetails = page.locator('.tier-card').nth(2).locator('.tier-card-details')
    await expect(eliteDetails).toContainText('1%')
  })

  // 6. Buyer credits incentive card renders with buyer_discounts data
  test('Buyer credits incentive card renders when buyer_discounts present', async ({ page }) => {
    const promo = buildPromoPayload({
      buyer_discounts: {
        discount_amount_usd: 15,
        discount_type: 'flat',
        discount_cap_type: 'percentage',
        discount_cap_value: 100,
        frequency: 'monthly',
        occurrences: 3,
        start_date: futureDate(),
        image_url: null,
      },
    })
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page, [])

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Credits item should be visible
    const creditsCard = page.locator('.credits-item').first()
    await expect(creditsCard).toBeVisible()
    await expect(creditsCard).toContainText('$15 Shopping Discount')
    await expect(creditsCard).toContainText('once a month')
    await expect(creditsCard).toContainText('3 months')
    await expect(creditsCard).toContainText('100%')
  })

  // 7. Subscription discount incentive card renders per-plan details
  test('Subscription discount incentive card renders for selected plan', async ({ page }) => {
    const promo = buildPromoPayload()
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page) // 50% off Pro, 30% off Elite

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    // Wait for the incentive card to render (depends on async promoDiscounts state)
    await page.waitForSelector('.promo-incentive-grid .incentive-item', { timeout: 10000 })

    // Default selected plan is 'pro', so incentive card should show Pro details
    const incentiveCards = page.locator('.promo-incentive-grid .incentive-item')

    // The subscription discount incentive card shows "CasaGrown Pro — 50% Off"
    await expect(page.locator('text=CasaGrown Pro — 50% Off').first()).toBeVisible()
    await expect(page.locator('.incentive-item').last()).toContainText('$5.00/mo')
    // Struck-through original price in the incentive detail
    await expect(page.locator('.incentive-item').last()).toContainText('$10.00/mo')
    // Fee reduction info
    await expect(page.locator('text=Reduced by 2%').first()).toBeVisible()

    // Switch to Elite plan and verify the incentive card updates
    await page.locator('.tier-card').nth(2).click()
    await page.waitForTimeout(500)
    await expect(page.locator('text=CasaGrown Elite — 30% Off').first()).toBeVisible()
    await expect(page.locator('.incentive-item').last()).toContainText('$20.30/mo')
  })

  // 8. Giveaway incentive card renders with title/photos
  test('Giveaway incentive card renders with title and photo', async ({ page }) => {
    const promo = buildPromoPayload({
      giveaway: {
        title: 'Win a Farm Basket!',
        description: '<p>Enter to win our exclusive basket.</p>',
        start_date: futureDate(),
        end_date: futureDate(),
        photos: ['https://example.com/basket.jpg'],
      },
    })
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page, [])

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const giveawayCard = page.locator('.giveaway-item').first()
    await expect(giveawayCard).toBeVisible()
    await expect(giveawayCard).toContainText('Win a Farm Basket!')
    await expect(giveawayCard).toContainText('Enter to win our exclusive basket.')

    // Photo should be rendered
    const photo = giveawayCard.locator('.incentive-photo')
    await expect(photo).toBeVisible()
    await expect(photo).toHaveAttribute('src', 'https://example.com/basket.jpg')
  })

  // 9. Deadline passed → 'Promotion Ended' badge shown
  test('Deadline passed shows Promotion Ended badge and disabled form', async ({ page }) => {
    const promo = buildPromoPayload({
      enrollment_deadline: pastDate(),
    })
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page, [])

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // "Promotion Ended" badge should be visible
    await expect(page.locator('.promo-badge.deadline-passed')).toBeVisible()
    await expect(page.locator('.promo-badge.deadline-passed')).toHaveText('Promotion Ended')

    // Form area should show error state for deadline passed
    await expect(page.locator('.form-error-state')).toBeVisible()
    await expect(page.locator('.form-error-state')).toContainText('deadline for this promotion has passed')
  })

  // 10. Capacity reached → 'Limit Reached' badge shown
  test('Capacity reached shows Promotion Limit Reached badge and fallback', async ({ page }) => {
    const promo = buildPromoPayload({
      is_capacity_reached: true,
    })
    await mockPromoRPC(page, promo)
    await mockTiers(page)
    await mockPromoDiscountsTable(page, [])

    await page.goto(`/p/${SLUG}?promo=promo-tiers-test`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Badge
    await expect(page.locator('.promo-badge.deadline-passed')).toBeVisible()
    await expect(page.locator('.promo-badge.deadline-passed')).toHaveText('Promotion Limit Reached')

    // Fallback state with "Continue to Market" link
    await expect(page.locator('text=reached its maximum capacity')).toBeVisible()
    await expect(page.locator('text=You can still join CasaGrown!')).toBeVisible()
    await expect(page.locator('text=Continue to Market')).toBeVisible()
  })

  // 11. No promo (null promo id) → canonical landing page without discounts
  test('Null promo ID renders canonical landing page without discounts', async ({ page }) => {
    const canonical = {
      id: null,
      name: 'Welcome to Our Farm',
      description_html: '<p>Browse our local goods</p>',
      enrollment_deadline: futureDate(),
      allow_existing_users: true,
      hero_image_url: 'https://example.com/canonical-hero.jpg',
    }
    await mockPromoRPC(page, canonical)
    await mockTiers(page)
    await mockPromoDiscountsTable(page, [])

    await page.goto(`/p/${SLUG}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await expect(page.locator('h1')).toHaveText('Welcome to Our Farm')
    await expect(page.locator('text=Browse our local goods')).toBeVisible()

    // No discount badges should exist
    await expect(page.locator('.tier-discount-badge')).toHaveCount(0)

    // No struck-through prices
    await expect(page.locator('.price-strike')).toHaveCount(0)
  })
})
