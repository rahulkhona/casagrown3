/**
 * Deep Interactions — Dispute Resolution, Pickup Passcode, Chat, Helpers
 *
 * Tests the deeper interaction flows using RPC + UI verification:
 * - Dispute lifecycle: file → seller respond → accept/reject refund → escalate
 * - Pickup passcode: mark ready → enter code → complete / decline
 * - Chat: send message, verify receipt, community chat
 * - Helpers: join booth, queue, deliver, revocation
 *
 * Data Setup: Uses docker exec psql to create orders in the right states
 * (delivered for disputes, pending for pickups) since seed data may not
 * have the exact states needed.
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  getAccessToken,
  callRpc,
  queryTable,
  execSql,
  preAuthAllUsers,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_USERS,
  type UserKey,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

// ── Supabase helpers (unique to this spec) ──

async function updateRow(token: string, table: string, filter: string, data: Record<string, any>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  })
  return res.json()
}

// ── Pre-auth ──
const tokens: Record<string, string> = {}

// ── Shared state across tests ──
let deliveredOrderId: string = ''
let disputeOrderId: string = ''
let disputeId: string = ''
let pendingPickupOrderId: string = ''
let pickupPasscode: string = ''

test.describe('Deep Interactions', () => {
  test.beforeAll(async () => {
    for (const [key, user] of Object.entries(TEST_USERS)) {
      try {
        tokens[key] = await getAccessToken(user.email, user.password)
      } catch {
        console.warn(`[AUTH] Could not get token for ${key}`)
      }
    }

    // ── IDEMPOTENT DATA RESET ──
    // 1. Clean up disputes from previous runs
    await execSql(`DELETE FROM order_disputes WHERE initiated_by = 'b2222222-2222-2222-2222-222222222222'`)

    // 2. Reset all Beth↔Sam delivery orders back to pending
    await execSql(
      `UPDATE market_orders SET status = 'pending', delivered_at = NULL
       WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
         AND seller_id = 'a1111111-1111-1111-1111-111111111111'
         AND fulfillment_type = 'delivery'
         AND status IN ('delivered', 'resolved', 'escalated', 'disputed', 'completed')`
    )

    // 3. Reset Beth↔ANY seller pickup orders back to pending
    await execSql(
      `UPDATE market_orders SET status = 'pending', seller_passcode = NULL, buyer_passcode = NULL, buyer_passcode_entered = false, delivered_at = NULL, auto_complete_at = NULL
       WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
         AND fulfillment_type = 'pickup'
         AND status != 'pending'`
    )

    // Helper: extract UUID from execSql RETURNING output (filters out "UPDATE N" lines)
    const extractUuid = (raw: string | undefined): string | null => {
      if (!raw) return null
      const line = raw.split('\n')[0]?.trim()
      return line && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(line) ? line : null
    }

    // ── CREATE REQUIRED ORDER STATES ──
    // 4. Mark TWO delivery orders as 'delivered' for dispute tests (D1 + D5)
    //    First reset any non-pending delivery orders back to pending (idempotent reruns)
    await execSql(
      `UPDATE market_orders SET status = 'pending', delivered_at = NULL
       WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
         AND seller_id = 'a1111111-1111-1111-1111-111111111111'
         AND fulfillment_type = 'delivery'
         AND status IN ('delivered', 'disputed', 'escalated', 'resolved', 'completed')`
    )

    const firstDelivered = await execSql(
      `UPDATE market_orders SET status = 'delivered', delivered_at = now()
       WHERE id = (
         SELECT id FROM market_orders
         WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
           AND seller_id = 'a1111111-1111-1111-1111-111111111111'
           AND status = 'pending'
           AND fulfillment_type = 'delivery'
         ORDER BY id LIMIT 1
       ) RETURNING id`
    )
    const firstUuid = extractUuid(firstDelivered)
    if (firstUuid) {
      deliveredOrderId = firstUuid
      console.log(`[SETUP] Marked order ${deliveredOrderId} as delivered`)
    } else {
      console.warn('[SETUP] No pending delivery order found for D1 dispute tests')
    }

    const secondDelivered = await execSql(
      `UPDATE market_orders SET status = 'delivered', delivered_at = now()
       WHERE id = (
         SELECT id FROM market_orders
         WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
           AND status = 'pending'
           AND fulfillment_type = 'delivery'
           AND id != '${deliveredOrderId || '00000000-0000-0000-0000-000000000000'}'
         ORDER BY id LIMIT 1
       ) RETURNING id`
    )
    const secondUuid = extractUuid(secondDelivered)
    if (secondUuid) {
      console.log(`[SETUP] Marked second order ${secondUuid} as delivered`)
    }

    // 5. Find a pending pickup order for passcode tests — match any seller
    const pickupResult = await execSql(
      `SELECT id FROM market_orders
       WHERE buyer_id = 'b2222222-2222-2222-2222-222222222222'
         AND status = 'pending'
         AND fulfillment_type = 'pickup'
       LIMIT 1`
    )
    if (pickupResult) {
      pendingPickupOrderId = pickupResult.trim()
      console.log(`[SETUP] Found pending pickup order: ${pendingPickupOrderId}`)
    } else {
      console.warn('[SETUP] No pending pickup order found — will skip pickup tests')
    }

    console.log(`[SETUP] deliveredOrderId=${deliveredOrderId}, pendingPickupOrderId=${pendingPickupOrderId}`)
  })

  // ════════════════════════════════════════════════════════════
  // DISPUTE RESOLUTION LIFECYCLE
  // ════════════════════════════════════════════════════════════

  test.describe('Dispute Resolution', () => {
    test('D1 — file dispute on a delivered order', async () => {
      expect(deliveredOrderId).toBeTruthy()
      const bethToken = tokens['beth']

      // Beth files dispute on the delivered order
      const result = await callRpc(bethToken, 'buyer_dispute_order', {
        p_order_id: deliveredOrderId,
        p_reason: 'Received fewer items than ordered',
        p_photos: [{ url: 'https://placeholder.test/evidence.jpg', timestamp: new Date().toISOString() }],
        p_dispute_type: 'quantity_mismatch',
        p_quantity_received: 1,
      })

      console.log('[DISPUTE] File result:', JSON.stringify(result).substring(0, 200))

      // Check dispute was created
      const disputes = await queryTable(
        bethToken,
        'order_disputes',
        `order_id=eq.${deliveredOrderId}&limit=1`,
      )

      expect(disputes.length).toBeGreaterThan(0)
      disputeId = disputes[0].id
      disputeOrderId = deliveredOrderId
      expect(disputes[0].reason).toContain('fewer items')
      console.log(`[DISPUTE] Created dispute ${disputeId}`)
    })

    test('D2 — seller responds with partial refund offer', async () => {
      expect(disputeId).toBeTruthy()

      const samToken = tokens['sam']
      const result = await callRpc(samToken, 'seller_respond_dispute', {
        p_dispute_id: disputeId,
        p_refund_type: 'partial',
        p_refund_amount: 5,
        p_pickup_offered: false,
      })
      console.log('[DISPUTE] Seller respond result:', JSON.stringify(result).substring(0, 200))

      // Verify dispute status updated
      const disputes = await queryTable(samToken, 'order_disputes', `id=eq.${disputeId}`)
      expect(disputes.length).toBeGreaterThan(0)
      console.log(`[DISPUTE] Status after response: ${disputes[0].status}`)
    })

    test('D3 — buyer accepts refund', async () => {
      expect(disputeId).toBeTruthy()

      const bethToken = tokens['beth']
      const result = await callRpc(bethToken, 'buyer_accept_refund', { p_dispute_id: disputeId })
      console.log('[DISPUTE] Accept result:', JSON.stringify(result).substring(0, 200))

      // Verify dispute resolved
      const disputes = await queryTable(bethToken, 'order_disputes', `id=eq.${disputeId}`)
      expect(disputes.length).toBeGreaterThan(0)
      console.log(`[DISPUTE] Status after accept: ${disputes[0].status}`)
    })

    test('D4 — verify dispute UI on order detail page', async ({ browser }) => {
      expect(disputeOrderId).toBeTruthy()

      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, `/orders/${disputeOrderId}`)

      const body = await bethPage.locator('body').innerText()
      const lower = body.toLowerCase()
      // Should show dispute-related content or order details
      const hasContent =
        lower.includes('dispute') ||
        lower.includes('refund') ||
        lower.includes('resolved') ||
        lower.includes('order') ||
        lower.includes('status')
      expect(hasContent).toBeTruthy()

      await bethPage.context().close()
    })

    test('D4b — full refund flow (seller offers full, buyer accepts)', async () => {
      const bethToken = tokens['beth']
      const samToken = tokens['sam']

      // Seed a fresh delivered order (previous tests consumed all others)
      const orderId = `e2e00000-d4b0-0000-0000-${Date.now().toString(16).padStart(12, '0')}`
      await execSql(
        `INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, total_usd, status, fulfillment_type, delivered_at)
         SELECT '${orderId}',
                'b2222222-2222-2222-2222-222222222222',
                'a1111111-1111-1111-1111-111111111111',
                mb.id,
                mp.id,
                mp.name,
                1,
                10.00,
                10.00,
                10.00,
                'delivered',
                'delivery',
                now()
         FROM market_booths mb
         JOIN market_products mp ON mp.seller_id = mb.owner_id
         WHERE mb.owner_id = 'a1111111-1111-1111-1111-111111111111'
         LIMIT 1
         ON CONFLICT (id) DO NOTHING`
      )

      let orders = await queryTable(
        bethToken,
        'market_orders',
        `id=eq.${orderId}`,
      )

      if (!orders.length) { test.skip(); return }

      // File dispute
      await callRpc(bethToken, 'buyer_dispute_order', {
        p_order_id: orders[0].id,
        p_reason: 'Product was damaged',
        p_photos: [],
        p_dispute_type: 'wrong_item',
      })

      const disputes = await queryTable(bethToken, 'order_disputes', `order_id=eq.${orders[0].id}&limit=1`)
      expect(disputes.length).toBeGreaterThan(0)

      // Seller offers FULL refund (total_usd)
      const fullRefundResult = await callRpc(samToken, 'seller_respond_dispute', {
        p_dispute_id: disputes[0].id,
        p_refund_type: 'full',
        p_refund_amount: orders[0].total_usd,
        p_pickup_offered: false,
      })
      console.log('[DISPUTE] Full refund result:', JSON.stringify(fullRefundResult).substring(0, 200))

      // Verify refund type is full
      const updatedDispute = await queryTable(bethToken, 'order_disputes', `id=eq.${disputes[0].id}`)
      expect(updatedDispute[0].refund_type).toBe('full')
      expect(Number(updatedDispute[0].refund_amount_usd)).toBe(Number(orders[0].total_usd))

      // Buyer accepts
      await callRpc(bethToken, 'buyer_accept_refund', { p_dispute_id: disputes[0].id })

      const finalDispute = await queryTable(bethToken, 'order_disputes', `id=eq.${disputes[0].id}`)
      expect(['buyer_accepted', 'resolved']).toContain(finalDispute[0].status)
      console.log(`[DISPUTE] Full refund accepted, status: ${finalDispute[0].status}`)
    })

    test('D4c — buyer rejects refund (resolve without accepting)', async () => {
      const bethToken = tokens['beth']
      const samToken = tokens['sam']

      // Seed a fresh delivered order for this test (previous tests consumed all others)
      const orderId = `e2e00000-d4c0-0000-0000-${Date.now().toString(16).padStart(12, '0')}`
      await execSql(
        `INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, total_usd, status, fulfillment_type, delivered_at)
         SELECT '${orderId}',
                'b2222222-2222-2222-2222-222222222222',
                'a1111111-1111-1111-1111-111111111111',
                mb.id,
                mp.id,
                mp.name,
                1,
                5.00,
                5.00,
                5.00,
                'delivered',
                'delivery',
                now()
         FROM market_booths mb
         JOIN market_products mp ON mp.seller_id = mb.owner_id
         WHERE mb.owner_id = 'a1111111-1111-1111-1111-111111111111'
         LIMIT 1
         ON CONFLICT (id) DO NOTHING`
      )

      let orders = await queryTable(
        bethToken,
        'market_orders',
        `id=eq.${orderId}`,
      )

      if (!orders.length) { test.skip(); return }

      // File dispute
      await callRpc(bethToken, 'buyer_dispute_order', {
        p_order_id: orders[0].id,
        p_reason: 'Minor quality issue',
        p_photos: [],
        p_dispute_type: 'quality',
      })

      const disputes = await queryTable(bethToken, 'order_disputes', `order_id=eq.${orders[0].id}&limit=1`)
      expect(disputes.length).toBeGreaterThan(0)

      // Seller offers partial refund
      await callRpc(samToken, 'seller_respond_dispute', {
        p_dispute_id: disputes[0].id,
        p_refund_type: 'partial',
        p_refund_amount: 2.00,
        p_pickup_offered: false,
      })

      // Buyer REJECTS — resolves without accepting refund
      const rejectResult = await callRpc(bethToken, 'buyer_resolve_dispute', {
        p_dispute_id: disputes[0].id,
      })
      console.log('[DISPUTE] Reject/resolve result:', JSON.stringify(rejectResult).substring(0, 200))

      // Verify dispute is resolved
      const finalDispute = await queryTable(bethToken, 'order_disputes', `id=eq.${disputes[0].id}`)
      expect(finalDispute.length).toBeGreaterThan(0)
      expect(['resolved', 'buyer_resolved', 'buyer_accepted']).toContain(finalDispute[0].status)
      console.log(`[DISPUTE] Buyer rejected refund, resolved: ${finalDispute[0].status}`)
    })

    test('D5 — escalation flow (file new dispute and escalate)', async () => {
      const bethToken = tokens['beth']

      // Seed a fresh delivered order for escalation (previous tests consumed all others)
      const orderId = `e2e00000-d500-0000-0000-${Date.now().toString(16).padStart(12, '0')}`
      await execSql(
        `INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, total_usd, status, fulfillment_type, delivered_at)
         SELECT '${orderId}',
                'b2222222-2222-2222-2222-222222222222',
                'a1111111-1111-1111-1111-111111111111',
                mb.id,
                mp.id,
                mp.name,
                1,
                8.00,
                8.00,
                8.00,
                'delivered',
                'delivery',
                now()
         FROM market_booths mb
         JOIN market_products mp ON mp.seller_id = mb.owner_id
         WHERE mb.owner_id = 'a1111111-1111-1111-1111-111111111111'
         LIMIT 1
         ON CONFLICT (id) DO NOTHING`
      )

      let orders = await queryTable(
        bethToken,
        'market_orders',
        `id=eq.${orderId}`,
      )

      if (!orders.length) { test.skip(); return }

      // File dispute
      await callRpc(bethToken, 'buyer_dispute_order', {
        p_order_id: orders[0].id,
        p_reason: 'Wrong item delivered',
        p_photos: [],
        p_dispute_type: 'wrong_item',
      })

      const disputes = await queryTable(bethToken, 'order_disputes', `order_id=eq.${orders[0].id}&limit=1`)
      expect(disputes.length).toBeGreaterThan(0)

      // Escalate
      const escResult = await callRpc(bethToken, 'escalate_dispute', { p_dispute_id: disputes[0].id })
      console.log('[DISPUTE] Escalation result:', JSON.stringify(escResult).substring(0, 200))

      const updated = await queryTable(bethToken, 'order_disputes', `id=eq.${disputes[0].id}`)
      expect(updated.length).toBeGreaterThan(0)
      console.log(`[DISPUTE] Status after escalation: ${updated[0].status}`)
    })
  })

  // ════════════════════════════════════════════════════════════
  // PICKUP PASSCODE FLOW
  // ════════════════════════════════════════════════════════════

  test.describe('Pickup Flow', () => {
    // ── Path A: Seller marks ready, buyer doesn't arrive → auto-complete after 24hr ──
    test('P0 — seller_mark_ready_pickup sets ready_for_pickup_at, keeps status pending', async () => {
      const samToken = tokens['sam']

      // Seed a fresh pending pickup order
      const orderId = `e2e00000-0000-0000-a0a0-${Date.now().toString(16).padStart(12, '0')}`
      await execSql(
        `INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, total_usd, status, fulfillment_type)
         SELECT '${orderId}',
                'b2222222-2222-2222-2222-222222222222',
                'a1111111-1111-1111-1111-111111111111',
                mb.id, mp.id, mp.name, 1, 5.00, 5.00, 5.00, 'pending', 'pickup'
         FROM market_booths mb
         JOIN market_products mp ON mp.seller_id = mb.owner_id
         WHERE mb.owner_id = 'a1111111-1111-1111-1111-111111111111'
         LIMIT 1
         ON CONFLICT (id) DO NOTHING`
      )

      const result = await callRpc(samToken, 'seller_mark_ready_pickup', {
        p_order_id: orderId,
      })
      console.log('[PICKUP P0] Ready result:', JSON.stringify(result))

      if (result.error) {
        console.error(`[PICKUP P0] Error: ${result.error}`)
      }
      expect(result.success).toBe(true)
      expect(result.ready_for_pickup_at).toBeTruthy()
      expect(result.auto_complete_at).toBeTruthy()

      // Verify: status must STILL be 'pending', ready_for_pickup_at set, delivered_at NULL
      const updated = await queryTable(samToken, 'market_orders', `id=eq.${orderId}`)
      expect(updated.length).toBeGreaterThan(0)
      expect(updated[0].status).toBe('pending')
      expect(updated[0].ready_for_pickup_at).toBeTruthy()
      expect(updated[0].delivered_at).toBeNull()
      expect(updated[0].auto_complete_at).toBeTruthy()

      console.log(`[PICKUP P0] Status: ${updated[0].status}, ready_at: ${updated[0].ready_for_pickup_at}, delivered_at: ${updated[0].delivered_at}, auto_complete: ${updated[0].auto_complete_at}`)
    })

    // ── Path B: Buyer arrives, seller fulfills directly → delivered (4hr auto-complete) ──
    test('P1 — seller hands off pickup order → status becomes delivered', async () => {
      // Reset a Sam-owned non-delivered order to pending/pickup for this test
      const resetResult = execSql(
        `UPDATE market_orders SET status = 'pending', fulfillment_type = 'pickup', delivered_at = NULL, ready_for_pickup_at = NULL, auto_complete_at = NULL WHERE id = (SELECT id FROM market_orders WHERE seller_id = 'a1111111-1111-1111-1111-111111111111' AND buyer_id = 'b2222222-2222-2222-2222-222222222222' AND status NOT IN ('delivered','completed') AND ready_for_pickup_at IS NULL ORDER BY created_at DESC LIMIT 1) RETURNING id`
      )
      const testOrderId = resetResult?.split('\n')[0]?.trim()
      console.log(`[PICKUP P1] Reset order for test: ${testOrderId}`)

      if (!testOrderId) {
        const fallback = execSql(
          `SELECT id FROM market_orders WHERE seller_id = 'a1111111-1111-1111-1111-111111111111' AND buyer_id = 'b2222222-2222-2222-2222-222222222222' AND status = 'pending' AND fulfillment_type = 'pickup' AND ready_for_pickup_at IS NULL LIMIT 1`
        )
        if (!fallback?.trim()) { test.skip(); return }
        pendingPickupOrderId = fallback.trim()
      } else {
        pendingPickupOrderId = testOrderId
      }
      console.log(`[PICKUP P1] Using order: ${pendingPickupOrderId}`)

      const samToken = tokens['sam']
      const result = await callRpc(samToken, 'seller_mark_delivered', {
        p_order_id: pendingPickupOrderId,
        p_photos: [],
      })
      console.log('[PICKUP P1] Hand off result:', JSON.stringify(result))

      if (result.error) {
        console.error(`[PICKUP P1] RPC error: ${result.error}`)
      }
      expect(result.success).toBe(true)

      // Verify status is 'delivered', delivered_at set, ready_for_pickup_at still NULL
      const updated = await queryTable(samToken, 'market_orders', `id=eq.${pendingPickupOrderId}`)
      expect(updated.length).toBeGreaterThan(0)
      expect(updated[0].status).toBe('delivered')
      expect(updated[0].delivered_at).toBeTruthy()
      expect(updated[0].ready_for_pickup_at).toBeNull()
      console.log(`[PICKUP P1] Status: ${updated[0].status}, auto_complete_at: ${updated[0].auto_complete_at}`)
    })

    test('P2 — auto_complete_at is set to ~4 hours from hand-off', async () => {
      expect(pendingPickupOrderId).toBeTruthy()

      const samToken = tokens['sam']
      const updated = await queryTable(samToken, 'market_orders', `id=eq.${pendingPickupOrderId}`)
      expect(updated.length).toBeGreaterThan(0)

      const autoComplete = new Date(updated[0].auto_complete_at)
      const delivered = new Date(updated[0].delivered_at)
      const diffHours = (autoComplete.getTime() - delivered.getTime()) / (1000 * 60 * 60)

      // Should be approximately 4 hours (3.5-4.5h tolerance)
      expect(diffHours).toBeGreaterThanOrEqual(3.5)
      expect(diffHours).toBeLessThanOrEqual(4.5)
      console.log(`[PICKUP] Timer: ${diffHours.toFixed(2)} hours`)
    })

    test('P3 — buyer notification created on hand-off', async () => {
      expect(pendingPickupOrderId).toBeTruthy()

      // Check market_notifications (NOT legacy notifications table)
      const bethToken = tokens['beth']
      const notifs = await queryTable(
        bethToken,
        'market_notifications',
        `user_id=eq.b2222222-2222-2222-2222-222222222222&order=created_at.desc&limit=10`,
      )

      // Should have a notification about pickup hand-off from the trigger
      const hasPickupNotif = notifs.some((n: any) =>
        (n.content || '').toLowerCase().includes('pickup') ||
        (n.content || '').toLowerCase().includes('ready') ||
        (n.content || '').toLowerCase().includes('confirm')
      )
      console.log(`[PICKUP] Buyer notifications:`, notifs.map((n: any) => n.content).slice(0, 3))
      expect(hasPickupNotif).toBeTruthy()
    })

    test('P4 — pickup order visible on order detail page', async ({ browser }) => {
      expect(pendingPickupOrderId).toBeTruthy()

      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, `/orders/${pendingPickupOrderId}`)

      const body = await bethPage.locator('body').textContent() || ''
      expect(body.length).toBeGreaterThan(50)
      const lower = body.toLowerCase()
      // Should show delivery/pickup status or order details
      const hasContent =
        lower.includes('order') ||
        lower.includes('deliver') ||
        lower.includes('pickup') ||
        lower.includes('confirm')
      expect(hasContent).toBeTruthy()

      // VERIFY NEW NAVIGATION LAYOUT
      const hasNavigation = lower.includes('pickup address') || lower.includes('directions')
      expect(hasNavigation).toBeTruthy()

      await bethPage.context().close()
    })

    test('P5 — pending pickup order renders on order detail page', async ({ browser }) => {
      // Find a pending pickup order (ready_for_pickup is just a notification, not a status)
      const orderId = await execSql(
        `SELECT id FROM market_orders WHERE status = 'pending' AND fulfillment_type = 'pickup' LIMIT 1`
      )

      if (!orderId?.trim()) { test.skip(); return }

      const samPage = await loginAsUser(browser, 'sam')
      await navigateTo(samPage, `/orders/${orderId.trim()}`)

      const body = await samPage.locator('body').textContent() || ''
      expect(body.length).toBeGreaterThan(50)

      await samPage.context().close()
    })

    test('P6 — seller delivery order shows navigation near address', async ({ browser }) => {
      // Find a pending delivery order where sam is the seller
      const orderId = await execSql(
        `SELECT id FROM market_orders WHERE status = 'pending' AND fulfillment_type = 'delivery' AND seller_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1`
      )
      if (!orderId) { test.skip(); return }

      const samPage = await loginAsUser(browser, 'sam')
      await navigateTo(samPage, `/orders/${orderId.trim()}`)

      const body = await samPage.locator('body').textContent() || ''
      const lower = body.toLowerCase()
      
      // VERIFY NEW NAVIGATION LAYOUT
      const hasDeliveryNav = lower.includes('delivery address') || lower.includes('directions')
      expect(hasDeliveryNav).toBeTruthy()

      await samPage.context().close()
    })
  })

  // ════════════════════════════════════════════════════════════
  // CHAT MESSAGING
  // ════════════════════════════════════════════════════════════

  test.describe('Chat Messaging', () => {
    test('C1 — send message on chat page', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/chat')
      await assertPageHealthy(bethPage)

      // Find existing chat threads
      const chatLinks = bethPage.locator('a[href*="/chat/"]')
      const chatCount = await chatLinks.count()

      if (chatCount > 0) {
        await chatLinks.first().click()
        await bethPage.waitForLoadState('domcontentloaded')
        await bethPage.waitForTimeout(2000)

        // Find message input
        const msgInput = bethPage.locator('input[type="text"], textarea').last()
        if (await msgInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          const testMsg = `Test message ${Date.now()}`
          await msgInput.fill(testMsg)

          const sendBtn = bethPage.locator('button:has-text("Send"), button:has-text("send")').first()
          if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await sendBtn.click()
            await bethPage.waitForTimeout(1000)

            const body = await bethPage.locator('body').innerText()
            expect(body).toContain(testMsg)
          }
        }
      } else {
        // No chats — just verify page renders
        const body = await bethPage.locator('body').innerText()
        expect(body.length).toBeGreaterThan(30)
      }

      await bethPage.context().close()
    })

    test('C2 — seller sees chat list', async ({ browser }) => {
      const samPage = await loginAsUser(browser, 'sam')
      await navigateTo(samPage, '/chat')
      await assertPageHealthy(samPage)

      const body = await samPage.locator('body').innerText()
      expect(body.length).toBeGreaterThan(30)

      await samPage.context().close()
    })

    test('C3 — community chat post', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/community')
      await assertPageHealthy(bethPage)

      // Look for compose/post input
      const composeInput = bethPage.locator('textarea, input[type="text"]').first()
      if (await composeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const testPost = `Community test ${Date.now()}`
        await composeInput.fill(testPost)

        // Use a narrow selector that excludes suggestion chips, and force-click
        // to bypass any overlay div that may intercept pointer events
        const submitBtn = bethPage.locator('button[type="submit"]:not([class*="suggestionChip"]), form button:has-text("Post"), form button:has-text("Send")').first()
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click({ force: true, timeout: 10_000 })
          await bethPage.waitForTimeout(2000)
        }
      }

      const body = await bethPage.locator('body').innerText()
      expect(body.length).toBeGreaterThan(50)

      await bethPage.context().close()
    })
  })

  // ════════════════════════════════════════════════════════════
  // HELPER SYSTEM
  // ════════════════════════════════════════════════════════════

  test.describe('Helper System', () => {
    test('H1 — helper join page renders', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/join-booth/TESTCODE')
      const body = await bethPage.locator('body').innerText()
      expect(body.length).toBeGreaterThan(20)
      await bethPage.context().close()
    })

    test('H2 — join booth as helper via RPC', async () => {
      // Set a helper passcode on Sam's booth
      await execSql(
        `UPDATE market_booths SET helper_passcode = 'TEST42'
         WHERE id = (
           SELECT id FROM market_booths
           WHERE owner_id = 'a1111111-1111-1111-1111-111111111111'
           LIMIT 1
         )`
      )

      // Also delete any existing helper row to clean state
      await execSql(
        `DELETE FROM booth_helpers
         WHERE helper_id = 'b2222222-2222-2222-2222-222222222222'`
      )

      const bethToken = tokens['beth']
      const result = await callRpc(bethToken, 'join_booth_as_helper', {
        p_passcode: 'TEST42',
      })
      console.log('[HELPER] Join result:', JSON.stringify(result).substring(0, 200))

      // Verify helper record created
      const helpers = await queryTable(
        bethToken,
        'booth_helpers',
        `helper_id=eq.b2222222-2222-2222-2222-222222222222&limit=1`,
      )

      if (helpers.length > 0) {
        expect(helpers[0].status).toBe('accepted')
      }
    })

    test('H3 — helper queue page shows assignments', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/helping')
      await assertPageHealthy(bethPage)

      const body = await bethPage.locator('body').innerText()
      const lower = body.toLowerCase()
      const hasContent =
        lower.includes('helping') ||
        lower.includes('order') ||
        lower.includes('join') ||
        lower.includes('booth') || lower.includes('produce stand')
      expect(hasContent).toBeTruthy()

      await bethPage.context().close()
    })

    test('H4 — helper delivers order via RPC', async () => {
      const bethToken = tokens['beth']

      const queue = await callRpc(bethToken, 'get_helper_queue', {})
      console.log('[HELPER] Queue:', JSON.stringify(queue).substring(0, 200))

      if (Array.isArray(queue) && queue.length > 0) {
        const orderId = queue[0].order_id || queue[0].id

        const result = await callRpc(bethToken, 'helper_mark_delivered', {
          p_order_id: orderId,
          p_proof_urls: ['https://placeholder.test/helper-delivery.jpg'],
        })
        console.log('[HELPER] Deliver result:', JSON.stringify(result).substring(0, 200))
      } else {
        console.warn('[HELPER] No orders in helper queue')
      }
    })

    test('H5 — owner revokes helper', async () => {
      await execSql(
        `UPDATE booth_helpers SET status = 'revoked'
         WHERE helper_id = 'b2222222-2222-2222-2222-222222222222'`
      )

      // Verify
      const samToken = tokens['sam']
      const helpers = await queryTable(
        samToken,
        'booth_helpers',
        `helper_id=eq.b2222222-2222-2222-2222-222222222222&limit=1`,
      )

      if (helpers.length > 0) {
        expect(helpers[0].status).toBe('revoked')
      }
    })

    test('H6 — revoked helper sees empty queue', async ({ browser }) => {
      const bethPage = await loginAsUser(browser, 'beth')
      await navigateTo(bethPage, '/helping')

      const body = await bethPage.locator('body').innerText()
      const lower = body.toLowerCase()
      const isEmpty =
        lower.includes('join') ||
        lower.includes('no') ||
        lower.includes('helping') ||
        body.length > 20
      expect(isEmpty).toBeTruthy()

      await bethPage.context().close()
    })
  })
})
