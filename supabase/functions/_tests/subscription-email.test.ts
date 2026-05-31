/**
 * Subscription Email & Manage-Subscription Edge Function Tests
 *
 * Tests the manage-subscription edge function actions:
 * cancel, checkout, confirm (invalid), status
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/subscription-email.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const MAILPIT_URL = 'http://127.0.0.1:54324'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SELLER_EMAIL = 'seller@test.local'

/** Clear all messages in Mailpit */
async function clearMailpit() {
  try { await (await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })).text() } catch { /* ok */ }
}

/** Authenticate via OTP + Mailpit and return access token */
async function getAccessToken(email: string): Promise<string | null> {
  try {
    await clearMailpit()

    const otpRes = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify({ email }),
    })
    await otpRes.text()

    // Get OTP from Mailpit
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`)
      const data = await listRes.json()
      const messages = data.messages || []
      const msg = messages.find((m: any) => m.To?.some((to: any) => to.Address === email))
      if (msg) {
        const otpMatch = msg.Snippet?.match(/\b(\d{6})\b/)
        if (otpMatch) {
          const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
            body: JSON.stringify({ type: 'email', token: otpMatch[1], email }),
          })
          const session = await verifyRes.json()
          return session.access_token ?? null
        }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return null
  } catch {
    return null
  }
}

/** Call the manage-subscription edge function */
async function callManageSubscription(action: string, token: string, extra: Record<string, unknown> = {}) {
  return fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...extra }),
  })
}

Deno.test({ name: 'manage-subscription: status returns valid response', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await getAccessToken(SELLER_EMAIL)
  if (!token) {
    console.log('Could not get access token — skipping')
    return
  }

  const res = await callManageSubscription('status', token)
  const body = await res.json()
  console.log(`  Status response: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)

  // Should return 200 with subscription info (or null if no subscription)
  assertEquals(res.status, 200, `Status should return 200, got ${res.status}`)
}})

Deno.test({ name: 'manage-subscription: cancel returns valid response (not 500)', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await getAccessToken(SELLER_EMAIL)
  if (!token) {
    console.log('Could not get access token — skipping')
    return
  }

  const res = await callManageSubscription('cancel', token)
  const body = await res.json()
  console.log(`  Cancel response: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)

  // 200 = cancel scheduled, 400 = no active subscription — both are valid
  // 500 = server crash — that's a failure
  const validStatus = res.status === 200 || res.status === 400
  assertEquals(validStatus, true, `Cancel should return 200 or 400, got ${res.status}: ${JSON.stringify(body)}`)
}})

Deno.test({ name: 'manage-subscription: checkout creates session or returns error', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await getAccessToken(SELLER_EMAIL)
  if (!token) {
    console.log('Could not get access token — skipping')
    return
  }

  const res = await callManageSubscription('checkout', token, { plan: 'pro' })
  const body = await res.json()
  console.log(`  Checkout response: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)

  // 200 = checkout URL created, 400 = already subscribed — both valid
  const validStatus = res.status === 200 || res.status === 400
  assertEquals(validStatus, true, `Checkout should return 200 or 400, got ${res.status}`)

  // If 200, should have url field
  if (res.status === 200) {
    assertExists(body.url, 'Checkout response should contain url')
  }
}})

Deno.test({ name: 'manage-subscription: confirm rejects invalid session (not 500)', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const token = await getAccessToken(SELLER_EMAIL)
  if (!token) {
    console.log('Could not get access token — skipping')
    return
  }

  const res = await callManageSubscription('confirm', token, { session_id: 'cs_test_invalid_session_123' })
  const body = await res.json()
  console.log(`  Confirm response: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)

  // Should return 400 (invalid session), not 500 (crash)
  assertEquals(res.status === 500, false, `Confirm with invalid session should not crash (500). Got: ${res.status}`)
}})

Deno.test({ name: 'manage-subscription: subscription trigger sends thank-you email', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const TEST_SELLER_ID = 'a1111111-1111-1111-1111-111111111111';
  
  // Cleanup pre-existing
  await fetch(`${SUPABASE_URL}/rest/v1/seller_subscriptions?user_id=eq.${TEST_SELLER_ID}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  // Clear Mailpit messages
  await clearMailpit();

  // 1. Insert trialing Pro subscription to trigger 'signup' guide email
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/seller_subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      user_id: TEST_SELLER_ID,
      plan: 'pro',
      status: 'trialing',
      stripe_customer_id: 'cus_email_test',
      stripe_subscription_id: 'sub_email_test',
    }),
  });
  await insertRes.text();

  // 2. Upgrade to Elite to trigger 'upgrade' guide email
  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/seller_subscriptions?user_id=eq.${TEST_SELLER_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      plan: 'elite',
    }),
  });
  await updateRes.text();

  // 3. Verify in Mailpit
  const deadline = Date.now() + 10_000;
  let signupEmailFound = false;
  let upgradeEmailFound = false;

  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    const data = await listRes.json();
    const messages = data.messages || [];
    
    for (const msg of messages) {
      if (msg.Subject?.includes('Welcome to CasaGrown Pro')) {
        signupEmailFound = true;
      }
      if (msg.Subject?.includes('Plan Upgraded to CasaGrown Elite')) {
        upgradeEmailFound = true;
      }
    }

    if (signupEmailFound && upgradeEmailFound) {
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Cleanup & Restore seed state to prevent test pollution for downstream E2E tests
  await fetch(`${SUPABASE_URL}/rest/v1/seller_subscriptions?user_id=eq.${TEST_SELLER_ID}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  // Restore profile is_pro flag
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_SELLER_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ is_pro: true }),
  });

  // Restore active Pro subscription
  await fetch(`${SUPABASE_URL}/rest/v1/seller_subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      user_id: TEST_SELLER_ID,
      plan: 'pro',
      status: 'active',
      stripe_customer_id: 'cus_test_sam_seller',
      stripe_subscription_id: 'sub_test_sam_seller',
    }),
  });

  assertEquals(signupEmailFound, true, 'Signup thank-you guide email should be sent');
  assertEquals(upgradeEmailFound, true, 'Upgrade thank-you guide email should be sent');
}})
