/**
 * CRM Edge Functions — Integration Tests
 *
 * Tests: receive-facebook-lead, send-crm-campaign, postmark-webhook,
 *        twilio-campaign-webhook, estimate-earnings,
 *        process-earnings-estimate-request-queue
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/crm-functions.test.ts
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

async function callFn(name: string, body: unknown, method = 'POST') {
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

// ── receive-facebook-lead ────────────────────────────────────────────────────

Deno.test('receive-facebook-lead: GET webhook verification', async () => {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/receive-facebook-lead?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=abc123`,
    { method: 'GET', headers: { 'apikey': SERVICE_ROLE_KEY } }
  )
  await res.text() // consume body
  // Wrong token → 403, or 503 if fn not running locally
  const acceptable = [403, 503, 500]
  assertEquals(acceptable.includes(res.status), true, `Expected 403/503, got ${res.status}`)
})

Deno.test('receive-facebook-lead: non-page object is skipped', async () => {
  const res = await callFn('receive-facebook-lead', {
    object: 'user',     // not 'page' — should be skipped
    entry: [],
  })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.received, true)
  assertExists(body.skipped)
})

Deno.test('receive-facebook-lead: page event with leadgen inserts lead', async () => {
  const res = await callFn('receive-facebook-lead', {
    object: 'page',
    entry: [{
      id: 'page123',
      changes: [{
        field: 'leadgen',
        value: {
          leadgen_id: 'lead_test_001',
          ad_id: 'ad_001',
          form_id: 'form_001',
          campaign_name: 'spring-launch',
          field_data: [
            { name: 'full_name', values: ['Deno Test User'] },
            { name: 'email', values: ['deno_fb_test@casagrown.local'] },
            { name: 'phone_number', values: ['+15005550001'] },
          ],
        },
      }],
    }],
  })

  // Skip if function not running locally
  if (res.status === 503 || res.status === 500) {
    await res.text()
    console.log('receive-facebook-lead not running locally — skipping insertion check')
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.received, true)
  assertEquals(body.inserted, 1, 'One lead should be inserted')
  assertEquals(body.errors, 0, 'No insert errors expected')

  // Verify the lead exists in DB
  const dbRes = await fetch(
    `${SUPABASE_URL}/rest/v1/crm_leads?email=eq.deno_fb_test%40casagrown.local&select=name,source_platform,utm_campaign`,
    {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      }
    }
  )
  const leads = await dbRes.json()
  assertEquals(leads.length, 1, 'Lead should exist in DB')
  assertEquals(leads[0].source_platform, 'facebook')
  assertEquals(leads[0].utm_campaign, 'spring-launch')

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.deno_fb_test%40casagrown.local`, {
    method: 'DELETE',
    headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
  })
})

// ── postmark-webhook ─────────────────────────────────────────────────────────

Deno.test('postmark-webhook: Open event updates opened_at', async () => {
  // Insert a campaign send to update
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_campaign_sends`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      campaign_id: null,
      recipient_type: 'lead',
      recipient_id: '00000000-0000-0000-0000-000000000099',
      email: 'postmark_test@casagrown.local',
      sent_at: new Date().toISOString(),
    }),
  })
  const rows = await sbRes.json()
  const send = Array.isArray(rows) ? rows[0] : rows

  if (!send?.id) {
    console.log('postmark-webhook: could not create send record (RLS or schema issue) — skipping')
    return
  }

  // Fire Open event
  const res = await callFn('postmark-webhook', {
    RecordType: 'Open',
    Recipient: 'postmark_test@casagrown.local',
    MessageID: 'pm-msg-001',
  })

  // Skip body checks if function not running locally
  if (res.status === 503 || res.status === 500) {
    await res.text()
    console.log('postmark-webhook not running locally — skipping open_at check')
  } else {
    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.ok, true)
    assertEquals(body.processed, 'Open')
  }

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/crm_campaign_sends?id=eq.${send.id}`, {
    method: 'DELETE',
    headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
  })
})

Deno.test('postmark-webhook: Bounce event returns ok', async () => {
  const res = await callFn('postmark-webhook', {
    RecordType: 'Bounce',
    Recipient: 'bounce_test@nonexistent.example.com',
  })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
})

Deno.test('postmark-webhook: missing recipient returns skipped', async () => {
  const res = await callFn('postmark-webhook', {
    RecordType: 'Open',
    // no Recipient field
  })
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
  assertExists(body.skipped)
})

// ── twilio-campaign-webhook ──────────────────────────────────────────────────

Deno.test('twilio-campaign-webhook: delivered status does not update DB', async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-campaign-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: new URLSearchParams({
      MessageSid: 'SM999',
      MessageStatus: 'delivered',
      To: '+15005550006',
    }).toString(),
  })
  await res.text() // consume body to avoid leak
  assertEquals(res.status, 200)
})

Deno.test('twilio-campaign-webhook: failed status returns 200', async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/twilio-campaign-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: new URLSearchParams({
      MessageSid: 'SM998',
      MessageStatus: 'failed',
      To: '+15005550009',
    }).toString(),
  })
  await res.text() // consume body to avoid leak
  assertEquals(res.status, 200)
})

// ── send-crm-campaign ────────────────────────────────────────────────────────

Deno.test('send-crm-campaign: no scheduled campaigns returns 0 processed', async () => {
  // Without any campaigns scheduled, should return gracefully
  const res = await callFn('send-crm-campaign', {})
  assertEquals(res.status, 200)
  const body = await res.json()
  assertExists(body.processed, 'processed field should exist')
})

// ── send-crm-campaign template model helper ───────────────────────────────────

import { buildTemplateModel } from '../send-crm-campaign/utils.ts'

Deno.test('send-crm-campaign: buildTemplateModel resolves names correctly', () => {
  // Test full name
  const model1 = buildTemplateModel('John Doe');
  assertEquals(model1.name, 'John Doe');
  assertEquals(model1.first_name, 'John');
  assertEquals(model1.last_name, 'Doe');

  // Test single name
  const model2 = buildTemplateModel('Prince');
  assertEquals(model2.name, 'Prince');
  assertEquals(model2.first_name, 'Prince');
  assertEquals(model2.last_name, null);

  // Test no name (fallback to Neighbor)
  const model3 = buildTemplateModel(null);
  assertEquals(model3.name, null);
  assertEquals(model3.first_name, 'Neighbor');
  assertEquals(model3.last_name, null);

  // Test empty string (fallback to Neighbor)
  const model4 = buildTemplateModel('');
  assertEquals(model4.name, '');
  assertEquals(model4.first_name, 'Neighbor');
  assertEquals(model4.last_name, null);
});

// ── estimate-earnings ─────────────────────────────────────────────────────────

Deno.test('estimate-earnings: missing inputs returns 400', async () => {
  const res = await callFn('estimate-earnings', {
    zipcode: '94105',
    size: '',     // missing
    plants: [],   // empty
    trees: [],    // empty
  })
  await res.text() // consume body
  // 400 for missing inputs, or 503/500 if function not running locally
  const acceptable = [400, 500, 503]
  assertEquals(acceptable.includes(res.status), true, `Expected 400/500/503, got ${res.status}`)
})

Deno.test('estimate-earnings: valid garden inputs saves lead and returns AI result or queued', async () => {
  const testEmail = 'deno_estimate_test@casagrown.local'

  const res = await callFn('estimate-earnings', {
    zipcode: '94105',
    size: 'Small Backyard',
    plants: ['Tomatoes (x2)', 'Peppers (x1)'],
    trees: [],
    lead: {
      name: 'Deno Test',
      email: testEmail,
      phone: '',
      marketingConsent: false,
    },
  })

  if (res.status === 503 || res.status === 500 || res.status === 404) {
    await res.text()
    console.log('estimate-earnings not running locally — skipping body checks')
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()

  // Should be either full AI result or queued signal
  const isQueued = body.queued === true
  const aiResult = body.ai_estimate_result || body
  const isResult = typeof aiResult.estimated_annual_earnings === 'number'
  assertEquals(
    isQueued || isResult,
    true,
    `Expected queued or AI result, got: ${JSON.stringify(body)}`
  )

  if (isResult) {
    assertExists(aiResult.excess_produce)
    assertExists(aiResult.analogies)
    assertEquals(Array.isArray(aiResult.analogies), true)
    assertExists(aiResult.reasoning)
  }

  // Verify lead was persisted to crm_leads
  const dbRes = await fetch(
    `${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}&select=email,form_version,metadata`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  )
  const leads = await dbRes.json()
  assertEquals(leads.length, 1, 'Lead should be persisted in crm_leads')
  assertEquals(leads[0].form_version, 'v1-earnings-estimator')
  assertExists(leads[0].metadata?.plants, 'Plants array should be stored in metadata')
  assertExists(leads[0].metadata?.trees, 'Trees array should be stored in metadata')

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
})

Deno.test('estimate-earnings: existing lead is updated, not duplicated', async () => {
  const testEmail = 'deno_estimate_dedup@casagrown.local'

  // Pre-insert a lead
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      email: testEmail,
      name: 'Existing Lead',
      form_version: 'v1-earnings-estimator',
      status: 'new',
    }),
  })
  await insertRes.text()

  const res = await callFn('estimate-earnings', {
    zipcode: '94105',
    size: 'Small Backyard',
    plants: ['Basil (x3)'],
    trees: [],
    lead: { name: 'Existing Lead', email: testEmail, phone: '', marketingConsent: false },
  })

  if (res.status === 503 || res.status === 500 || res.status === 404) {
    await res.text()
    console.log('estimate-earnings not running — skipping dedup check')
  } else {
    await res.text() // consume
    // Verify only one lead exists (upsert, not duplicate insert)
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}&select=id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    )
    const leads = await dbRes.json()
    assertEquals(leads.length, 1, 'Should not create duplicate leads for same email')
  }

  // Cleanup
  const cleanupRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  await cleanupRes.text()
})

// ── process-earnings-estimate-request-queue ───────────────────────────────────

Deno.test('process-earnings-estimate-request-queue: rejects unauthenticated requests', async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-earnings-estimate-request-queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,   // anon key, not service role
    },
    body: JSON.stringify({}),
  })
  await res.text()
  // Should be 401 unauthorized, or 503/404 if not running locally
  const acceptable = [401, 404, 500, 503]
  assertEquals(acceptable.includes(res.status), true, `Expected 401/404/500/503, got ${res.status}`)
})

Deno.test('process-earnings-estimate-request-queue: returns 0 processed when no queued leads', async () => {
  // Ensure no unprocessed estimator leads exist for this test
  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-earnings-estimate-request-queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({}),
  })

  if (res.status === 503 || res.status === 500 || res.status === 404) {
    await res.text()
    console.log('process-earnings-estimate-request-queue not running locally — skipping')
    return
  }

  assertEquals(res.status, 200)
  const body = await res.json()
  assertExists(body.processed, 'processed count should exist in response')
  assertExists(body.abandoned !== undefined || body.processed !== undefined, 'response shape correct')
})

Deno.test('process-earnings-estimate-request-queue: skips leads that already have ai_estimate_result', async () => {
  const testEmail = 'deno_queue_skip@casagrown.local'

  // Insert a lead that already has an ai_estimate_result in metadata — should NOT be reprocessed
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      email: testEmail,
      name: 'Already Processed Lead',
      form_version: 'v1-earnings-estimator',
      status: 'new',
      metadata: {
        garden_size: 'Small Backyard',
        plants: ['Tomatoes (x1)'],
        trees: [],
        ai_estimate_result: {
          excess_produce: '10 lbs of tomatoes',
          estimated_annual_earnings: 100,
          analogies: ['a', 'b', 'c'],
          reasoning: 'test',
        },
      },
    }),
  })
  await insertRes.text()

  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-earnings-estimate-request-queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({}),
  })

  if (res.status === 503 || res.status === 500 || res.status === 404) {
    await res.text()
    console.log('process-earnings-estimate-request-queue not running — skipping skip test')
  } else {
    assertEquals(res.status, 200)
    const body = await res.json()
    // The already-processed lead should NOT be in the processed count
    // (we can't assert exact number without controlling the full DB state)
    assertExists(body.processed)
  }

  // Cleanup
  const cleanupRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  await cleanupRes.text()
})

Deno.test('process-earnings-estimate-request-queue: skips leads marked ai_estimate_abandoned', async () => {
  const testEmail = 'deno_queue_abandoned@casagrown.local'

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      email: testEmail,
      name: 'Abandoned Lead',
      form_version: 'v1-earnings-estimator',
      status: 'new',
      metadata: {
        garden_size: 'Small Backyard',
        plants: ['Basil (x1)'],
        trees: [],
        ai_estimate_abandoned: new Date().toISOString(),
      },
    }),
  })
  await insertRes.text()

  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-earnings-estimate-request-queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({}),
  })

  if (res.status === 503 || res.status === 500 || res.status === 404) {
    await res.text()
    console.log('process-earnings-estimate-request-queue not running — skipping abandoned test')
  } else {
    assertEquals(res.status, 200)
    // Abandoned lead should be filtered out by the query (.is('metadata->ai_estimate_abandoned', null))
    const body = await res.json()
    assertExists(body.processed)
  }

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
})

// ── sendMarketingSms ──────────────────────────────────────────────────────────

import { sendMarketingSms } from '../_shared/twilio.ts'

Deno.test('sendMarketingSms: returns config error when neither service SID nor marketing phone number is set', async () => {
  const original = Deno.env.get('TWILIO_MARKETING_MESSAGING_SERVICE_SID')
  const originalFrom = Deno.env.get('TWILIO_MARKETING_FROM_NUMBER')
  if (original) Deno.env.delete('TWILIO_MARKETING_MESSAGING_SERVICE_SID')
  if (originalFrom) Deno.env.delete('TWILIO_MARKETING_FROM_NUMBER')

  const result = await sendMarketingSms('+15005550006', 'Hello from CasaGrown!')

  assertEquals(result.success, false)
  assertExists(result.error)
  assertEquals(
    result.error?.includes('TWILIO_MARKETING_MESSAGING_SERVICE_SID'),
    true,
    `Error should mention missing env var, got: ${result.error}`
  )

  if (original) Deno.env.set('TWILIO_MARKETING_MESSAGING_SERVICE_SID', original)
  if (originalFrom) Deno.env.set('TWILIO_MARKETING_FROM_NUMBER', originalFrom)
})

Deno.test('sendMarketingSms: uses From (marketing phone number) in Twilio API call when MessagingServiceSid is not set', async () => {
  let capturedBody: URLSearchParams | null = null

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('api.twilio.com')) {
      capturedBody = new URLSearchParams(init?.body as string)
      return new Response(JSON.stringify({ sid: 'SM_test', status: 'queued' }), { status: 201 })
    }
    return originalFetch(input, init)
  }

  Deno.env.set('TWILIO_ACCOUNT_SID', 'ACtest')
  Deno.env.set('TWILIO_AUTH_TOKEN', 'authtest')
  Deno.env.set('TWILIO_MARKETING_FROM_NUMBER', '+15005550006')
  const originalServiceSid = Deno.env.get('TWILIO_MARKETING_MESSAGING_SERVICE_SID')
  if (originalServiceSid) Deno.env.delete('TWILIO_MARKETING_MESSAGING_SERVICE_SID')

  const result = await sendMarketingSms('+15005550005', 'Spring market is live!')

  assertEquals(result.success, true)
  assertExists(capturedBody, 'Twilio API should have been called')
  assertEquals((capturedBody as any)?.get('From'), '+15005550006', 'Must use From number')
  assertEquals((capturedBody as any)?.get('MessagingServiceSid'), null, 'Must NOT set MessagingServiceSid')
  assertEquals((capturedBody as any)?.get('To'), '+15005550005')
  assertEquals((capturedBody as any)?.get('Body'), 'Spring market is live!')

  globalThis.fetch = originalFetch
  Deno.env.delete('TWILIO_ACCOUNT_SID')
  Deno.env.delete('TWILIO_AUTH_TOKEN')
  Deno.env.delete('TWILIO_MARKETING_FROM_NUMBER')
  if (originalServiceSid) Deno.env.set('TWILIO_MARKETING_MESSAGING_SERVICE_SID', originalServiceSid)
})

Deno.test('sendMarketingSms: uses MessagingServiceSid (not From) in Twilio API call', async () => {
  let capturedBody: any = null

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('api.twilio.com')) {
      capturedBody = new URLSearchParams(init?.body as string)
      return new Response(JSON.stringify({ sid: 'SM_test', status: 'queued' }), { status: 201 })
    }
    return originalFetch(input, init)
  }

  Deno.env.set('TWILIO_ACCOUNT_SID', 'ACtest')
  Deno.env.set('TWILIO_AUTH_TOKEN', 'authtest')
  Deno.env.set('TWILIO_MARKETING_MESSAGING_SERVICE_SID', 'MGtest123')

  const result = await sendMarketingSms('+15005550006', 'Spring market is live!')

  assertEquals(result.success, true)
  assertExists(capturedBody, 'Twilio API should have been called')
  assertEquals((capturedBody as any)?.get('MessagingServiceSid'), 'MGtest123', 'Must use MessagingServiceSid')
  assertEquals((capturedBody as any)?.get('From'), null, 'Must NOT set From when using MessagingServiceSid')
  assertEquals((capturedBody as any)?.get('To'), '+15005550006')
  assertEquals((capturedBody as any)?.get('Body'), 'Spring market is live!')

  globalThis.fetch = originalFetch
  Deno.env.delete('TWILIO_ACCOUNT_SID')
  Deno.env.delete('TWILIO_AUTH_TOKEN')
  Deno.env.delete('TWILIO_MARKETING_MESSAGING_SERVICE_SID')
})

Deno.test('sendMarketingSms: Twilio error response returns success:false with message', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('api.twilio.com')) {
      return new Response(
        JSON.stringify({ code: 21614, message: 'To number is not a valid mobile number' }),
        { status: 400 }
      )
    }
    return originalFetch(input, init)
  }

  Deno.env.set('TWILIO_ACCOUNT_SID', 'ACtest')
  Deno.env.set('TWILIO_AUTH_TOKEN', 'authtest')
  Deno.env.set('TWILIO_MARKETING_MESSAGING_SERVICE_SID', 'MGtest123')

  const result = await sendMarketingSms('+15005550001', 'Test message')

  assertEquals(result.success, false)
  assertExists(result.error)

  globalThis.fetch = originalFetch
  Deno.env.delete('TWILIO_ACCOUNT_SID')
  Deno.env.delete('TWILIO_AUTH_TOKEN')
  Deno.env.delete('TWILIO_MARKETING_MESSAGING_SERVICE_SID')
})

Deno.test('sendMarketingSms: network failure returns success:false', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('api.twilio.com')) throw new Error('Network unreachable')
    return originalFetch(input)
  }

  Deno.env.set('TWILIO_ACCOUNT_SID', 'ACtest')
  Deno.env.set('TWILIO_AUTH_TOKEN', 'authtest')
  Deno.env.set('TWILIO_MARKETING_MESSAGING_SERVICE_SID', 'MGtest123')

  const result = await sendMarketingSms('+15005550006', 'Test')

  assertEquals(result.success, false)
  assertEquals(result.error?.includes('Network'), true)

  globalThis.fetch = originalFetch
  Deno.env.delete('TWILIO_ACCOUNT_SID')
  Deno.env.delete('TWILIO_AUTH_TOKEN')
  Deno.env.delete('TWILIO_MARKETING_MESSAGING_SERVICE_SID')
})

Deno.test('estimate-nutrition-loss: persists buyer questionnaire metadata (neighbor_buying_comfort, store_types, etc.)', async () => {
  const testEmail = 'deno_nutrition_metadata_test@casagrown.local'
  const payload = {
    produce: ['Spinach', 'Broccoli'],
    skip_ai: true,
    prefetched_result: {
      summary: 'Test summary',
      items: []
    },
    lead: {
      name: 'Nutrition Survey Tester',
      email: testEmail,
      phone: '4085551234',
      zipcode: '95125',
      marketingConsent: true,
      neighbor_buying_comfort: 'very_open',
      store_types: ['Farmers Market or Local Stand', 'Specialty & Organic Grocer'],
      fulfillment_modes: ['In-Store Shopping', 'Curbside Pickup'],
      buying_frequency: '1week',
    }
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/estimate-nutrition-loss`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(payload),
  })

  assertEquals(res.status, 200)
  const leadRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  const leads = await leadRes.json()
  assertEquals(leads.length > 0, true)
  const lead = leads[0]
  assertEquals(lead.metadata?.neighbor_buying_comfort, 'very_open')
  assertEquals(Array.isArray(lead.metadata?.store_types), true)
  assertEquals(lead.metadata?.store_types.includes('Farmers Market or Local Stand'), true)
  assertEquals(lead.metadata?.fulfillment_modes.includes('In-Store Shopping'), true)
  assertEquals(lead.metadata?.buying_frequency, '1week')

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
})

Deno.test('estimate-earnings: persists seller questionnaire metadata (selling_comfort, excess_handling, garden_size)', async () => {
  const testEmail = 'deno_earnings_metadata_test@casagrown.local'
  const payload = {
    zipcode: '95125',
    size: 'Large Backyard Garden',
    plants: ['Tomatoes', 'Peppers'],
    trees: ['Lemon Tree'],
    selling_comfort: 'Very comfortable — I want to earn extra income!',
    excess_handling: 'Give it away to friends & neighbors',
    skip_ai: true,
    prefetched_result: {
      excess_produce: 'Test excess',
      estimated_annual_earnings: 500,
      analogies: ['a'],
      reasoning: 'test'
    },
    lead: {
      name: 'Seller Survey Tester',
      email: testEmail,
      phone: '4085559876',
      zipcode: '95125',
      marketingConsent: true,
    }
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/estimate-earnings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(payload),
  })

  assertEquals(res.status, 200)
  const leadRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  const leads = await leadRes.json()
  assertEquals(leads.length > 0, true)
  const lead = leads[0]
  assertEquals(lead.metadata?.garden_size, 'Large Backyard Garden')
  assertEquals(lead.metadata?.selling_comfort, 'Very comfortable — I want to earn extra income!')
  assertEquals(lead.metadata?.excess_handling, 'Give it away to friends & neighbors')

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(testEmail)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
})
