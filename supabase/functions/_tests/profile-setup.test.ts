/**
 * Profile Setup Pipeline — Integration Tests
 *
 * Verifies: resolve-usps-address edge function, resolve-community edge function,
 * and profile → community binding via home_community_h3_index.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/profile-setup.test.ts
 */
import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const BUYER_ID = 'b2222222-2222-2222-2222-222222222222'

async function queryTable(table: string, filters: string = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  })
  return { status: res.status, data: await res.json() }
}

async function callEdgeFunction(name: string, body: unknown) {
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  })
}

Deno.test({ name: 'profile-setup: resolve-usps-address edge function responds', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const res = await callEdgeFunction('resolve-usps-address', {
    street: '123 Main St',
    city: 'Anytown',
    state: 'CA',
    zip: '90210',
  })

  // The edge function should respond (may return mock data or validation error)
  assert(res.status < 500, `resolve-usps-address should not 500, got ${res.status}`)
  const body = await res.text()
  console.log(`  [USPS] Response: ${res.status} ${body.substring(0, 200)}`)
  console.log('  ✅ USPS edge function is reachable')
}})

Deno.test({ name: 'profile-setup: resolve-community edge function responds', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const res = await callEdgeFunction('resolve-community', {
    lat: 34.0522,
    lng: -118.2437,
  })

  assert(res.status < 500, `resolve-community should not 500, got ${res.status}`)
  const body = await res.text()
  console.log(`  [COMMUNITY] Response: ${res.status} ${body.substring(0, 300)}`)
  console.log('  ✅ Community resolver is reachable')
}})

Deno.test({ name: 'profile-setup: profile has H3 community binding', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  // Verify the seeded buyer profile has a community binding via home_community_h3_index
  const { status, data: profiles } = await queryTable('profiles', `id=eq.${BUYER_ID}&select=id,full_name,home_community_h3_index,zip_code,state_code,nearby_community_h3_indices`)
  
  assertEquals(status, 200, 'Profile query should succeed')
  assert(Array.isArray(profiles) && profiles.length > 0, 'Buyer profile should exist')
  
  const profile = profiles[0]
  console.log(`  [PROFILE] ${profile.full_name}:`)
  console.log(`    H3: ${profile.home_community_h3_index}`)
  console.log(`    ZIP: ${profile.zip_code}`)
  console.log(`    State: ${profile.state_code}`)
  console.log(`    Nearby H3s: ${profile.nearby_community_h3_indices?.length || 0} cells`)

  assertExists(profile.home_community_h3_index, 'Profile should have a home_community_h3_index')
  assert(profile.home_community_h3_index.length > 0, 'H3 index should be non-empty')
  console.log('  ✅ Profile community binding verified')
}})

Deno.test({ name: 'profile-setup: profile address fields are populated', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const { status, data: profiles } = await queryTable('profiles', `id=eq.${BUYER_ID}&select=street_address,city,state_code,zip_code,phone_number`)
  
  assertEquals(status, 200)
  assert(Array.isArray(profiles) && profiles.length > 0, 'Profile should exist')
  
  const p = profiles[0]
  assertExists(p.street_address, 'Should have street_address')
  assertExists(p.city, 'Should have city')
  assertExists(p.state_code, 'Should have state_code')
  assertExists(p.zip_code, 'Should have zip_code')
  
  console.log(`  [ADDRESS] ${p.street_address}, ${p.city}, ${p.state_code} ${p.zip_code}`)
  console.log(`  [PHONE] ${p.phone_number}`)
  console.log('  ✅ Profile address fields verified')
}})
