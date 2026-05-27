/**
 * Pro Subscription — Integration Tests
 *
 * Tests the manage-subscription edge function: confirm flow,
 * subscription receipt records, notification creation, and
 * stripe-subscription-webhook handlers.
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Test seller from seed data
const TEST_SELLER_ID = "a1111111-1111-1111-1111-111111111111";
const TEST_SELLER_EMAIL = "seller@test.local";

async function dbSelect(table: string, query: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${query}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  return res.json();
}

async function dbInsert(table: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function dbDelete(table: string, query: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
}

async function dbUpdate(
  table: string,
  query: string,
  data: Record<string, unknown>,
) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(data),
  });
}

async function callManageSubscription(
  action: string,
  extra: Record<string, unknown> = {},
) {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/manage-subscription`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action, user_id: TEST_SELLER_ID, ...extra }),
    },
  );
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Setup: Ensure clean state
// ═══════════════════════════════════════════════════════════════
async function cleanupTestData() {
  await dbDelete("subscription_receipts", `user_id=eq.${TEST_SELLER_ID}`);
  await dbDelete("seller_subscriptions", `user_id=eq.${TEST_SELLER_ID}`);
  await dbDelete("notifications", `user_id=eq.${TEST_SELLER_ID}`);
  await dbUpdate("profiles", `id=eq.${TEST_SELLER_ID}`, { is_pro: false });
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

Deno.test("Pro Subscription — status returns free when no subscription", async () => {
  await cleanupTestData();
  const result = await callManageSubscription("status");
  assertEquals(result.plan, "free");
  assertEquals(result.isPro, false);
});

Deno.test("Pro Subscription — confirm creates subscription + receipt + notification", async () => {
  await cleanupTestData();

  // Create an incomplete subscription first
  await dbInsert("seller_subscriptions", {
    user_id: TEST_SELLER_ID,
    plan: "pro",
    status: "inactive",
    stripe_customer_id: "cus_test_123",
    stripe_subscription_id: "sub_sim_test_123",
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const result = await callManageSubscription("confirm");

  assertEquals(result.success, true);
  assertEquals(result.isPro, true);

  // Verify subscription is now active
  const subs = await dbSelect(
    "seller_subscriptions",
    `user_id=eq.${TEST_SELLER_ID}&select=status,plan`,
  );
  assertEquals(subs[0]?.status, "active");
  assertEquals(subs[0]?.plan, "pro");

  // Verify profile is_pro flag
  const profiles = await dbSelect(
    "profiles",
    `id=eq.${TEST_SELLER_ID}&select=is_pro`,
  );
  assertEquals(profiles[0]?.is_pro, true);

  // Verify subscription receipt was created
  const receipts = await dbSelect(
    "subscription_receipts",
    `user_id=eq.${TEST_SELLER_ID}&select=amount_usd,description`,
  );
  assertEquals(receipts.length >= 1, true, "Should have at least 1 receipt");
  assertEquals(receipts[0]?.description, "CasaGrown Pro — Monthly subscription");

  // Verify in-app notification was created
  const notifications = await dbSelect(
    "notifications",
    `user_id=eq.${TEST_SELLER_ID}&select=content&order=created_at.desc&limit=1`,
  );
  assertEquals(notifications.length >= 1, true, "Should have at least 1 notification");
  const content = notifications[0]?.content || "";
  assertEquals(
    content.includes("Pro") || content.includes("pro"),
    true,
    "Notification should mention Pro",
  );
});

Deno.test("Pro Subscription — status returns active after confirm", async () => {
  const result = await callManageSubscription("status");
  assertEquals(result.plan, "pro");
  assertEquals(result.isPro, true);
  assertEquals(result.status, "active");
});

Deno.test("Pro Subscription — cancel marks subscription for end-of-period", async () => {
  const result = await callManageSubscription("cancel");
  assertEquals(result.success, true);

  const subs = await dbSelect(
    "seller_subscriptions",
    `user_id=eq.${TEST_SELLER_ID}&select=canceled_at,status`,
  );
  assertExists(subs[0]?.canceled_at, "canceled_at should be set");
});

Deno.test("Pro Subscription — resume clears canceled_at", async () => {
  const result = await callManageSubscription("resume");
  assertEquals(result.success, true);

  const subs = await dbSelect(
    "seller_subscriptions",
    `user_id=eq.${TEST_SELLER_ID}&select=canceled_at`,
  );
  assertEquals(subs[0]?.canceled_at, null, "canceled_at should be null after resume");
});

Deno.test("Pro Subscription — subscription_receipts table has correct schema", async () => {
  const receipts = await dbSelect(
    "subscription_receipts",
    `user_id=eq.${TEST_SELLER_ID}&select=id,user_id,amount_usd,description,stripe_session_id,stripe_invoice_id,invoice_url,period_start,period_end,created_at&limit=1`,
  );

  if (receipts.length > 0) {
    const r = receipts[0];
    assertExists(r.id, "Should have id");
    assertExists(r.user_id, "Should have user_id");
    assertExists(r.amount_usd, "Should have amount_usd");
    assertExists(r.description, "Should have description");
    assertExists(r.created_at, "Should have created_at");
  }
});

Deno.test("Pro Subscription — webhook handles invoice.paid", async () => {
  await cleanupTestData();

  // Create an active subscription
  await dbInsert("seller_subscriptions", {
    user_id: TEST_SELLER_ID,
    plan: "pro",
    status: "active",
    stripe_customer_id: "cus_webhook_test",
    stripe_subscription_id: "sub_webhook_test",
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const webhookBody = {
    id: "evt_test_invoice_paid",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_test_123",
        customer: "cus_webhook_test",
        subscription: "sub_webhook_test",
        amount_paid: 1000,
        hosted_invoice_url: "https://stripe.com/invoice/test",
        period_start: Math.floor(Date.now() / 1000),
        period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      },
    },
  };

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/stripe-subscription-webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(webhookBody),
    },
  );

  const result = await res.json();
  assertEquals(result.received, true);
  assertEquals(result.action, "invoice_confirmed");

  // Verify receipt was created
  const receipts = await dbSelect(
    "subscription_receipts",
    `user_id=eq.${TEST_SELLER_ID}&select=amount_usd&order=created_at.desc&limit=1`,
  );
  assertEquals(receipts.length >= 1, true, "Should have receipt from webhook");
  assertEquals(receipts[0]?.amount_usd, 10);

  // Verify in-app notification
  const notifications = await dbSelect(
    "notifications",
    `user_id=eq.${TEST_SELLER_ID}&select=content&order=created_at.desc&limit=1`,
  );
  assertEquals(notifications.length >= 1, true, "Should have notification from webhook");
});

Deno.test("Pro Subscription — webhook handles payment_failed", async () => {
  const webhookBody = {
    id: "evt_test_payment_failed",
    type: "invoice.payment_failed",
    data: {
      object: {
        customer: "cus_webhook_test",
        subscription: "sub_webhook_test",
      },
    },
  };

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/stripe-subscription-webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(webhookBody),
    },
  );

  const result = await res.json();
  assertEquals(result.received, true);
  assertEquals(result.action, "marked_past_due");

  const subs = await dbSelect(
    "seller_subscriptions",
    `user_id=eq.${TEST_SELLER_ID}&select=status`,
  );
  assertEquals(subs[0]?.status, "past_due");
});

Deno.test("Pro Subscription — webhook handles subscription.deleted", async () => {
  await dbUpdate("seller_subscriptions", `user_id=eq.${TEST_SELLER_ID}`, {
    status: "active",
  });
  await dbUpdate("profiles", `id=eq.${TEST_SELLER_ID}`, { is_pro: true });

  const webhookBody = {
    id: "evt_test_sub_deleted",
    type: "customer.subscription.deleted",
    data: {
      object: {
        customer: "cus_webhook_test",
        status: "canceled",
      },
    },
  };

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/stripe-subscription-webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(webhookBody),
    },
  );

  const result = await res.json();
  assertEquals(result.received, true);
  assertEquals(result.action, "canceled");

  const profiles = await dbSelect(
    "profiles",
    `id=eq.${TEST_SELLER_ID}&select=is_pro`,
  );
  assertEquals(profiles[0]?.is_pro, false);
});

// Cleanup — restore seed state so downstream E2E tests pass
Deno.test("Pro Subscription — cleanup test data", async () => {
  await cleanupTestData();

  // Restore seed state: is_pro=true + active subscription + FB connection
  await dbUpdate("profiles", `id=eq.${TEST_SELLER_ID}`, { is_pro: true });
  await dbInsert("seller_subscriptions", {
    user_id: TEST_SELLER_ID,
    plan: "pro",
    status: "active",
    stripe_customer_id: "cus_test_sam_seller",
    stripe_subscription_id: "sub_test_sam_seller",
  });
  await dbInsert("seller_fb_connections", {
    user_id: TEST_SELLER_ID,
    fb_access_token: "EAAtest_fake_token_for_e2e",
    fb_page_id: "123456789012345",
    fb_page_name: "Willow Glen Farm Stand",
    fb_page_access_token: "EAAtest_fake_page_token_for_e2e",
    auto_sync_enabled: true,
    status: "connected",
  });

  assertEquals(true, true);
});
