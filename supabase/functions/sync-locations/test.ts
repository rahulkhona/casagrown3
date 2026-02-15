/**
 * Integration tests for sync-locations edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/sync-locations/test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
  invokeFunction,
  optionsPreflight,
  serviceHeaders,
} from "../_shared/test-helpers.ts";

Deno.test("sync-locations — CORS preflight", async () => {
  const headers = await optionsPreflight("sync-locations");
  assertEquals(headers.get("access-control-allow-origin"), "*");
});

Deno.test("sync-locations — syncs countries successfully", async () => {
  const { data } = await invokeFunction(
    "sync-locations",
    {},
    serviceHeaders(),
  );
  assertEquals(data.success, true, "Should succeed");
  assertExists(data.count, "Should return country count");
  assertEquals(
    (data.count as number) > 100,
    true,
    "Should have 100+ countries",
  );
  assertEquals(data.message, "Countries synced successfully");
});
