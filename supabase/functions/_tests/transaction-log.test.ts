/**
 * transaction-log.test.ts — Regression test for get_transaction_log RPC
 *
 * Verifies that ALL transaction types (sales, purchases, redemptions,
 * incentive credits) appear correctly in the Activity feed.
 *
 * This test exists because 20260502103500_fix_payout_ui.sql accidentally
 * dropped the Purchases and CC Purchases UNION ALL blocks.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/transaction-log.test.ts
 */

import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const MAILPIT_URL = 'http://127.0.0.1:54324'

// Seeded users
const BUYER_ID  = 'b2222222-2222-2222-2222-222222222222'
const SELLER_ID = 'd4444444-4444-4444-4444-444444444444'
const BUYER_EMAIL  = 'buyer@test.local'
const SELLER_EMAIL = 'seller@test.local'

// ── Helpers ──

async function queryTable(table: string, filters = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  return res.json()
}

async function getOtpFromMailpit(email: string, timeoutMs = 10_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`)
    const data = await listRes.json()
    const messages = data.messages || []
    for (const msg of messages) {
      const to = msg.To?.[0]?.Address || ''
      if (to.toLowerCase() !== email.toLowerCase()) continue
      // Fetch individual message to get Text body
      const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)
      const msgData = await msgRes.json()
      const text = msgData.Text || ''
      const otpMatch = text.match(/\b(\d{6})\b/)
      if (otpMatch) return otpMatch[1]
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}

async function loginAs(email: string): Promise<string | null> {
  // Clear mailpit
  const delRes = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' }).catch(() => null)
  if (delRes) await delRes.text().catch(() => {})
  // Request OTP
  const otpRes = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email }),
  })
  await otpRes.text() // consume body
  // Wait a moment for email delivery
  await new Promise(r => setTimeout(r, 1000))
  const otp = await getOtpFromMailpit(email)
  if (!otp) return null
  // Verify
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ type: 'email', token: otp, email }),
  })
  const session = await verifyRes.json()
  return session.access_token ?? null
}

async function callRpc(name: string, body: unknown, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`RPC ${name} failed: ${res.status} ${JSON.stringify(data)}`)
  }
  return data
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

Deno.test({ name: 'get_transaction_log returns sale entries for seller', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await loginAs(SELLER_EMAIL)
  assertExists(token, 'Seller should be able to log in')
  const txLog = await callRpc('get_transaction_log', {}, token!)
  assert(Array.isArray(txLog), 'Transaction log should be an array')
  const sales = txLog.filter((tx: any) => tx.tx_type === 'sale')
  console.log(`[TX LOG] Seller has ${sales.length} sale entries, ${txLog.length} total`)
  assert(sales.length > 0, 'Seller should have at least 1 sale in transaction log')
}})

Deno.test({ name: 'get_transaction_log returns purchase entries for buyer (REGRESSION)', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await loginAs(BUYER_EMAIL)
  assertExists(token, 'Buyer should be able to log in')
  const txLog = await callRpc('get_transaction_log', {}, token!)
  assert(Array.isArray(txLog), 'Transaction log should be an array')
  const purchases = txLog.filter((tx: any) => tx.tx_type === 'purchase')
  console.log(`[TX LOG] Buyer has ${purchases.length} purchase entries, ${txLog.length} total`)
  assert(purchases.length > 0, 'REGRESSION: Buyer MUST have purchase entries in transaction log')
}})

Deno.test({ name: 'get_transaction_log purchase metadata has order_id and product_name', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await loginAs(BUYER_EMAIL)
  assertExists(token, 'Buyer should be able to log in')
  const txLog = await callRpc('get_transaction_log', {}, token!)
  const purchases = txLog.filter((tx: any) => tx.tx_type === 'purchase')
  if (purchases.length > 0) {
    const p = purchases[0]
    assertEquals(p.direction, 'debit', 'Purchase should be a debit')
    assertExists(p.metadata?.order_id, 'Purchase should have order_id in metadata')
    assertExists(p.metadata?.product_name, 'Purchase should have product_name in metadata')
    console.log(`[TX LOG] First purchase: ${p.description}, $${p.amount}`)
  }
}})

Deno.test({ name: 'get_transaction_log handles credit_received without errors', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await loginAs(BUYER_EMAIL)
  assertExists(token, 'Buyer should be able to log in')
  // The new user_incentives UNION ALL should not crash even if no incentives exist
  const txLog = await callRpc('get_transaction_log', {}, token!)
  assert(Array.isArray(txLog), 'Transaction log should handle incentive credits block')
  const credits = txLog.filter((tx: any) => tx.tx_type === 'credit_received')
  console.log(`[TX LOG] Buyer has ${credits.length} credit_received entries`)
}})

Deno.test({ name: 'get_transaction_summary returns correct structure', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await loginAs(SELLER_EMAIL)
  assertExists(token, 'Seller should be able to log in')
  const summary = await callRpc('get_transaction_summary', {}, token!)
  assertExists(summary, 'Summary should not be null')
  assert('total_sales' in summary, 'Summary should have total_sales')
  assert('available_usd' in summary, 'Summary should have available_usd')
  assert('unsettled_sales_usd' in summary, 'Summary should have unsettled_sales_usd')
  console.log(`[TX SUMMARY] Sales: $${summary.total_sales}, Available: $${summary.available_usd}`)
}})

Deno.test({ name: 'get_transaction_log date filtering works', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await loginAs(SELLER_EMAIL)
  assertExists(token, 'Seller should be able to log in')
  // Query with a far-future range that should return nothing
  const txLog = await callRpc('get_transaction_log', {
    p_start_date: '2099-01-01T00:00:00Z',
    p_end_date: '2099-12-31T23:59:59Z',
  }, token!)
  assert(Array.isArray(txLog), 'Should return array for empty range')
  assertEquals(txLog.length, 0, 'Future date range should return no results')
}})
