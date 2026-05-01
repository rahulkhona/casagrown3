/**
 * Cancel Redemption Flow — Integration Tests
 *
 * Tests cancel_redemption_with_refund RPC and trg_redemption_notify triggers.
 * Verifies refunds, point ledger, and multi-channel notifications.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/cancel-redemption.test.ts
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

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
}

async function rpc<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!text) return null as T
  try { return JSON.parse(text) as T } catch { return text as T }
}

async function restGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS })
  return res.json()
}

async function ensureUser(suffix: string): Promise<string> {
  const email = `cancel-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return data.user?.id
}

async function seedBalance(userId: string, available: number) {
  await fetch(`${SUPABASE_URL}/rest/v1/user_balances`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      available_usd: available,
      pending_usd: 0,
      total_earned_usd: available,
      total_spent_usd: 0,
      total_withdrawn_usd: 15.00, // Pre-withdrawn amount so we can test the refund math
    }),
  })
}

// ============================================================================
// 1. cancel_redemption_with_refund: Successful Refund Flow
// ============================================================================
Deno.test({
  name: 'cancel-redemption: refunds balance and logs notification',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureUser('refund')
    await seedBalance(userId, 50.00) // 50 available, 15 withdrawn

    // Insert a fake redemption
    const redemptionId = crypto.randomUUID()
    const pointCost = 1500 // $15.00

    // Create a fake redemption item first
    const itemId = crypto.randomUUID()
    const merchRes = await fetch(`${SUPABASE_URL}/rest/v1/redemption_merchandize`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        id: itemId,
        name: 'Test Cashout',
        type: 'gift_card',
        point_cost: 1500
      })
    })

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/redemptions`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        id: redemptionId,
        user_id: userId,
        point_cost: pointCost,
        status: 'queued',
        metadata: { test: true },
        item_id: itemId
      }),
    })

    const redData = await insertRes.json()
    // Removed fallback code

    const cancelReason = 'Admin rejected test payout'

    const result = await rpc<{ success: boolean; refunded_usd: number; new_balance_usd: number }>('cancel_redemption_with_refund', {
      p_redemption_id: redemptionId,
      p_reason: cancelReason,
    })

    console.log(result); assertExists(result)
    assertEquals(result.success, true)
    assertEquals(result.refunded_usd, 15.00)
    assertEquals(result.new_balance_usd, 65.00) // 50 + 15

    // Verify balance updated correctly in user_balances
    const data = await restGet('user_balances', `user_id=eq.${userId}`)
    const row = Array.isArray(data) ? data[0] : data
    assertEquals(Number(row.available_usd), 65.00)
    assertEquals(Number(row.total_withdrawn_usd), 0.00) // 15 - 15

    // Verify transaction log
    const ledger = await restGet('market_ledger', `user_id=eq.${userId}&order=id.desc&limit=1`)
    const entry = Array.isArray(ledger) ? ledger[0] : ledger
    assertExists(entry)
    assertEquals(entry.event_type, 'refund_issued')
    assertEquals(entry.direction, 'credit')
    assertEquals(Number(entry.amount_usd), 15.00)

    // Wait slightly for triggers to finish propagating to the notification tables
    await new Promise(r => setTimeout(r, 500))

    // Verify In-App Notification was generated with the reason
    const notifs = await restGet('market_notifications', `user_id=eq.${userId}&order=created_at.desc&limit=1`)
    const notif = Array.isArray(notifs) ? notifs[0] : notifs
    assertExists(notif)
    assertEquals(notif.content.includes(cancelReason), true)
    assertEquals(notif.content.includes('$15'), true)
  },
})

// ============================================================================
// 2. cancel_redemption_with_refund: Fails on non-queued
// ============================================================================
Deno.test({
  name: 'cancel-redemption: fails if status is completed',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureUser('refund-fail')
    await seedBalance(userId, 50.00)

    // Create a fake redemption item first
    const itemId = crypto.randomUUID()
    const merchRes2 = await fetch(`${SUPABASE_URL}/rest/v1/redemption_merchandize`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        id: itemId,
        name: 'Test Cashout 2',
        type: 'gift_card',
        point_cost: 1000
      })
    })

    const redemptionId = crypto.randomUUID()
    await fetch(`${SUPABASE_URL}/rest/v1/redemptions`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        id: redemptionId,
        user_id: userId,
        point_cost: 1000,
        status: 'completed', // Already completed
        item_id: itemId
      }),
    })

    const result = await rpc<{ success: boolean; error: string }>('cancel_redemption_with_refund', {
      p_redemption_id: redemptionId,
      p_reason: 'Too late',
    })

    console.log(result); assertExists(result)
    assertEquals(result.success, false)
    assertEquals(typeof result.error, 'string')
    assertEquals(result.error.includes('completed'), true)
  },
})
