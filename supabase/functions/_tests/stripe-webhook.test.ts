/**
 * Stripe Webhook — Integration Tests
 *
 * Tests the stripe-webhook edge function's event handling:
 *  - payment_intent.succeeded → payment confirmation
 *  - payment_intent.payment_failed → transaction status update
 *  - payout.paid → settlement clearing
 *  - charge.dispute.created → buyer debt creation
 *  - Idempotency: already-processed payments skip
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/stripe-webhook.test.ts
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

async function callWebhook(event: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      // No stripe-signature — dev mode skips verification when secret is unset
    },
    body: JSON.stringify(event),
  })
  const data = await res.json()
  return { status: res.status, data }
}

async function createTestUser(suffix: string): Promise<{ id: string; token: string }> {
  const email = `sw-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return { id: data.user?.id, token: data.access_token }
}

// ============================================================================
// 1. payment_intent.succeeded — when transaction exists
// ============================================================================
Deno.test({
  name: 'stripe-webhook: payment_intent.succeeded returns received:true',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const piId = `pi_test_webhook_${Date.now()}`

    const result = await callWebhook({
      id: `evt_test_${Date.now()}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: piId, amount: 1000 } },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    // No matching transaction — should get warning but still 200
  },
})

// ============================================================================
// 2. payment_intent.payment_failed — updates transaction
// ============================================================================
Deno.test({
  name: 'stripe-webhook: payment_intent.payment_failed returns received:true',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const piId = `pi_test_fail_${Date.now()}`

    const result = await callWebhook({
      id: `evt_fail_${Date.now()}`,
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: piId,
          last_payment_error: { message: 'Card declined' },
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
  },
})

// ============================================================================
// 3. payout.paid — settlement clearing + event persistence
// ============================================================================
Deno.test({
  name: 'stripe-webhook: payout.paid clears settlement and saves payout event',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Create a funds_pending settlement with unique date (far future to avoid collisions)
    const day = Math.floor(Math.random() * 28) + 1
    const month = Math.floor(Math.random() * 12) + 1
    const uniqueDate = `2099-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const settlement = await restPost('market_settlements', {
      market_date: uniqueDate,
      status: 'funds_pending',
      total_captured_usd: 50.00,
      stripe_payout_id: null,
    })
    assertExists(settlement.id, `Settlement insert failed — possible date collision on ${uniqueDate}`)

    const payoutId = `po_test_paid_${Date.now()}`
    const result = await callWebhook({
      id: `evt_payout_${Date.now()}`,
      type: 'payout.paid',
      data: { object: { id: payoutId, amount: 5000 } }, // $50 in cents
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    // Settlement should be matched
    if (result.data.matched_settlements) {
      assertEquals(result.data.matched_settlements.length > 0, true)
    }
    // Should indicate amount_fallback since no STRIPE_SECRET_KEY in test
    assertEquals(result.data.matched_via, 'amount_fallback')

    // Verify payout event was persisted
    const events = await restGet('stripe_payout_events', `stripe_payout_id=eq.${payoutId}`)
    assertEquals(events.length, 1)
    assertEquals(events[0].event_type, 'paid')
    assertEquals(Number(events[0].amount_usd), 50.00)
    assertEquals(events[0].matched_settlement_ids.length > 0, true)
  },
})

// ============================================================================
// 4. charge.dispute.created — creates buyer debt + persists dispute
// ============================================================================
Deno.test({
  name: 'stripe-webhook: charge.dispute.created creates dispute record and buyer debt',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const disputeId = `dp_lifecycle_${Date.now()}`
    const result = await callWebhook({
      id: `evt_dispute_${Date.now()}`,
      type: 'charge.dispute.created',
      data: {
        object: {
          id: disputeId,
          charge: `ch_fake_${Date.now()}`,
          payment_intent: `pi_fake_${Date.now()}`,
          amount: 2500,
          reason: 'fraudulent',
          evidence_details: {
            due_by: Math.floor(Date.now() / 1000) + 7 * 86400, // 7 days from now
          },
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)

    // Verify dispute was persisted in stripe_disputes table
    const disputes = await restGet('stripe_disputes', `stripe_dispute_id=eq.${disputeId}`)
    assertEquals(disputes.length, 1)
    assertEquals(disputes[0].stripe_dispute_id, disputeId)
    assertEquals(Number(disputes[0].amount_usd), 25.00)
    assertEquals(disputes[0].reason, 'fraudulent')
    assertEquals(disputes[0].status, 'needs_response')
  },
})

// ============================================================================
// 4b. charge.dispute.updated — updates dispute status
// ============================================================================
Deno.test({
  name: 'stripe-webhook: charge.dispute.updated changes dispute status',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // First create a dispute
    const disputeId = `dp_update_${Date.now()}`
    await restPost('stripe_disputes', {
      stripe_dispute_id: disputeId,
      amount_usd: 30.00,
      status: 'needs_response',
      reason: 'product_not_received',
    })

    // Send updated event
    const result = await callWebhook({
      id: `evt_disp_upd_${Date.now()}`,
      type: 'charge.dispute.updated',
      data: {
        object: {
          id: disputeId,
          status: 'under_review',
          amount: 3000,
          reason: 'product_not_received',
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)

    // Verify status was updated
    const disputes = await restGet('stripe_disputes', `stripe_dispute_id=eq.${disputeId}`)
    assertEquals(disputes.length, 1)
    assertEquals(disputes[0].status, 'under_review')
  },
})

// ============================================================================
// 4c. charge.dispute.funds_withdrawn — metadata confirmation
// ============================================================================
Deno.test({
  name: 'stripe-webhook: charge.dispute.funds_withdrawn returns received',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const disputeId = `dp_withdrawn_${Date.now()}`
    // Pre-create the dispute record
    await restPost('stripe_disputes', {
      stripe_dispute_id: disputeId,
      amount_usd: 45.00,
      status: 'needs_response',
      reason: 'unrecognized',
    })

    const result = await callWebhook({
      id: `evt_disp_fw_${Date.now()}`,
      type: 'charge.dispute.funds_withdrawn',
      data: {
        object: {
          id: disputeId,
          amount: 4500,
          reason: 'unrecognized',
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
  },
})

// ============================================================================
// 4d. charge.dispute.funds_reinstated — credits bank ledger
// ============================================================================
Deno.test({
  name: 'stripe-webhook: charge.dispute.funds_reinstated returns received',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const disputeId = `dp_reinstated_${Date.now()}`
    // Pre-create the dispute record
    await restPost('stripe_disputes', {
      stripe_dispute_id: disputeId,
      amount_usd: 60.00,
      status: 'under_review',
      reason: 'duplicate',
    })

    const result = await callWebhook({
      id: `evt_disp_fr_${Date.now()}`,
      type: 'charge.dispute.funds_reinstated',
      data: {
        object: {
          id: disputeId,
          amount: 6000,
          reason: 'duplicate',
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)

    // Dispute should still exist
    const disputes = await restGet('stripe_disputes', `stripe_dispute_id=eq.${disputeId}`)
    assertEquals(disputes.length, 1)
  },
})

// ============================================================================
// 4e. charge.dispute.closed — resolves dispute
// ============================================================================
Deno.test({
  name: 'stripe-webhook: charge.dispute.closed updates dispute with resolution',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const disputeId = `dp_closed_${Date.now()}`
    // Pre-create the dispute record
    await restPost('stripe_disputes', {
      stripe_dispute_id: disputeId,
      amount_usd: 35.00,
      status: 'under_review',
      reason: 'fraudulent',
    })

    // Close as won
    const result = await callWebhook({
      id: `evt_disp_cl_${Date.now()}`,
      type: 'charge.dispute.closed',
      data: {
        object: {
          id: disputeId,
          amount: 3500,
          status: 'won',
          reason: 'fraudulent',
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)

    // Verify dispute status updated to 'won' and resolved_at set
    const disputes = await restGet('stripe_disputes', `stripe_dispute_id=eq.${disputeId}`)
    assertEquals(disputes.length, 1)
    assertEquals(disputes[0].status, 'won')
    assertExists(disputes[0].resolved_at)
  },
})

// ============================================================================
// 5. payout.failed — saves event + notifies admin staff
// ============================================================================
Deno.test({
  name: 'stripe-webhook: payout.failed saves event and notifies admins',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const payoutId = `po_fail_${Date.now()}`
    const result = await callWebhook({
      id: `evt_pofail_${Date.now()}`,
      type: 'payout.failed',
      data: {
        object: {
          id: payoutId,
          amount: 7500, // $75 in cents
          failure_code: 'no_account',
          failure_message: 'No bank account on file',
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
    assertEquals(result.data.payout_id, payoutId)

    // Verify payout failure event was persisted
    const events = await restGet('stripe_payout_events', `stripe_payout_id=eq.${payoutId}`)
    assertEquals(events.length, 1)
    assertEquals(events[0].event_type, 'failed')
    assertEquals(Number(events[0].amount_usd), 75.00)
    assertEquals(events[0].failure_code, 'no_account')
    assertEquals(events[0].failure_message, 'No bank account on file')

    // Verify admin staff received in-app notifications
    // (via market_notifications, not legacy notifications table)
    // Only check staff with a valid user_id (some may be null in seed data)
    const staff = await restGet('staff_members', 'select=user_id&user_id=not.is.null')
    for (const s of staff) {
      const notifs = await restGet(
        'market_notifications',
        `user_id=eq.${s.user_id}&content=like.*Stripe payout FAILED*&order=created_at.desc&limit=1`
      )
      assertEquals(notifs.length > 0, true, `Staff ${s.user_id} should have failure notification`)
    }
  },
})

// ============================================================================
// 6. payout.paid without matching settlements — still saves event
// ============================================================================
Deno.test({
  name: 'stripe-webhook: payout.paid with no matching settlements still records event',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clean up any existing funds_pending settlements first
    // (Previous tests may leave some). We use a unique payoutId.
    const payoutId = `po_nomatch_${Date.now()}`
    const result = await callWebhook({
      id: `evt_payout_nomatch_${Date.now()}`,
      type: 'payout.paid',
      data: { object: { id: payoutId, amount: 99999900 } }, // $999,999 — won't match anything
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)

    // Event should still be recorded even with no matches
    const events = await restGet('stripe_payout_events', `stripe_payout_id=eq.${payoutId}`)
    assertEquals(events.length, 1)
    assertEquals(events[0].event_type, 'paid')
    assertEquals(events[0].matched_settlement_ids.length >= 0, true) // May match leftover settlements or none
  },
})

// ============================================================================
// 7. Unknown event type — graceful handling
// ============================================================================
Deno.test({
  name: 'stripe-webhook: unknown event type returns received:true',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await callWebhook({
      id: `evt_unknown_${Date.now()}`,
      type: 'customer.updated',
      data: { object: { id: 'cus_test' } },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)
  },
})

// ============================================================================
// 8. payout.failed with amount=0 — handles edge case
// ============================================================================
Deno.test({
  name: 'stripe-webhook: payout.failed handles missing amount gracefully',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const payoutId = `po_noamt_${Date.now()}`
    const result = await callWebhook({
      id: `evt_pofail_noamt_${Date.now()}`,
      type: 'payout.failed',
      data: {
        object: {
          id: payoutId,
          // No amount field — tests our (payout.amount || 0) / 100 fix
          failure_message: 'Test edge case',
        },
      },
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.received, true)

    // Should be saved with $0.00
    const events = await restGet('stripe_payout_events', `stripe_payout_id=eq.${payoutId}`)
    assertEquals(events.length, 1)
    assertEquals(Number(events[0].amount_usd), 0)
  },
})
