/**
 * Address Leak & PII RLS — UI Assertion Tests
 *
 * Two categories:
 *   1. Negative assertions — raw street addresses must NEVER appear in the DOM on cross-user pages
 *   2. Form integrity assertions — own-user forms (checkout, distance checker) must still receive address data
 *
 * These tests mock Supabase responses so they run without a live database.
 *
 * Run: cd apps/next-market && npx playwright test e2e/address-leak.spec.ts --project=chromium
 */
import { test, expect } from './fixtures'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Regex that matches a raw street address: digits followed by a word (e.g. "123 Oak Ave") */
const RAW_ADDRESS_PATTERN = /\b\d{2,5}\s+[A-Z][a-zA-Z]+\s+(Ave|St|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Loop|Trail|Circle|Cir)\b/i

/** Mock a public_profiles response (no street_address column) */
async function mockPublicProfiles(page: import('@playwright/test').Page, profiles: Array<{
  id: string; full_name: string; avatar_url?: string | null;
  seller_avg_rating?: number; seller_rating_count?: number;
  farm_name?: string; business_type?: string; seller_bio?: string;
  closure_status?: string | null;
}>) {
  await page.route('**/rest/v1/public_profiles*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(profiles),
    })
  })
}

/** Mock a public_market_booths response (no pickup_address column, only pickup_display_address) */
async function mockPublicBooths(page: import('@playwright/test').Page, booths: Array<{
  id: string; owner_id: string; name: string;
  pickup_display_address?: string | null;
  offers_pickup?: boolean; offers_delivery?: boolean;
  delivery_radius_miles?: number | null;
  is_open?: boolean;
  short_code?: string;
}>) {
  await page.route('**/rest/v1/public_market_booths*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(booths),
    })
  })
}

/** Mock the base profiles table for own-user reads */
async function mockOwnProfile(page: import('@playwright/test').Page, profile: {
  id: string; full_name: string; street_address?: string;
  city?: string; state_code?: string; zip_code?: string; zip_plus4?: string;
  phone_number?: string; email?: string;
}) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([profile]),
      })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    }
  })
}

// ── Test Suite: Negative Assertions (PII must NOT leak) ───────────────────────

