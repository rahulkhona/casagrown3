/**
 * Search Integrations — Integration Tests
 *
 * Tests: ofn-product-search, usda-farmers-markets, casagrown-product-search,
 *        universal-search, crm-ofn-prospects
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/search-integrations.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

Deno.test('ofn-product-search: returns valid structure', async () => {
  const req = await fetch(`${SUPABASE_URL}/functions/v1/ofn-product-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ query: 'honey', zipcode: '90001', radius: 25 })
  });
  
  assertEquals(req.status, 200);
  const data = await req.json();
  assertExists(data.data);
  assertEquals(data.source, 'openfoodnetwork');
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('usda-farmers-markets: returns valid structure', async () => {
  const req = await fetch(`${SUPABASE_URL}/functions/v1/usda-farmers-markets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ query: 'market', zipcode: '90001', radius: 25 })
  });
  
  assertEquals(req.status, 200);
  const data = await req.json();
  assertExists(data.data);
  assertExists(data.farms);
  assertEquals(data.source, 'usda');
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('casagrown-product-search: returns valid structure', async () => {
  const req = await fetch(`${SUPABASE_URL}/functions/v1/casagrown-product-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ query: 'tomato', zipcode: '90001', radius: 25 })
  });
  
  assertEquals(req.status, 200);
  const data = await req.json();
  assertExists(data.data);
  assertEquals(data.source, 'casagrown');
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('universal-search: returns default message', async () => {
  const req = await fetch(`${SUPABASE_URL}/functions/v1/universal-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ name: 'Functions' })
  });
  
  assertEquals(req.status, 200);
  const data = await req.json();
  assertEquals(data.message, 'Hello Functions!');
});

Deno.test('crm-ofn-prospects: triggers sync', async () => {
  const req = await fetch(`${SUPABASE_URL}/functions/v1/crm-ofn-prospects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ zipcode: '90001' })
  });
  
  assertEquals(req.status, 200);
  const data = await req.json();
  assertExists(data.data);
  assertEquals(Array.isArray(data.data), true);
});
