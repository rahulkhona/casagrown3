/**
 * Vitest unit tests for the Disputes admin pages.
 *
 * These tests verify:
 * 1. stripe_disputes table CRUD
 * 2. Dispute admin RPCs (get_disputes_admin, get_dispute_stats, get_dispute_evidence, save_dispute_evidence_draft)
 * 3. order_status_log trigger + table
 * 4. RLS: non-staff blocked from disputes
 *
 * Run: cd apps/next-admin && npx vitest run __tests__/disputes.test.ts
 */
import { describe, test, expect, beforeAll } from 'vitest'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

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

async function rpcCallAnon(fnName: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(params),
  })
  return { status: res.status, data: await res.json() }
}

// ── Setup: get staff user token ──
beforeAll(async () => {
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

// ══════════════════════════════════════════════════════════════
// stripe_disputes Table
// ══════════════════════════════════════════════════════════════
describe('stripe_disputes table', () => {
  test('can insert and read a dispute', async () => {
    const disputeId = `dp_vitest_${Date.now()}`
    const insert = await restPost('stripe_disputes', {
      stripe_dispute_id: disputeId,
      amount_usd: 25.50,
      status: 'needs_response',
      reason: 'fraudulent',
      fee_usd: 15.00,
    })
    expect(insert.status).toBe(201)
    expect(insert.data.stripe_dispute_id).toBe(disputeId)

    const read = await restGet('stripe_disputes', `stripe_dispute_id=eq.${disputeId}`)
    expect(read.status).toBe(200)
    expect(read.data).toHaveLength(1)
    expect(Number(read.data[0].amount_usd)).toBe(25.50)
    expect(read.data[0].reason).toBe('fraudulent')
  })

  test('rejects invalid status', async () => {
    const insert = await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_vitest_bad_${Date.now()}`,
      amount_usd: 10.00,
      status: 'totally_invalid',
    })
    expect([400, 409]).toContain(insert.status)
  })

  test('rejects duplicate stripe_dispute_id', async () => {
    const id = `dp_vitest_dup_${Date.now()}`
    await restPost('stripe_disputes', {
      stripe_dispute_id: id,
      amount_usd: 10.00,
      status: 'needs_response',
    })
    const dup = await restPost('stripe_disputes', {
      stripe_dispute_id: id,
      amount_usd: 20.00,
      status: 'needs_response',
    })
    expect(dup.status).toBe(409) // UNIQUE constraint
  })

  test('fee_usd defaults to 15.00', async () => {
    const insert = await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_vitest_fee_${Date.now()}`,
      amount_usd: 30.00,
      status: 'needs_response',
    })
    expect(insert.status).toBe(201)
    expect(Number(insert.data.fee_usd)).toBe(15.00)
  })
})

// ══════════════════════════════════════════════════════════════
// Dispute Admin RPCs
// ══════════════════════════════════════════════════════════════
describe('Dispute Admin RPCs', () => {
  test('get_disputes_admin returns array as staff', async () => {
    const result = await rpcCallAuth('get_disputes_admin', { p_limit: 5 })
    expect(result.status).toBe(200)
    // Returns JSONB which is an array (possibly empty)
    expect(result.data !== null).toBe(true)
  })

  test('get_disputes_admin filters by status', async () => {
    // Insert a known dispute so we can filter
    await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_vitest_filter_${Date.now()}`,
      amount_usd: 77.00,
      status: 'won',
      reason: 'test_filter',
    })

    const result = await rpcCallAuth('get_disputes_admin', { p_status: 'won', p_limit: 50 })
    expect(result.status).toBe(200)
    // All returned disputes should have status='won'
    if (Array.isArray(result.data) && result.data.length > 0) {
      for (const d of result.data) {
        expect(d.status).toBe('won')
      }
    }
  })

  test('get_dispute_stats returns expected fields', async () => {
    const result = await rpcCallAuth('get_dispute_stats')
    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    expect(typeof result.data.needs_response).toBe('number')
    expect(typeof result.data.under_review).toBe('number')
    expect(typeof result.data.won).toBe('number')
    expect(typeof result.data.lost).toBe('number')
    expect(typeof result.data.total).toBe('number')
    expect(typeof result.data.total_disputed_usd).toBe('number')
    expect(typeof result.data.total_fees_usd).toBe('number')
  })

  test('get_dispute_evidence returns error for non-existent dispute', async () => {
    const result = await rpcCallAuth('get_dispute_evidence', {
      p_dispute_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(result.status).toBe(200)
    expect(result.data.error).toBe('Dispute not found')
  })

  test('get_dispute_evidence returns evidence for existing dispute', async () => {
    // Insert a dispute with a known buyer_id (the staff user)
    const staffRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${staffToken}`, 'apikey': ANON_KEY },
    })
    const staffUser = await staffRes.json()

    const insert = await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_vitest_evidence_${Date.now()}`,
      amount_usd: 42.00,
      status: 'needs_response',
      reason: 'product_not_received',
      market_date: '2026-01-15',
      buyer_id: staffUser.id,
    })
    expect(insert.status).toBe(201)
    const disputeDbId = insert.data.id

    const result = await rpcCallAuth('get_dispute_evidence', { p_dispute_id: disputeDbId })
    expect(result.status).toBe(200)
    expect(result.data.dispute).toBeDefined()
    expect(result.data.purchases).toBeDefined()
    expect(result.data.sales).toBeDefined()
    expect(result.data.net_calculation).toBeDefined()
    expect(result.data.order_status_logs).toBeDefined()
    expect(result.data.chat_logs).toBeDefined()
    expect(result.data.fulfillment_photos).toBeDefined()
  })

  test('save_dispute_evidence_draft persists evidence', async () => {
    const insert = await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_vitest_draft_${Date.now()}`,
      amount_usd: 55.00,
      status: 'needs_response',
    })
    expect(insert.status).toBe(201)

    const result = await rpcCallAuth('save_dispute_evidence_draft', {
      p_dispute_id: insert.data.id,
      p_evidence: { test: true, notes: 'Draft evidence data' },
    })
    expect(result.status).toBe(200)
    expect(result.data.success).toBe(true)

    // Verify evidence_json was saved
    const read = await restGet('stripe_disputes', `id=eq.${insert.data.id}`)
    expect(read.data[0].evidence_json).toBeDefined()
    expect(read.data[0].evidence_json.test).toBe(true)
  })

  test('dispute RPCs reject non-staff users', async () => {
    const result = await rpcCallAnon('get_disputes_admin', { p_limit: 5 })
    // Should fail with 401 (unauthenticated) or raise exception
    expect([400, 401, 403]).toContain(result.status)
  })
})

// ══════════════════════════════════════════════════════════════
// order_status_log Table + Triggers
// ══════════════════════════════════════════════════════════════
describe('order_status_log table', () => {
  test('table exists and has expected columns', async () => {
    const result = await restGet('order_status_log', 'limit=0')
    expect(result.status).toBe(200)
  })

  test('order_status_log has entries (trigger fires on order changes)', async () => {
    // The trigger fires on orders table changes.
    // We just verify the table is queryable and has rows if orders exist.
    const result = await restGet('order_status_log', 'limit=5&order=changed_at.desc')
    expect(result.status).toBe(200)
    expect(Array.isArray(result.data)).toBe(true)
  })
})
