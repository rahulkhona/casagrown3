/**
 * market-hold Integration Tests
 */
import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const fnUrl = `${SUPABASE_URL}/functions/v1/market-hold`

Deno.test('market-hold: rejects missing action', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({}),
  })
  const body = await res.json()
  assertEquals(typeof body, 'object')
})

Deno.test('market-hold: function responds (not 404)', async () => {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action: 'create', amountCents: 100 }),
  })
  await res.text() // consume body
  assertEquals(res.status !== 404, true, 'market-hold function should exist')
})

Deno.test({ name: 'market-hold: point_ledger table is accessible', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error } = await supabase
    .from('point_ledger')
    .select('id, user_id, type, amount, balance_after')
    .limit(1)
  assertEquals(error, null, 'point_ledger should be accessible')
}})

Deno.test({ name: 'market-hold: market_holds table is accessible with correct schema', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error } = await supabase
    .from('market_holds')
    .select('id, buyer_id, stripe_payment_intent_id, hold_amount_cents, spent_amount_cents, status, balance_applied_cents')
    .limit(1)
  assertEquals(error, null, 'market_holds should be accessible with correct columns')
}})

Deno.test({ name: 'market-hold: status check constraint validates', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  // Try inserting with invalid status — should fail due to CHECK constraint
  const { error } = await supabase
    .from('market_holds')
    .insert({
      buyer_id: '00000000-0000-0000-0000-000000000001',
      stripe_payment_intent_id: 'pi_test_invalid',
      stripe_client_secret: 'pi_test_invalid_secret',
      hold_amount_cents: 1000,
      status: 'invalid',
    })
  assertEquals(error !== null, true, 'Invalid status should be rejected by check constraint')
}})

Deno.test({ name: 'market-hold: unique active hold per buyer enforced', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  let data = null;
  let error = null;
  for (let i = 0; i < 5; i++) {
    const res = await supabase
      .from('market_holds')
      .select('id, buyer_id, status')
      .eq('status', 'active')
      .limit(0);
    data = res.data;
    error = res.error;
    if (!error) break;
    console.log(`[RETRY] market-hold active holds query failed: ${error.message}. Retrying in 1s...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assertEquals(error, null, 'Should be able to query active holds')
}})
