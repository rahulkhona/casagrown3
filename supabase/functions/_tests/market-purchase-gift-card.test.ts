/**
 * Market Purchase Gift Card — Integration Tests
 *
 * Tests the market-purchase-gift-card edge function:
 * - Auth required
 * - Missing fields validation
 * - Schema verification (giftcards_cache, redemptions)
 * - Error handling
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/market-purchase-gift-card.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const HEADERS = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY }

async function callFn(name: string, body: any, token?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token || SERVICE_ROLE_KEY}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

// 1. Auth required
Deno.test({
  name: 'market-purchase-gift-card: requires auth',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('market-purchase-gift-card', {}, ANON_KEY)
    assertEquals(true, status >= 400)
  },
})

// 2. Missing fields
Deno.test({
  name: 'market-purchase-gift-card: rejects missing fields',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('market-purchase-gift-card', {})
    assertEquals(true, status >= 400)
  },
})

// 3. giftcards_cache table
Deno.test({
  name: 'market-purchase-gift-card: giftcards_cache accessible',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/giftcards_cache?select=id,provider,status&limit=0`, { headers: HEADERS })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// 4. redemptions table
Deno.test({
  name: 'market-purchase-gift-card: redemptions table accessible',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/redemptions?select=id,user_id,status,provider&limit=0`, { headers: HEADERS })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// 5. debit_market_balance RPC
Deno.test({
  name: 'market-purchase-gift-card: debit_market_balance RPC exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    // debit_market_balance takes p_user_id and p_amount
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/debit_market_balance`, {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000099', p_amount_usd: 0.01 }),
    })
    // Should exist (not 404) — may return an error for non-existent user which is fine
    assertEquals(true, res.status !== 404, 'debit_market_balance should exist')
    await res.text()
  },
})
