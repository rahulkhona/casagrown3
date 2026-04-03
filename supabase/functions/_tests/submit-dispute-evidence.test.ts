/**
 * submit-dispute-evidence — Integration Tests (Deno)
 *
 * Tests the evidence submission edge function:
 *  - Draft save mode (submit=false)
 *  - Missing dispute_id
 *  - Already-submitted dispute
 *  - Non-existent dispute
 *
 * Note: Actual Stripe submission is not tested (requires STRIPE_SECRET_KEY).
 * We test the draft/validation paths.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/submit-dispute-evidence.test.ts
 */
import {
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
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

async function restGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS })
  return res.json()
}

async function callFunction(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-dispute-evidence`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return { status: res.status, data }
}

// ============================================================================
// 1. Missing dispute_id returns 400
// ============================================================================
Deno.test({
  name: 'submit-dispute-evidence: returns 400 when dispute_id missing',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await callFunction({})
    assertEquals(result.status, 400)
  },
})

// ============================================================================
// 2. Non-existent dispute returns 404
// ============================================================================
Deno.test({
  name: 'submit-dispute-evidence: returns 404 for non-existent dispute',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await callFunction({
      dispute_id: '00000000-0000-0000-0000-000000000000',
    })
    assertEquals(result.status, 404)
  },
})

// ============================================================================
// 3. Draft save mode works (submit=false)
// ============================================================================
Deno.test({
  name: 'submit-dispute-evidence: saves draft when submit=false',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Create a dispute
    const dispute = await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_draft_test_${Date.now()}`,
      amount_usd: 20.00,
      status: 'needs_response',
      reason: 'fraudulent',
    })

    const result = await callFunction({
      dispute_id: dispute.id,
      evidence: { test_data: true, notes: 'Test evidence' },
      submit: false,
    })

    assertEquals(result.status, 200)
    assertEquals(result.data.success, true)
    assertEquals(result.data.action, 'draft_saved')

    // Verify evidence was saved
    const disputes = await restGet('stripe_disputes', `id=eq.${dispute.id}`)
    assertEquals(disputes.length, 1)
    assertEquals(disputes[0].evidence_json.test_data, true)
  },
})

// ============================================================================
// 4. Already-submitted dispute returns 400
// ============================================================================
Deno.test({
  name: 'submit-dispute-evidence: rejects already-submitted dispute',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Create a dispute that's already submitted
    const dispute = await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_submitted_${Date.now()}`,
      amount_usd: 30.00,
      status: 'under_review',
      reason: 'product_not_received',
      evidence_submitted_at: new Date().toISOString(),
    })

    const result = await callFunction({
      dispute_id: dispute.id,
      submit: true,
    })

    assertEquals(result.status, 400)
  },
})

// ============================================================================
// 5. Submit mode fails without STRIPE_SECRET_KEY (expected in dev)
// ============================================================================
Deno.test({
  name: 'submit-dispute-evidence: submit mode returns 500 without Stripe key',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const dispute = await restPost('stripe_disputes', {
      stripe_dispute_id: `dp_nokey_${Date.now()}`,
      amount_usd: 15.00,
      status: 'needs_response',
      reason: 'unrecognized',
    })

    // Try to submit — STRIPE_SECRET_KEY is not set in dev, so should error
    const result = await callFunction({
      dispute_id: dispute.id,
      evidence: { test: true },
      submit: true,
    })

    // Should fail with 500 since STRIPE_SECRET_KEY is not configured
    assertEquals(result.status, 500)
  },
})
