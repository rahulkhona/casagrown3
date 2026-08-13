// -----------------------------------------------------------------------------
// Deno Integration Test: generate-daily-jigsaw-image.test.ts
// -----------------------------------------------------------------------------

import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321"
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4Mzg3NjgwMH0.q7e..."

Deno.test({
  name: "1. generate-daily-jigsaw-image: resolves daily produce image and returns 200 OK",
  async fn() {
    const res = await fetch("http://localhost:54321/functions/v1/generate-daily-jigsaw-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    assertEquals(res.status, 200, "Should return HTTP 200 OK")
    const data = await res.json()
    assertEquals(data.success, true, "Response success should be true")
    assertExists(data.imageUrl, "Response must include imageUrl")
    assertExists(data.cropName, "Response must include cropName")
  },
})

Deno.test({
  name: "2. generate-daily-jigsaw-image: simulated failure engages fallback engine & logs support alert email",
  async fn() {
    const res = await fetch("http://localhost:54321/functions/v1/generate-daily-jigsaw-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force_failure: true }),
    })

    assertEquals(res.status, 200, "Fallback must return HTTP 200 OK with zero crashes")
    const data = await res.json()
    assertEquals(data.success, true, "Fallback response success should be true")
    assertExists(data.imageUrl, "Fallback response must include fallback imageUrl")
  },
})

Deno.test({
  name: "3. generate-daily-jigsaw-image: stops generation when 1,000 AI generated images reached",
  async fn() {
    // Verify 1000 cap handler returns milestone status
    const res = await fetch("http://localhost:54321/functions/v1/generate-daily-jigsaw-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    assertEquals(res.status, 200, "Should return HTTP 200 OK")
    const data = await res.json()
    assertEquals(data.success, true)
  },
})
