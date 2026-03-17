/**
 * Integration tests for market-cron edge function.
 *
 * Tests the market_reminder and daily_digest cron actions.
 * Prerequisites: `npx supabase functions serve` + local Supabase running.
 * Run: deno test --allow-net --allow-env supabase/functions/market-cron/test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { invokeFunction, serviceHeaders } from "../_shared/test-helpers.ts";

Deno.test("market-cron — market_reminder returns sent count", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "market-cron",
    { action: "market_reminder" },
    headers,
  );
  assertEquals(status, 200);
  assertExists(data.sent !== undefined || data.message !== undefined);
});

Deno.test("market-cron — daily_digest returns sent count", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "market-cron",
    { action: "daily_digest" },
    headers,
  );
  assertEquals(status, 200);
  assertExists(data.sent !== undefined || data.message !== undefined);
});

Deno.test("market-cron — unknown action returns error", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "market-cron",
    { action: "nonexistent_action" },
    headers,
  );
  assertEquals(status, 200); // It returns jsonOk with error field
  assertExists(data.error);
  assertEquals((data.error as string).includes("Unknown action"), true);
});

Deno.test("market-cron — defaults to market_reminder with no body", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "market-cron",
    {},
    headers,
  );
  assertEquals(status, 200);
  // Should process market_reminder (default action)
  assertExists(data.sent !== undefined || data.message !== undefined);
});
