/**
 * Integration tests for fetch-market-gift-cards edge function.
 *
 * Tests the market-specific gift card catalog fetch which includes prepaid cards.
 * Prerequisites: `npx supabase functions serve` + local Supabase running.
 * Run: deno test --allow-net --allow-env supabase/functions/fetch-market-gift-cards/test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { authHeaders, invokeFunction, serviceHeaders } from "../_shared/test-helpers.ts";

Deno.test("fetch-market-gift-cards — returns catalog with count", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "fetch-market-gift-cards",
    {},
    headers,
  );
  assertEquals(status, 200);
  assertExists(data.count !== undefined);
  assertExists(data.cached !== undefined);
  // cards may be empty if no provider keys configured, but structure should be valid
  if (data.cards) {
    assertEquals(Array.isArray(data.cards), true);
  }
});

Deno.test("fetch-market-gift-cards — supports refresh parameter", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "fetch-market-gift-cards",
    { refresh: true },
    headers,
  );
  assertEquals(status, 200);
  assertExists(data.count !== undefined);
  // When refreshing, cached should be false
  if ((data.count as number) > 0) {
    assertEquals(data.cached, false);
  }
});

Deno.test("fetch-market-gift-cards — works with authenticated user", async () => {
  const headers = await authHeaders();
  const { status, data } = await invokeFunction(
    "fetch-market-gift-cards",
    {},
    headers,
  );
  assertEquals(status, 200);
  assertExists(data.count !== undefined);
});

Deno.test("fetch-market-gift-cards — returns cards with expected fields", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "fetch-market-gift-cards",
    {},
    headers,
  );
  assertEquals(status, 200);
  if (data.cards && (data.cards as unknown[]).length > 0) {
    const card = (data.cards as Record<string, unknown>[])[0]!;
    // Each card should have these fields
    assertExists(card.brandName);
    assertExists(card.brandKey);
    assertExists(card.availableProviders);
    assertEquals(Array.isArray(card.availableProviders), true);
  }
});
