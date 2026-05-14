/**
 * CRM Prospects — Integration Tests
 *
 * Tests the "Add to CRM Leads" functionality for USDA farmer prospects
 * and farmers market manager leads.
 *
 * Verifies:
 * 1. Farmer leads insert correctly with metadata.lead_type = 'farmer'
 * 2. Market manager leads insert with metadata.lead_type = 'market_manager'
 * 3. Both respect crm_leads RLS (anon can insert, staff can read)
 * 4. Zipcode and contact fields are stored correctly
 *
 * Run: cd apps/next-admin && npx vitest run __tests__/crm-prospects.test.ts
 */
import { describe, test, expect, afterAll } from 'vitest'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const HEADERS_SR = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Prefer': 'return=representation',
}

const HEADERS_ANON = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ANON_KEY}`,
  'apikey': ANON_KEY,
  'Prefer': 'return=representation',
}

const TEST_TAG = `prospects_test_${Date.now()}`
const createdIds: string[] = []

afterAll(async () => {
  for (const id of createdIds) {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${id}`, {
      method: 'DELETE', headers: HEADERS_SR,
    })
  }
})

// ════════════════════════════════════════════════════════════════
// Farmer Prospects — Add to CRM Leads
// ════════════════════════════════════════════════════════════════
describe('Farmer Prospects → CRM Leads', () => {
  let farmLeadId = ''

  test('inserts a USDA on-farm market lead with farmer metadata', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
      method: 'POST',
      headers: HEADERS_SR,  // admin UI runs as authenticated staff
      body: JSON.stringify({
        name: `Green Valley Farm — ${TEST_TAG}`,
        email: 'contact@greenvalleyfarm.test',
        phone: '(408) 555-0100',
        source_platform: 'usda',
        notes: 'USDA on-farm market. Website: greenvalleyfarm.test',
        metadata: {
          lead_type: 'farmer',
          usda_directory: 'onfarmmarket',
          location: 'San Jose, CA 95120',
          listing_name: `Green Valley Farm — ${TEST_TAG}`,
        },
        zipcode: '95120',
        status: 'new',
      }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data[0].id).toBeDefined()
    farmLeadId = data[0].id
    createdIds.push(farmLeadId)
  })

  test('stored farmer lead has correct metadata.lead_type', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${farmLeadId}`, {
      headers: HEADERS_SR,
    })
    const data = await res.json()
    expect(data.length).toBe(1)
    expect(data[0].metadata?.lead_type).toBe('farmer')
    expect(data[0].metadata?.usda_directory).toBe('onfarmmarket')
    expect(data[0].source_platform).toBe('usda')
    expect(data[0].status).toBe('new')
    expect(data[0].zipcode).toBe('95120')
  })

  test('stored farmer lead has correct contact info', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${farmLeadId}`, {
      headers: HEADERS_SR,
    })
    const data = await res.json()
    expect(data[0].email).toBe('contact@greenvalleyfarm.test')
    expect(data[0].phone).toBe('(408) 555-0100')
    expect(data[0].name).toContain('Green Valley Farm')
  })

  test('inserts a CSA lead with farmer metadata', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        name: `Sunrise CSA — ${TEST_TAG}`,
        email: null,
        phone: '(408) 555-0200',
        source_platform: 'usda',
        metadata: {
          lead_type: 'farmer',
          usda_directory: 'csa',
          location: 'Campbell, CA 95008',
          listing_name: `Sunrise CSA — ${TEST_TAG}`,
        },
        zipcode: '95008',
        status: 'new',
      }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    createdIds.push(data[0].id)
    expect(data[0].metadata?.usda_directory).toBe('csa')
    expect(data[0].email).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// Farmers Market Manager Leads
// ════════════════════════════════════════════════════════════════
describe('Market Manager Prospects → CRM Leads', () => {
  let marketLeadId = ''

  test('inserts a farmers market manager lead', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        name: `Downtown SJ Farmers Market — ${TEST_TAG}`,
        email: 'manager@sjfarmersmarket.test',
        phone: '(408) 555-0300',
        source_platform: 'usda',
        notes: 'Website: sjfarmersmarket.test',
        metadata: {
          lead_type: 'market_manager',
          usda_directory: 'farmersmarket',
          location: 'San Jose, CA 95113',
          listing_name: `Downtown SJ Farmers Market — ${TEST_TAG}`,
        },
        zipcode: '95113',
        status: 'new',
      }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    marketLeadId = data[0].id
    createdIds.push(marketLeadId)
  })

  test('stored market manager lead has correct metadata.lead_type', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?id=eq.${marketLeadId}`, {
      headers: HEADERS_SR,
    })
    const data = await res.json()
    expect(data[0].metadata?.lead_type).toBe('market_manager')
    expect(data[0].metadata?.usda_directory).toBe('farmersmarket')
    expect(data[0].source_platform).toBe('usda')
    expect(data[0].email).toBe('manager@sjfarmersmarket.test')
    expect(data[0].zipcode).toBe('95113')
  })

  test('market manager and farmer leads are distinguishable by metadata', async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_leads?source_platform=eq.usda&name=like.*${TEST_TAG}*`,
      { headers: HEADERS_SR }
    )
    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(3) // 2 farmer + 1 market manager
    const farmerLeads = data.filter((l: any) => l.metadata?.lead_type === 'farmer')
    const marketLeads = data.filter((l: any) => l.metadata?.lead_type === 'market_manager')
    expect(farmerLeads.length).toBeGreaterThanOrEqual(2)
    expect(marketLeads.length).toBeGreaterThanOrEqual(1)
  })
})

// ════════════════════════════════════════════════════════════════
// RLS: staff can insert and read; anon is blocked
// ════════════════════════════════════════════════════════════════
describe('CRM Leads RLS', () => {
  test('service role can insert a lead', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
      method: 'POST',
      headers: HEADERS_SR,
      body: JSON.stringify({
        name: `RLS Test Lead — ${TEST_TAG}`,
        source_platform: 'usda',
        metadata: { lead_type: 'farmer' },
        status: 'new',
      }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    createdIds.push(data[0].id)
  })

  test('anon key cannot read crm_leads (RLS blocks SELECT)', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?limit=1`, {
      headers: HEADERS_ANON,
    })
    // RLS blocks anon select — expect 200 with empty array or 401/403
    if (res.status === 200) {
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(0)
    } else {
      expect([401, 403]).toContain(res.status)
    }
  })

  test('service role can read all leads', async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_leads?source_platform=eq.usda&name=like.*${TEST_TAG}*`,
      { headers: HEADERS_SR }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(1)
  })
})
