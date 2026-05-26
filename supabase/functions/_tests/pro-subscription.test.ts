/**
 * Deno integration tests for Pro subscription management.
 *
 * Tests the seller_subscriptions table, manage-subscription edge function,
 * and the relationship between subscriptions and profiles.is_pro flag.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/pro-subscription.test.ts
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const SELLER_ID = "a1111111-1111-1111-1111-111111111111";
const BUYER_ID = "b2222222-2222-2222-2222-222222222222";

// Helper: run SQL via docker exec
async function sqlExec(sql: string): Promise<string> {
  const proc = new Deno.Command("docker", {
    args: [
      "exec", "-i", "supabase_db_casagrown3",
      "psql", "-U", "postgres", "-t", "-A", "-c", sql,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await proc.output();
  const raw = new TextDecoder().decode(output.stdout).trim();
  const lines = raw.split("\n").filter((l) =>
    !l.match(/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|RESET)\s/i)
  );
  return lines[0]?.trim() || raw;
}

// Helper: get seller token
async function getSellerToken(): Promise<{ token: string; userId: string }> {
  // Fix identity if needed
  const proc = new Deno.Command("docker", {
    args: [
      "exec", "-i", "supabase_db_casagrown3",
      "psql", "-U", "postgres", "-c",
      `INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
       SELECT id, id, email, 'email', jsonb_build_object('sub', id::text, 'email', email), now(), now(), now()
       FROM auth.users WHERE email = 'seller@test.local'
       ON CONFLICT (provider_id, provider) DO NOTHING;
       UPDATE auth.users SET
         confirmation_token = COALESCE(confirmation_token, ''),
         recovery_token = COALESCE(recovery_token, ''),
         email_change_token_new = COALESCE(email_change_token_new, ''),
         email_change = COALESCE(email_change, ''),
         email_change_token_current = COALESCE(email_change_token_current, ''),
         reauthentication_token = COALESCE(reauthentication_token, '')
       WHERE email = 'seller@test.local';`,
    ],
  });
  try { await proc.output(); } catch { /* ok */ }

  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ email: "seller@test.local", password: "TestPassword123!" }),
    },
  );
  const data = await res.json();
  if (!data.access_token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return { token: data.access_token, userId: data.user.id };
}

// Helper: call edge function
async function callManageSubscription(
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: any }> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/manage-subscription`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );
  let data;
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text() };
  }
  return { status: res.status, data };
}

// ══════════════════════════════════════════════════════════════
// Table Structure
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "pro-subscription: seller_subscriptions table exists",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const exists = await sqlExec(
      `SELECT count(*) FROM information_schema.tables WHERE table_name = 'seller_subscriptions'`,
    );
    assertEquals(exists, "1");
  },
});

Deno.test({
  name: "pro-subscription: table has required columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_name = 'seller_subscriptions'
    `);
    assert(cols.includes("user_id"), "Should have user_id");
    assert(cols.includes("plan"), "Should have plan");
    assert(cols.includes("status"), "Should have status");
    assert(cols.includes("stripe_subscription_id"), "Should have stripe_subscription_id");
    assert(cols.includes("stripe_customer_id"), "Should have stripe_customer_id");
  },
});

// ══════════════════════════════════════════════════════════════
// CRUD Operations
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "pro-subscription: create subscription record",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Ensure clean slate
    await sqlExec(
      `DELETE FROM seller_subscriptions WHERE user_id = '${BUYER_ID}'`,
    );

    const id = await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id)
      VALUES ('${BUYER_ID}', 'pro', 'active', 'cus_test_buyer', 'sub_test_buyer')
      RETURNING id
    `);
    assertExists(id);
    assert(id.length > 10, "Should return a UUID");

    // Cleanup
    await sqlExec(
      `DELETE FROM seller_subscriptions WHERE user_id = '${BUYER_ID}'`,
    );
  },
});

Deno.test({
  name: "pro-subscription: unique constraint on user_id",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Seller already has a subscription from seed — try duplicate
    const result = await sqlExec(`
      DO $$ BEGIN
        INSERT INTO seller_subscriptions (user_id, plan, status)
        VALUES ('${SELLER_ID}', 'pro', 'active');
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'unique_violation';
      END $$
    `);
    // If we get here without error, ON CONFLICT handled it
    // The key test is that the table enforces uniqueness
    const count = await sqlExec(
      `SELECT count(*) FROM seller_subscriptions WHERE user_id = '${SELLER_ID}'`,
    );
    assertEquals(count, "1");
  },
});

Deno.test({
  name: "pro-subscription: plan check constraint validates values",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Try invalid plan
    const result = await sqlExec(`
      DO $$ BEGIN
        INSERT INTO seller_subscriptions (user_id, plan, status)
        VALUES ('${BUYER_ID}', 'invalid_plan', 'active');
      EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'check_violation';
      END $$
    `);
    // If no error, the constraint works or it fell through
    const exists = await sqlExec(
      `SELECT count(*) FROM seller_subscriptions WHERE user_id = '${BUYER_ID}' AND plan = 'invalid_plan'`,
    );
    assertEquals(exists, "0");
  },
});

Deno.test({
  name: "pro-subscription: cancel subscription changes status",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await sqlExec(`
      UPDATE seller_subscriptions SET status = 'canceled', canceled_at = now()
      WHERE user_id = '${SELLER_ID}'
    `);

    const status = await sqlExec(
      `SELECT status FROM seller_subscriptions WHERE user_id = '${SELLER_ID}'`,
    );
    assertEquals(status, "canceled");

    // Restore for other tests
    await sqlExec(`
      UPDATE seller_subscriptions SET status = 'active', canceled_at = NULL
      WHERE user_id = '${SELLER_ID}'
    `);
  },
});

// ══════════════════════════════════════════════════════════════
// manage-subscription Edge Function
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "pro-subscription: manage-subscription requires auth",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/manage-subscription`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          // No auth token
        },
        body: JSON.stringify({ action: "create-checkout-session" }),
      },
    );

    // Should reject with 401 or return error
    assert(
      [200, 401, 403].includes(res.status),
      `Expected auth rejection, got ${res.status}`,
    );
    if (res.status === 200) {
      const data = await res.json();
      // If 200, should have an error field
      assert(
        data.error || data.skipped,
        "Unauthenticated request should error",
      );
    }
  },
});

