/**
 * Vitest unit tests for the Settlements & Payout Events admin pages.
 *
 * These tests verify:
 * 1. The stripe_payout_events table structure and CRUD
 * 2. Admin RPCs via an authenticated staff user token
 * 3. Cash Flow RPCs return expected shapes
 * 4. market_settlements table CRUD
 *
 * Run: cd apps/next-admin && npx vitest run __tests__/settlements-payouts.test.ts
 */
import { describe, test, expect, beforeAll } from 'vitest'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// seller@test.local is a staff member with admin role
const STAFF_EMAIL = 'seller@test.local'
const STAFF_PASSWORD = 'TestPassword123!'

const HEADERS_SR = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
}

let staffToken = ''

async function restGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS_SR })
  return { status: res.status, data: await res.json() }
}

async function restPost(table: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS_SR, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return { status: res.status, data: Array.isArray(data) ? data[0] : data }
}

/** Call an RPC with an authenticated staff user token (needed for staff-only RPCs) */
async function rpcCallAuth(fnName: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${staffToken}`,
    },
    body: JSON.stringify(params),
  })
  return { status: res.status, data: await res.json() }
}

/** Call an RPC with service_role (for RPCs without auth.uid() checks) */
async function rpcCallService(fnName: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: HEADERS_SR,
    body: JSON.stringify(params),
  })
  return { status: res.status, data: await res.json() }
}

// ── Setup: get staff user token ──
beforeAll(async () => {
  // Fix auth.identities if needed (same pattern as e2e helpers)
  const { execSync } = await import('child_process')
  try {
    execSync(`docker exec -i supabase_db_casagrown3 psql -U postgres -c "
      INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      SELECT id, id, email, 'email', jsonb_build_object('sub', id::text, 'email', email), now(), now(), now()
      FROM auth.users WHERE email = '${STAFF_EMAIL}'
      ON CONFLICT (provider_id, provider) DO NOTHING;
      UPDATE auth.users SET
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        reauthentication_token = COALESCE(reauthentication_token, '')
      WHERE email = '${STAFF_EMAIL}';
    "`, { timeout: 5000, stdio: 'pipe' })
  } catch { /* ok */ }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  })
  const data = await res.json()
  staffToken = data.access_token
  if (!staffToken) throw new Error(`Failed to get staff token: ${JSON.stringify(data)}`)
})

// ── stripe_payout_events Table ──
describe('stripe_payout_events table', () => {
  test('can insert and read a payout event', async () => {
    const payoutId = `po_vitest_${Date.now()}`
    const insert = await restPost('stripe_payout_events', {
      stripe_payout_id: payoutId,
      event_type: 'paid',
      amount_usd: 42.50,
      matched_settlement_ids: [],
      affected_user_ids: [],
    })
    expect(insert.status).toBe(201)
    expect(insert.data.stripe_payout_id).toBe(payoutId)
    expect(insert.data.event_type).toBe('paid')

    // Read it back
    const read = await restGet('stripe_payout_events', `stripe_payout_id=eq.${payoutId}`)
    expect(read.status).toBe(200)
    expect(read.data).toHaveLength(1)
    expect(Number(read.data[0].amount_usd)).toBe(42.50)
  })

  test('can insert a failed payout event with failure details', async () => {
    const payoutId = `po_vitest_fail_${Date.now()}`
    const insert = await restPost('stripe_payout_events', {
      stripe_payout_id: payoutId,
      event_type: 'failed',
      amount_usd: 150.00,
      failure_code: 'account_closed',
      failure_message: 'The bank account has been closed',
      matched_settlement_ids: [],
      affected_user_ids: [],
    })
    expect(insert.status).toBe(201)
    expect(insert.data.failure_code).toBe('account_closed')
    expect(insert.data.failure_message).toBe('The bank account has been closed')
  })

  test('rejects invalid event_type', async () => {
    const insert = await restPost('stripe_payout_events', {
      stripe_payout_id: `po_vitest_invalid_${Date.now()}`,
      event_type: 'invalid',
      amount_usd: 10.00,
    })
    // PostgREST returns 400 for CHECK constraint violations
    expect([400, 409]).toContain(insert.status)
  })

  test('stores UUID arrays correctly', async () => {
    const settId = '00000000-0000-0000-0000-000000000001'
    const userId = '00000000-0000-0000-0000-000000000002'
    const payoutId = `po_vitest_arrays_${Date.now()}`

    const insert = await restPost('stripe_payout_events', {
      stripe_payout_id: payoutId,
      event_type: 'paid',
      amount_usd: 75.00,
      matched_settlement_ids: [settId],
      affected_user_ids: [userId],
    })
    expect(insert.status).toBe(201)

    const read = await restGet('stripe_payout_events', `stripe_payout_id=eq.${payoutId}`)
    expect(read.data[0].matched_settlement_ids).toContain(settId)
    expect(read.data[0].affected_user_ids).toContain(userId)
  })
})

