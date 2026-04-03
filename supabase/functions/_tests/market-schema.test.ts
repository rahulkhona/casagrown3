/**
 * Market Schema Integration Tests
 *
 * Verifies market_booths and market_products CRUD operations and
 * constraints against the local Supabase instance.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/market-schema.test.ts
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

/** Create a test user via HTTP signup (avoids admin JWT signing issues) */
async function ensureTestUser(): Promise<string> {
  const email = `market-schema-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  if (!data.user?.id) throw new Error(`Failed to create test user: ${JSON.stringify(data)}`)
  return data.user.id
}

Deno.test({
  name: 'market_booths: insert and verify',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureTestUser()

    await supabaseRest('market_booths', 'DELETE', undefined, `owner_id=eq.${userId}`)

    const rows = await supabaseRest('market_booths', 'POST', {
      owner_id: userId,
      name: 'Test Market Booth',
      description: 'Integration test booth',
      decorative_theme: 'rustic',
      market_day_of_week: 6,
    })
    const booth = rows[0]!

    assertExists(booth)
    assertEquals(booth.name, 'Test Market Booth')
    assertEquals(booth.market_day_of_week, 6)

    await supabaseRest('market_booths', 'DELETE', undefined, `id=eq.${booth.id}`)
  },
})

Deno.test({
  name: 'market_booths: unique constraint on owner_id',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureTestUser()

    await supabaseRest('market_booths', 'DELETE', undefined, `owner_id=eq.${userId}`)

    const rows = await supabaseRest('market_booths', 'POST', { owner_id: userId, name: 'Booth 1' })
    const booth1 = rows[0]!
    assertExists(booth1)

    // Second insert for same owner should fail (409 conflict)
    let gotError = false
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/market_booths`, {
        method: 'POST',
        headers: { ...REST_HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify({ owner_id: userId, name: 'Booth 2' }),
      })
      if (res.status >= 400) gotError = true
    } catch {
      gotError = true
    }

    assertEquals(gotError, true, 'Duplicate owner_id should fail')

    await supabaseRest('market_booths', 'DELETE', undefined, `id=eq.${booth1.id}`)
  },
})

Deno.test({
  name: 'market_products: per-market-day product CRUD',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureTestUser()

    await supabaseRest('market_booths', 'DELETE', undefined, `owner_id=eq.${userId}`)

    const boothRows = await supabaseRest('market_booths', 'POST', { owner_id: userId, name: 'Product Test Booth' })
    const booth = boothRows[0]!
    assertExists(booth)

    const productRows = await supabaseRest('market_products', 'POST', {
      seller_id: userId,
      market_date: '2026-03-15',
      name: 'Fresh Tomatoes',
      category: 'produce',
      price_usd: 3.50,
      unit: 'lb',
      inventory: 20,
    })
    const product = productRows[0]!

    assertExists(product)
    assertEquals(product.name, 'Fresh Tomatoes')
    assertEquals(product.market_date, '2026-03-15')

    // Cascade deletes products
    await supabaseRest('market_booths', 'DELETE', undefined, `id=eq.${booth.id}`)
  },
})

Deno.test({
  name: 'market_products: requires market_date',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureTestUser()

    await supabaseRest('market_booths', 'DELETE', undefined, `owner_id=eq.${userId}`)

    const boothRows = await supabaseRest('market_booths', 'POST', { owner_id: userId, name: 'Date Test Booth' })
    const booth = boothRows[0]!
    assertExists(booth)

    // Omitting market_date should fail (NOT NULL)
    let gotError = false
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/market_products`, {
        method: 'POST',
        headers: { ...REST_HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          seller_id: userId,
          name: 'No Date Product',
          price_usd: 5.00,
        }),
      })
      if (res.status >= 400) gotError = true
    } catch {
      gotError = true
    }

    assertEquals(gotError, true, 'Missing market_date should fail')

    await supabaseRest('market_booths', 'DELETE', undefined, `id=eq.${booth.id}`)
  },
})
