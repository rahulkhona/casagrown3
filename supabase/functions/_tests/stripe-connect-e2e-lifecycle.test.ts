/**
 * G1: Stripe Connect E2E Lifecycle Test
 *
 * Tests the FULL lifecycle:
 *   settlement → transfer failure → webhook → wallet restore → tx log visibility
 *
 * G9: Admin notification delivery for transfer failures
 * G10: Notification channel assertions (best-effort fire-and-forget)
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/stripe-connect-e2e-lifecycle.test.ts
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
  const email = `e2e-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return { id: data.user?.id, token: data.access_token }
}

// ============================================================================
// G1: Full lifecycle — settlement → transfer.failed → wallet restore → tx log
// ============================================================================
Deno.test({
  name: 'G1: Full lifecycle — settlement to wallet restore via transfer.failed',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Step 1: Create seller with Stripe Connect
    const seller = await createTestUser('lifecycle-seller')
    assertExists(seller.id)
    const stripeAccountId = `acct_lifecycle_${Date.now()}`
    const transferId = `tr_lifecycle_${Date.now()}`

    await restPatch('profiles', `id=eq.${seller.id}`, {
      stripe_connect_id: stripeAccountId,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    // Step 2: Create settlement infrastructure
    const settlement = await restPost('market_settlements', {
      market_date: `2095-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      status: 'funds_pending',
      total_captured_usd: 120.00,
    })
    assertExists(settlement?.id, `G1: settlement should be created (got: ${JSON.stringify(settlement).substring(0, 200)})`)

    const userSettlement = await restPost('user_settlements', {
      settlement_id: settlement.id,
      user_id: seller.id,
      gross_sales_usd: 120.00,
      platform_fees_usd: 12.00,
      net_payout_usd: 108.00,
      status: 'stripe_transfer_pending',
      stripe_transfer_id: transferId,
    })
    assertExists(userSettlement.id)

    await restPost('user_balances', {
      user_id: seller.id,
      available_usd: 0,
      pending_usd: 0,
      total_earned_usd: 120,
    })

    // Step 3: Verify pre-conditions
    const preBal = await restGet('user_balances', `user_id=eq.${seller.id}`)
    assertEquals(Number(preBal[0].pending_usd), 0)

    const preSettlement = await restGet('user_settlements', `id=eq.${userSettlement.id}`)
    assertEquals(preSettlement[0].status, 'stripe_transfer_pending')

    // Step 4: Send transfer.failed webhook
    const webhookResult = await callWebhook({
      id: `evt_lifecycle_${Date.now()}`,
      type: 'transfer.failed',
      data: {
        object: {
          id: transferId,
          failure_message: 'insufficient_funds',
          metadata: { user_id: seller.id, settlement_id: settlement.id },
        },
      },
    })

    assertEquals(webhookResult.status, 200)
    assertEquals(webhookResult.data.action, 'wallet_restored')
    assertEquals(webhookResult.data.status, 'wallet_fallback')

    // Step 5: Verify user_settlement status
    const postSettlement = await restGet('user_settlements', `id=eq.${userSettlement.id}`)
    assertEquals(postSettlement[0].status, 'wallet_fallback')

    // Step 6: Verify wallet balance restored
    const postBal = await restGet('user_balances', `user_id=eq.${seller.id}`)
    assertEquals(Number(postBal[0].pending_usd), 108.00)

    // Step 7: Verify ledger has reversal entry
    const ledger = await restGet(
      'market_ledger',
      `user_id=eq.${seller.id}&event_type=eq.stripe_transfer_reversed&direction=eq.credit`
    )
    assertEquals(ledger.length, 1)
    assertEquals(Number(ledger[0].amount_usd), 108.00)

    // Step 8: Verify seller notification created
    const sellerNotifs = await restGet(
      'notifications',
      `user_id=eq.${seller.id}&order=created_at.desc&limit=1`
    )
    assertEquals(sellerNotifs.length >= 1, true)
    assertEquals(sellerNotifs[0].content.includes('failed'), true)

    // G9: Verify admin staff notifications
    const staff = await restGet('staff_members', 'select=user_id&user_id=not.is.null')
    if (staff.length > 0) {
      const adminNotifs = await restGet(
        'notifications',
        `user_id=eq.${staff[0].user_id}&content=like.*${transferId}*&order=created_at.desc&limit=1`
      )
      // Admin should have received alert about the transfer failure
      assertEquals(adminNotifs.length >= 1, true, 'G9: Admin staff received transfer failure notification')
    }
  },
})

// ============================================================================
// G1b: Full lifecycle — transfer.reversed path
// ============================================================================
Deno.test({
  name: 'G1b: Full lifecycle — settlement to wallet restore via transfer.reversed',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const seller = await createTestUser('lifecycle-reversed')
    assertExists(seller.id)
    const transferId = `tr_reversed_${Date.now()}`

    await restPatch('profiles', `id=eq.${seller.id}`, {
      stripe_connect_id: `acct_reversed_${Date.now()}`,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    const settlement = await restPost('market_settlements', {
      market_date: `2094-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      status: 'funds_pending',
      total_captured_usd: 75.00,
    })

    const userSettlement = await restPost('user_settlements', {
      settlement_id: settlement.id,
      user_id: seller.id,
      gross_sales_usd: 75.00,
      platform_fees_usd: 7.50,
      net_payout_usd: 67.50,
      status: 'paid_out',
      stripe_transfer_id: transferId,
      stripe_transfer_completed_at: new Date().toISOString(),
    })

    await restPost('user_balances', {
      user_id: seller.id,
      available_usd: 0,
      pending_usd: 0,
      total_earned_usd: 75,
    })

    // Send transfer.reversed webhook
    const result = await callWebhook({
      id: `evt_reversed_${Date.now()}`,
      type: 'transfer.reversed',
      data: {
        object: {
          id: transferId,
          reversals: { data: [{ reason: 'bank_account_restricted' }] },
          metadata: { user_id: seller.id, settlement_id: settlement.id },
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.status, 'stripe_transfer_reversed')

    // Verify notification mentions "returned"
    const notifs = await restGet(
      'notifications',
      `user_id=eq.${seller.id}&order=created_at.desc&limit=1`
    )
    assertEquals(notifs.length >= 1, true)
    assertEquals(notifs[0].content.includes('returned'), true)

    // Verify balance
    const bal = await restGet('user_balances', `user_id=eq.${seller.id}`)
    assertEquals(Number(bal[0].pending_usd), 67.50)
  },
})

// ============================================================================
// G1c: After wallet restore, stripe_transfer_pending count drops
// ============================================================================
Deno.test({
  name: 'G1c: Restored settlement no longer counted as in-transit',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const seller = await createTestUser('intransit-check')
    assertExists(seller.id)
    const transferId1 = `tr_intransit1_${Date.now()}`
    const transferId2 = `tr_intransit2_${Date.now()}`

    await restPatch('profiles', `id=eq.${seller.id}`, {
      stripe_connect_id: `acct_intransit_${Date.now()}`,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    // Create two settlements — one will fail, one stays pending
    const settlement1 = await restPost('market_settlements', {
      market_date: `2093-${String(Math.floor(Math.random() * 6) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      status: 'funds_pending',
      total_captured_usd: 50.00,
    })

    const settlement2 = await restPost('market_settlements', {
      market_date: `2093-${String(Math.floor(Math.random() * 6) + 7).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      status: 'funds_pending',
      total_captured_usd: 30.00,
    })

    // US1 = will fail, US2 = stays pending
    await restPost('user_settlements', {
      settlement_id: settlement1.id,
      user_id: seller.id,
      gross_sales_usd: 50.00,
      platform_fees_usd: 5.00,
      net_payout_usd: 45.00,
      status: 'stripe_transfer_pending',
      stripe_transfer_id: transferId1,
    })

    await restPost('user_settlements', {
      settlement_id: settlement2.id,
      user_id: seller.id,
      gross_sales_usd: 30.00,
      platform_fees_usd: 3.00,
      net_payout_usd: 27.00,
      status: 'stripe_transfer_pending',
      stripe_transfer_id: transferId2,
    })

    await restPost('user_balances', {
      user_id: seller.id,
      available_usd: 0,
      pending_usd: 0,
      total_earned_usd: 80,
    })

    // Before: 2 pending transfers
    const pendingBefore = await restGet(
      'user_settlements',
      `user_id=eq.${seller.id}&status=eq.stripe_transfer_pending`
    )
    assertEquals(pendingBefore.length, 2)

    // Fail transfer 1
    await callWebhook({
      id: `evt_intransit_${Date.now()}`,
      type: 'transfer.failed',
      data: {
        object: {
          id: transferId1,
          failure_message: 'test',
          metadata: { user_id: seller.id, settlement_id: settlement1.id },
        },
      },
    })

    // After: only 1 pending transfer
    const pendingAfter = await restGet(
      'user_settlements',
      `user_id=eq.${seller.id}&status=eq.stripe_transfer_pending`
    )
    assertEquals(pendingAfter.length, 1)
    assertEquals(pendingAfter[0].stripe_transfer_id, transferId2)

    // The failed one should be wallet_fallback
    const fallback = await restGet(
      'user_settlements',
      `user_id=eq.${seller.id}&status=eq.wallet_fallback`
    )
    assertEquals(fallback.length, 1)
    assertEquals(fallback[0].stripe_transfer_id, transferId1)
  },
})

// ============================================================================
// G10: Webhook handlers don't crash when notification sub-functions fail
// ============================================================================
Deno.test({
  name: 'G10: Deauthorization webhook survives notification failures gracefully',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // The push/SMS/email notifications are try/catch wrapped.
    // This test verifies the webhook returns success even if those fail
    // (which they will in test environment since the sub-functions may not exist).
    const user = await createTestUser('notif-resilience')
    assertExists(user.id)
    const acctId = `acct_notif_${Date.now()}`

    await restPatch('profiles', `id=eq.${user.id}`, {
      stripe_connect_id: acctId,
      stripe_onboarding_completed: true,
      stripe_connect_active: true,
    })

    const result = await callWebhook({
      id: `evt_notif_${Date.now()}`,
      type: 'account.application.deauthorized',
      account: acctId,
      data: { object: { id: acctId } },
    })

    // Should succeed despite notification functions potentially failing
    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.action, 'connect_deactivated')

    // At minimum, the in-app notification should exist
    const notifs = await restGet('notifications', `user_id=eq.${user.id}`)
    assertEquals(notifs.length >= 1, true, 'G10: In-app notification created despite sub-function failures')
  },
})
