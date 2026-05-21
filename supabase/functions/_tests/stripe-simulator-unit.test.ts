// Stripe Simulator Unit Tests — Full API Surface
//
// Tests the complete Stripe API simulator to verify all endpoints work
// correctly before routing real edge functions through it.
//
// Run: cd supabase && deno test --allow-env --allow-net \
//        functions/_tests/stripe-simulator-unit.test.ts

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { StripeSimulator } from './stripe-simulator.ts'

const SIM_PORT = 8090
const SIM_BASE = `http://127.0.0.1:${SIM_PORT}`
const AUTH_HEADER = { Authorization: 'Bearer sk_test_sim' }

// ── Helpers ─────────────────────────────────────────────────────────

async function stripePost(path: string, body: URLSearchParams | Record<string, string>, extraHeaders: Record<string, string> = {}) {
  const urlParams = body instanceof URLSearchParams ? body : new URLSearchParams(body)
  const res = await fetch(`${SIM_BASE}${path}`, {
    method: 'POST',
    headers: { ...AUTH_HEADER, 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders },
    body: urlParams,
  })
  return { status: res.status, data: await res.json() }
}

async function stripeGet(path: string) {
  const res = await fetch(`${SIM_BASE}${path}`, { headers: AUTH_HEADER })
  return { status: res.status, data: await res.json() }
}

// ============================================================================
// PaymentIntent: Create
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/payment_intents creates PI',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const r = await stripePost('/v1/payment_intents', {
        amount: '5000', currency: 'usd', capture_method: 'manual',
        'metadata[user_id]': 'buyer_001', description: 'Test hold',
      })
      assertEquals(r.status, 200)
      assertExists(r.data.id)
      assertEquals(r.data.id.startsWith('pi_sim_'), true)
      assertEquals(r.data.amount, 5000)
      assertEquals(r.data.status, 'requires_payment_method')
      assertEquals(r.data.capture_method, 'manual')
      assertExists(r.data.client_secret)
      assertEquals(r.data.metadata.user_id, 'buyer_001')
      console.log(`✅ Create PI: ${r.data.id}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// PaymentIntent: Cancel
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/payment_intents/:id/cancel cancels PI',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const created = await stripePost('/v1/payment_intents', { amount: '3000', currency: 'usd' })
      const piId = created.data.id

      const cancelled = await stripePost(`/v1/payment_intents/${piId}/cancel`, {})
      assertEquals(cancelled.status, 200)
      assertEquals(cancelled.data.status, 'canceled')
      assertEquals(cancelled.data.id, piId)
      console.log(`✅ Cancel PI: ${piId}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// PaymentIntent: Capture
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/payment_intents/:id/capture captures PI',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const created = await stripePost('/v1/payment_intents', { amount: '7500', currency: 'usd', capture_method: 'manual' })
      const piId = created.data.id

      const captured = await stripePost(`/v1/payment_intents/${piId}/capture`, { amount_to_capture: '6000' })
      assertEquals(captured.status, 200)
      assertEquals(captured.data.status, 'succeeded')
      assertEquals(captured.data.amount, 6000)
      assertExists(captured.data.latest_charge)
      assertEquals(captured.data.latest_charge.startsWith('ch_sim_'), true)
      console.log(`✅ Capture PI: ${piId} → charge ${captured.data.latest_charge}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// PaymentIntent: Get
// ============================================================================
Deno.test({
  name: 'Simulator: GET /v1/payment_intents/:id retrieves PI',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const created = await stripePost('/v1/payment_intents', { amount: '2000', currency: 'usd' })
      const piId = created.data.id

      const fetched = await stripeGet(`/v1/payment_intents/${piId}`)
      assertEquals(fetched.status, 200)
      assertEquals(fetched.data.id, piId)
      assertEquals(fetched.data.amount, 2000)

      // Non-existent PI → 404
      const notFound = await stripeGet('/v1/payment_intents/pi_nonexistent')
      assertEquals(notFound.status, 404)
      console.log(`✅ Get PI: ${piId}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// PaymentIntent: Get with expand (confirm-payment pattern)
// ============================================================================
Deno.test({
  name: 'Simulator: GET /v1/payment_intents/:id?expand works',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const created = await stripePost('/v1/payment_intents', { amount: '4000', currency: 'usd' })
      const fetched = await stripeGet(`/v1/payment_intents/${created.data.id}?expand[]=payment_method`)
      assertEquals(fetched.status, 200)
      assertExists(fetched.data.payment_method_options)
      console.log('✅ Get PI with expand')
    } finally { sim.stop() }
  },
})

