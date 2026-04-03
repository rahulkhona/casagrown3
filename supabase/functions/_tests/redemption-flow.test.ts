/**
 * Redemption Flow — Integration Tests
 *
 * Tests redemption RPCs and table access: get_active_redemption_providers,
 * redemption_queue, giftcards_cache, and redemptions table.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/redemption-flow.test.ts
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

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
}

async function rpc<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!text) return null as T
  try { return JSON.parse(text) as T } catch { return text as T }
}

async function restGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS })
  return res.json()
}

async function restPost(table: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

async function createTestUser(suffix: string): Promise<{ id: string; token: string }> {
  const email = `redeem-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return { id: data.user?.id, token: data.access_token }
}

// ============================================================================
// 1. get_active_redemption_providers — exists and returns array
// ============================================================================
Deno.test({
  name: 'redemption: get_active_redemption_providers returns array',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await rpc<any[]>('get_active_redemption_providers')
    assertEquals(Array.isArray(result), true)
  },
})

// ============================================================================
// 2. redemption_queue — can insert a redemption request
// (method must be 'giftcards', 'charity', or 'cashout'; status defaults to 'queued')
// ============================================================================
Deno.test({
  name: 'redemption: can insert into redemption_queue',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('queue')

    const { status, data } = await restPost('redemption_queue', {
      user_id: user.id,
      method: 'giftcards',
      amount_usd: 10.00,
      config: { brand: 'amazon' },
    })

    const record = Array.isArray(data) ? data[0] : data
    assertExists(record.id)
    assertEquals(record.status, 'queued')
    assertEquals(Number(record.amount_usd), 10)
  },
})

// ============================================================================
// 3. giftcards_cache — table is readable
// ============================================================================
Deno.test({
  name: 'redemption: giftcards_cache table is accessible',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const data = await restGet('giftcards_cache', 'select=id,provider,status&limit=5')
    // Should be accessible and return array (may be empty)
    assertEquals(Array.isArray(data), true,
      `Expected array, got: ${JSON.stringify(data).slice(0, 200)}`)
  },
})

// ============================================================================
// 4. redemptions table — exists and is readable
// ============================================================================
Deno.test({
  name: 'redemption: redemptions table is accessible',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const data = await restGet('redemptions', 'select=id,user_id,status&limit=5')
    assertEquals(Array.isArray(data), true,
      `Expected array, got: ${JSON.stringify(data).slice(0, 200)}`)
  },
})

// ============================================================================
// 5. redemption_queue method constraint — rejects invalid method
// ============================================================================
Deno.test({
  name: 'redemption: rejects invalid method in queue',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('bad-method')

    const { status } = await restPost('redemption_queue', {
      user_id: user.id,
      method: 'invalid_method',
      amount_usd: 5.00,
      config: {},
    })

    // Should fail with constraint violation (409)
    assertEquals(status >= 400, true, `Expected error status, got ${status}`)
  },
})
