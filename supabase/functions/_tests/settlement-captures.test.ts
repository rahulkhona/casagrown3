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
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_o0BQy4UlCDU'

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

async function restPost(table: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

async function restPatch(table: string, query: string, body: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
}

async function restGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: HEADERS,
  })
  return res.json()
}

/** Create a test user via signup */
async function createTestUser(suffix: string): Promise<{ id: string; token: string }> {
  const email = `sc-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return { id: data.user?.id, token: data.access_token }
}

// ============================================================================
// 1. is_buyer_blocked: clean user is NOT blocked
// ============================================================================
Deno.test({
  name: 'settlement-captures: clean user is not blocked',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('clean')
    const result = await rpc<{ blocked: boolean; outstanding_debts: number }>('is_buyer_blocked', {
      p_buyer_id: user.id,
    })
    assertExists(result)
    assertEquals(result.blocked, false)
    assertEquals(result.outstanding_debts, 0)
  },
})

// ============================================================================
// 2. buyer_debts: inserting a debt blocks the buyer
// ============================================================================
Deno.test({
  name: 'settlement-captures: buyer with debt is blocked',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const buyer = await createTestUser('debtor')

    // Create a fake settlement for reference
    const settlement = await restPost('market_settlements', {
      market_date: '2020-06-15',
      status: 'cleared',
    })

    // Create buyer debt
    await restPost('buyer_debts', {
      buyer_id: buyer.id,
      settlement_id: settlement.id,
      amount_usd: 25.00,
      reason: 'capture_failed',
      stripe_payment_intent_id: `pi_test_debt_${Date.now()}`,
      error_message: 'Card declined',
    })

    const result = await rpc<{ blocked: boolean; total_debt_usd: number; outstanding_debts: number }>('is_buyer_blocked', {
      p_buyer_id: buyer.id,
    })
    assertExists(result)
    assertEquals(result.blocked, true)
    assertEquals(result.total_debt_usd, 25)
    assertEquals(result.outstanding_debts, 1)
  },
})

// ============================================================================
// 3. Blocked buyer gets 403 from market-hold edge function
// ============================================================================
Deno.test({
  name: 'settlement-captures: blocked buyer cannot create holds',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const buyer = await createTestUser('blocked-hold')

    // Create settlement + debt
    const settlement = await restPost('market_settlements', {
      market_date: '2020-07-15',
      status: 'cleared',
    })
    await restPost('buyer_debts', {
      buyer_id: buyer.id,
      settlement_id: settlement.id,
      amount_usd: 10.00,
      reason: 'capture_failed',
      stripe_payment_intent_id: `pi_block_${Date.now()}`,
      error_message: 'Card declined',
    })

    // Try to call market-hold
    const res = await fetch(`${SUPABASE_URL}/functions/v1/market-hold`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyer.token}`,
      },
      body: JSON.stringify({
        order_id: '00000000-0000-0000-0000-000000000000',
        amount_cents: 1000,
      }),
    })

    const data = await res.json()
    // Should be blocked — either 403 or error message about outstanding charges
    assertEquals(true,
      res.status === 403 || (data.error && data.error.includes('outstanding')),
      `Expected 403 or outstanding debt error, got: ${JSON.stringify(data)}`
    )
  },
})

// ============================================================================
// 4. Auto-recovery: give buyer balance, recover debt
// ============================================================================
Deno.test({
  name: 'settlement-captures: auto_recover_buyer_debt clears debt from balance',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const buyer = await createTestUser('recover')

    // Create settlement + debt
    const settlement = await restPost('market_settlements', {
      market_date: '2020-08-15',
      status: 'cleared',
    })
    await restPost('buyer_debts', {
      buyer_id: buyer.id,
      settlement_id: settlement.id,
      amount_usd: 15.00,
      reason: 'capture_failed',
      stripe_payment_intent_id: `pi_recover_${Date.now()}`,
      error_message: 'Card declined',
    })

    // Give buyer balance
    await fetch(`${SUPABASE_URL}/rest/v1/user_balances`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: buyer.id,
        available_usd: 30.00,
        pending_usd: 0,
        total_earned_usd: 30,
        total_spent_usd: 0,
        total_withdrawn_usd: 0,
      }),
    })

    // Run auto-recovery
    await rpc('auto_recover_buyer_debt', { p_buyer_id: buyer.id })

    // Buyer should now be unblocked
    const result = await rpc<{ blocked: boolean }>('is_buyer_blocked', {
      p_buyer_id: buyer.id,
    })
    assertEquals(result.blocked, false)

    // Balance should be reduced
    const balances = await restGet('user_balances', `user_id=eq.${buyer.id}`)
    const balance = Array.isArray(balances) ? balances[0] : balances
    assertEquals(Number(balance.available_usd), 15.00)
  },
})

// ============================================================================
// 5. Multiple debts: create 2 debts, recover both
// ============================================================================
Deno.test({
  name: 'settlement-captures: multiple debts recovered at once',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const buyer = await createTestUser('multi-debt')

    const s1 = await restPost('market_settlements', { market_date: '2020-09-01', status: 'cleared' })
    const s2 = await restPost('market_settlements', { market_date: '2020-09-02', status: 'cleared' })

    await restPost('buyer_debts', {
      buyer_id: buyer.id, settlement_id: s1.id, amount_usd: 10.00,
      reason: 'capture_failed', stripe_payment_intent_id: `pi_m1_${Date.now()}`,
      error_message: 'Declined',
    })
    await restPost('buyer_debts', {
      buyer_id: buyer.id, settlement_id: s2.id, amount_usd: 8.00,
      reason: 'capture_failed', stripe_payment_intent_id: `pi_m2_${Date.now()}`,
      error_message: 'Declined',
    })

    // Verify blocked with total = $18
    const before = await rpc<{ blocked: boolean; total_debt_usd: number }>('is_buyer_blocked', {
      p_buyer_id: buyer.id,
    })
    assertEquals(before.blocked, true)
    assertEquals(before.total_debt_usd, 18)

    // Give buyer $50 balance and recover
    await fetch(`${SUPABASE_URL}/rest/v1/user_balances`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: buyer.id, available_usd: 50.00,
        pending_usd: 0, total_earned_usd: 50, total_spent_usd: 0, total_withdrawn_usd: 0,
      }),
    })
    await rpc('auto_recover_buyer_debt', { p_buyer_id: buyer.id })

    const after = await rpc<{ blocked: boolean }>('is_buyer_blocked', { p_buyer_id: buyer.id })
    assertEquals(after.blocked, false)

    const balances = await restGet('user_balances', `user_id=eq.${buyer.id}`)
    const balance = Array.isArray(balances) ? balances[0] : balances
    assertEquals(Number(balance.available_usd), 32.00) // 50 - 18
  },
})

// ============================================================================
// 6. Debt recovery timing: responds within 200ms
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