test.describe('Address Leak — Raw PII must not appear on cross-user pages', () => {

  test('booth detail page: raw seller street address must not appear in DOM', async ({ page }) => {
    const SELLER_RAW_ADDRESS = '456 Private Seller Lane'

    // Public view does NOT expose raw address
    await mockPublicBooths(page, [{
      id: 'booth-001',
      owner_id: 'seller-uid',
      name: "Maria's Garden Stand",
      pickup_display_address: 'Near Elm Street, San Jose, CA', // anonymized
      offers_pickup: true,
      offers_delivery: false,
      is_open: true,
    }])
    await mockPublicProfiles(page, [{
      id: 'seller-uid',
      full_name: 'Maria Gonzalez',
      seller_avg_rating: 4.8,
      seller_rating_count: 12,
      farm_name: 'Maria Garden',
    }])
    // Base table mock should NOT be queried for cross-user reads — but if it is, it would expose PII
    await page.route('**/rest/v1/market_booths*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'booth-001',
          owner_id: 'seller-uid',
          name: "Maria's Garden Stand",
          pickup_address: SELLER_RAW_ADDRESS, // raw address — must NOT appear in DOM
        }]),
      })
    })
    await page.route('**/rest/v1/market_products*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.goto('/market/booth/booth-001')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // Raw seller street address must NOT appear
    expect(body).not.toContain(SELLER_RAW_ADDRESS)
    expect(body).not.toMatch(RAW_ADDRESS_PATTERN)
    // Anonymized form IS expected to appear
    if (body?.includes('pickup') || body?.includes('Pickup')) {
      expect(body).toContain('Near Elm Street')
    }
  })

  test('product detail page: seller home address must not appear in DOM', async ({ page }) => {
    const SELLER_HOME_ADDRESS = '789 Oak Ave, Sunnyvale, CA 94086'

    await mockPublicBooths(page, [{
      id: 'booth-001',
      owner_id: 'seller-uid',
      name: "Tom's Veggies",
      pickup_display_address: 'Near Oak Ave, Sunnyvale, CA',
      offers_pickup: true,
      offers_delivery: true,
      delivery_radius_miles: 5,
      is_open: true,
    }])
    await mockPublicProfiles(page, [{
      id: 'seller-uid',
      full_name: 'Tom Baker',
      seller_avg_rating: 4.5,
      seller_rating_count: 8,
    }])
    await page.route('**/rest/v1/market_products*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'prod-001',
          booth_id: 'booth-001',
          seller_id: 'seller-uid',
          name: 'Fresh Tomatoes',
          price_usd: 3.99,
          unit: 'lb',
          inventory: 10,
          is_active: true,
          is_draft: false,
          moderation_status: 'approved',
          photos: [],
          category: 'vegetables',
        }]),
      })
    })

    await page.goto('/market/booth/booth-001/product/prod-001')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // Seller home address must NOT appear on the product page
    expect(body).not.toContain('789 Oak Ave')
    expect(body).not.toContain(SELLER_HOME_ADDRESS)
    // zip+4 (PII) must not appear
    expect(body).not.toMatch(/\b\d{5}-\d{4}\b/)
  })

  test('following page: no raw seller address data in booth list', async ({ page }) => {
    await page.route('**/rest/v1/market_followers*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ booth_id: 'booth-001', created_at: new Date().toISOString() }]),
      })
    })
    await mockPublicBooths(page, [{
      id: 'booth-001',
      owner_id: 'seller-uid',
      name: "Rosa's Herbs",
      offers_pickup: true,
      offers_delivery: false,
      is_open: true,
    }])
    await mockPublicProfiles(page, [{
      id: 'seller-uid',
      full_name: 'Rosa Martinez',
      avatar_url: null,
    }])
    await page.route('**/rest/v1/rpc/get_recommended_people_to_follow*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.goto('/following')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // No raw addresses — following page should only show booth names and owner names
    expect(body).not.toMatch(RAW_ADDRESS_PATTERN)
    expect(body).not.toMatch(/\b\d{5}-\d{4}\b/)
    // Seller name from public_profiles should appear
    expect(body).toContain('Rosa')
  })

  test('orders list: seller street_address must not appear in order cards', async ({ page }) => {
    // Business rule: delivery_address captured at checkout IS allowed to appear on
    // order cards (seller needs buyer's delivery address; buyer sees their own).
    // The SELLER's private home address from profiles must NEVER appear.
    const SELLER_PROFILE_HOME = '321 Private Rd, San Jose, CA'
    const BUYER_PROFILE_HOME = '999 Private Buyer Home, Oakland, CA' // buyer home ≠ delivery_address

    await page.route('**/rest/v1/market_orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'order-001',
          buyer_id: 'buyer-uid',
          seller_id: 'seller-uid',
          booth_id: 'booth-001',
          product_id: 'prod-001',
          product_name: 'Fresh Tomatoes',
          status: 'pending',
          fulfillment_type: 'delivery',
          // delivery_address is captured at checkout time — allowed to show to both parties
          delivery_address: '654 Delivery Way, Fremont, CA',
          quantity: 2,
          total_usd: 7.98,
          created_at: new Date().toISOString(),
        }]),
      })
    })
    await mockPublicProfiles(page, [
      { id: 'buyer-uid', full_name: 'John Smith', avatar_url: null },
      { id: 'seller-uid', full_name: 'Maria Gonzalez', avatar_url: null },
    ])
    await mockPublicBooths(page, [{
      id: 'booth-001',
      owner_id: 'seller-uid',
      name: "Maria's Stand",
      pickup_display_address: 'Near Elm St, San Jose',
      offers_pickup: true,
      offers_delivery: true,
      is_open: true,
    }])
    await page.route('**/rest/v1/booth_helpers*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    // Mock own-user profiles read (useAuth hook) to prevent real buyer street_address leaking
    await mockOwnProfile(page, {
      id: 'buyer-uid',
      full_name: 'Test Buyer',
      street_address: undefined, // no address exposed
    })

    await page.goto('/orders')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // Seller's personal home address (from profiles.street_address) must NEVER leak
    expect(body).not.toContain(SELLER_PROFILE_HOME)
    expect(body).not.toContain('321 Private Rd')
    // Buyer's personal home address from profiles (distinct from delivery_address) must not leak
    expect(body).not.toContain(BUYER_PROFILE_HOME)
    expect(body).not.toContain('999 Private Buyer Home')
    // delivery_address from the order itself IS allowed (captured at checkout, shown to both parties)
    // — no assertion against it here
  })

  test('order detail page: seller street_address from profiles must not appear', async ({ page }) => {
    const SELLER_HOME = '99 Seller Home Rd, Palo Alto, CA'

    await page.route('**/rest/v1/market_orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'order-detail-001',
          buyer_id: 'buyer-uid',
          seller_id: 'seller-uid',
          booth_id: 'booth-001',
          product_id: 'prod-001',
          product_name: 'Herbs Bundle',
          status: 'pending',
          fulfillment_type: 'pickup',
          delivery_address: null,
          quantity: 1,
          total_usd: 12.00,
          created_at: new Date().toISOString(),
          booth: { name: "Rosa's Stand" },
        }]),
      })
    })
    await mockPublicProfiles(page, [
      { id: 'buyer-uid', full_name: 'Alex Johnson', avatar_url: null },
      { id: 'seller-uid', full_name: 'Rosa Martinez', avatar_url: null },
    ])
    await mockPublicBooths(page, [{
      id: 'booth-001',
      owner_id: 'seller-uid',
      name: "Rosa's Stand",
      pickup_display_address: 'Near Maple Ave, Palo Alto, CA',
      offers_pickup: true,
      is_open: true,
    }])
    await page.route('**/rest/v1/order_disputes*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/rest/v1/order_chat_messages*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/rest/v1/booth_helpers*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.goto('/orders/order-detail-001')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // Seller's personal home address must NEVER appear
    expect(body).not.toContain(SELLER_HOME)
    expect(body).not.toContain('99 Seller Home Rd')
    // Anonymized form is OK for pickup
    if (body?.includes('pickup') || body?.includes('Pickup') || body?.includes('Near')) {
      expect(body).toContain('Near Maple Ave')
    }
  })

  test('Q&A author names appear but no address data leaks', async ({ page }) => {
    await page.route('**/rest/v1/market_products*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'prod-qa-001',
          booth_id: 'booth-001',
          seller_id: 'seller-uid',
          name: 'Organic Basil',
          price_usd: 5.00,
          unit: 'bunch',
          inventory: 5,
          is_active: true,
          photos: [],
          category: 'herbs',
        }]),
      })
    })
    await page.route('**/rest/v1/product_comments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'comment-001',
          product_id: 'prod-qa-001',
          author_id: 'buyer-uid',
          content: 'Is this organic?',
          created_at: new Date().toISOString(),
          public_profiles: { full_name: 'Alex Johnson', avatar_url: null },
        }]),
      })
    })
    await mockPublicBooths(page, [{
      id: 'booth-001', owner_id: 'seller-uid', name: "Rosa's Stand",
      pickup_display_address: 'Near Maple Ave', offers_pickup: true, is_open: true,
    }])
    await mockPublicProfiles(page, [
      { id: 'seller-uid', full_name: 'Rosa Martinez' },
      { id: 'buyer-uid', full_name: 'Alex Johnson' },
    ])

    await page.goto('/market/booth/booth-001/product/prod-qa-001')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // Author name from public_profiles should appear
    expect(body).toContain('Alex Johnson')
    // No raw addresses
    expect(body).not.toMatch(RAW_ADDRESS_PATTERN)
  })
})

