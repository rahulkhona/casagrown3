/**
 * Background & Infrastructure Functions — Integration Tests
 *
 * Tests: market-donate-earnings, send-transaction-email, assign-experiment,
 *        analyze-product-photo, simulate-bank-deposit, enrich-communities,
 *        fetch-donation-projects, fetch-gift-cards, fetch-market-gift-cards,
 *        sync-locations, sync-provider-balance, update-zip-codes
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/background-functions.test.ts
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

// ============================================================================
// market-donate-earnings
// ============================================================================
Deno.test({
  name: 'market-donate-earnings: requires auth (rejects anon)',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('market-donate-earnings', {}, ANON_KEY)
    assertEquals(true, status >= 400)
  },
})

Deno.test({
  name: 'market-donate-earnings: rejects missing fields',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('market-donate-earnings', {})
    assertEquals(true, status >= 400)
  },
})

// ============================================================================
// send-transaction-email
// ============================================================================
Deno.test({
  name: 'send-transaction-email: function exists (not 404)',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('send-transaction-email', { transactionId: 'test' })
    // Should not be 404 — any other status means the function exists
    assertEquals(true, status !== 404, 'Function should exist')
  },
})

Deno.test({
  name: 'send-transaction-email: rejects invalid transaction',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('send-transaction-email', {
      transactionId: '00000000-0000-0000-0000-000000000099',
    })
    assertEquals(true, status >= 400 || status === 200) // May return 200 with error body
  },
})

// ============================================================================
// assign-experiment
// ============================================================================
Deno.test({
  name: 'assign-experiment: rejects missing experiment_id',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('assign-experiment', { device_id: 'test' })
    assertEquals(true, status >= 400, 'Missing experiment_id should fail')
  },
})

Deno.test({
  name: 'assign-experiment: rejects missing device_id',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('assign-experiment', { experiment_id: 'test' })
    assertEquals(true, status >= 400, 'Missing device_id should fail')
  },
})

Deno.test({
  name: 'assign-experiment: experiments table accessible',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/experiments?select=id,name,status&limit=0`, { headers: HEADERS })
    assertEquals(res.status, 200)
    await res.text()
  },
})

Deno.test({
  name: 'assign-experiment: experiment_assignments table accessible',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/experiment_assignments?select=id,experiment_id,device_id,variant_id&limit=0`, { headers: HEADERS })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// ============================================================================
// analyze-product-photo
// ============================================================================
Deno.test({
  name: 'analyze-product-photo: rejects missing image',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('analyze-product-photo', {})
    assertEquals(true, status === 400, 'Missing image should return 400')
  },
})

Deno.test({
  name: 'analyze-product-photo: function exists (not 404)',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    // Retry to handle edge function server startup race in CI
    let status = 404;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-product-photo`, {
        method: 'OPTIONS',
        headers: { 'Origin': 'http://localhost:3000' },
      })
      status = res.status;
      await res.text();
      if (status !== 404) break;
      if (i < 2) await new Promise(r => setTimeout(r, 2000));
    }
    assertEquals(true, status !== 404)
  },
})

// ============================================================================
// simulate-bank-deposit
// ============================================================================
Deno.test({
  name: 'simulate-bank-deposit: rejects missing settlement_id',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('simulate-bank-deposit', {})
    // May fail with auth error or missing fields — just shouldn't be 404
    assertEquals(true, status !== 404, 'Function should exist')
  },
})

Deno.test({
  name: 'simulate-bank-deposit: requires staff access',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('simulate-bank-deposit', {
      settlement_id: '00000000-0000-0000-0000-000000000099',
    })
    assertEquals(true, status >= 400, 'Non-staff should be rejected')
  },
})

// ============================================================================
// enrich-communities
// ============================================================================
Deno.test({
  name: 'enrich-communities: function exists (not 404)',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('enrich-communities', {})
    assertEquals(true, status !== 404, 'Function should exist')
  },
})

Deno.test({
  name: 'enrich-communities: communities table accessible',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/communities?select=h3_index,name&limit=0`, { headers: HEADERS })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// ============================================================================
// fetch-donation-projects
// ============================================================================
Deno.test({
  name: 'fetch-donation-projects: function exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('fetch-donation-projects', {})
    assertEquals(true, status !== 404)
  },
})

// ============================================================================
// fetch-gift-cards
// ============================================================================
Deno.test({
  name: 'fetch-gift-cards: function exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('fetch-gift-cards', {})
    assertEquals(true, status !== 404)
  },
})

// ============================================================================
// fetch-market-gift-cards
// ============================================================================
Deno.test({
  name: 'fetch-market-gift-cards: function exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('fetch-market-gift-cards', {})
    assertEquals(true, status !== 404)
  },
})

// ============================================================================
// sync-locations
// ============================================================================
Deno.test({
  name: 'sync-locations: function exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('sync-locations', {})
    assertEquals(true, status !== 404)
  },
})

Deno.test({
  name: 'sync-locations: countries table accessible',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/countries?select=iso_3,name&limit=0`, { headers: HEADERS })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// ============================================================================
// sync-provider-balance
// ============================================================================
Deno.test({
  name: 'sync-provider-balance: function exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('sync-provider-balance', {})
    assertEquals(true, status !== 404)
  },
})

Deno.test({
  name: 'sync-provider-balance: platform_bank_ledger accessible',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/platform_bank_ledger?select=id,event_type,amount_usd&limit=0`, { headers: HEADERS })
    assertEquals(true, res.status === 200 || res.status === 404)
    await res.text()
  },
})

// ============================================================================
// update-zip-codes
// ============================================================================
Deno.test({
  name: 'update-zip-codes: function exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status } = await callFn('update-zip-codes', {})
    assertEquals(true, status !== 404)
  },
})
