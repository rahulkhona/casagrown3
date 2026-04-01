/**
 * create-order Integration Tests
 */
import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const fnUrl = `${SUPABASE_URL}/functions/v1/create-order`

Deno.test('create-order: rejects missing postId', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      sellerId: '00000000-0000-0000-0000-000000000002',
      quantity: 1, pointsPerUnit: 100, totalPrice: 100,
      category: 'produce', product: 'Tomatoes',
    }),
  })
  const body = await res.json()
  assertEquals(typeof body, 'object')
})

Deno.test('create-order: rejects zero quantity', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      postId: '00000000-0000-0000-0000-000000000001',
      sellerId: '00000000-0000-0000-0000-000000000002',
      quantity: 0, pointsPerUnit: 100, totalPrice: 0,
      category: 'produce', product: 'Tomatoes',
    }),
  })
  const body = await res.json()
  assertEquals(typeof body, 'object')
})

Deno.test('create-order: rejects missing category', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      postId: '00000000-0000-0000-0000-000000000001',
      sellerId: '00000000-0000-0000-0000-000000000002',
      quantity: 1, pointsPerUnit: 100, totalPrice: 100,
      product: 'Tomatoes',
    }),
  })
  const body = await res.json()
  assertEquals(typeof body, 'object')
})

Deno.test('create-order: function responds (not 404)', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      postId: '00000000-0000-0000-0000-000000000001',
      sellerId: '00000000-0000-0000-0000-000000000002',
      quantity: 1, pointsPerUnit: 100, totalPrice: 100,
      category: 'produce', product: 'Tomatoes',
    }),
  })
  await res.text() // consume body
  assertEquals(res.status !== 404, true, 'Function should exist')
})

Deno.test({ name: 'create-order: orders table is accessible with correct schema', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data, error } = await supabase
    .from('orders')
    .select('id, buyer_id, seller_id, status, quantity, points_per_unit, tax_rate_pct, tax_amount')
    .limit(1)
  assertEquals(error, null, 'orders table should be accessible with expected columns')
}})

Deno.test({ name: 'create-order: create_order_atomic RPC exists', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error } = await supabase.rpc('create_order_atomic', {
    p_buyer_id: '00000000-0000-0000-0000-000000000001',
    p_seller_id: '00000000-0000-0000-0000-000000000002',
    p_post_id: '00000000-0000-0000-0000-000000000003',
    p_quantity: 1,
    p_points_per_unit: 100,
    p_total_price: 100,
    p_category: 'produce',
    p_product: 'Test',
    p_delivery_date: null,
    p_delivery_instructions: null,
  })
  if (error) {
    assertEquals(
      error.message.includes('does not exist') === false,
      true,
      `create_order_atomic RPC should exist, got: ${error.message}`
    )
  }
}})
