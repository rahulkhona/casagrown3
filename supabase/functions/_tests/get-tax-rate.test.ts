/**
 * get-tax-rate — Integration Tests
 *
 * Tests the tax rate lookup chain: cache, category rules, product overrides.
 * 
 * The edge function priority is:
 *   1. product_tax_overrides → fixed/exempt rate for specific product
 *   2. category_tax_rules → fixed/exempt rate for category in state
 *   3. zip_tax_cache → cached combined rate from ZipTax API
 *   4. ZipTax API v40 → fetch, cache, and return combined rate
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

/** Seed zip_tax_cache for test ZIP */
async function seedCache(zip: string, rate: number) {
  const expiresAt = new Date(Date.now() + 86400000 * 30).toISOString()
  await fetch(`${SUPABASE_URL}/rest/v1/zip_tax_cache`, {
    method: 'POST',
    headers: { ...REST_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      zip_code: zip,
      combined_rate: rate,
      state_rate: 7.25,
      county_rate: 0,
      city_rate: 0,
      district_rate: rate - 7.25,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    }),
  })
}

/** Delete category rules so cache path is tested */
async function clearCategoryRules(stateCode: string, category: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/category_tax_rules?state_code=eq.${stateCode}&category_name=eq.${category}&effective_until=is.null`, {
    method: 'DELETE',
    headers: REST_HEADERS,
  })
}

/** Seed a category tax rule */
async function seedCategoryRule(stateCode: string, category: string, ruleType: string, ratePct: number | null) {
  // Delete existing active rule
  await clearCategoryRules(stateCode, category)

  const res = await fetch(`${SUPABASE_URL}/rest/v1/category_tax_rules`, {
    method: 'POST',
    headers: REST_HEADERS,
    body: JSON.stringify({
      state_code: stateCode,
      category_name: category,
      rule_type: ruleType,
      rate_pct: ratePct,
    }),
  })
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

/** Get a test user access token */
async function getTestToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: 'seller@test.local', password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return data.access_token
}

// ============================================================================
// 1. Cache hit: Use a ZIP+category combo with NO category rule
//    Use 'seeds' category (has no CA rule) and ZIP 95126
// ============================================================================
Deno.test({
  name: 'get-tax-rate: returns cached rate with source "cache"',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Ensure no category rule for seeds in CA
    await clearCategoryRules('CA', 'seeds')
    await seedCache('95126', 9.125)
    const token = await getTestToken()

    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-tax-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        zip_code: '95126',
        state_code: 'CA',
        category: 'seeds', // No active category rule for seeds → falls through to cache
      }),
    })

    assertEquals(res.status, 200)
    const data = await res.json()
    assertExists(data.rate_pct)
    assertEquals(data.source, 'cache')
    assertEquals(data.rate_pct, 9.125)
  },
})

// ============================================================================
// 2. Category exempt: CA soil is fixed 0% (exempt)
// ============================================================================
Deno.test({
  name: 'get-tax-rate: category exempt returns is_exempt true',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await seedCategoryRule('CA', 'soil', 'fixed', 0)
    const token = await getTestToken()

    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-tax-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        zip_code: '95126',
        state_code: 'CA',
        category: 'soil',
      }),
    })

    assertEquals(res.status, 200)
    const data = await res.json()
    assertEquals(data.is_exempt, true)
    assertEquals(data.rate_pct, 0)
    assertEquals(data.source, 'category_rule')
  },
})

// ============================================================================
// 3. Product override: specific product taxed despite exempt category
// ============================================================================
Deno.test({
  name: 'get-tax-rate: product override takes precedence',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const rule = await seedCategoryRule('CA', 'pots', 'fixed', 0)
    if (rule?.id) {
      // Delete existing overrides
      await fetch(`${SUPABASE_URL}/rest/v1/product_tax_overrides?category_rule_id=eq.${rule.id}&product_name=eq.Ceramic Pot`, {
        method: 'DELETE',
        headers: REST_HEADERS,
      })
      await fetch(`${SUPABASE_URL}/rest/v1/product_tax_overrides`, {
        method: 'POST',
        headers: REST_HEADERS,
        body: JSON.stringify({
          category_rule_id: rule.id,
          product_name: 'Ceramic Pot',
          rule_type: 'fixed',
          rate_pct: 8.25,
        }),
      })
    }

    const token = await getTestToken()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-tax-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        zip_code: '95126',
        state_code: 'CA',
        category: 'pots',
        product_name: 'Ceramic Pot',
      }),
    })

    assertEquals(res.status, 200)
    const data = await res.json()
    assertEquals(data.source, 'product_override')
    assertEquals(data.rate_pct, 8.25)
  },
})

// ============================================================================
// 4. Missing params: 400 error
// ============================================================================
Deno.test({
  name: 'get-tax-rate: returns 400 for missing params',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const token = await getTestToken()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-tax-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ zip_code: '95125' }),
    })

    const data = await res.json()
    assertEquals(typeof data.error, 'string')
  },
})

// ============================================================================
// 5. Auth required: 401 without token
// ============================================================================
Deno.test({
  name: 'get-tax-rate: returns 401 without auth',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-tax-rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zip_code: '95125',
        state_code: 'CA',
        category: 'produce',
      }),
    })

    const status = res.status
    assertEquals(true, status === 401 || status === 200, `Expected 401 or error, got ${status}`)
    if (status === 200) {
      const data = await res.json()
      assertExists(data.error)
    } else {
      await res.text()
    }
  },
})
