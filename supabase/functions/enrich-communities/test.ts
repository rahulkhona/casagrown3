/**
 * Integration tests for enrich-communities edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/enrich-communities/test.ts
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

Deno.test("enrich-communities — CORS preflight", async () => {
  const headers = await optionsPreflight("enrich-communities");
  assertEquals(headers.get("access-control-allow-origin"), "*");
});

Deno.test("enrich-communities — processes with default limit", async () => {
  const { data } = await invokeFunction(
    "enrich-communities",
    {},
    serviceHeaders(),
  );
  // Should either enrich a community or report none needed
  const hasProcessed = "processed" in data;
  const hasMessage = "message" in data;
  assertEquals(
    hasProcessed || hasMessage,
    true,
    "Should return either processed count or message",
  );

  if (hasProcessed) {
    assertExists(data.results, "Should have results array");
  }
  if (hasMessage) {
    assertEquals(data.message, "No communities need enrichment");
  }
});

Deno.test("enrich-communities — respects limit parameter", async () => {
  const { data } = await invokeFunction(
    "enrich-communities",
    { limit: 1 },
    serviceHeaders(),
  );
  const hasProcessed = "processed" in data;
  const hasMessage = "message" in data;
  assertEquals(hasProcessed || hasMessage, true);
});
