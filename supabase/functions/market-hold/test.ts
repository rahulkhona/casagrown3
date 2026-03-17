/**
 * Integration tests for market-hold edge function.
 *
 * Prerequisites: `npx supabase functions serve` + local Supabase running.
 * Run: deno test --allow-net --allow-env supabase/functions/market-hold/test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { authHeaders, invokeFunction } from "../_shared/test-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Supabase REST API helper */
async function supabaseRest(
  table: string,
  method: string,
  body?: Record<string, unknown>,
  queryParams?: string,
): Promise<Record<string, unknown>[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${queryParams ? `?${queryParams}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
      "Prefer": "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!text) return [];
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}

Deno.test("market-hold — rejects missing order_id", async () => {
  const headers = await authHeaders();
  const { status, data } = await invokeFunction(
    "market-hold",
    { amount_cents: 500 },
    headers,
  );
  assertEquals(status, 400);
  assertExists(data.error);
});

Deno.test("market-hold — rejects missing amount_cents", async () => {
  const headers = await authHeaders();
  const { status, data } = await invokeFunction(
    "market-hold",
    { order_id: "fake-order-id" },
    headers,
  );
  assertEquals(status, 400);
  assertExists(data.error);
});

Deno.test("market-hold — rejects non-existent order", async () => {
  const headers = await authHeaders();
  const { status, data } = await invokeFunction(
    "market-hold",
    { order_id: "00000000-0000-0000-0000-000000000000", amount_cents: 500 },
    headers,
  );
  assertEquals(status, 400);
  assertExists(data.error);
});

Deno.test("market-hold — rejects unauthenticated request", async () => {
  const { status } = await invokeFunction(
    "market-hold",
    { order_id: "d0000000-0000-0000-0000-000000000001", amount_cents: 500 },
    { "Content-Type": "application/json" },
  );
  // Should fail auth (401 or 400)
  assertEquals(status >= 400, true);
});
