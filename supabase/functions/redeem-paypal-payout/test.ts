/**
 * Integration tests for redeem-paypal-payout edge function.
 *
 * Prerequisite: `npx supabase functions serve` + local Supabase running.
 * Run: deno test --allow-net --allow-env supabase/functions/redeem-paypal-payout/test.ts
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
  const url = `${SUPABASE_URL}/rest/v1/${table}${
    queryParams ? `?${queryParams}` : ""
  }`;
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

async function setProviderActiveStatus(provider: string, isActive: boolean) {
  await supabaseRest("provider_queue_status", "PATCH", {
    is_active: isActive,
  }, `provider=eq.${provider}`);
}

async function setProviderDisabledAt(provider: string, dateIso: string | null) {
  await supabaseRest("provider_queue_status", "PATCH", {
    disabled_at: dateIso,
  }, `provider=eq.${provider}`);
}

Deno.test("redeem-paypal-payout — rejects invalid points amount", async () => {
  const headers = await authHeaders();
  const { status, data } = await invokeFunction(
    "redeem-paypal-payout",
    { pointsToRedeem: -50, payoutId: "test@example.com" },
    headers,
  );
  // Our shared error handler wraps thrown Error objects in status 400
  assertEquals(status, 400);
  assertEquals((data.error as string).includes("Invalid points amount"), true);
});

Deno.test("redeem-paypal-payout — rejects missing payout ID", async () => {
  const headers = await authHeaders();
  const { status, data } = await invokeFunction(
    "redeem-paypal-payout",
    { pointsToRedeem: 100 }, // payoutId is missing, and user profile doesn't have one
    headers,
  );
  assertEquals(status, 400);
  assertEquals(
    (data.error as string).includes("No PayPal email or Venmo phone"),
    true,
  );
});

Deno.test("redeem-paypal-payout — rejects insufficient points", async () => {
  const headers = await authHeaders();

  // Test user has 0 points, so requesting 100 should fail
  const { status, data } = await invokeFunction(
    "redeem-paypal-payout",
    { pointsToRedeem: 100, payoutId: "test@example.com" },
    headers,
  );
  assertEquals(status, 400);
  console.log("ACTUAL ERROR:", data.error);
  assertEquals((data.error as string).includes("Insufficient points"), true);
});

Deno.test("redeem-paypal-payout — honors provider disabled status", async () => {
  // 1. Disable PayPal provider and warp the disabled_at time to bypass Grace Window
  await setProviderActiveStatus("paypal", false);
  const wayPast = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await setProviderDisabledAt("paypal", wayPast);

  const headers = await authHeaders();

  // 2. Expect specific "temporarily offline" rejection before balance checks
  const { status, data } = await invokeFunction(
    "redeem-paypal-payout",
    { pointsToRedeem: 100, payoutId: "test@example.com" },
    headers,
  );
  assertEquals(status, 400);
  assertEquals((data.error as string).includes("temporarily offline"), true);

  // Cleanup
  await setProviderActiveStatus("paypal", true);
  await setProviderDisabledAt("paypal", null);
});
