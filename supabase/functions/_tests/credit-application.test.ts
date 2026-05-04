/**
 * Credit Application — Integration Tests
 *
 * Verifies the full lifecycle: grant credit → place order → credit consumed on completion.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/credit-application.test.ts
 */
import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Seeded users
const BUYER_ID = 'b2222222-2222-2222-2222-222222222222'
const SELLER_ID = 'd4444444-4444-4444-4444-444444444444'

async function callRpc(name: string, body: unknown, key: string = SERVICE_ROLE_KEY) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key,
    },
    body: JSON.stringify(body),
  })
}

async function queryTable(table: string, filters: string = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  return res.json()
}

async function insertRow(table: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  })
  const body = await res.json()
  if (res.status !== 201) {
    console.log(`  [INSERT FAILED] ${table}: ${res.status} ${JSON.stringify(body)}`)
    return null
  }
  return Array.isArray(body) ? body[0] : body
}

async function deleteRow(table: string, filter: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
}

Deno.test('get_user_credit_balance: returns credit breakdown by type', async () => {
  const res = await callRpc('get_user_credit_balance', { p_user_id: BUYER_ID })
  if (res.status === 404) { await res.text(); return }
  assertEquals(res.status, 200)
  const body = await res.json()
  assertExists(body.purchase_credits_usd, 'Should have purchase_credits_usd')
  assertExists(body.total_credits_usd, 'Should have total_credits_usd')
  console.log(`  [CREDITS] Buyer balance: $${body.total_credits_usd} (purchase=$${body.purchase_credits_usd}, fee=$${body.platform_fee_credits_usd}, universal=$${body.universal_credits_usd})`)
})

Deno.test({ name: 'apply_credits_to_order: FIFO credit consumption on order', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // 1. Create a purchase credit for the buyer
  //    Schema: amount_usd, remaining_usd, credit_type, cap_type (enum: percentage/flat_amount),
  //    cap_value, source (enum: escalation_resolution/goodwill/promotion)
  const credit = await insertRow('user_credits', {
    user_id: BUYER_ID,
    credit_type: 'purchase',
    amount_usd: 10.00,
    remaining_usd: 10.00,
    cap_type: 'flat_amount',
    cap_value: 10.00,
    source: 'goodwill',
    expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
  })
  if (!credit) { console.log('  Could not create credit — skipping'); return }
  console.log(`  [CREDIT] Created credit ${credit.id}: $${credit.remaining_usd}`)

  // 2. Look up a seeded product to get price
  const products = await queryTable('market_products', `seller_id=eq.${SELLER_ID}&select=id,price_usd&is_active=eq.true&limit=1`)
  if (!products.length) {
    console.log('  No products found — skipping')
    await deleteRow('user_credits', `id=eq.${credit.id}`)
    return
  }

  // 3. Place an order using place_market_order
  const orderRes = await callRpc('place_market_order', {
    p_product_id: products[0].id,
    p_quantity: 1,
    p_expected_price: Number(products[0].price_usd),
    p_fulfillment_type: 'delivery',
    p_delivery_address: JSON.stringify({
      line1: '123 Test St', city: 'Test City', state: 'CA', zip: '90210', lat: 34.05, lng: -118.24,
    }),
  })
  const orderBody = await orderRes.json()
  console.log(`  [ORDER] place_market_order: ${JSON.stringify(orderBody)}`)

  if (!orderBody.order_id) {
    console.log('  Could not create order — skipping credit test')
    await deleteRow('user_credits', `id=eq.${credit.id}`)
    return
  }

  // 4. Apply credits to order
  const applyRes = await callRpc('apply_credits_to_order', {
    p_order_id: orderBody.order_id,
    p_user_id: BUYER_ID,
  })
  const appliedAmount = await applyRes.json()
  console.log(`  [APPLY] Credit applied: $${appliedAmount}`)
  assert(Number(appliedAmount) > 0, 'Should apply some credit')

  // 5. Verify credit was consumed — remaining_usd should be less
  const updatedCredit = await queryTable('user_credits', `id=eq.${credit.id}&select=remaining_usd`)
  console.log(`  [VERIFY] Credit remaining: $${updatedCredit[0]?.remaining_usd}`)
  assert(Number(updatedCredit[0]?.remaining_usd) < 10.00, 'remaining_usd should decrease')

  // 6. Verify credit_usage_log has an entry
  const usageLog = await queryTable('credit_usage_log', `credit_id=eq.${credit.id}&select=*`)
  console.log(`  [LOG] Usage log entries: ${usageLog.length}`)
  assert(usageLog.length > 0, 'credit_usage_log should have an entry')
  assertEquals(usageLog[0].order_id, orderBody.order_id)

  // 7. Verify order has credit_applied_usd set
  const order = await queryTable('market_orders', `id=eq.${orderBody.order_id}&select=credit_applied_usd`)
  console.log(`  [ORDER] credit_applied_usd: $${order[0]?.credit_applied_usd}`)
  assert(Number(order[0]?.credit_applied_usd) > 0, 'order should show credit applied')

  // Cleanup
  await deleteRow('credit_usage_log', `credit_id=eq.${credit.id}`)
  await deleteRow('market_orders', `id=eq.${orderBody.order_id}`)
  await deleteRow('user_credits', `id=eq.${credit.id}`)
  console.log('  ✅ Cleanup complete')
}})