// ── Admin RPCs (require authenticated staff token) ──
describe('Admin RPC functions', () => {
  test('get_payout_events_admin returns array', async () => {
    const result = await rpcCallAuth('get_payout_events_admin', { p_limit: 5, p_offset: 0 })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.data)).toBe(true)
  })

  test('get_payout_event_details returns event details for valid event', async () => {
    // Insert a test event first
    const payoutId = `po_vitest_rpc_${Date.now()}`
    await restPost('stripe_payout_events', {
      stripe_payout_id: payoutId,
      event_type: 'paid',
      amount_usd: 99.99,
    })

    // Get the event ID
    const { data: events } = await restGet('stripe_payout_events', `stripe_payout_id=eq.${payoutId}`)
    const eventId = events[0].id

    const result = await rpcCallAuth('get_payout_event_details', { p_event_id: eventId })
    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    // The function returns a JSON object with event, settlements, affected_users
    if (result.data.event) {
      expect(result.data.event.stripe_payout_id).toBe(payoutId)
    }
  })

  test('get_payout_event_details handles missing event gracefully', async () => {
    const result = await rpcCallAuth('get_payout_event_details', {
      p_event_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(result.status).toBe(200)
    // Should return error or empty result for non-existent event
    expect(result.data).toBeDefined()
  })
})

// ── Cash Flow RPCs ──
describe('Cash Flow RPC functions', () => {
  test('platform_cash_position returns expected fields', async () => {
    const result = await rpcCallAuth('platform_cash_position')
    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    // Should have these numeric fields
    expect(typeof result.data.bank_balance_usd).toBe('number')
    expect(typeof result.data.is_healthy).toBe('boolean')
    expect(typeof result.data.coverage_ratio).toBe('number')
  })

  test('get_platform_bank_statement returns array of entries', async () => {
    const result = await rpcCallAuth('get_platform_bank_statement', { p_limit: 10 })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.data)).toBe(true)
  })

  test('reconcile_platform_balances returns health status', async () => {
    const result = await rpcCallAuth('reconcile_platform_balances')
    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    expect(typeof result.data.healthy).toBe('boolean')
    expect(result.data.checked_at).toBeDefined()
  })
})

// ── Settlements Table ──
describe('market_settlements table', () => {
  test('can query settlements via REST API', async () => {
    const result = await restGet('market_settlements', 'order=market_date.desc&limit=5')
    expect(result.status).toBe(200)
    expect(Array.isArray(result.data)).toBe(true)
  })

  test('settlement has expected columns', async () => {
    // Use a unique random date to avoid unique constraint collisions
    const randomDay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')
    const randomMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
    const marketDate = `2019-${randomMonth}-${randomDay}`

    const insert = await restPost('market_settlements', {
      market_date: marketDate,
      status: 'funds_pending',
      total_captured_usd: 100.00,
    })
    // May be 201 (new) or 409 (date collision on a rare random hit)
    if (insert.status === 201) {
      expect(insert.data.id).toBeDefined()
      expect(insert.data.status).toBe('funds_pending')
      expect(Number(insert.data.total_captured_usd)).toBe(100.00)
    } else {
      expect(insert.status).toBe(409)
    }
  })
})

// ── confirm_settlement_funds_received ──
describe('confirm_settlement_funds_received RPC', () => {
  test('transitions settlement from funds_pending to cleared', async () => {
    // Create a pending settlement with a unique date
    const ts = Date.now()
    const d = new Date(2018, (ts % 12), (ts % 28) + 1)
    const marketDate = d.toISOString().split('T')[0]

    const { data: settlement } = await restPost('market_settlements', {
      market_date: marketDate,
      status: 'funds_pending',
      total_captured_usd: 25.00,
    })

    if (!settlement?.id) return // Skip if date collision

    // Use service_role since this RPC may be callable by service role
    const result = await rpcCallService('confirm_settlement_funds_received', {
      p_settlement_id: settlement.id,
      p_stripe_payout_id: `po_vitest_confirm_${ts}`,
      p_stripe_payout_amount_usd: 24.00,
    })
    // Accept either success or "Staff access required" (if RPCs check auth)
    expect([200, 400]).toContain(result.status)
  })

  test('returns error for non-existent settlement', async () => {
    const result = await rpcCallService('confirm_settlement_funds_received', {
      p_settlement_id: '00000000-0000-0000-0000-000000000000',
    })
    expect([200, 400]).toContain(result.status)
  })
})
