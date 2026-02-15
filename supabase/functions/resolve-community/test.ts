/**
 * Integration tests for resolve-community edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/resolve-community/test.ts
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

Deno.test("resolve-community — CORS preflight", async () => {
  const headers = await optionsPreflight("resolve-community");
  assertEquals(headers.get("access-control-allow-origin"), "*");
});

Deno.test("resolve-community — rejects missing location", async () => {
  const { data } = await invokeFunction(
    "resolve-community",
    {},
    serviceHeaders(),
  );
  assertExists(data.error);
  assertEquals(
    (data.error as string).includes("Missing location"),
    true,
  );
});

Deno.test("resolve-community — resolves by lat/lng", async () => {
  const { data } = await invokeFunction(
    "resolve-community",
    { lat: 37.7749, lng: -122.4194 }, // San Francisco
    serviceHeaders(),
  );
  assertExists(data.primary, "Should return primary community");
  assertExists(
    (data.primary as Record<string, unknown>).name,
    "Primary should have name",
  );
  assertExists(
    (data.primary as Record<string, unknown>).h3_index,
    "Primary should have h3_index",
  );
  assertExists(data.neighbors, "Should return neighbors");
  assertEquals(
    (data.neighbors as unknown[]).length > 0,
    true,
    "Should have at least 1 neighbor",
  );
  assertExists(data.resolved_location, "Should return resolved location");
  assertExists(data.hex_boundaries, "Should return hex boundaries");
});

Deno.test("resolve-community — resolves by address (geocoding)", async () => {
  const { data } = await invokeFunction(
    "resolve-community",
    { address: "1600 Amphitheatre Parkway, Mountain View, CA" },
    serviceHeaders(),
  );
  assertExists(data.primary, "Should return primary community");
  assertExists(data.resolved_location, "Should return resolved location");
  const loc = data.resolved_location as { lat: number; lng: number };
  // Mountain View coordinates (approximate)
  assertEquals(
    loc.lat > 37.0 && loc.lat < 38.0,
    true,
    "Lat should be near SF Bay Area",
  );
  assertEquals(
    loc.lng < -121.0 && loc.lng > -123.0,
    true,
    "Lng should be near SF Bay Area",
  );
});
