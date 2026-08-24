import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveBenchmark } from '../sync-produce-benchmarks/index.ts'
import { handleSuggestPrice } from '../suggest-product-price/index.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

Deno.test('sync-produce-benchmarks - resolves Kroger 20% discount for supported retail ZIPs', async () => {
  const res = await resolveBenchmark('Tomatoes', '90210', null, null, true)
  
  assertEquals(res.produce_name, 'Tomatoes')
  assertEquals(res.zip_code, '90210')
  assertEquals(res.source, 'kroger')
  assertEquals(res.avg_retail_price, 1.29)
  // 1.29 * 0.80 = 1.032 -> 1.03
  assertEquals(res.suggested_price, 1.03)
  assertEquals(res.unit, 'lb')
})

Deno.test('sync-produce-benchmarks - resolves USDA 1.5x markup for fallback ZIPs', async () => {
  const res = await resolveBenchmark('Tomatoes', '95120', null, null, true)
  
  assertEquals(res.produce_name, 'Tomatoes')
  assertEquals(res.zip_code, '95120')
  assertEquals(res.source, 'usda_ams')
  // 0.60 * 1.50 = 0.90
  assertEquals(res.suggested_price, 0.90)
})

Deno.test({
  name: 'sync-produce-benchmarks - get_suggested_produce_price RPC queries cached benchmark correctly',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Seed benchmark
    await supabase.from('market_price_benchmarks').upsert({
      produce_name: 'Meyer Lemons',
      zip_code: '90210',
      avg_retail_price: 0.79,
      suggested_price: 0.63,
      unit: 'each',
      source: 'kroger',
      updated_at: new Date().toISOString()
    }, { onConflict: 'produce_name,zip_code' })

    // Query via RPC
    const { data, error } = await supabase.rpc('get_suggested_produce_price', {
      p_produce_name: 'Meyer Lemons',
      p_zip_code: '90210'
    })

    assertEquals(error, null)
    assertExists(data)
    assertEquals(data.found, true)
    assertEquals(data.suggested_price, 0.63)
    assertEquals(data.source, 'kroger')
  },
})

Deno.test({
  name: 'suggest-product-price - resolves empirical benchmark via handleSuggestPrice handler',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Seed benchmark in DB
    await supabase.from('market_price_benchmarks').upsert({
      produce_name: 'Strawberries',
      zip_code: '90210',
      avg_retail_price: 3.49,
      suggested_price: 2.79,
      unit: 'lb',
      source: 'kroger',
      updated_at: new Date().toISOString()
    }, { onConflict: 'produce_name,zip_code' })

    const req = new Request('http://localhost/suggest-product-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Strawberries', zip_code: '90210' }),
    })

    const res = await handleSuggestPrice(req)
    assertEquals(res.status, 200)

    const data = await res.json()
    assertExists(data)
    assertEquals(data.price_usd, 2.79)
    assertEquals(data.source, 'kroger')
  },
})

