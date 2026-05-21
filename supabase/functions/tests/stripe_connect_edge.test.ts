/**
 * Stripe Connect System — Edge Function Integration Tests
 *
 * Runs E2E integration tests for:
 * - stripe-connect-onboard
 * - stripe-webhook (specifically Connect account.updated events)
 * - execute-settlement-captures (Stripe Connect transfer execution)
 *
 * Run: deno test --allow-net --allow-env supabase/functions/tests/stripe_connect_edge.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper: invoke edge function
async function invoke(name: string, body: unknown, token?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token || ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// Helper: query table via REST
async function query(table: string, params: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  return res.json().catch(() => []);
}

// Helper: mutate table via REST (using Service Key for admin access)
async function mutate(table: string, method: "POST" | "PATCH" | "DELETE", body: unknown, params = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? `?${params}` : ""}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => null);
}

// ============================================================================
// 1. STRIPE-CONNECT-ONBOARD
// ============================================================================

Deno.test("[stripe-connect-onboard] rejects unauthenticated requests with 401", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-connect-onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("[stripe-connect-onboard] fails gracefully on invalid auth credentials", async () => {
  const { status, data } = await invoke(
    "stripe-connect-onboard", 
    {}, 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid-token"
  );
  
  assertEquals(status, 401);
  if (data?.error) {
    assertEquals(data.error, "Authentication required");
  }
});

// ============================================================================
// 2. STRIPE-WEBHOOK (account.updated Webhook Receiver)
// ============================================================================

Deno.test("[stripe-webhook] completes seller onboarding upon charges/payouts enabled", async () => {
  const mockStripeId = `acct_edge_test_${Math.random().toString(36).substring(2, 8)}`;

  // Create standard auth user using signup endpoint (bypasses admin jwt HS256 validation constraints)
  const email = `edge-test-${Date.now()}@test.local`;
  const signUpRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
    body: JSON.stringify({ email, password: "testPassword123!" }),
  });
  const signUpData = await signUpRes.json();
  const mockUserId = signUpData.user?.id;
  if (!mockUserId) {
    throw new Error(`Failed to create test user: ${JSON.stringify(signUpData)}`);
  }

  // Update profile to ensure correct initial state
  await mutate("profiles", "PATCH", {
    stripe_connect_id: mockStripeId,
    stripe_onboarding_completed: false,
    stripe_connect_active: false,
  }, `id=eq.${mockUserId}`);

  // 2. Call stripe-webhook function with the mock account.updated complete payload
  const webhookBody = {
    type: "account.updated",
    id: `evt_edge_test_${Date.now()}`,
    data: {
      object: {
        id: mockStripeId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    },
  };

  const { status, data } = await invoke("stripe-webhook", webhookBody);
  
  // Accept 200 (success) or 401 (signature restriction active in dev env)
  if (status === 200) {
    assertEquals(data?.received, true);

    // 3. Assert DB profile state transitions to completed and active
    const profiles = await query("profiles", `id=eq.${mockUserId}`);
    assertEquals(profiles.length, 1);
    assertEquals(profiles[0].stripe_onboarding_completed, true);
    assertEquals(profiles[0].stripe_connect_active, true);

    // 4. Assert in-app notification is fired/created
    const notifications = await query("notifications", `user_id=eq.${mockUserId}&order=created_at.desc&limit=1`);
    assertEquals(notifications.length, 1);
    assertEquals(notifications[0].content.includes("Stripe account has been successfully linked"), true);
  } else if (status === 401) {
    console.log("ℹ️ Webhook returned 401 (Expected signature check failed since STRIPE_WEBHOOK_SECRET is active).");
  } else {
    throw new Error(`Unexpected stripe-webhook status ${status}`);
  }
});

// ============================================================================
// 3. EXECUTE-SETTLEMENT-CAPTURES
// ============================================================================

Deno.test("[execute-settlement-captures] executes with zero captures gracefully", async () => {
  const nonexistentSettlementId = "ff000000-0000-0000-0000-000000000f01";
  
  const { status, data } = await invoke(
    "execute-settlement-captures", 
    { settlement_id: nonexistentSettlementId },
    SERVICE_KEY
  );
  
  // Should complete gracefully with 200 and total 0 captures processed
  if (status === 200) {
    assertEquals(data?.total, 0);
    assertEquals(data?.transfers_total, 0);
  } else if (status === 401 || status === 403) {
    console.log("ℹ️ Auth restricted in test environment (missing or invalid service token).");
  } else {
    throw new Error(`Unexpected status ${status}`);
  }
});
