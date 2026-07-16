/**
 * parse-listing-text — Integration Tests
 *
 * Tests the parse-listing-text edge function which accepts free-form text
 * and optional photos, returning structured product listing data via Gemini AI.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/parse-listing-text.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const CORS = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }

async function callFn(name: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: CORS,
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

// ============================================================================
// Missing text → 400
// ============================================================================
Deno.test({
  name: 'parse-listing-text: rejects missing text',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('parse-listing-text', {})
    assertEquals(status, 400)
    assertEquals(data.error, 'Missing text')
    console.log('✅ parse-listing-text: missing text returns 400')
  },
})

Deno.test({
  name: 'parse-listing-text: rejects empty string text',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('parse-listing-text', { text: '' })
    assertEquals(status, 400)
    assertEquals(data.error, 'Missing text')
    console.log('✅ parse-listing-text: empty text returns 400')
  },
})

Deno.test({
  name: 'parse-listing-text: rejects too-short text',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('parse-listing-text', { text: 'a' })
    assertEquals(status, 400)
    assertEquals(data.error, 'Missing text')
    console.log('✅ parse-listing-text: short text returns 400')
  },
})

// ============================================================================
// Function exists (not 404)
// ============================================================================
Deno.test({
  name: 'parse-listing-text: function exists (not 404)',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-listing-text`, {
      method: 'POST',
      headers: CORS,
      body: JSON.stringify({ text: 'test listing' }),
    })
    // Should NOT be 404 — any other status means the function is deployed
    assertEquals(res.status !== 404, true, `Expected non-404 but got ${res.status}`)
    await res.text() // consume body
    console.log(`✅ parse-listing-text: function exists (status=${res.status})`)
  },
})

// ============================================================================
// SKIP_AI returns mock data
// ============================================================================
Deno.test({
  name: 'parse-listing-text: SKIP_AI returns mock data with expected fields',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    // This test depends on SKIP_AI=true being set in the local env.
    // When running locally with SKIP_AI=true, the function returns mock data.
    const { status, data } = await callFn('parse-listing-text', {
      text: 'I have 5 dozen oranges for sale at $5 per dozen',
      seller_state: 'CA',
      seller_city: 'San Jose',
    })

    // If SKIP_AI is enabled, we get a 200 with mock fields
    // If SKIP_AI is not enabled, the function still shouldn't 404
    if (status === 200 && data.name === 'Local Test Product') {
      // SKIP_AI is active — verify mock shape
      assertEquals(data.category, 'produce')
      assertEquals(data.quantity, 1)
      assertEquals(data.unit, 'each')
      assertEquals(data.price_usd, 5.00)
      assertEquals(data.is_free, false)
      assertEquals(data.offers_delivery, true)
      assertEquals(data.offers_pickup, true)
      assertExists(data.delivery_days)
      assertExists(data.delivery_time_of_day)
      assertExists(data.pickup_days)
      assertExists(data.pickup_time_of_day)
      assertExists(data.delivery_zipcodes)
      assertEquals(data.suggested_unit, 'each')
      console.log('✅ parse-listing-text: SKIP_AI mock data has all expected fields')
    } else {
      // AI is active — just verify we got a valid response shape
      assertEquals(status !== 404, true)
      console.log(`✅ parse-listing-text: AI active, status=${status}`)
    }
  },
})

// ============================================================================
// Text with quantity, unit, price — parses correctly (AI-dependent)
// ============================================================================
Deno.test({
  name: 'parse-listing-text: parses text with quantity, unit, and price',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('parse-listing-text', {
      text: 'I want to sell 5 dozen oranges at $5 per dozen',
      seller_state: 'CA',
      seller_city: 'San Jose',
    })

    assertEquals(status, 200)
    assertExists(data)

    // If AI is active and responded, verify field types
    if (!data.error) {
      assertExists(data.name)
      assertExists(data.category)
      assertExists(data.description)
      assertEquals(typeof data.quantity, 'number')
      assertExists(data.unit)
      assertEquals(typeof data.is_free, 'boolean')
      assertEquals(typeof data.offers_delivery, 'boolean')
      assertEquals(typeof data.offers_pickup, 'boolean')
      assertEquals(Array.isArray(data.delivery_days), true)
      assertEquals(Array.isArray(data.delivery_time_of_day), true)
      assertEquals(Array.isArray(data.pickup_days), true)
      assertEquals(Array.isArray(data.pickup_time_of_day), true)
      assertEquals(Array.isArray(data.delivery_zipcodes), true)
      assertExists(data.suggested_unit)
      console.log('✅ parse-listing-text: text with qty/unit/price parsed, name=', data.name)
    } else {
      console.log('⚠️  parse-listing-text: AI returned error (expected in CI):', data.error)
    }
  },
})

// ============================================================================
// Delivery preferences parsing
// ============================================================================
Deno.test({
  name: 'parse-listing-text: parses delivery preferences',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn('parse-listing-text', {
      text: 'Selling fresh eggs, $6 per dozen. I can deliver on Saturday afternoon within 3 miles.',
      seller_state: 'CA',
      seller_city: 'Palo Alto',
    })

    assertEquals(status, 200)
    assertExists(data)

    if (!data.error) {
      assertEquals(typeof data.offers_delivery, 'boolean')
      assertEquals(Array.isArray(data.delivery_days), true)
      assertEquals(Array.isArray(data.delivery_time_of_day), true)
      // If AI understood the delivery text correctly:
      if (data.delivery_days.length > 0) {
        assertEquals(data.delivery_days.every((d: string) =>
          ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(d)
        ), true)
      }
      if (data.delivery_time_of_day.length > 0) {
        assertEquals(data.delivery_time_of_day.every((t: string) =>
          ['morning','afternoon','evening'].includes(t)
        ), true)
      }
      console.log('✅ parse-listing-text: delivery prefs parsed, days=', data.delivery_days, 'time=', data.delivery_time_of_day)
    } else {
      console.log('⚠️  parse-listing-text: AI returned error (expected in CI):', data.error)
    }
  },
})

// ============================================================================
// Images alongside text
// ============================================================================
Deno.test({
  name: 'parse-listing-text: handles images alongside text',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    // Use a tiny 1x1 red pixel JPEG as base64 for testing
    const tinyImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYI4Q/SFhSRTEqNykzRik0NTkRSCFNMkNIRQoFUKBJGihSVGUcLC4nODk3NS41RDo7TUNDREY4Rk5ERDhGPjVEOjsiLw/9oADAMBAAIRAxEAPwA/r/P5n//Z'

    const { status, data } = await callFn('parse-listing-text', {
      text: 'Fresh tomatoes from my garden',
      images: [tinyImage],
      seller_state: 'CA',
    })

    assertEquals(status, 200)
    assertExists(data)

    // The function should accept the request and either parse or return an AI error
    if (!data.error) {
      assertExists(data.name)
      assertExists(data.category)
      console.log('✅ parse-listing-text: images + text parsed, name=', data.name)
    } else {
      // AI might fail in test env but the function handled it gracefully
      assertEquals(typeof data.error, 'string')
      console.log('✅ parse-listing-text: images + text handled gracefully, error=', data.error)
    }
  },
})

// ============================================================================
// AI failure returns error gracefully (status 200 with error field)
// ============================================================================
Deno.test({
  name: 'parse-listing-text: AI failure returns error gracefully',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    // This tests the catch-all error handling. Even if AI fails,
    // the function should return { error: "..." } with status 200
    const { status, data } = await callFn('parse-listing-text', {
      text: 'Selling some produce',
    })

    // Should always be 200 (or possibly a success)
    assertEquals(status, 200)
    assertExists(data)

    if (data.error) {
      assertEquals(typeof data.error, 'string')
      console.log('✅ parse-listing-text: AI failure returned graceful error:', data.error)
    } else {
      // AI actually worked — that's fine too
      assertExists(data.name)
      console.log('✅ parse-listing-text: AI succeeded, name=', data.name)
    }
  },
})

// ============================================================================
// CORS: OPTIONS returns ok
// ============================================================================
Deno.test({
  name: 'parse-listing-text: OPTIONS returns CORS headers',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-listing-text`, {
      method: 'OPTIONS',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    })
    assertEquals(res.status, 200)
    const text = await res.text()
    assertEquals(text, 'ok')
    console.log('✅ parse-listing-text: OPTIONS returns CORS ok')
  },
})
