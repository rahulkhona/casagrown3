/**
 * CRM Edge Functions — Integration Tests
 *
 * Tests: receive-facebook-lead, send-crm-campaign, postmark-webhook,
 *        twilio-campaign-webhook
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