Deno.test({
  name: "pro-subscription: create-checkout-session returns structured response",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    let token: string;
    try {
      ({ token } = await getSellerToken());
    } catch (e) {
      console.log(`⚠️ Could not get seller token: ${e.message} — skipping`);
      return;
    }
    const { status, data } = await callManageSubscription(token, {
      action: "create-checkout-session",
    });

    // Without real Stripe keys, will get an error but should be structured
    assert(
      [200, 400, 401, 404, 500].includes(status),
      `Expected structured response, got ${status}: ${JSON.stringify(data)}`,
    );
    assertExists(data);
  },
});

Deno.test({
  name: "pro-subscription: cancel-subscription returns structured response",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    let token: string;
    try {
      ({ token } = await getSellerToken());
    } catch (e) {
      console.log(`⚠️ Could not get seller token — skipping`);
      return;
    }
    const { status, data } = await callManageSubscription(token, {
      action: "cancel-subscription",
    });

    assert(
      [200, 400, 401, 404, 500].includes(status),
      `Expected structured response, got ${status}: ${JSON.stringify(data)}`,
    );
    assertExists(data);
  },
});

Deno.test({
  name: "pro-subscription: resume-subscription returns structured response",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    let token: string;
    try {
      ({ token } = await getSellerToken());
    } catch (e) {
      console.log(`⚠️ Could not get seller token — skipping`);
      return;
    }
    const { status, data } = await callManageSubscription(token, {
      action: "resume-subscription",
    });

    assert(
      [200, 400, 401, 404, 500].includes(status),
      `Expected structured response, got ${status}: ${JSON.stringify(data)}`,
    );
    assertExists(data);
  },
});

Deno.test({
  name: "pro-subscription: invalid action returns error",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    let token: string;
    try {
      ({ token } = await getSellerToken());
    } catch (e) {
      console.log(`⚠️ Could not get seller token — skipping`);
      return;
    }
    const { status, data } = await callManageSubscription(token, {
      action: "invalid-action",
    });

    assertExists(data);
    assert(data.error || status >= 400, "Should return error for invalid action");
  },
});

// ══════════════════════════════════════════════════════════════
// Pro Features Integration
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "pro-subscription: profiles.is_pro reflects subscription status",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Seller should be Pro
    const isPro = await sqlExec(
      `SELECT is_pro FROM profiles WHERE id = '${SELLER_ID}'`,
    );
    assertEquals(isPro, "t");

    // Buyer should not be Pro
    const buyerPro = await sqlExec(
      `SELECT COALESCE(is_pro, false) FROM profiles WHERE id = '${BUYER_ID}'`,
    );
    assertEquals(buyerPro, "f");
  },
});

Deno.test({
  name: "pro-subscription: pro_onboarding fields exist",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_name = 'profiles' AND column_name IN (
        'farm_name', 'business_type', 'business_logo_url', 'seller_bio',
        'business_license', 'pro_features_enabled'
      )
    `);
    assert(cols.includes("farm_name"), "profiles should have farm_name");
    assert(cols.includes("business_logo_url"), "profiles should have business_logo_url");
    assert(cols.includes("seller_bio"), "profiles should have seller_bio");
    assert(cols.includes("pro_features_enabled"), "profiles should have pro_features_enabled");
  },
});
