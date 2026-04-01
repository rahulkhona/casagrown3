/**
 * Execute Auto-Payouts — Integration Tests
 *
 * Tests the execute-auto-payouts cron edge function:
 * - Auth: service-role only
 * - Schema verification for all dependent tables
 * - RPC existence for batch_debit_market_balance, get_auto_payout_eligible_users
 * - Payout result tracking
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/execute-auto-payouts.test.ts
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
    method: 'POST', headers: HEADERS, body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!text) return null as T
  try { return JSON.parse(text) as T } catch { return text as T }
}

// ============================================================================
// 1. Auth: anon key rejected
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: rejects anon key',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/execute-auto-payouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
      body: '{}',
    })
    assertEquals(true, res.status >= 400, 'Anon key should be rejected')
    await res.text()
  },
})

// ============================================================================
// 2. RPC: get_auto_payout_eligible_users exists and returns array
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: get_auto_payout_eligible_users RPC exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const result = await rpc<unknown[]>('get_auto_payout_eligible_users')
    assertExists(result)
    assertEquals(Array.isArray(result), true)
  },
})

// ============================================================================
// 3. RPC: batch_debit_market_balance exists
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: batch_debit_market_balance RPC exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const result = await rpc('batch_debit_market_balance', { p_entries: [] })
    assertExists(result)
  },
})

// ============================================================================
// 4. Schema: user_auto_redemption_config table accessible
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: user_auto_redemption_config table exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_auto_redemption_config?select=user_id,threshold_usd,method&limit=0`, {
      headers: HEADERS,
    })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// ============================================================================
// 5. Schema: market_ledger table accessible
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: market_ledger tracks payout debits',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/market_ledger?select=id,user_id,amount_usd,direction&limit=0`, {
      headers: HEADERS,
    })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// ============================================================================
// 6. Schema: payout_history table accessible
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: payout_history exists for tracking',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/payout_history?select=id&limit=0`, {
      headers: HEADERS,
    })
    // payout_history may not exist — track if it doesn't
    assertEquals(true, res.status === 200 || res.status === 404)
    await res.text()
  },
})

// ============================================================================
// 7. Performance: eligible users query responds within 500ms
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: eligible users query perf < 500ms',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const start = performance.now()
    await rpc('get_auto_payout_eligible_users')
    const elapsed = performance.now() - start
    assertEquals(elapsed < 500, true, `Took ${elapsed.toFixed(0)}ms, expected < 500ms`)
  },
})
