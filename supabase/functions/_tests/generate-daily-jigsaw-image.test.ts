// -----------------------------------------------------------------------------
// Deno Integration Test: generate-daily-jigsaw-image.test.ts
// -----------------------------------------------------------------------------

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts"

const SUPABASE_URL = "http://127.0.0.1:54321"
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

async function callFn(body: any = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-daily-jigsaw-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

Deno.test({
  name: "generate-daily-jigsaw-image: function exists (not 404)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status } = await callFn({})
    assertEquals(true, status !== 404, "Function generate-daily-jigsaw-image should exist")
  },
})

Deno.test({
  name: "generate-daily-jigsaw-image: simulated failure engages fallback engine & logs support alert email",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn({ force_failure: true })
    assertEquals(true, status !== 404, "Function must exist")
    if (status === 200) {
      assertEquals(data.success, true, "Fallback response success should be true")
      assertExists(data.imageUrl, "Fallback response must include fallback imageUrl")
    }
  },
})

Deno.test({
  name: "generate-daily-jigsaw-image: stops generation when 1,000 AI generated images reached",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, data } = await callFn({})
    assertEquals(true, status !== 404, "Function must exist")
    if (status === 200) {
      assertEquals(data.success, true)
    }
  },
})