// ============================================================================
// Transfer: Success
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/transfers — success',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    sim.addTransferBehavior('acct_ok', 'success')
    await sim.start()
    try {
      const r = await stripePost('/v1/transfers', {
        amount: '9000', currency: 'usd', destination: 'acct_ok',
        transfer_group: 'settlement_001', 'metadata[user_id]': 'user_001',
      })
      assertEquals(r.status, 200)
      assertExists(r.data.id)
      assertEquals(r.data.amount, 9000)
      assertEquals(r.data.destination, 'acct_ok')
      console.log(`✅ Transfer success: ${r.data.id}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// Transfer: Permanent failure (400)
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/transfers — permanent failure',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    sim.addTransferBehavior('acct_bad', 'permanent_failure', 'Account deactivated')
    await sim.start()
    try {
      const r = await stripePost('/v1/transfers', { amount: '5000', currency: 'usd', destination: 'acct_bad' })
      assertEquals(r.status, 400)
      assertEquals(r.data.error.message, 'Account deactivated')
      console.log('✅ Transfer permanent failure: 400')
    } finally { sim.stop() }
  },
})

// ============================================================================
// Transfer: Transient then success (500 → 200)
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/transfers — transient then success',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    sim.addTransferBehavior('acct_flaky', 'transient_then_success')
    await sim.start()
    try {
      const r1 = await stripePost('/v1/transfers', { amount: '7200', currency: 'usd', destination: 'acct_flaky' })
      assertEquals(r1.status, 500)
      const r2 = await stripePost('/v1/transfers', { amount: '7200', currency: 'usd', destination: 'acct_flaky' })
      assertEquals(r2.status, 200)
      assertExists(r2.data.id)
      console.log('✅ Transfer transient→success: 500 → 200')
    } finally { sim.stop() }
  },
})

// ============================================================================
// Transfer: Idempotency key
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/transfers — idempotency key returns cached response',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    sim.addTransferBehavior('acct_idemp', 'success')
    await sim.start()
    try {
      const key = 'xfer_settlement_test_user_test'
      const r1 = await stripePost('/v1/transfers',
        { amount: '4500', currency: 'usd', destination: 'acct_idemp' },
        { 'Idempotency-Key': key })
      assertEquals(r1.status, 200)
      const r2 = await stripePost('/v1/transfers',
        { amount: '4500', currency: 'usd', destination: 'acct_idemp' },
        { 'Idempotency-Key': key })
      assertEquals(r2.status, 200)
      assertEquals(r2.data.id, r1.data.id, 'Same idempotency key → same transfer ID')
      console.log(`✅ Idempotency: both returned ${r1.data.id}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// Refund
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/refunds creates refund',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      // Create a PI first
      const pi = await stripePost('/v1/payment_intents', { amount: '3000', currency: 'usd' })
      const r = await stripePost('/v1/refunds', { payment_intent: pi.data.id })
      assertEquals(r.status, 200)
      assertExists(r.data.id)
      assertEquals(r.data.id.startsWith('re_sim_'), true)
      assertEquals(r.data.amount, 3000)
      assertEquals(r.data.status, 'succeeded')

      // Non-existent PI → 400
      const bad = await stripePost('/v1/refunds', { payment_intent: 'pi_fake_nonexistent' })
      assertEquals(bad.status, 400)
      console.log(`✅ Refund: ${r.data.id}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// Balance Transactions
// ============================================================================
Deno.test({
  name: 'Simulator: GET /v1/balance_transactions returns list',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const r = await stripeGet('/v1/balance_transactions?payout=po_test_123&limit=100&type=charge')
      assertEquals(r.status, 200)
      assertEquals(r.data.object, 'list')
      assertEquals(r.data.has_more, false)
      assertEquals(r.data.data.length >= 1, true, 'Should have at least 1 transaction')
      assertExists(r.data.data[0].id)
      assertEquals(r.data.data[0].type, 'charge')
      console.log(`✅ Balance transactions: ${r.data.data.length} entries`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// Connect Account: Create
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/accounts creates Connect account',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const r = await stripePost('/v1/accounts', { type: 'express', country: 'US', email: 'seller@test.com' })
      assertEquals(r.status, 200)
      assertExists(r.data.id)
      assertEquals(r.data.id.startsWith('acct_sim_'), true)
      assertEquals(r.data.type, 'express')
      assertEquals(r.data.charges_enabled, false, 'New account not yet enabled')
      console.log(`✅ Create account: ${r.data.id}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// Connect Account: Get
// ============================================================================
Deno.test({
  name: 'Simulator: GET /v1/accounts/:id retrieves account',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    sim.seedAccount('acct_test_existing', { charges_enabled: true, payouts_enabled: true })
    await sim.start()
    try {
      const r = await stripeGet('/v1/accounts/acct_test_existing')
      assertEquals(r.status, 200)
      assertEquals(r.data.id, 'acct_test_existing')
      assertEquals(r.data.charges_enabled, true)

      const notFound = await stripeGet('/v1/accounts/acct_nonexistent')
      assertEquals(notFound.status, 404)
      console.log('✅ Get account: found + 404')
    } finally { sim.stop() }
  },
})

// ============================================================================
// Account Links
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/account_links creates onboarding link',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const r = await stripePost('/v1/account_links', {
        account: 'acct_test_123', type: 'account_onboarding',
        return_url: 'https://casagrown.org/return', refresh_url: 'https://casagrown.org/refresh',
      })
      assertEquals(r.status, 200)
      assertExists(r.data.url)
      assertEquals(r.data.url.includes('acct_test_123'), true)
      assertExists(r.data.expires_at)
      console.log(`✅ Account link: ${r.data.url.substring(0, 60)}...`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// Dispute
// ============================================================================
Deno.test({
  name: 'Simulator: POST /v1/disputes/:id updates dispute',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    await sim.start()
    try {
      const r = await stripePost('/v1/disputes/dp_test_123', { evidence: 'submitted' })
      assertEquals(r.status, 200)
      assertEquals(r.data.id, 'dp_test_123')
      assertEquals(r.data.status, 'under_review')
      console.log('✅ Dispute update: under_review')
    } finally { sim.stop() }
  },
})

