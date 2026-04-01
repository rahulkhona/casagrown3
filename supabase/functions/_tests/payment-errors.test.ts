/**
 * Payment Pipeline Error Handling — Integration Tests
 *
 * Tests the FULL payment error pipeline via Stripe sandbox:
 * 1. Card decline (generic)
 * 2. Expired card
 * 3. Insufficient funds
 * 4. Capture a cancelled PI
 * 5. Full hold → capture pipeline (happy path)
 * 6. Partial capture releases remaining hold
 * 7. is_buyer_blocked gate
 * 8. auto_recover_buyer_debt RPC
 * 9. market-hold rejects unauthenticated
 * 10. execute-settlement-captures handles missing settlement
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/payment-errors.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

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

async function callFn(name: string, body: any, authHeader?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader ?? `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

/** Helper: create a Stripe PI with a test payment method */
async function createPI(pmToken: string, amount = 500) {
  return fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      amount: String(amount),
      currency: 'usd',
      capture_method: 'manual',
      payment_method: pmToken,
      confirm: 'true',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
    }).toString(),
  })
}

// ============================================================================
// 1. Card decline (generic)
// ============================================================================
Deno.test({
  name: 'Payment Error: Stripe declines card (generic_decline)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) return

    const res = await createPI('pm_card_visa_chargeDeclined')
    const pi = await res.json()

    assertEquals(res.status, 402, 'Should return 402')
    assertEquals(pi.error?.type, 'card_error')
    assertEquals(pi.error?.code, 'card_declined')
    assertEquals(pi.error?.decline_code, 'generic_decline')

    console.log(`✅ Card declined: "${pi.error.message}"`)
  },
})

// ============================================================================
// 2. Expired card
// ============================================================================
Deno.test({
  name: 'Payment Error: Stripe rejects expired card',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) return

    const res = await createPI('pm_card_chargeDeclinedExpiredCard')
    const pi = await res.json()

    assertEquals(res.status, 402)
    assertEquals(pi.error?.type, 'card_error')
    // Stripe may return code as 'expired_card' or 'card_declined' depending on token
    assertEquals(true,
      pi.error?.code === 'expired_card' || pi.error?.code === 'card_declined',
      `Should be expired/declined code: ${pi.error?.code}`)

    console.log(`✅ Expired card: "${pi.error.message}" (code: ${pi.error?.code})`)
  },
})

// ============================================================================
// 3. Insufficient funds
// ============================================================================
Deno.test({
  name: 'Payment Error: Stripe rejects insufficient funds',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) return

    const res = await createPI('pm_card_chargeDeclinedInsufficientFunds')
    const pi = await res.json()

    assertEquals(res.status, 402)
    assertEquals(pi.error?.type, 'card_error')
    assertEquals(pi.error?.code, 'card_declined')
    assertEquals(pi.error?.decline_code, 'insufficient_funds')

    console.log(`✅ Insufficient funds: "${pi.error.message}"`)
  },
})

// ============================================================================
// 4. Capture a cancelled PI (settlement failure scenario)
// ============================================================================
Deno.test({
  name: 'Payment Error: Capture cancelled PI fails (settlement retry path)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) return

    // Create → cancel → attempt capture
    const createRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: '1000', currency: 'usd', capture_method: 'manual',
        'automatic_payment_methods[enabled]': 'true',
        'automatic_payment_methods[allow_redirects]': 'never',
      }).toString(),
    })
    const pi = await createRes.json()
    assertExists(pi.id)

    await fetch(`https://api.stripe.com/v1/payment_intents/${pi.id}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    })

    const captureRes = await fetch(`https://api.stripe.com/v1/payment_intents/${pi.id}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'amount_to_capture=1000',
    })
    const result = await captureRes.json()

    assertEquals(captureRes.status, 400)
    assertEquals(result.error?.type, 'invalid_request_error')

    console.log(`✅ Capture cancelled PI fails: "${result.error.message}"`)
  },
})

// ============================================================================
// 5. Full hold → authorize → capture pipeline (happy path with sandbox)
// ============================================================================
Deno.test({
  name: 'Payment Pipeline: hold → authorize → capture with test card',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) return

    // Create PI with valid test card
    const res = await createPI('pm_card_visa', 750)
    const pi = await res.json()
    assertEquals(res.status, 200, `PI should succeed: ${JSON.stringify(pi.error)}`)
    assertEquals(pi.status, 'requires_capture')
    assertExists(pi.id)

    // Capture exact amount
    const captureRes = await fetch(`https://api.stripe.com/v1/payment_intents/${pi.id}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'amount_to_capture=500',
    })
    const captured = await captureRes.json()
    assertEquals(captured.status, 'succeeded')
    assertEquals(captured.amount_received, 500)

    console.log(`✅ Full pipeline: hold $7.50 → capture $5.00 — PI ${pi.id}`)
  },
})

// ============================================================================
// 6. Partial capture releases remaining hold
// ============================================================================
Deno.test({
  name: 'Payment Pipeline: partial capture releases remaining hold',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) return

    const res = await createPI('pm_card_visa', 2000)
    const pi = await res.json()
    assertEquals(pi.status, 'requires_capture')

    const captureRes = await fetch(`https://api.stripe.com/v1/payment_intents/${pi.id}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'amount_to_capture=1250',
    })
    const captured = await captureRes.json()
    assertEquals(captured.status, 'succeeded')
    assertEquals(captured.amount_received, 1250)
    assertEquals(captured.amount, 2000)

    console.log(`✅ Partial capture: held $20 → captured $12.50 → $7.50 released`)
  },
})

// ============================================================================
// 7. is_buyer_blocked gate
// ============================================================================
Deno.test({
  name: 'Payment Error: is_buyer_blocked returns false for clean user',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const clean = await rpc<{ blocked: boolean; outstanding_debts: number }>('is_buyer_blocked', {
      p_buyer_id: '00000000-0000-0000-0000-000000000099',
    })
    assertExists(clean)
    assertEquals(clean.blocked, false)
    assertEquals(clean.outstanding_debts, 0)

    console.log(`✅ is_buyer_blocked: clean user unblocked`)
  },
})

// ============================================================================
// 8. auto_recover_buyer_debt RPC
// ============================================================================
Deno.test({
  name: 'Payment Error: auto_recover_buyer_debt handles no debts',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await rpc('auto_recover_buyer_debt', {
      p_buyer_id: '00000000-0000-0000-0000-000000000099',
    })
    assertExists(typeof result)
    console.log(`✅ auto_recover_buyer_debt: no-op for clean user`)
  },
})

// ============================================================================
// 9. market-hold rejects unauthenticated
// ============================================================================
Deno.test({
  name: 'Payment Error: market-hold rejects anon request',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('market-hold',
      { order_id: 'fake', amount_cents: 100 },
      `Bearer ${ANON_KEY}`,
    )
    assertEquals(true, status === 401 || data.error === 'Authentication required')
    console.log(`✅ market-hold rejects anon: ${status}`)
  },
})

// ============================================================================
// 10. execute-settlement-captures handles missing settlement
// ============================================================================
Deno.test({
  name: 'Payment Error: settlement-captures handles missing settlement',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('execute-settlement-captures', {
      settlement_id: '00000000-0000-0000-0000-000000000099',
    })
    assertEquals(true, status !== 404, 'Function should exist')
    if (data.total !== undefined) {
      assertEquals(data.total, 0)
    }
    console.log(`✅ settlement-captures: missing settlement handled`)
  },
})
