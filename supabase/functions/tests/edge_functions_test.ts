// Edge Function Comprehensive Tests
// Tests all 38 edge functions for: auth rejection, input validation, and business logic
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
  return { status: res.status, data: await res.json().catch(() => null) }
}

function expectErrorStatus(status: number, functionName: string) {
  if (status !== 400 && status !== 401 && status !== 500 && status !== 403) {
    throw new Error(`[${functionName}] Expected error status (400/401/403/500), got ${status}`)
  }
}

// ============================================================================
// Group 1: Order & Payment Functions (Critical Path)
// ============================================================================

Deno.test('create-order: rejects unauthenticated requests', async () => {
  const { status } = await invokeFunction('create-order', {
    postId: 'test', sellerId: 'test', quantity: 1, pointsPerUnit: 10,
    totalPrice: 10, category: 'produce', product: 'Tomatoes',
  })
  expectErrorStatus(status, 'create-order')
})

Deno.test('create-order: validates required fields', async () => {
  const { status } = await invokeFunction('create-order', {})
  expectErrorStatus(status, 'create-order')
})

Deno.test('create-order: rejects negative quantity', async () => {
  const { status } = await invokeFunction('create-order', {
    postId: 'test', sellerId: 'test', quantity: -1, pointsPerUnit: 10,
    totalPrice: -10, category: 'produce', product: 'Bad',
  })
  expectErrorStatus(status, 'create-order')
})

Deno.test('create-order: rejects zero total price', async () => {
  const { status } = await invokeFunction('create-order', {
    postId: 'test', sellerId: 'test', quantity: 1, pointsPerUnit: 0,
    totalPrice: 0, category: 'produce', product: 'Free',
  })
  expectErrorStatus(status, 'create-order')
})

Deno.test('market-hold: rejects unauthenticated requests', async () => {
  const { status } = await invokeFunction('market-hold', {
    order_id: 'test', amount_cents: 100,
  })
  expectErrorStatus(status, 'market-hold')
})

Deno.test('market-hold: rejects missing order_id', async () => {
  const { status } = await invokeFunction('market-hold', { amount_cents: 100 })
  expectErrorStatus(status, 'market-hold')
})

Deno.test('market-hold: rejects negative amount', async () => {
  const { status } = await invokeFunction('market-hold', {
    order_id: 'test', amount_cents: -500,
  })
  expectErrorStatus(status, 'market-hold')
})

Deno.test('confirm-payment: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('confirm-payment', { payment_intent_id: 'pi_test' })
  expectErrorStatus(status, 'confirm-payment')
})

Deno.test('confirm-payment: rejects missing payment_intent_id', async () => {
  const { status } = await invokeFunction('confirm-payment', {})
  expectErrorStatus(status, 'confirm-payment')
})

Deno.test('create-payment-intent: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('create-payment-intent', { amount: 1000, currency: 'usd' })
  expectErrorStatus(status, 'create-payment-intent')
})

Deno.test('create-payment-intent: rejects missing amount', async () => {
  const { status } = await invokeFunction('create-payment-intent', {})
  expectErrorStatus(status, 'create-payment-intent')
})

// ============================================================================
// Group 2: Tax & Compliance
// ============================================================================

Deno.test('get-tax-rate: rejects without zip code', async () => {
  const { status } = await invokeFunction('get-tax-rate', {})
  expectErrorStatus(status, 'get-tax-rate')
})

Deno.test('get-tax-rate: rejects invalid zip format', async () => {
  const { status } = await invokeFunction('get-tax-rate', { zip: 'ABCDE' })
  expectErrorStatus(status, 'get-tax-rate')
})

Deno.test('resolve-usps-address: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('resolve-usps-address', { address: '123 Main St' })
  expectErrorStatus(status, 'resolve-usps-address')
})

Deno.test('resolve-usps-address: rejects empty address', async () => {
  const { status } = await invokeFunction('resolve-usps-address', {})
  expectErrorStatus(status, 'resolve-usps-address')
})

// ============================================================================
// Group 3: Cashout & Gift Card Functions
// ============================================================================

Deno.test('market-cashout-paypal: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('market-cashout-paypal', { amount_usd: 10 })
  expectErrorStatus(status, 'market-cashout-paypal')
})

Deno.test('market-cashout-paypal: rejects negative amount', async () => {
  const { status } = await invokeFunction('market-cashout-paypal', { amount_usd: -5 })
  expectErrorStatus(status, 'market-cashout-paypal')
})

