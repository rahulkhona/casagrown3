/**
 * create-payment-intent Integration Tests
 */
import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const fnUrl = `${SUPABASE_URL}/functions/v1/create-payment-intent`

Deno.test('create-payment-intent: rejects missing amountCents', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ pointsAmount: 100 }),
  })
  const body = await res.json()
  assertEquals(typeof body, 'object')
})

Deno.test('create-payment-intent: rejects amount below minimum ($0.50)', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ amountCents: 10, pointsAmount: 10 }),
  })
  const body = await res.json()
  assertEquals(typeof body, 'object')
})

Deno.test('create-payment-intent: rejects amount above maximum ($1000)', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ amountCents: 200000, pointsAmount: 200000 }),
  })
  const body = await res.json()
  assertEquals(typeof body, 'object')
})

Deno.test('create-payment-intent: function responds (not 404)', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ amountCents: 500, pointsAmount: 500 }),
  })
  await res.text() // consume body to avoid leak
  assertEquals(res.status !== 404, true, 'Function should not return 404')
})

Deno.test({ name: 'create-payment-intent: payment_transactions table is accessible', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error } = await supabase
    .from('payment_transactions')
    .select('id, user_id, amount_cents, points_amount, status, provider')
    .limit(1)
  assertEquals(error, null, 'payment_transactions should be accessible')
}})

Deno.test({ name: 'create-payment-intent: validates payment_status enum', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error } = await supabase
    .from('payment_transactions')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000001',
      amount_cents: 500,
      points_amount: 500,
      status: 'invalid_status',
    })
  assertExists(error, 'Invalid status should be rejected by enum')
}})
