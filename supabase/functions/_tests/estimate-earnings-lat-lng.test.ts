import { assert, assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

Deno.test('estimate-earnings parses lat lng from body', async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/estimate-earnings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ zipcode: '95110', zip: '95110', size: 'Medium', produce_name: 'test tomatoes', latitude: 37.3382, longitude: -121.8863 })
  })

  const json = await res.json()
  assert(res.status === 200)
  assertEquals(typeof json.ai_estimate_result.estimated_annual_earnings, 'number')
})
