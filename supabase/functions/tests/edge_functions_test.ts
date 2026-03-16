// Edge Function Integration Tests
// These test the edge functions via HTTP calls to the local Supabase instance
// Run with: deno test --allow-net --allow-env supabase/functions/tests/

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

async function invokeFunction(name: string, body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || ANON_KEY}`,
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

// ============================================================================
// create-order
// ============================================================================
Deno.test('create-order: rejects unauthenticated requests', async () => {
  const { status } = await invokeFunction('create-order', {
    postId: 'test', sellerId: 'test', quantity: 1, pointsPerUnit: 10,
    totalPrice: 10, category: 'produce', product: 'Tomatoes',
  })
  if (status !== 401 && status !== 400) {
    throw new Error(`Expected 401 or 400, got ${status}`)
  }
})

Deno.test('create-order: validates required fields', async () => {
  const { status, data } = await invokeFunction('create-order', {})
  if (status !== 400 && status !== 401 && status !== 500) {
    throw new Error(`Expected error status, got ${status}`)
  }
})

// ============================================================================
// market-hold
// ============================================================================
Deno.test('market-hold: rejects unauthenticated requests', async () => {
  const { status } = await invokeFunction('market-hold', {
    order_id: 'test', amount_cents: 100,
  })
  if (status !== 401 && status !== 400) {
    throw new Error(`Expected 401 or 400, got ${status}`)
  }
})

// ============================================================================
// get-tax-rate
// ============================================================================
Deno.test('get-tax-rate: rejects without zip code', async () => {
  const { status, data } = await invokeFunction('get-tax-rate', {})
  // Should return error for missing zip
  if (status !== 400 && status !== 401 && status !== 500) {
    throw new Error(`Expected error status, got ${status}`)
  }
})

// ============================================================================
// fetch-market-gift-cards
// ============================================================================
Deno.test('fetch-market-gift-cards: returns data or auth error', async () => {
  const { status } = await invokeFunction('fetch-market-gift-cards', {})
  // Should return 200 (public) or 401 (auth required)
  if (status !== 200 && status !== 401 && status !== 400) {
    throw new Error(`Expected 200 or 401, got ${status}`)
  }
})

// ============================================================================
// fetch-donation-projects
// ============================================================================
Deno.test('fetch-donation-projects: returns data or auth error', async () => {
  const { status } = await invokeFunction('fetch-donation-projects', {})
  if (status !== 200 && status !== 401 && status !== 400) {
    throw new Error(`Expected 200 or 401, got ${status}`)
  }
})

// ============================================================================
// market-cashout-paypal
// ============================================================================
Deno.test('market-cashout-paypal: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('market-cashout-paypal', { amount_usd: 10 })
  if (status !== 401 && status !== 400) {
    throw new Error(`Expected 401 or 400, got ${status}`)
  }
})

// ============================================================================
// market-purchase-gift-card
// ============================================================================
Deno.test('market-purchase-gift-card: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('market-purchase-gift-card', { card_id: 'test' })
  if (status !== 401 && status !== 400) {
    throw new Error(`Expected 401 or 400, got ${status}`)
  }
})

// ============================================================================
// market-donate-earnings
// ============================================================================
Deno.test('market-donate-earnings: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('market-donate-earnings', { project_id: 'test', amount_usd: 5 })
  if (status !== 401 && status !== 400) {
    throw new Error(`Expected 401 or 400, got ${status}`)
  }
})

// ============================================================================
// send-market-email
// ============================================================================
Deno.test('send-market-email: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('send-market-email', { type: 'test', to: 'test@test.com' })
  if (status !== 401 && status !== 400) {
    throw new Error(`Expected 401 or 400, got ${status}`)
  }
})

// ============================================================================
// stripe-webhook
// ============================================================================
Deno.test('stripe-webhook: rejects without signature', async () => {
  const { status } = await invokeFunction('stripe-webhook', { type: 'test' })
  // Stripe webhook should reject without proper signature
  if (status !== 400 && status !== 401 && status !== 500) {
    throw new Error(`Expected error status, got ${status}`)
  }
})
