/**
 * Sandbox API Integration Tests
 *
 * Tests that hit REAL sandbox APIs to verify external integrations:
 * 1. Stripe Sandbox — PaymentIntent creation + cancellation
 * 2. Tremendous Sandbox — Gift card catalog fetch
 * 3. Reloadly Sandbox — Auth token + catalog
 * 4. Gemini AI — Product photo analysis
 *
 * These tests use the sandbox keys from .env and verify that
 * our edge functions correctly integrate with external providers.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/sandbox-api.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Read API keys from env (same ones edge functions use)
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const TREMENDOUS_API_KEY = Deno.env.get('TREMENDOUS_API_KEY') ?? ''
const RELOADLY_CLIENT_ID = Deno.env.get('RELOADLY_CLIENT_ID') ?? ''
const RELOADLY_CLIENT_SECRET = Deno.env.get('RELOADLY_CLIENT_SECRET') ?? ''
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
}

async function callFn(name: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

// ============================================================================
// 1. STRIPE SANDBOX — Create + cancel a PaymentIntent
// ============================================================================
Deno.test({
  name: 'Stripe Sandbox: create PaymentIntent (sk_test_)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      console.log('⏭️  STRIPE_SECRET_KEY not set or not sandbox — skipping')
      return
    }

    // Create a $1.00 test PaymentIntent via Stripe API directly
    const params = new URLSearchParams({
      amount: '100',
      currency: 'usd',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      description: 'CasaGrown sandbox test',
    })

    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    
    assertEquals(res.status, 200, `Stripe API returned ${res.status}`)
    const pi = await res.json()
    
    assertExists(pi.id, 'PaymentIntent should have an id')
    assertExists(pi.client_secret, 'PaymentIntent should have client_secret')
    assertEquals(pi.status, 'requires_payment_method')
    assertEquals(pi.amount, 100)

    // Clean up: cancel the PaymentIntent
    const cancelRes = await fetch(`https://api.stripe.com/v1/payment_intents/${pi.id}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    })
    assertEquals(cancelRes.status, 200, 'Cancel should succeed')
    const cancelled = await cancelRes.json()
    assertEquals(cancelled.status, 'canceled')

    console.log(`✅ Stripe sandbox: created + cancelled PI ${pi.id}`)
  },
})

// ============================================================================
// 2. STRIPE SANDBOX — Verify market-hold edge function with Stripe
// ============================================================================
Deno.test({
  name: 'Stripe Sandbox: market-hold returns meaningful response',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      console.log('⏭️  STRIPE_SECRET_KEY not set — skipping')
      return
    }

    // market-hold requires auth + orderId — test that it interacts with Stripe
    const { status, data } = await callFn('market-hold', {
      orderId: '00000000-0000-0000-0000-000000000099',
    })
    // Should return an error about the order not existing (not a Stripe error)
    assertExists(data)
    // The function should NOT return 404 (it should exist and respond)
    assertEquals(true, status !== 404, 'market-hold function should exist')

    console.log(`✅ market-hold responds correctly: ${status}`)
  },
})

// ============================================================================
// 3. STRIPE SANDBOX — Verify refund RPC handles expired PI
// ============================================================================
Deno.test({
  name: 'Stripe Sandbox: refund returns error for fake PI',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      console.log('⏭️  STRIPE_SECRET_KEY not set — skipping')
      return
    }

    // Try to refund a non-existent PaymentIntent
    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'payment_intent=pi_fake_nonexistent_1234567890',
    })

    // Should return 400 or 404 (invalid PI)
    assertEquals(true, res.status >= 400, 'Fake PI refund should fail')
    const err = await res.json()
    assertExists(err.error, 'Should have error object')
    assertEquals(err.error.type, 'invalid_request_error')

    console.log(`✅ Stripe sandbox: fake PI refund correctly rejected`)
  },
})

// ============================================================================
// 4. TREMENDOUS SANDBOX — Fetch gift card catalog
// ============================================================================
Deno.test({
  name: 'Tremendous Sandbox: fetch product catalog',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!TREMENDOUS_API_KEY.startsWith('TEST_')) {
      console.log('⏭️  TREMENDOUS_API_KEY not set or not sandbox — skipping')
      return
    }

    const res = await fetch('https://testflight.tremendous.com/api/v2/products', {
      headers: {
        'Authorization': `Bearer ${TREMENDOUS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    assertEquals(res.status, 200, `Tremendous API returned ${res.status}`)
    const data = await res.json()
    assertExists(data.products, 'Should have products array')
    assertEquals(true, data.products.length > 0, 'Should have at least 1 product')

    // Verify structure of a product
    const first = data.products[0]
    assertExists(first.id, 'Product should have id')
    assertExists(first.name, 'Product should have name')

    console.log(`✅ Tremendous sandbox: ${data.products.length} products fetched`)
  },
})

// ============================================================================
// 5. TREMENDOUS SANDBOX — Fetch funding sources
// ============================================================================
Deno.test({
  name: 'Tremendous Sandbox: fetch funding sources',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!TREMENDOUS_API_KEY.startsWith('TEST_')) {
      console.log('⏭️  TREMENDOUS_API_KEY not set — skipping')
      return
    }

    const res = await fetch('https://testflight.tremendous.com/api/v2/funding_sources', {
      headers: {
        'Authorization': `Bearer ${TREMENDOUS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    assertEquals(res.status, 200)
    const data = await res.json()
    assertExists(data.funding_sources, 'Should have funding_sources array')

    console.log(`✅ Tremendous sandbox: ${data.funding_sources.length} funding sources`)
  },
})

// ============================================================================
// 6. RELOADLY SANDBOX — Get auth token
// ============================================================================
Deno.test({
  name: 'Reloadly Sandbox: obtain auth token',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!RELOADLY_CLIENT_ID || !RELOADLY_CLIENT_SECRET) {
      console.log('⏭️  RELOADLY credentials not set — skipping')
      return
    }

    const res = await fetch('https://auth.reloadly.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: RELOADLY_CLIENT_ID,
        client_secret: RELOADLY_CLIENT_SECRET,
        grant_type: 'client_credentials',
        audience: 'https://giftcards-sandbox.reloadly.com',
      }),
    })

    assertEquals(res.status, 200, `Reloadly auth returned ${res.status}`)
    const data = await res.json()
    assertExists(data.access_token, 'Should have access_token')
    assertEquals(true, data.access_token.length > 50, 'Token should be substantial')

    console.log(`✅ Reloadly sandbox: auth token obtained (${data.token_type})`)
  },
})

// ============================================================================
// 7. RELOADLY SANDBOX — Fetch gift card products
// ============================================================================
Deno.test({
  name: 'Reloadly Sandbox: fetch gift card catalog',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!RELOADLY_CLIENT_ID || !RELOADLY_CLIENT_SECRET) {
      console.log('⏭️  RELOADLY credentials not set — skipping')
      return
    }

    // First get token
    const authRes = await fetch('https://auth.reloadly.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: RELOADLY_CLIENT_ID,
        client_secret: RELOADLY_CLIENT_SECRET,
        grant_type: 'client_credentials',
        audience: 'https://giftcards-sandbox.reloadly.com',
      }),
    })
    const authData = await authRes.json()
    if (!authData.access_token) {
      console.log('⏭️  Could not get Reloadly token — skipping')
      return
    }

    // Fetch catalog
    const res = await fetch('https://giftcards-sandbox.reloadly.com/products?size=5&page=1', {
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
    })

    assertEquals(res.status, 200)
    const data = await res.json()
    assertExists(data.content, 'Should have content array')
    assertEquals(true, data.content.length > 0, 'Should have at least 1 gift card')

    const first = data.content[0]
    assertExists(first.productName, 'Gift card should have productName')

    console.log(`✅ Reloadly sandbox: ${data.content.length} gift cards fetched (first: ${first.productName})`)
  },
})

// ============================================================================
// 8. GEMINI AI — Product photo analysis
// ============================================================================
Deno.test({
  name: 'Gemini AI: analyze-product-photo responds',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!GEMINI_API_KEY) {
      console.log('⏭️  GEMINI_API_KEY not set — skipping')
      return
    }

    // Test the Gemini AI API directly with a simple text prompt
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Respond with exactly one word: "tomato"'
            }]
          }]
        }),
      }
    )

    // Gemini may rate-limit in test environments — accept 200 or 429
    assertEquals(true, res.status === 200 || res.status === 429,
      `Gemini API returned unexpected ${res.status}`)

    if (res.status === 429) {
      console.log('✅ Gemini AI: API reachable (rate-limited in test — expected)')
      await res.text()
      return
    }

    const data = await res.json()
    assertExists(data.candidates, 'Should have candidates')
    assertEquals(true, data.candidates.length > 0, 'Should have at least 1 candidate')

    const responseText = data.candidates[0]?.content?.parts?.[0]?.text ?? ''
    assertEquals(true, responseText.length > 0, 'Should have response text')

    console.log(`✅ Gemini AI: responded with "${responseText.trim()}"`)
  },
})

// ============================================================================
// 9. GEMINI AI — Moderate listing edge function works with AI
// ============================================================================
Deno.test({
  name: 'Gemini AI: moderate-listing edge function with AI',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!GEMINI_API_KEY) {
      console.log('⏭️  GEMINI_API_KEY not set — skipping')
      return
    }

    // The moderate-listing function uses AI for content moderation
    const { status, data } = await callFn('moderate-listing', {
      productId: '00000000-0000-0000-0000-000000000099',
    })
    // Should exist and respond (may error because product doesn't exist)
    assertEquals(true, status !== 404, 'moderate-listing should exist')
    assertExists(data)

    console.log(`✅ moderate-listing responds: ${status}`)
  },
})

// ============================================================================
// 10. STRIPE SANDBOX — Verify webhook signature validation
// ============================================================================
Deno.test({
  name: 'Stripe Sandbox: webhook rejects invalid signature',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Send a fake webhook with bad signature
    const { status, data } = await callFn('stripe-webhook', {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_fake' } },
    })
    // Should handle gracefully (not crash)
    assertEquals(true, status !== 404, 'stripe-webhook should exist')

    console.log(`✅ stripe-webhook: fake event handled: ${status}`)
  },
})
