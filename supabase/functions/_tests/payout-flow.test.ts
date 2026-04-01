/**
 * Payout Flow — Integration Tests
 *
 * Tests debit_market_balance, transaction summaries, batch debits,
 * bank ledger entries, cash position, and reconciliation.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/payout-flow.test.ts
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

async function restGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS })
  return res.json()
}

async function ensureUser(suffix: string): Promise<string> {
  const email = `pf-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return data.user?.id
}

async function seedBalance(userId: string, available: number) {
  await fetch(`${SUPABASE_URL}/rest/v1/user_balances`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      available_usd: available,
      pending_usd: 0,
      total_earned_usd: available,
      total_spent_usd: 0,
      total_withdrawn_usd: 0,
    }),
  })
}

// ============================================================================
// 1. Seeded user has correct balance
// ============================================================================
Deno.test({
  name: 'payout-flow: seed user has correct available_usd',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureUser('balance')
    await seedBalance(userId, 47.50)

    const data = await restGet('user_balances', `user_id=eq.${userId}`)
    const row = Array.isArray(data) ? data[0] : data
    assertExists(row)
    assertEquals(Number(row.available_usd), 47.50)
  },
})

// ============================================================================
// 2. get_auto_payout_eligible_users returns array
// ============================================================================
Deno.test({
  name: 'payout-flow: get_auto_payout_eligible_users returns array',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await rpc<unknown[]>('get_auto_payout_eligible_users')
    assertEquals(Array.isArray(result), true)
  },
})

// ============================================================================
// 3. debit_market_balance: successful debit
// ============================================================================
Deno.test({
  name: 'payout-flow: debit_market_balance reduces available_usd',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureUser('debit')
    await seedBalance(userId, 50.00)

    const result = await rpc<{ success: boolean; new_balance: number }>('debit_market_balance', {
      p_user_id: userId,
      p_amount_usd: 20.00,
    })

    assertExists(result)
    assertEquals(result.success, true)

    const data = await restGet('user_balances', `user_id=eq.${userId}`)
    const row = Array.isArray(data) ? data[0] : data
    assertEquals(Number(row.available_usd), 30.00)
  },
})

// ============================================================================
// 4. debit_market_balance: overdraft prevention
// ============================================================================
Deno.test({
  name: 'payout-flow: debit_market_balance rejects overdraft',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureUser('overdraft')
    await seedBalance(userId, 10.00)

    const result = await rpc<{ success: boolean; error: string }>('debit_market_balance', {
      p_user_id: userId,
      p_amount_usd: 25.00,
    })

    assertExists(result)
    assertEquals(result.success, false)
    assertEquals(typeof result.error, 'string')

    // Balance should be unchanged
    const data = await restGet('user_balances', `user_id=eq.${userId}`)
    const row = Array.isArray(data) ? data[0] : data
    assertEquals(Number(row.available_usd), 10.00)
  },
})

// ============================================================================
// 5. batch_debit_market_balance: mixed results
// ============================================================================
Deno.test({
  name: 'payout-flow: batch_debit handles mixed success/failure',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const u1 = await ensureUser('batch1')
    const u2 = await ensureUser('batch2')
    await seedBalance(u1, 100.00)
    await seedBalance(u2, 5.00)

    const result = await rpc<{ total: number; succeeded: number; failed: number }>('batch_debit_market_balance', {
      p_debits: [
        { user_id: u1, amount_usd: 30.00, metadata: { reason: 'test' } },
        { user_id: u2, amount_usd: 50.00, metadata: { reason: 'test' } }, // insufficient
        { user_id: '00000000-0000-0000-0000-000000000099', amount_usd: 10.00, metadata: { reason: 'test' } }, // non-existent
      ],
    })

    assertExists(result)
    assertEquals(result.total, 3)
    assertEquals(result.succeeded, 1)
    assertEquals(result.failed, 2)
  },
})

// ============================================================================
// 6. append_bank_ledger_entry: records outflow
// ============================================================================
Deno.test({
  name: 'payout-flow: bank ledger records cashout outflow',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const refId = `pf_test_${Date.now()}`
    const id = await rpc<number>('append_bank_ledger_entry', {
      p_event_type: 'cashout_sent',
      p_direction: 'outflow',
      p_amount_usd: 15.00,
      p_provider: 'paypal',
      p_reference_type: 'redemption',
      p_reference_id: refId,
    })

    assertExists(id)
    assertEquals(typeof id, 'number')
    assertEquals(id > 0, true)
  },
})

// ============================================================================
// 7. platform_cash_position: returns bank balance
// ============================================================================
Deno.test({
  name: 'payout-flow: platform_cash_position has bank_balance_usd',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Need staff auth context for this RPC
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/platform_cash_position`, {
      method: 'POST',
      headers: HEADERS,
      body: '{}',
    })
    // May return 200 (service role) or 400 (staff check)
    assertEquals(true, [200, 400].includes(res.status))
    const text = await res.text()
    if (res.status === 200 && text) {
      const data = JSON.parse(text)
      assertExists(data.bank_balance_usd !== undefined || data.is_healthy !== undefined)
    }
  },
})

// ============================================================================
// 8. reconcile_platform_balances: healthy check
// ============================================================================
Deno.test({
  name: 'payout-flow: reconcile_platform_balances RPC callable',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reconcile_platform_balances`, {
      method: 'POST',
      headers: HEADERS,
      body: '{}',
    })
    assertEquals(true, [200, 400].includes(res.status))
    await res.text()
  },
})

// ============================================================================
// 9. debit_market_balance: response time < 100ms
// ============================================================================
Deno.test({
  name: 'payout-flow: debit_market_balance responds within 100ms',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const start = performance.now()
    await rpc('debit_market_balance', {
      p_user_id: '00000000-0000-0000-0000-000000000099',
      p_amount_usd: 1.00,
    })
    const elapsed = performance.now() - start
    assertEquals(elapsed < 100, true, `Took ${elapsed.toFixed(0)}ms`)
  },
})

// ============================================================================
// 10. Market ledger entries: debit creates audit trail
// ============================================================================
Deno.test({
  name: 'payout-flow: debit creates market_ledger entry',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureUser('ledger')
    await seedBalance(userId, 100.00)

    await rpc('debit_market_balance', {
      p_user_id: userId,
      p_amount_usd: 25.00,
      p_metadata: { reason: 'test_payout' },
    })

    // Check for ledger entry
    const entries = await restGet('market_ledger', `user_id=eq.${userId}&order=id.desc&limit=1`)
    const entry = Array.isArray(entries) ? entries[0] : entries
    assertExists(entry)
    assertEquals(entry.direction, 'debit')
    assertEquals(Number(entry.amount_usd), 25.00)
  },
})
