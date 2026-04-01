/**
 * Phone OTP — Integration Tests
 *
 * Tests SMS verification edge functions and rate limiting.
 *
 * Run: cd supabase && deno test --allow-env --allow-net \
 *        functions/_tests/phone-otp.test.ts
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
  const email = `otp-${suffix}-${Date.now()}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  return { id: data.user?.id, token: data.access_token }
}

// ============================================================================
// 1. send-phone-otp: rejects missing phone number
// ============================================================================
Deno.test({
  name: 'phone-otp: send-phone-otp rejects missing phone',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('no-phone')

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-phone-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`,
      },
      body: JSON.stringify({}),
    })

    const data = await res.json()
    assertEquals(
      res.status >= 400 || data.error !== undefined,
      true,
      `Expected error for missing phone, got: ${JSON.stringify(data)}`,
    )
  },
})

// ============================================================================
// 2. verify-phone-otp: rejects wrong code
// ============================================================================
Deno.test({
  name: 'phone-otp: verify-phone-otp rejects invalid code',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('bad-code')

    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-phone-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.token}`,
      },
      body: JSON.stringify({ phone: '+15551234567', code: '000000' }),
    })

    const data = await res.json()
    assertEquals(
      res.status >= 400 || data.error !== undefined || data.verified === false,
      true,
      `Expected verification failure, got: ${JSON.stringify(data)}`,
    )
  },
})

// ============================================================================
// 3. SMS rate limits table — can insert rate limit log entry
// (schema: id, phone_number, user_id, ip_address, created_at)
// ============================================================================
Deno.test({
  name: 'phone-otp: sms_rate_limits table is accessible',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const user = await createTestUser('rate-limit')

    const res = await fetch(`${SUPABASE_URL}/rest/v1/sms_rate_limits`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        phone_number: '+15559998888',
        user_id: user.id,
        ip_address: '127.0.0.1',
      }),
    })

    const data = await res.json()
    const record = Array.isArray(data) ? data[0] : data
    assertExists(record.id, `Expected id in record, got: ${JSON.stringify(record).slice(0, 200)}`)
  },
})

// ============================================================================
// 4. SMS rate limits — multiple entries for rate limiting
// ============================================================================
Deno.test({
  name: 'phone-otp: can query rate limit count for a phone number',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const phone = `+1555${Date.now() % 10000000}`

    // Insert a rate limit entry
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/sms_rate_limits`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({ phone_number: phone }),
    })
    const insertData = await insertRes.json()
    const inserted = Array.isArray(insertData) ? insertData[0] : insertData
    assertExists(inserted.id, `Insert should return id`)

    // Query count
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_rate_limits?phone_number=eq.${encodeURIComponent(phone)}&select=id`,
      { headers: HEADERS },
    )
    const data = await res.json()
    assertEquals(Array.isArray(data), true)
    assertEquals(data.length >= 1, true, `Expected at least 1 entry for ${phone}`)
  },
})

// ============================================================================
// 5. send-phone-otp edge function exists and responds
// ============================================================================
Deno.test({
  name: 'phone-otp: send-phone-otp function responds (not 404)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-phone-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ phone: '+15551234567' }),
    })

    // Should not be 404 (function exists)
    assertEquals(res.status !== 404, true, `Function should exist, got status ${res.status}`)
  },
})
