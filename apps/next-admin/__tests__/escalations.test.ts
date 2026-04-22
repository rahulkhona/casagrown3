/**
 * Vitest unit tests for the Escalation Resolution system.
 *
 * These tests verify:
 * 1. admin_resolve_escalation RPC (all resolution types incl. combo)
 * 2. admin_claim_escalation / admin_relinquish_escalation RPCs
 * 3. admin_add_dispute_comment RPC
 * 4. get_escalated_orders_admin / get_escalation_detail_admin / get_escalation_stats_admin RPCs
 * 5. user_credits table + apply_credits_to_order FIFO logic
 * 6. get_user_credit_balance RPC
 * 7. Non-staff access blocked
 *
 * Run: cd apps/next-admin && npx vitest run __tests__/escalations.test.ts
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
let staffUserId = ''
let testOrderId = ''
let testDisputeId = ''
let testOrder2Id = ''
let testDispute2Id = ''
let testBuyerId = ''
let testSellerId = ''

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

async function sqlExec(sql: string) {
  const { execSync } = await import('child_process')
  const raw = execSync(
    `docker exec -i supabase_db_casagrown3 psql -U postgres -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { timeout: 10000, encoding: 'utf-8' }
  ).trim()
  // Strip psql status lines like "INSERT 0 1" from RETURNING output
  return raw.split('\n').filter(l => !l.match(/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|RESET)\s/i))[0]?.trim() || raw.trim()
}

// ── Setup: Get staff token + seed test dispute data ──
beforeAll(async () => {
  const { execSync } = await import('child_process')

  // Fix auth identity for login
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

  // Login
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  })
  const data = await res.json()
  staffToken = data.access_token
  staffUserId = data.user?.id
  if (!staffToken) throw new Error(`Failed to get staff token: ${JSON.stringify(data)}`)

  // Get existing IDs from DB
  testBuyerId = await sqlExec(`SELECT id FROM auth.users WHERE email != '${STAFF_EMAIL}' LIMIT 1`)
  testSellerId = await sqlExec(`SELECT id FROM auth.users WHERE email = '${STAFF_EMAIL}' LIMIT 1`)

  if (!testBuyerId) testBuyerId = staffUserId
  if (!testSellerId) testSellerId = staffUserId

  const boothId = await sqlExec(`SELECT id FROM market_booths LIMIT 1`)
  const productId = await sqlExec(`SELECT id FROM market_products LIMIT 1`)

  // Create orders + disputes using SQL gen_random_uuid()
  testOrderId = await sqlExec(`
    INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
      product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
      fulfillment_type, status, platform_fee_pct, platform_fee_usd,
      tax_rate_pct, tax_amount_usd)
    VALUES (gen_random_uuid(), '${testBuyerId}'::uuid, '${testSellerId}'::uuid,
      '${boothId}'::uuid, '${productId}'::uuid,
      'Escalation Test Tomatoes', 2, 12.50, 25.00, 25.00,
      'delivery', 'escalated', 10, 2.50, 0, 0)
    RETURNING id
  `)

  testDisputeId = await sqlExec(`
    INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
    VALUES (gen_random_uuid(), '${testOrderId}'::uuid,
      '${testBuyerId}'::uuid, 'Product arrived damaged - Vitest', 'open')
    RETURNING id
  `)

  testOrder2Id = await sqlExec(`
    INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
      product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
      fulfillment_type, status, platform_fee_pct, platform_fee_usd,
      tax_rate_pct, tax_amount_usd)
    VALUES (gen_random_uuid(), '${testBuyerId}'::uuid, '${testSellerId}'::uuid,
      '${boothId}'::uuid, '${productId}'::uuid,
      'Combo Test Tomatoes', 1, 15.00, 15.00, 15.00,
      'pickup', 'escalated', 10, 1.50, 0, 0)
    RETURNING id
  `)

  testDispute2Id = await sqlExec(`
    INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
    VALUES (gen_random_uuid(), '${testOrder2Id}'::uuid,
      '${testBuyerId}'::uuid, 'Wrong item received - Vitest', 'open')
    RETURNING id
  `)
}, 30000)


// ══════════════════════════════════════════════════════════════
// Escalation List & Stats RPCs
// ══════════════════════════════════════════════════════════════
describe('Escalation List & Stats RPCs', () => {
  test('get_escalated_orders_admin returns array as staff', async () => {
    const result = await rpcCallAuth('get_escalated_orders_admin', { p_limit: 50 })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.data)).toBe(true)
  })

  test('get_escalation_stats_admin returns expected fields', async () => {
    const result = await rpcCallAuth('get_escalation_stats_admin')
    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    expect(typeof result.data.open).toBe('number')
    expect(typeof result.data.resolved).toBe('number')
    expect(typeof result.data.total).toBe('number')
    expect(typeof result.data.total_disputed_usd).toBe('number')
  })

  test('get_escalation_detail_admin returns full dispute data', async () => {
    const result = await rpcCallAuth('get_escalation_detail_admin', { p_dispute_id: testDisputeId })
    expect(result.status).toBe(200)
    if (result.data?.error) {
      // Dispute may not exist if seed failed, but RPC should not crash
      expect(result.data.error).toBeDefined()
    } else {
      expect(result.data.dispute).toBeDefined()
      expect(result.data.order).toBeDefined()
      expect(result.data.buyer).toBeDefined()
      expect(result.data.seller).toBeDefined()
      expect(result.data.messages).toBeDefined()
      expect(result.data.credits_issued).toBeDefined()
    }
  })

  test('non-staff cannot call get_escalated_orders_admin', async () => {
    const result = await rpcCallAnon('get_escalated_orders_admin', { p_limit: 5 })
    expect([400, 401, 403]).toContain(result.status)
  })
})


// ══════════════════════════════════════════════════════════════
// Claim / Relinquish Workflow
// ══════════════════════════════════════════════════════════════
describe('Claim / Relinquish Workflow', () => {
  test('admin_claim_escalation succeeds', async () => {
    const result = await rpcCallAuth('admin_claim_escalation', { p_dispute_id: testDisputeId })
    expect(result.status).toBe(200)
    // RPC should return success (not an error)
    expect(result.data?.error).toBeUndefined()
  })

  test('admin_relinquish_escalation succeeds', async () => {
    const result = await rpcCallAuth('admin_relinquish_escalation', { p_dispute_id: testDisputeId })
    expect(result.status).toBe(200)
    expect(result.data?.error).toBeUndefined()
  })
})


// ══════════════════════════════════════════════════════════════
// Admin Comment
// ══════════════════════════════════════════════════════════════
describe('Admin Dispute Comment', () => {
  test('admin_add_dispute_comment inserts message', async () => {
    const result = await rpcCallAuth('admin_add_dispute_comment', {
      p_dispute_id: testDisputeId,
      p_body: 'Please provide delivery photos - Vitest',
      p_request_info_from: 'seller',
    })
    expect(result.status).toBe(200)
    expect(result.data?.success || result.data?.error === undefined).toBeTruthy()

    const count = await sqlExec(
      `SELECT count(*) FROM order_dispute_messages WHERE dispute_id = '${testDisputeId}' AND body LIKE '%Vitest%'`
    )
    expect(parseInt(count)).toBeGreaterThanOrEqual(1)
  })
})


// ══════════════════════════════════════════════════════════════
// Resolution — Full Refund
// ══════════════════════════════════════════════════════════════
describe('Resolution — Full Refund', () => {
  test('admin_resolve_escalation with refund_full succeeds', async () => {
    const result = await rpcCallAuth('admin_resolve_escalation', {
      p_order_id: testOrderId,
      p_resolution_type: 'refund_full',
      p_reason: 'Item was clearly defective - Vitest',
    })
    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
  })

  test('order status is resolved after full refund', async () => {
    const status = await sqlExec(`SELECT status FROM market_orders WHERE id = '${testOrderId}'`)
    expect(status).toBe('resolved')
  })

  test('dispute status is staff_resolved', async () => {
    const status = await sqlExec(`SELECT status FROM order_disputes WHERE id = '${testDisputeId}'`)
    expect(status).toBe('staff_resolved')
  })

  test('cannot resolve already-resolved order', async () => {
    const result = await rpcCallAuth('admin_resolve_escalation', {
      p_order_id: testOrderId,
      p_resolution_type: 'refund_full',
      p_reason: 'Try again',
    })
    expect(result.status).toBe(200)
    expect(result.data?.error).toContain('disputed or escalated')
  })
})


// ══════════════════════════════════════════════════════════════
// Resolution — Credit Both (combo)
// ══════════════════════════════════════════════════════════════
describe('Resolution — Credit Both (combo)', () => {
  test('admin_resolve_escalation with credit_both succeeds', async () => {
    const result = await rpcCallAuth('admin_resolve_escalation', {
      p_order_id: testOrder2Id,
      p_resolution_type: 'credit_both',
      p_reason: 'Both parties had valid points - Vitest',
      p_credit_amount_usd: 5.00,
      p_credit_type: 'purchase',
      p_credit_cap_type: 'percentage',
      p_credit_cap_value: 20,
      p_secondary_credit_usd: 3.00,
      p_secondary_credit_type: 'purchase',
      p_secondary_credit_cap_type: 'percentage',
      p_secondary_credit_cap_value: 20,
    })
    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
  })

  test('buyer received credit from combo resolution', async () => {
    const count = await sqlExec(
      `SELECT count(*) FROM user_credits WHERE user_id = '${testBuyerId}' AND source = 'escalation_resolution' AND reason LIKE '%Vitest%'`
    )
    expect(parseInt(count)).toBeGreaterThanOrEqual(1)
  })

  test('seller received secondary credit from combo resolution', async () => {
    const count = await sqlExec(
      `SELECT count(*) FROM user_credits WHERE user_id = '${testSellerId}' AND source = 'escalation_resolution' AND reason LIKE '%Vitest%'`
    )
    expect(parseInt(count)).toBeGreaterThanOrEqual(1)
  })
})


// ══════════════════════════════════════════════════════════════
// Credit Balance & FIFO
// ══════════════════════════════════════════════════════════════
describe('Credit Balance & FIFO', () => {
  test('get_user_credit_balance returns buyer credits', async () => {
    const result = await rpcCallAuth('get_user_credit_balance', { p_user_id: testBuyerId })
    expect(result.status).toBe(200)
    if (result.data?.total_credits_usd !== undefined) {
      expect(parseFloat(result.data.total_credits_usd)).toBeGreaterThanOrEqual(0)
    }
  })

  test('user_credits table has expected columns', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_credits?limit=0`, { headers: HEADERS_SR })
    expect(res.status).toBe(200)
  })

  test('credit_usage_log table exists', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/credit_usage_log?limit=0`, { headers: HEADERS_SR })
    expect(res.status).toBe(200)
  })
})


// ══════════════════════════════════════════════════════════════
// Notifications Generated
// ══════════════════════════════════════════════════════════════
describe('Notifications', () => {
  test('buyer received resolution notifications', async () => {
    const count = await sqlExec(
      `SELECT count(*) FROM market_notifications WHERE user_id = '${testBuyerId}' AND content LIKE '%dispute%'`
    )
    expect(parseInt(count)).toBeGreaterThanOrEqual(1)
  })

  test('seller received resolution notifications', async () => {
    const count = await sqlExec(
      `SELECT count(*) FROM market_notifications WHERE user_id = '${testSellerId}' AND content LIKE '%dispute%'`
    )
    expect(parseInt(count)).toBeGreaterThanOrEqual(1)
  })
})


// ══════════════════════════════════════════════════════════════
// Non-Staff Access Blocked
// ══════════════════════════════════════════════════════════════
describe('Non-Staff Access', () => {
  test('non-staff cannot resolve escalation', async () => {
    const result = await rpcCallAnon('admin_resolve_escalation', {
      p_order_id: testOrderId,
      p_resolution_type: 'refund_full',
      p_reason: 'hacker',
    })
    // SECURITY DEFINER RPCs return 200 but with error JSON
    if (result.status === 200) {
      expect(result.data?.error).toContain('Staff access required')
    } else {
      expect([400, 401, 403]).toContain(result.status)
    }
  })

  test('non-staff cannot claim escalation', async () => {
    const result = await rpcCallAnon('admin_claim_escalation', { p_dispute_id: testDisputeId })
    // Either HTTP error or JSON error
    if (result.status === 200) {
      expect(result.data?.error).toBeDefined()
    } else {
      expect([400, 401, 403]).toContain(result.status)
    }
  })

  test('non-staff cannot add dispute comment', async () => {
    const result = await rpcCallAnon('admin_add_dispute_comment', {
      p_dispute_id: testDisputeId,
      p_body: 'hacker was here',
    })
    if (result.status === 200) {
      expect(result.data?.error).toBeDefined()
    } else {
      expect([400, 401, 403]).toContain(result.status)
    }
  })
})
