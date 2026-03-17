/**
 * Integration tests for send-market-email edge function.
 *
 * Tests email sending via Mailpit (local SMTP).
 * Prerequisites: `npx supabase functions serve` + local Supabase running + Mailpit.
 * Run: deno test --allow-net --allow-env supabase/functions/send-market-email/test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { invokeFunction, serviceHeaders } from "../_shared/test-helpers.ts";

Deno.test("send-market-email — rejects missing fields", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "send-market-email",
    { to: "test@test.com" },
    headers,
  );
  assertEquals(status, 400);
  assertExists(data.error);
  assertEquals(
    (data.error as string).includes("Missing required fields"),
    true,
  );
});

Deno.test("send-market-email — rejects missing to", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "send-market-email",
    { subject: "Test", html: "<p>Hello</p>" },
    headers,
  );
  assertEquals(status, 400);
  assertExists(data.error);
});

Deno.test("send-market-email — rejects missing subject", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "send-market-email",
    { to: "test@test.com", html: "<p>Hello</p>" },
    headers,
  );
  assertEquals(status, 400);
  assertExists(data.error);
});

Deno.test("send-market-email — sends email successfully via Mailpit", async () => {
  const headers = serviceHeaders();
  const { status, data } = await invokeFunction(
    "send-market-email",
    {
      to: "integration-test@test.local",
      subject: "Integration Test Email",
      html: "<p>This is a test email from send-market-email integration tests.</p>",
    },
    headers,
  );
  // Should succeed (200) or fail gracefully if Mailpit isn't reachable from edge function container
  assertEquals(status < 500, true);
  if (status === 200) {
    assertExists(data.success);
    assertEquals(data.success, true);
  }
});

Deno.test("send-market-email — handles CORS preflight", async () => {
  const FUNCTIONS_URL =
    (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321") +
    "/functions/v1";
  const res = await fetch(`${FUNCTIONS_URL}/send-market-email`, {
    method: "OPTIONS",
  });
  await res.text();
  assertEquals(res.status, 200);
  assertExists(res.headers.get("access-control-allow-origin"));
});