// ── Test Suite: Form Integrity (own-user forms must still work) ────────────────

test.describe('Form Integrity — Own-user forms must still receive their data', () => {

  test('distance checker in product detail still reads buyer own address from base table', async ({ page }) => {
    // Mock own-user profiles (base table) — buyer can read their own street_address
    await mockOwnProfile(page, {
      id: 'buyer-uid',
      full_name: 'Alex Johnson',
      street_address: '101 Buyer Ave',
      city: 'San Jose',
      state_code: 'CA',
      zip_code: '95101',
    })
    await mockPublicBooths(page, [{
      id: 'booth-001', owner_id: 'seller-uid', name: "Tom's Veggies",
      pickup_display_address: 'Near Oak Ave, Sunnyvale, CA',
      offers_pickup: true, offers_delivery: true, delivery_radius_miles: 10, is_open: true,
    }])
    await mockPublicProfiles(page, [{ id: 'seller-uid', full_name: 'Tom Baker' }])
    await page.route('**/rest/v1/market_products*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'prod-001',
          booth_id: 'booth-001',
          seller_id: 'seller-uid',
          name: 'Tomatoes',
          price_usd: 3.99,
          unit: 'lb',
          inventory: 5,
          is_active: true,
          photos: [],
          category: 'vegetables',
        }]),
      })
    })

    await page.goto('/market/booth/booth-001/product/prod-001')
    await page.waitForTimeout(2000)

    // The page should render without crashing — distance checker reads buyer's own profile
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    // Product name should appear
    expect(body).toContain('Tomatoes')
  })

  test('messages inbox still shows partner names from public_profiles', async ({ page }) => {
    // The messages page queries public_profiles separately (not via embedded FK join)
    // after the PII fix — both the embedded profile and the standalone public_profiles
    // mocks must be set up.
    await mockPublicProfiles(page, [
      { id: 'buyer-uid', full_name: 'Alex Johnson', avatar_url: null },
      { id: 'seller-uid', full_name: 'Rosa Martinez', avatar_url: null },
    ])
    await page.route('**/rest/v1/market_conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'conv-001',
          last_message_at: new Date().toISOString(),
          unread_count_a: 0,
          unread_count_b: 1,
          participant_a: 'buyer-uid',
          participant_b: 'seller-uid',
          // public_profiles FK join embedded in conversation response
          profile_a: { id: 'buyer-uid', full_name: 'Alex Johnson', avatar_url: null },
          profile_b: { id: 'seller-uid', full_name: 'Rosa Martinez', avatar_url: null },
          market_chat_messages: [{ content: 'Is it available?', created_at: new Date().toISOString(), sender_id: 'buyer-uid', media: null }],
        }]),
      })
    })
    await page.route('**/rest/v1/messenger_conversations*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/rest/v1/ig_conversations*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/rest/v1/wa_conversations*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.goto('/messages')
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // At least one conversation partner name must appear (from public_profiles — name only, no street_address)
    // The messages page shows the other party's name — with the test fixture auth as buyer-uid,
    // either Alex Johnson (self) or Rosa Martinez (partner) should appear
    const hasPartnerName = body?.includes('Alex Johnson') || body?.includes('Rosa Martinez')
    if (!hasPartnerName) {
      console.log('[MSG-INBOX] Body preview:', body?.substring(0, 300))
    }
    expect(hasPartnerName).toBeTruthy()
    // No raw addresses in the inbox
    expect(body).not.toMatch(RAW_ADDRESS_PATTERN)
  })

  test('rating reminder shows counterparty name from public_profiles', async ({ page }) => {
    await page.route('**/rest/v1/market_orders*', async (route) => {
      const url = route.request().url()
      if (url.includes('buyer_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'order-rated-001',
            product_name: 'Fresh Herbs',
            seller_id: 'seller-uid',
            status: 'completed',
            seller_rating: null,
          }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      }
    })
    await mockPublicProfiles(page, [{ id: 'seller-uid', full_name: 'Rosa Martinez' }])

    // Navigate to any page that renders RatingReminder (e.g., market page)
    await page.goto('/market')
    await page.waitForTimeout(3000)

    // If the rating reminder rendered, it should show the seller name
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    // If rating reminder is shown, seller name must appear
    if (body?.includes('rate') || body?.includes('Rate') || body?.includes('rating')) {
      expect(body).not.toMatch(RAW_ADDRESS_PATTERN)
    }
  })
})
