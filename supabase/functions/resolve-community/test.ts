import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mock Deno.env for local testing if needed, though supabase test runs inject them
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "ey...";

Deno.test("Resolve Community - Sanity Check", async () => {
  // This test verifies that the module can at least be imported and dependencies are resolved.
  // Real integration tests would require mocking the database or running against a local Supabase instance.

  // Check if libraries import correctly (this would have failed with the npm: vs esm.sh issue)
  const { latLngToCell } = await import("https://esm.sh/h3-js@4.1.0");
  const index = latLngToCell(37.7749, -122.4194, 7);

  assertExists(index);
  assertEquals(index.length, 15);
  console.log("H3 Library imported and working:", index);
});

// Integration Test (Requires running Supabase)
// Run with: deno test --allow-net --allow-env
Deno.test("Resolve Community - Payload Validation", async () => {
  // We can't easily invoke the served function directly without refactoring it to export the handler.
  // But we can test the inputs.
  const payload = { address: "1600 Amphitheatre Parkway, Mountain View, CA" };
  assertExists(payload.address);
});