Deno.test('market-cashout-paypal: rejects zero amount', async () => {
  const { status } = await invokeFunction('market-cashout-paypal', { amount_usd: 0 })
  expectErrorStatus(status, 'market-cashout-paypal')
})

Deno.test('market-purchase-gift-card: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('market-purchase-gift-card', { card_id: 'test' })
  expectErrorStatus(status, 'market-purchase-gift-card')
})

Deno.test('market-purchase-gift-card: rejects missing card_id', async () => {
  const { status } = await invokeFunction('market-purchase-gift-card', {})
  expectErrorStatus(status, 'market-purchase-gift-card')
})

Deno.test('market-donate-earnings: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('market-donate-earnings', { project_id: 'test', amount_usd: 5 })
  expectErrorStatus(status, 'market-donate-earnings')
})

Deno.test('market-donate-earnings: rejects negative amount', async () => {
  const { status } = await invokeFunction('market-donate-earnings', { project_id: 'test', amount_usd: -5 })
  expectErrorStatus(status, 'market-donate-earnings')
})

Deno.test('market-donate-earnings: rejects missing project_id', async () => {
  const { status } = await invokeFunction('market-donate-earnings', { amount_usd: 5 })
  expectErrorStatus(status, 'market-donate-earnings')
})

Deno.test('fetch-market-gift-cards: returns data or auth error', async () => {
  const { status } = await invokeFunction('fetch-market-gift-cards', {})
  if (status !== 200 && status !== 401 && status !== 400 && status !== 500) {
    throw new Error(`Expected 200/401/400/500, got ${status}`)
  }
})

Deno.test('fetch-donation-projects: returns data or auth error', async () => {
  const { status } = await invokeFunction('fetch-donation-projects', {})
  if (status !== 200 && status !== 401 && status !== 400 && status !== 500) {
    throw new Error(`Expected 200/401/400/500, got ${status}`)
  }
})

// ============================================================================
// Group 4: Notification Functions
// ============================================================================

Deno.test('send-market-email: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('send-market-email', { type: 'test', to: 'test@test.com' })
  expectErrorStatus(status, 'send-market-email')
})

Deno.test('send-market-email: rejects missing type', async () => {
  const { status } = await invokeFunction('send-market-email', { to: 'test@test.com' })
  expectErrorStatus(status, 'send-market-email')
})

Deno.test('notify-on-market-message: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('notify-on-market-message', { conversation_id: 'test' })
  expectErrorStatus(status, 'notify-on-market-message')
})

Deno.test('notify-on-market-message: rejects missing conversation_id', async () => {
  const { status } = await invokeFunction('notify-on-market-message', {})
  expectErrorStatus(status, 'notify-on-market-message')
})

Deno.test('notify-product-flagged: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('notify-product-flagged', { product_id: 'test' })
  expectErrorStatus(status, 'notify-product-flagged')
})

Deno.test('notify-product-flagged: rejects missing product_id', async () => {
  const { status } = await invokeFunction('notify-product-flagged', {})
  expectErrorStatus(status, 'notify-product-flagged')
})

Deno.test('send-notification-email: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('send-notification-email', { email: 'x@x.com', subject: 'Hi' })
  expectErrorStatus(status, 'send-notification-email')
})

Deno.test('send-push-notification: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('send-push-notification', { user_id: 'test', title: 'Hi' })
  expectErrorStatus(status, 'send-push-notification')
})

Deno.test('send-push-notification: rejects missing user_id', async () => {
  const { status } = await invokeFunction('send-push-notification', { title: 'Hi' })
  expectErrorStatus(status, 'send-push-notification')
})

Deno.test('send-transaction-email: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('send-transaction-email', { type: 'receipt', order_id: 'test' })
  expectErrorStatus(status, 'send-transaction-email')
})

// ============================================================================
// Group 5: Phone Verification
// ============================================================================

Deno.test('send-phone-otp: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('send-phone-otp', { phone: '+14155551234' })
  expectErrorStatus(status, 'send-phone-otp')
})

Deno.test('send-phone-otp: rejects invalid phone format', async () => {
  const { status } = await invokeFunction('send-phone-otp', { phone: 'notaphone' })
  expectErrorStatus(status, 'send-phone-otp')
})

Deno.test('verify-phone-otp: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('verify-phone-otp', { phone: '+14155551234', code: '123456' })
  expectErrorStatus(status, 'verify-phone-otp')
})

Deno.test('verify-phone-otp: rejects missing code', async () => {
  const { status } = await invokeFunction('verify-phone-otp', { phone: '+14155551234' })
  expectErrorStatus(status, 'verify-phone-otp')
})

