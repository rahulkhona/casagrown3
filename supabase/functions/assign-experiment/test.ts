/**
 * Integration tests for assign-experiment edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/assign-experiment/test.ts
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

Deno.test("assign-experiment — CORS preflight", async () => {
  const headers = await optionsPreflight("assign-experiment");
  assertEquals(headers.get("access-control-allow-origin"), "*");
});

Deno.test("assign-experiment — validates required fields", async () => {
  const { data } = await invokeFunction(
    "assign-experiment",
    {},
    serviceHeaders(),
  );
  assertExists(data.error);
  assertEquals(
    (data.error as string).includes("experiment_id"),
    true,
  );
});

Deno.test("assign-experiment — handles nonexistent experiment", async () => {
  const { data } = await invokeFunction(
    "assign-experiment",
    {
      experiment_id: "00000000-0000-0000-0000-000000000000",
      device_id: "test-device-123",
      context: {},
    },
    serviceHeaders(),
  );
  assertExists(data.error);
  assertEquals(
    (data.error as string).includes("not found"),
    true,
  );
});