// ============================================================================
// Mixed: Full settlement flow through simulator
// ============================================================================
Deno.test({
  name: 'Simulator: Full settlement flow — create PI, capture, transfer',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    sim.addTransferBehavior('acct_seller1', 'success')
    await sim.start()
    try {
      // Step 1: Create PI (buyer hold)
      const pi = await stripePost('/v1/payment_intents', {
        amount: '10000', currency: 'usd', capture_method: 'manual',
        'metadata[user_id]': 'buyer_001', 'metadata[type]': 'market_hold',
      })
      assertEquals(pi.status, 200)
      assertEquals(pi.data.status, 'requires_payment_method')

      // Step 2: Capture PI (settlement)
      const cap = await stripePost(`/v1/payment_intents/${pi.data.id}/capture`, { amount_to_capture: '8500' })
      assertEquals(cap.status, 200)
      assertEquals(cap.data.status, 'succeeded')
      assertExists(cap.data.latest_charge)

      // Step 3: Transfer to seller (Stripe Connect)
      const xfer = await stripePost('/v1/transfers', {
        amount: '7650', currency: 'usd', destination: 'acct_seller1',
        transfer_group: 'settlement_001',
      })
      assertEquals(xfer.status, 200)
      assertExists(xfer.data.id)

      // Verify audit log
      const log = sim.getCallLog()
      assertEquals(log.length, 3, 'Should have 3 API calls')
      assertEquals(log.filter(l => l.status === 200).length, 3, 'All should succeed')

      console.log(`✅ Full flow: PI ${pi.data.id} → capture → transfer ${xfer.data.id}`)
    } finally { sim.stop() }
  },
})

// ============================================================================
// Audit log completeness
// ============================================================================
Deno.test({
  name: 'Simulator: Call log captures all API interactions',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sim = new StripeSimulator(SIM_PORT)
    sim.addDefaultTransferBehavior('success')
    await sim.start()
    try {
      await stripePost('/v1/payment_intents', { amount: '1000', currency: 'usd' })
      await stripePost('/v1/transfers', { amount: '900', currency: 'usd', destination: 'acct_any' })
      await stripeGet('/v1/balance_transactions?payout=po_x')
      await stripePost('/v1/accounts', { type: 'express' })

      const log = sim.getCallLog()
      assertEquals(log.length, 4)
      const paths = log.map(l => l.path)
      assertEquals(paths.includes('/v1/payment_intents'), true)
      assertEquals(paths.includes('/v1/transfers'), true)
      assertEquals(paths.includes('/v1/balance_transactions'), true)
      assertEquals(paths.includes('/v1/accounts'), true)

      console.log(`✅ Audit log: ${log.length} calls recorded`)
    } finally { sim.stop() }
  },
})