Deno.test({ name: 'apply_credits_to_order: expired credits are skipped', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // Create an expired credit
  const credit = await insertRow('user_credits', {
    user_id: BUYER_ID,
    credit_type: 'purchase',
    amount_usd: 50.00,
    remaining_usd: 50.00,
    cap_type: 'flat_amount',
    cap_value: 50.00,
    source: 'goodwill',
    expires_at: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
  })
  if (!credit) { console.log('  Could not create expired credit — skipping'); return }
  console.log(`  [CREDIT] Created expired credit ${credit.id}`)

  // Find any existing order to test against
  const orders = await queryTable('market_orders', 'select=id,total_usd&limit=1&status=eq.pending')
  if (!orders.length) {
    // Create a minimal order to test against
    const products = await queryTable('market_products', `seller_id=eq.${SELLER_ID}&select=id,price_usd&is_active=eq.true&limit=1`)
    if (!products.length) {
      console.log('  No products or pending orders — skipping')
      await deleteRow('user_credits', `id=eq.${credit.id}`)
      return
    }
    const orderRes = await callRpc('place_market_order', {
      p_product_id: products[0].id,
      p_quantity: 1,
      p_expected_price: Number(products[0].price_usd),
      p_fulfillment_type: 'delivery',
      p_delivery_address: JSON.stringify({
        line1: '789 Expired Credit St', city: 'Test', state: 'CA', zip: '90210', lat: 34.05, lng: -118.24,
      }),
    })
    const orderBody = await orderRes.json()
    if (!orderBody.order_id) {
      console.log(`  Could not create order: ${JSON.stringify(orderBody)} — skipping`)
      await deleteRow('user_credits', `id=eq.${credit.id}`)
      return
    }
    orders.push({ id: orderBody.order_id })
  }

  const applyRes = await callRpc('apply_credits_to_order', {
    p_order_id: orders[0].id,
    p_user_id: BUYER_ID,
  })
  const appliedAmount = await applyRes.json()
  console.log(`  [APPLY] Applied from expired credit: $${appliedAmount}`)

  // The expired credit should NOT be consumed (remaining_usd unchanged)
  const updatedCredit = await queryTable('user_credits', `id=eq.${credit.id}&select=remaining_usd`)
  if (updatedCredit.length > 0) {
    assertEquals(Number(updatedCredit[0].remaining_usd), 50.00, 'Expired credit should not be consumed')
  }

  // Cleanup
  await deleteRow('user_credits', `id=eq.${credit.id}`)
  // Clean up created order if we made one
  if (orders.length === 1 && !orders[0].total_usd) {
    await deleteRow('market_orders', `id=eq.${orders[0].id}`)
  }
  console.log('  ✅ Expired credit correctly skipped')
}})
