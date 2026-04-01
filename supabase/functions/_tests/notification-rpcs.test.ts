/**
 * Notification RPCs — Integration Tests
 *
 * Tests notification table creation, push notification edge function,
 * and market email sending.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/notification-rpcs.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_o0BQy4UlCDU'

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
}

async function createTestUser(suffix: string): Promise<{ id: string; token: string }> {
  const email = `notif-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return { id: data.user?.id, token: data.access_token }
}

// ============================================================================
// 1. Insert into notifications table
// ============================================================================
Deno.test({
  name: 'notifications: can insert and read notification',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('notif-read')

    // Insert notification with service role
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        user_id: user.id,
        content: 'Test notification content',
        link_url: '/market',
      }),
    })
    const inserted = await insertRes.json()
    const notif = Array.isArray(inserted) ? inserted[0] : inserted
    assertExists(notif.id)
    assertEquals(notif.content, 'Test notification content')
  },
})

// ============================================================================
// 2. Market notifications table
// ============================================================================
Deno.test({
  name: 'market_notifications: can insert market-specific notification',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('mkt-notif')

    const res = await fetch(`${SUPABASE_URL}/rest/v1/market_notifications`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        user_id: user.id,
        content: 'Your order has been accepted',
        link_url: '/orders/test',
      }),
    })
    const data = await res.json()
    const notif = Array.isArray(data) ? data[0] : data
    assertExists(notif.id)
    assertEquals(notif.content, 'Your order has been accepted')
  },
})

// ============================================================================
// 3. Send push notification edge function accepts valid payload
// ============================================================================
Deno.test({
  name: 'send-push-notification: returns OK for valid payload',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('push')

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        userIds: [user.id],
        title: 'Test Push',
        body: 'Test body',
        url: '/market',
        tag: 'test',
      }),
    })

    // Should return 200 even if no push tokens registered (no delivery, but no error)
    assertEquals(res.status, 200)
  },
})

// ============================================================================
// 4. Send market email edge function
// ============================================================================
Deno.test({
  name: 'send-market-email: returns 200 for valid email payload',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-market-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      }),
    })

    // Should return 200 (email may not actually send in dev, but function processes OK)
    assertEquals(res.status, 200)
  },
})

// ============================================================================
// 5. Push subscription table
// ============================================================================
Deno.test({
  name: 'push_subscriptions: can register push token',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('push-sub')

    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: user.id,
        token: `test-token-${Date.now()}`,
        platform: 'web',
      }),
    })
    const data = await res.json()
    const sub = Array.isArray(data) ? data[0] : data
    assertExists(sub.id)
  },
})
