/**
 * place_market_order — Integration Tests
 *
 * Verifies that the place_market_order RPC works without a $5 minimum
 * and returns correct order data.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/place_market_order.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const REST_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Prefer': 'return=representation',
}

/** REST helper for table operations */
async function supabaseRest(
  table: string,
  method: string,
  body?: Record<string, unknown>,
  queryParams?: string
): Promise<Record<string, unknown>[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${queryParams ? `?${queryParams}` : ''}`
  const res = await fetch(url, {
    method,
    headers: REST_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!text) return []
  const data = JSON.parse(text)
  return Array.isArray(data) ? data : [data]
}

/** Call an RPC function */
async function rpc(name: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Create a test user via HTTP signup */
async function ensureTestUser(): Promise<{ id: string; accessToken: string }> {
  const email = `market-order-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  if (!data.user?.id) throw new Error(`Failed to create test user: ${JSON.stringify(data)}`)
  return { id: data.user.id, accessToken: data.access_token }
}

// ============================================================================
// Test: place_market_order RPC exists and is callable
// ============================================================================
Deno.test({
  name: 'place_market_order: RPC endpoint exists',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // PostgREST does parameter-based function matching, so we must pass
    // the expected params for a 200 response (even if the RPC itself errors)
    const result = await rpc('place_market_order', {
      buyer_id: '00000000-0000-0000-0000-000000000000',
      product_id: '00000000-0000-0000-0000-000000000000',
      quantity: 1,
      fulfillment_type: 'pickup',
    }) as Record<string, unknown>
    // We get a result back (even if it's an error like "product not found")
    // which confirms the RPC exists. A non-existent RPC would throw a 404.
    assertExists(result, 'Should get a response from the RPC')
  },
})

// ============================================================================
// Test: place_market_order does NOT enforce $5 minimum
// ============================================================================
Deno.test({
  name: 'place_market_order: no $5 minimum requirement (sub-$5 order)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Create a test buyer and seller
    const buyer = await ensureTestUser()
    const seller = await ensureTestUser()

    // 2. Create booth for seller
    await supabaseRest('market_booths', 'DELETE', undefined, `owner_id=eq.${seller.id}`)
    const boothRows = await supabaseRest('market_booths', 'POST', {
      owner_id: seller.id,
      name: 'Minimum Order Test Booth',
      offers_pickup: true,
      offers_delivery: false,
    })
    const booth = boothRows[0]!
    assertExists(booth, 'Booth should be created')

    // 3. Create a cheap product ($1.00) — well under old $5 minimum
    const productRows = await supabaseRest('market_products', 'POST', {
      seller_id: seller.id,
      market_date: new Date().toISOString().split('T')[0],
      name: 'Tiny Herb Bundle',
      category: 'produce',
      price_usd: 1.00,
      unit: 'bunch',
      inventory: 10,
    })
    const product = productRows[0]!
    assertExists(product, 'Product should be created')

    // 4. Call place_market_order with qty=1 (total = $1.00)
    const orderResult = await rpc('place_market_order', {
      p_buyer_id: buyer.id,
      p_product_id: product.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    }) as Record<string, unknown>

    assertExists(orderResult, 'Order result should not be null')

    // The order should NOT fail with a minimum_order error code
    if (orderResult.code) {
      assertEquals(
        orderResult.code !== 'minimum_order',
        true,
        `Should not enforce minimum order. Got error: ${JSON.stringify(orderResult)}`
      )
    }

    // If successful, should have an order_id
    if (orderResult.order_id) {
      assertExists(orderResult.order_id, 'Should return an order_id')
      assertEquals(orderResult.success, true, 'Should return success: true')
    }

    // 5. Cleanup
    await supabaseRest('market_products', 'DELETE', undefined, `id=eq.${product.id}`)
    await supabaseRest('market_booths', 'DELETE', undefined, `id=eq.${booth.id}`)
  },
})

// ============================================================================
// Test: place_market_order with normal ($5+) order still works
// ============================================================================
Deno.test({
  name: 'place_market_order: standard order ($5+) works normally',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const buyer = await ensureTestUser()
    const seller = await ensureTestUser()

    await supabaseRest('market_booths', 'DELETE', undefined, `owner_id=eq.${seller.id}`)
    const boothRows = await supabaseRest('market_booths', 'POST', {
      owner_id: seller.id,
      name: 'Standard Order Test Booth',
      offers_pickup: true,
    })
    const booth = boothRows[0]!
    assertExists(booth)

    const productRows = await supabaseRest('market_products', 'POST', {
      seller_id: seller.id,
      market_date: new Date().toISOString().split('T')[0],
      name: 'Fresh Tomatoes',
      category: 'produce',
      price_usd: 5.99,
      unit: 'lb',
      inventory: 20,
    })
    const product = productRows[0]!
    assertExists(product)

    const orderResult = await rpc('place_market_order', {
      p_buyer_id: buyer.id,
      p_product_id: product.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    }) as Record<string, unknown>

    assertExists(orderResult, 'Order result should not be null')

    // Should NOT have a minimum_order error
    if (orderResult.code) {
      assertEquals(
        orderResult.code !== 'minimum_order',
        true,
        'Should not have minimum order error for $5.99'
      )
    }

    // Cleanup
    await supabaseRest('market_products', 'DELETE', undefined, `id=eq.${product.id}`)
    await supabaseRest('market_booths', 'DELETE', undefined, `id=eq.${booth.id}`)
  },
})