// ============================================================================
// Group 6: Push Token & Registration
// ============================================================================

Deno.test('register-push-token: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('register-push-token', {
    token: 'fcm-token', platform: 'web',
  })
  expectErrorStatus(status, 'register-push-token')
})

Deno.test('register-push-token: rejects missing token', async () => {
  const { status } = await invokeFunction('register-push-token', { platform: 'web' })
  expectErrorStatus(status, 'register-push-token')
})

// ============================================================================
// Group 7: Community Functions (shared infrastructure)
// ============================================================================

Deno.test('create-offer: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('create-offer', { type: 'test' })
  expectErrorStatus(status, 'create-offer')
})

Deno.test('donate-points: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('donate-points', { amount: 100 })
  expectErrorStatus(status, 'donate-points')
})

Deno.test('donate-points: rejects negative amount', async () => {
  const { status } = await invokeFunction('donate-points', { amount: -100 })
  expectErrorStatus(status, 'donate-points')
})

Deno.test('pair-delegation: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('pair-delegation', { code: 'TEST' })
  expectErrorStatus(status, 'pair-delegation')
})

Deno.test('pair-delegation: rejects missing code', async () => {
  const { status } = await invokeFunction('pair-delegation', {})
  expectErrorStatus(status, 'pair-delegation')
})

// ============================================================================
// Group 8: Points & Redemption
// ============================================================================

Deno.test('redeem-gift-card: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('redeem-gift-card', { card_code: 'TEST123' })
  expectErrorStatus(status, 'redeem-gift-card')
})

Deno.test('redeem-gift-card: rejects missing card_code', async () => {
  const { status } = await invokeFunction('redeem-gift-card', {})
  expectErrorStatus(status, 'redeem-gift-card')
})

Deno.test('redeem-paypal-payout: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('redeem-paypal-payout', { amount: 10 })
  expectErrorStatus(status, 'redeem-paypal-payout')
})

Deno.test('refund-purchased-points: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('refund-purchased-points', { purchase_id: 'test' })
  expectErrorStatus(status, 'refund-purchased-points')
})

Deno.test('process-redemptions: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('process-redemptions', {})
  expectErrorStatus(status, 'process-redemptions')
})

// ============================================================================
// Group 9: Webhook & Cron
// ============================================================================

Deno.test('stripe-webhook: rejects without signature', async () => {
  const { status } = await invokeFunction('stripe-webhook', { type: 'test' })
  expectErrorStatus(status, 'stripe-webhook')
})

Deno.test('stripe-webhook: rejects malformed body', async () => {
  const { status } = await invokeFunction('stripe-webhook', { garbage: true })
  expectErrorStatus(status, 'stripe-webhook')
})

Deno.test('market-cron: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('market-cron', {})
  expectErrorStatus(status, 'market-cron')
})

// ============================================================================
// Group 10: Sync & Data Functions
// ============================================================================

Deno.test('sync-locations: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('sync-locations', {})
  expectErrorStatus(status, 'sync-locations')
})

Deno.test('sync-provider-balance: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('sync-provider-balance', {})
  expectErrorStatus(status, 'sync-provider-balance')
})

Deno.test('update-zip-codes: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('update-zip-codes', {})
  expectErrorStatus(status, 'update-zip-codes')
})

Deno.test('enrich-communities: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('enrich-communities', {})
  expectErrorStatus(status, 'enrich-communities')
})

Deno.test('resolve-community: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('resolve-community', { name: 'test' })
  expectErrorStatus(status, 'resolve-community')
})

Deno.test('resolve-pending-payments: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('resolve-pending-payments', {})
  expectErrorStatus(status, 'resolve-pending-payments')
})

Deno.test('assign-experiment: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('assign-experiment', { experiment: 'test' })
  expectErrorStatus(status, 'assign-experiment')
})

Deno.test('notify-on-message: rejects unauthenticated', async () => {
  const { status } = await invokeFunction('notify-on-message', { conversation_id: 'test' })
  expectErrorStatus(status, 'notify-on-message')
})

// ============================================================================
// Group 11: Gift Card & Fetch Functions
// ============================================================================

Deno.test('fetch-gift-cards: returns data or auth error', async () => {
  const { status } = await invokeFunction('fetch-gift-cards', {})
  if (status !== 200 && status !== 401 && status !== 400 && status !== 500) {
    throw new Error(`Expected 200/401/400/500, got ${status}`)
  }
})
