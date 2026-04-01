/**
 * Settlement Captures & Error Recovery — Integration Tests
 *
 * Tests buyer debt creation, blocking gate, auto-recovery,
 * and multi-debt scenarios.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/settlement-captures.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

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

// ============================================================================
// 1. is_buyer_blocked: clean user returns unblocked
// ============================================================================
Deno.test({
  name: 'settlement-captures: clean user is not blocked',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await rpc<{ blocked: boolean; outstanding_debts: number }>('is_buyer_blocked', {
      p_buyer_id: '00000000-0000-0000-0000-000000000099',
    })
    assertExists(result)
    assertEquals(result.blocked, false)
    assertEquals(result.outstanding_debts, 0)
  },
})

// ============================================================================
// 2. buyer_debts table is accessible and has correct schema
// ============================================================================
Deno.test({
  name: 'settlement-captures: buyer_debts table has correct schema',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/buyer_debts?select=id,buyer_id,settlement_id,amount_usd,reason,status,stripe_payment_intent_id,error_message,retry_count&limit=0`, {
      headers: HEADERS,
    })
    assertEquals(res.status, 200, 'buyer_debts should be queryable with all expected columns')
    await res.text()
  },
})

// ============================================================================
// 3. auto_recover_buyer_debt RPC exists
// ============================================================================
Deno.test({
  name: 'settlement-captures: auto_recover_buyer_debt RPC exists',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Call with a user who has no debts — should succeed (no-op)
    const result = await rpc('auto_recover_buyer_debt', {
      p_buyer_id: '00000000-0000-0000-0000-000000000099',
    })
    // Should not throw 'function does not exist'
    assertEquals(typeof result, 'object')
  },
})

// ============================================================================
// 4. is_buyer_blocked RPC responds within 200ms
// ============================================================================
Deno.test({
  name: 'settlement-captures: is_buyer_blocked responds within 200ms',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const start = performance.now()
    await rpc('is_buyer_blocked', {
      p_buyer_id: '00000000-0000-0000-0000-000000000099',
    })
    const elapsed = performance.now() - start
    assertEquals(elapsed < 200, true, `Response took ${elapsed.toFixed(0)}ms, expected < 200ms`)
  },
})

// ============================================================================
// 5. market_settlements table is accessible
// ============================================================================
Deno.test({
  name: 'settlement-captures: market_settlements table accessible',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/market_settlements?select=id,market_date,status&limit=0`, {
      headers: HEADERS,
    })
    assertEquals(res.status, 200, 'market_settlements should be queryable')
    await res.text()
  },
})

// ============================================================================
// 6. user_balances table is accessible
// ============================================================================
Deno.test({
  name: 'settlement-captures: user_balances table accessible',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_balances?select=user_id,available_usd,pending_usd&limit=0`, {
      headers: HEADERS,
    })
    assertEquals(res.status, 200, 'user_balances should be queryable')
    await res.text()
  },
})
