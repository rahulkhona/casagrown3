/**
 * Stripe Connect Safety Net — Integration Tests
 *
 * Tests the new webhook handlers added for the safety net:
 *  - C3: account.application.deauthorized → deactivate Connect
 *  - C4: transfer.failed → restore wallet balance
 *  - C4: transfer.reversed → restore wallet balance
 *  - H1: account.updated → writes audit log entry
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/stripe-connect-safety-net.test.ts
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
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

async function restPatch(table: string, query: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

async function callRpc(fn: string, params: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  })
  return res.json()
}

async function callWebhook(event: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(event),
  })
  const data = await res.json()
  return { status: res.status, data }
}

async function createTestUser(suffix: string): Promise<{ id: string; token: string }> {
  const email = `safety-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return { id: data.user?.id, token: data.access_token }
}

// ============================================================================
// C3: account.application.deauthorized — deactivates Connect
// ============================================================================
Deno.test({
  name: 'C3: account.application.deauthorized deactivates Connect and creates audit log',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Create a user with active Stripe Connect
    const user = await createTestUser('deauth')
    assertExists(user.id)

    const stripeAccountId = `acct_test_deauth_${Date.now()}`

    // Set up the profile with active Connect
    await restPatch('profiles', `id=eq.${user.id}`, {
      stripe_connect_id: stripeAccountId,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    // Verify pre-condition
    const before = await restGet('profiles', `id=eq.${user.id}`)
    assertEquals(before[0].stripe_connect_active, true)
    assertEquals(before[0].stripe_onboarding_completed, true)

    // Simulate Stripe deauthorization webhook
    const result = await callWebhook({
      id: `evt_deauth_${Date.now()}`,
      type: 'account.application.deauthorized',
      account: stripeAccountId,
      data: { object: { id: stripeAccountId } },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.action, 'connect_deactivated')

    // Verify profile was deactivated
    const after = await restGet('profiles', `id=eq.${user.id}`)
    assertEquals(after[0].stripe_connect_active, false)
    assertEquals(after[0].stripe_onboarding_completed, false)

    // Verify audit log entry was created
    const auditLogs = await restGet(
      'stripe_connect_audit_log',
      `user_id=eq.${user.id}&changed_by=eq.webhook&new_active=eq.false&order=created_at.desc&limit=1`
    )
    assertEquals(auditLogs.length, 1)
    assertEquals(auditLogs[0].old_active, true)
    assertEquals(auditLogs[0].new_active, false)
    assertEquals(auditLogs[0].reason.includes('deauthorized'), true)

    // Verify notification was created
    const notifs = await restGet('notifications', `user_id=eq.${user.id}&order=created_at.desc&limit=1`)
    assertEquals(notifs.length >= 1, true)
    assertEquals(notifs[0].content.includes('disconnected'), true)
  },
})

// ============================================================================
// C3: deauthorization with unknown account — graceful handling
// ============================================================================
Deno.test({
  name: 'C3: deauthorization with unknown account returns warning',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await callWebhook({
      id: `evt_deauth_unknown_${Date.now()}`,
      type: 'account.application.deauthorized',
      account: 'acct_does_not_exist',
      data: { object: { id: 'acct_does_not_exist' } },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.warning, 'Profile not found')
  },
})

// ============================================================================
// C4: transfer.failed — restores wallet balance
// ============================================================================
Deno.test({
  name: 'C4: transfer.failed restores wallet and creates reversal ledger entry',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Create a test user
    const user = await createTestUser('xfer-fail')
    assertExists(user.id)

    const stripeAccountId = `acct_test_xferfail_${Date.now()}`
    const transferId = `tr_test_fail_${Date.now()}`

    await restPatch('profiles', `id=eq.${user.id}`, {
      stripe_connect_id: stripeAccountId,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    // Create a settlement with stripe_transfer_pending status
    const marketDate = `${2098 + Math.floor(Math.random() * 100)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`
    await fetch(`${SUPABASE_URL}/rest/v1/market_settlements?market_date=eq.${marketDate}`, { method: 'DELETE', headers: HEADERS }).catch(() => {})
    const settlement = await restPost('market_settlements', {
      market_date: marketDate,
      status: 'funds_pending',
      total_captured_usd: 100.00,
    })
    assertExists(settlement?.id, 'C4 failed: settlement should be created')

    const userSettlement = await restPost('user_settlements', {
      settlement_id: settlement.id,
      user_id: user.id,
      gross_sales_usd: 100.00,
      platform_fees_usd: 10.00,
      net_payout_usd: 90.00,
      status: 'stripe_transfer_pending',
      stripe_transfer_id: transferId,
    })
    assertExists(userSettlement.id)

    // Zero the user's wallet balance (simulating Stripe path netting)
    await restPost('user_balances', {
      user_id: user.id,
      available_usd: 0,
      pending_usd: 0,
      total_earned_usd: 100,
    })

    // Simulate transfer.failed webhook
    const result = await callWebhook({
      id: `evt_xferfail_${Date.now()}`,
      type: 'transfer.failed',
      data: {
        object: {
          id: transferId,
          failure_message: 'account_closed',
          metadata: {
            user_id: user.id,
            settlement_id: settlement.id,
          },
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.action, 'wallet_restored')
    assertEquals(result.data.status, 'wallet_fallback')

    // Verify user_settlement status changed
    const settlements = await restGet('user_settlements', `id=eq.${userSettlement.id}`)
    assertEquals(settlements[0].status, 'wallet_fallback')

    // Verify wallet balance was restored
    const balances = await restGet('user_balances', `user_id=eq.${user.id}`)
    assertEquals(Number(balances[0].pending_usd), 90.00)

    // Verify reversal ledger entry
    const ledger = await restGet(
      'market_ledger',
      `user_id=eq.${user.id}&event_type=eq.stripe_transfer_reversed&direction=eq.credit`
    )
    assertEquals(ledger.length, 1)
    assertEquals(Number(ledger[0].amount_usd), 90.00)

    // Verify notification
    const notifs = await restGet('notifications', `user_id=eq.${user.id}&order=created_at.desc&limit=1`)
    assertEquals(notifs.length >= 1, true)
    assertEquals(notifs[0].content.includes('failed'), true)
  },
})

// ============================================================================
// C4: transfer.reversed — restores wallet balance after async reversal
// ============================================================================
Deno.test({
  name: 'C4: transfer.reversed restores wallet for previously-paid transfer',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('xfer-reverse')
    assertExists(user.id)

    const stripeAccountId = `acct_test_xferrev_${Date.now()}`
    const transferId = `tr_test_reverse_${Date.now()}`

    await restPatch('profiles', `id=eq.${user.id}`, {
      stripe_connect_id: stripeAccountId,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    // Create a settlement that was successfully paid out
    const marketDate = `${2097 + Math.floor(Math.random() * 100)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`
    await fetch(`${SUPABASE_URL}/rest/v1/market_settlements?market_date=eq.${marketDate}`, { method: 'DELETE', headers: HEADERS }).catch(() => {})
    const settlement = await restPost('market_settlements', {
      market_date: marketDate,
      status: 'funds_pending',
      total_captured_usd: 80.00,
    })
    assertExists(settlement?.id, 'C4 reversed: settlement should be created')

    const userSettlement = await restPost('user_settlements', {
      settlement_id: settlement.id,
      user_id: user.id,
      gross_sales_usd: 80.00,
      platform_fees_usd: 8.00,
      net_payout_usd: 72.00,
      status: 'paid_out',
      stripe_transfer_id: transferId,
    })
    assertExists(userSettlement?.id, 'C4 reversed: user_settlement should be created')

    await restPost('user_balances', {
      user_id: user.id,
      available_usd: 0,
      pending_usd: 0,
      total_earned_usd: 80,
    })

    // Simulate transfer.reversed webhook (bank rejected ACH)
    const result = await callWebhook({
      id: `evt_xferrev_${Date.now()}`,
      type: 'transfer.reversed',
      data: {
        object: {
          id: transferId,
          reversals: {
            data: [{ reason: 'bank_account_restricted' }],
          },
          metadata: {
            user_id: user.id,
            settlement_id: settlement.id,
          },
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.action, 'wallet_restored')
    assertEquals(result.data.status, 'stripe_transfer_reversed')

    // Verify status
    const settlements = await restGet('user_settlements', `id=eq.${userSettlement.id}`)
    assertEquals(settlements[0].status, 'stripe_transfer_reversed')

    // Verify wallet restored
    const balances = await restGet('user_balances', `user_id=eq.${user.id}`)
    assertEquals(Number(balances[0].pending_usd), 72.00)

    // Verify notification mentions "returned"
    const notifs = await restGet('notifications', `user_id=eq.${user.id}&order=created_at.desc&limit=1`)
    assertEquals(notifs.length >= 1, true)
    assertEquals(notifs[0].content.includes('returned'), true)
  },
})

// ============================================================================
// C4: transfer.failed idempotency — double webhook is a no-op
// ============================================================================
Deno.test({
  name: 'C4: transfer.failed is idempotent — double webhook skips already-processed',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('xfer-idempotent')
    assertExists(user.id)

    const transferId = `tr_test_idempotent_${Date.now()}`

    await restPatch('profiles', `id=eq.${user.id}`, {
      stripe_connect_id: `acct_test_idemp_${Date.now()}`,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    const marketDate = `${2096 + Math.floor(Math.random() * 100)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`
    await fetch(`${SUPABASE_URL}/rest/v1/market_settlements?market_date=eq.${marketDate}`, { method: 'DELETE', headers: HEADERS }).catch(() => {})
    const settlement = await restPost('market_settlements', {
      market_date: marketDate,
      status: 'funds_pending',
      total_captured_usd: 60.00,
    })

    // Create settlement already in wallet_fallback (as if first webhook already processed)
    await restPost('user_settlements', {
      settlement_id: settlement.id,
      user_id: user.id,
      gross_sales_usd: 60.00,
      platform_fees_usd: 6.00,
      net_payout_usd: 54.00,
      status: 'wallet_fallback',
      stripe_transfer_id: transferId,
    })

    await restPost('user_balances', {
      user_id: user.id,
      available_usd: 0,
      pending_usd: 54.00,
      total_earned_usd: 60,
    })

    // Send duplicate transfer.failed — should be a no-op
    const result = await callWebhook({
      id: `evt_xferdup_${Date.now()}`,
      type: 'transfer.failed',
      data: {
        object: {
          id: transferId,
          failure_message: 'duplicate test',
          metadata: { user_id: user.id, settlement_id: settlement.id },
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.skipped, 'already_processed')

    // Verify balance was NOT doubled
    const balances = await restGet('user_balances', `user_id=eq.${user.id}`)
    assertEquals(Number(balances[0].pending_usd), 54.00)
  },
})

// ============================================================================
// C4: transfer.failed with unknown transfer ID — graceful handling
// ============================================================================
Deno.test({
  name: 'C4: transfer.failed with unknown transfer ID returns warning',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await callWebhook({
      id: `evt_xferunknown_${Date.now()}`,
      type: 'transfer.failed',
      data: {
        object: {
          id: 'tr_does_not_exist',
          failure_message: 'test',
          metadata: {},
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.warning, 'No matching settlement')
  },
})

// ============================================================================
// H1: account.updated creates audit log entry
// ============================================================================
Deno.test({
  name: 'H1: account.updated writes audit log when activating Connect via webhook',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('audit')
    assertExists(user.id)

    const stripeAccountId = `acct_test_audit_${Date.now()}`

    await restPatch('profiles', `id=eq.${user.id}`, {
      stripe_connect_id: stripeAccountId,
      stripe_onboarding_completed: false,
      stripe_connect_active: false,
    })

    // Simulate account.updated for completed onboarding
    const result = await callWebhook({
      id: `evt_audit_${Date.now()}`,
      type: 'account.updated',
      data: {
        object: {
          id: stripeAccountId,
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)

    // Verify audit log entry was created
    const auditLogs = await restGet(
      'stripe_connect_audit_log',
      `user_id=eq.${user.id}&changed_by=eq.webhook&new_active=eq.true&order=created_at.desc&limit=1`
    )
    assertEquals(auditLogs.length, 1)
    assertEquals(auditLogs[0].old_active, false)
    assertEquals(auditLogs[0].new_active, true)
    assertEquals(auditLogs[0].reason.includes('account.updated'), true)
    assertEquals(auditLogs[0].reason.includes('charges_enabled=true'), true)
  },
})
