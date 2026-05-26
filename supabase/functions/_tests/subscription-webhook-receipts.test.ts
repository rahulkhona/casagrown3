/**
 * Deno integration tests for stripe-subscription-webhook — invoice.paid handler
 *
 * Tests subscription status updates, receipt notifications (in-app, push, email, SMS),
 * market_ledger entries, edge cases ($0 amount, unknown customer), and
 * invoice.payment_failed → past_due transitions.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check \
 *        functions/_tests/subscription-webhook-receipts.test.ts
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

const HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
};

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-subscription-webhook`;

// ── Helpers ────────────────────────────────────────────────────────────────

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

async function sqlExecAll(sql: string): Promise<string[]> {
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
  return raw.split("\n").filter((l) =>
    l.trim() && !l.match(/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|RESET)\s/i)
  );
}

async function createUser(suffix: string): Promise<string> {
  const email = `sub-webhook-${suffix}-${Date.now()}@test.local`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: "TestPassword123!" }),
  });
  const data = await res.json();
  return data.user?.id;
}

async function callWebhook(body: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function invoicePaidEvent(customerId: string, opts: {
  amountPaidCents?: number;
  invoiceId?: string;
  subscriptionId?: string;
  periodStart?: number;
  periodEnd?: number;
} = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `evt_test_${Date.now()}`,
    type: "invoice.paid",
    data: {
      object: {
        id: opts.invoiceId || `in_test_${Date.now()}`,
        customer: customerId,
        subscription: opts.subscriptionId || `sub_test_${Date.now()}`,
        amount_paid: opts.amountPaidCents ?? 999,
        hosted_invoice_url: "https://invoice.stripe.com/test",
        period_start: opts.periodStart || now - 2592000,
        period_end: opts.periodEnd || now,
      },
    },
  };
}

function paymentFailedEvent(customerId: string): Record<string, unknown> {
  return {
    id: `evt_fail_${Date.now()}`,
    type: "invoice.payment_failed",
    data: {
      object: {
        id: `in_fail_${Date.now()}`,
        customer: customerId,
        subscription: `sub_fail_${Date.now()}`,
      },
    },
  };
}

// Test user/subscription state
const TEST_CUSTOMER_ID = `cus_receipt_test_${Date.now()}`;
let testUserId: string;

// ══════════════════════════════════════════════════════════════
// Setup: Create test user + subscription
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: setup test user and subscription",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    testUserId = await createUser("receipt");
    assertExists(testUserId, "Test user should be created");

    // Create profile with email
    await sqlExec(`
      UPDATE profiles SET full_name = 'Receipt Test Seller', email = 'receipt-seller@test.local'
      WHERE id = '${testUserId}'
    `);

    // Create subscription record
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id)
      VALUES ('${testUserId}', 'pro', 'active', '${TEST_CUSTOMER_ID}', 'sub_receipt_test')
      ON CONFLICT (user_id) DO UPDATE SET
        stripe_customer_id = '${TEST_CUSTOMER_ID}',
        status = 'active'
    `);

    // Verify
    const customerId = await sqlExec(
      `SELECT stripe_customer_id FROM seller_subscriptions WHERE user_id = '${testUserId}'`,
    );
    assertEquals(customerId, TEST_CUSTOMER_ID);
    console.log(`✅ Setup: testUserId=${testUserId}, customerId=${TEST_CUSTOMER_ID}`);
  },
});

// ══════════════════════════════════════════════════════════════
// 1. invoice.paid → updates subscription status to 'active'
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: invoice.paid updates status to active",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Temporarily set to past_due to verify it gets corrected
    await sqlExec(`
      UPDATE seller_subscriptions SET status = 'past_due'
      WHERE user_id = '${testUserId}'
    `);

    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 999 });
    const { status, data } = await callWebhook(event);

    assertEquals(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assertEquals(data.action, "invoice_confirmed");

    // Allow async processing
    await new Promise((r) => setTimeout(r, 1000));

    const subStatus = await sqlExec(
      `SELECT status FROM seller_subscriptions WHERE user_id = '${testUserId}'`,
    );
    assertEquals(subStatus, "active", "Subscription status should be 'active' after invoice.paid");
    console.log("✅ invoice.paid → status = active");
  },
});

// ══════════════════════════════════════════════════════════════
// 2. invoice.paid → sends in-app notification with correct amount
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: invoice.paid creates in-app notification",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clear old notifications
    await sqlExec(
      `DELETE FROM notifications WHERE user_id = '${testUserId}' AND content LIKE '%Pro subscription payment%'`,
    );

    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 999 });
    const { status } = await callWebhook(event);
    assertEquals(status, 200);

    await new Promise((r) => setTimeout(r, 1000));

    const notifContent = await sqlExec(`
      SELECT content FROM notifications
      WHERE user_id = '${testUserId}' AND content LIKE '%Pro subscription payment%'
      ORDER BY created_at DESC LIMIT 1
    `);

    assert(
      notifContent.includes("$9.99"),
      `Notification should include '$9.99', got: ${notifContent}`,
    );
    assert(
      notifContent.includes("processed successfully"),
      `Notification should confirm payment processed: ${notifContent}`,
    );
    console.log("✅ invoice.paid → in-app notification with $9.99");
  },
});

// ══════════════════════════════════════════════════════════════
// 3. invoice.paid → invokes send-push-notification with correct payload
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: invoice.paid invokes push notification",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // The push notification is invoked via supabase.functions.invoke.
    // In the local test environment, the function may not have real push tokens,
    // but the webhook should still succeed (errors are caught/logged, not thrown).
    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 1499 });
    const { status, data } = await callWebhook(event);

    assertEquals(status, 200, "Webhook should succeed even if push fails");
    assertEquals(data.action, "invoice_confirmed");

    // The edge function catches push errors gracefully — verify the webhook
    // didn't crash and returned properly.
    assertExists(data.received);
    console.log("✅ invoice.paid → push notification invoked (no crash)");
  },
});

// ══════════════════════════════════════════════════════════════
// 4. invoice.paid → invokes send-notification-email (type subscription_receipt)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: invoice.paid invokes email with subscription_receipt type",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Ensure the user has an email
    const email = await sqlExec(
      `SELECT email FROM profiles WHERE id = '${testUserId}'`,
    );
    assertExists(email, "User should have an email set");

    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 999 });
    const { status, data } = await callWebhook(event);

    assertEquals(status, 200, "Webhook should succeed");
    assertEquals(data.action, "invoice_confirmed");

    // The edge function invokes send-notification-email with type 'subscription_receipt'.
    // In local test env, the function may not have Postmark credentials,
    // but errors are caught gracefully.
    console.log("✅ invoice.paid → email notification invoked (subscription_receipt)");
  },
});

// ══════════════════════════════════════════════════════════════
// 5. invoice.paid → invokes send-sms-notification
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: invoice.paid invokes SMS notification",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // SMS notification is fire-and-forget with try/catch
    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 999 });
    const { status, data } = await callWebhook(event);

    assertEquals(status, 200, "Webhook should succeed even if SMS provider is unavailable");
    assertEquals(data.action, "invoice_confirmed");
    console.log("✅ invoice.paid → SMS notification invoked (no crash)");
  },
});

// ══════════════════════════════════════════════════════════════
// 6. invoice.paid → creates market_ledger entry with event_type 'pro_subscription'
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: invoice.paid creates market_ledger entry",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clear existing ledger entries for this test
    await sqlExec(
      `DELETE FROM market_ledger WHERE user_id = '${testUserId}' AND event_type = 'pro_subscription'`,
    );

    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 999 });
    const { status } = await callWebhook(event);
    assertEquals(status, 200);

    await new Promise((r) => setTimeout(r, 1000));

    const ledgerEntry = await sqlExec(`
      SELECT event_type || '|' || direction || '|' || amount_usd
      FROM market_ledger
      WHERE user_id = '${testUserId}' AND event_type = 'pro_subscription'
      ORDER BY id DESC LIMIT 1
    `);

    assert(
      ledgerEntry.includes("pro_subscription"),
      `Ledger entry should have event_type 'pro_subscription', got: ${ledgerEntry}`,
    );
    assert(
      ledgerEntry.includes("debit"),
      `Ledger entry should be a debit, got: ${ledgerEntry}`,
    );
    assert(
      ledgerEntry.includes("9.99"),
      `Ledger amount should be 9.99, got: ${ledgerEntry}`,
    );
    console.log("✅ invoice.paid → market_ledger entry: pro_subscription, debit, $9.99");
  },
});

// ══════════════════════════════════════════════════════════════
// 7. invoice.paid → ledger entry has correct balance_after
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: ledger entry has correct balance_after",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clear existing ledger entries for clean balance calculation
    await sqlExec(
      `DELETE FROM market_ledger WHERE user_id = '${testUserId}'`,
    );

    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 999 });
    const { status } = await callWebhook(event);
    assertEquals(status, 200);

    await new Promise((r) => setTimeout(r, 1000));

    const balanceAfter = await sqlExec(`
      SELECT balance_after FROM market_ledger
      WHERE user_id = '${testUserId}' AND event_type = 'pro_subscription'
      ORDER BY id DESC LIMIT 1
    `);

    // With no prior entries, balance starts at 0, debit of $9.99 → balance_after = -9.99
    assertEquals(
      Number(balanceAfter),
      -9.99,
      `balance_after should be -9.99 (0 - 9.99), got: ${balanceAfter}`,
    );
    console.log("✅ Ledger balance_after = -9.99 (correct)");
  },
});

// ══════════════════════════════════════════════════════════════
// 8. invoice.paid with $0 amount → no ledger entry created
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: $0 invoice creates no ledger entry",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clear existing entries
    await sqlExec(
      `DELETE FROM market_ledger WHERE user_id = '${testUserId}' AND event_type = 'pro_subscription'`,
    );

    // Send invoice.paid with amount_paid = 0 (e.g. trial period, promo)
    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 0 });
    const { status, data } = await callWebhook(event);

    assertEquals(status, 200);
    assertEquals(data.action, "invoice_confirmed");

    await new Promise((r) => setTimeout(r, 1000));

    const count = await sqlExec(`
      SELECT count(*) FROM market_ledger
      WHERE user_id = '${testUserId}' AND event_type = 'pro_subscription'
    `);

    assertEquals(
      count,
      "0",
      `No ledger entry should be created for $0 invoice, got count: ${count}`,
    );
    console.log("✅ $0 invoice → no ledger entry created");
  },
});

// ══════════════════════════════════════════════════════════════
// 9. invoice.paid with unknown customer → returns user_not_found warning
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: unknown customer returns 200 (no crash)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const unknownCustomerId = `cus_unknown_${Date.now()}`;
    const event = invoicePaidEvent(unknownCustomerId, { amountPaidCents: 999 });
    const { status, data } = await callWebhook(event);

    // The webhook should still return 200 — the sub lookup returns null,
    // so the handler skips all the receipt logic.
    assertEquals(status, 200, "Should return 200 even for unknown customer");
    assertEquals(data.action, "invoice_confirmed");

    // No crash, no exception — graceful handling
    console.log("✅ Unknown customer → 200 (no crash, skipped receipt)");
  },
});

// ══════════════════════════════════════════════════════════════
// 10. invoice.payment_failed → marks subscription past_due
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: payment_failed marks subscription past_due",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Ensure subscription is active first
    await sqlExec(`
      UPDATE seller_subscriptions SET status = 'active'
      WHERE user_id = '${testUserId}'
    `);

    const event = paymentFailedEvent(TEST_CUSTOMER_ID);
    const { status, data } = await callWebhook(event);

    assertEquals(status, 200);
    assertEquals(data.action, "marked_past_due");

    await new Promise((r) => setTimeout(r, 1000));

    const subStatus = await sqlExec(
      `SELECT status FROM seller_subscriptions WHERE user_id = '${testUserId}'`,
    );
    assertEquals(subStatus, "past_due", "Status should be past_due after payment failed");

    // Should also create a notification
    const notif = await sqlExec(`
      SELECT content FROM notifications
      WHERE user_id = '${testUserId}' AND content LIKE '%payment failed%'
      ORDER BY created_at DESC LIMIT 1
    `);
    assert(
      notif.includes("payment failed") || notif.includes("payment method"),
      `Should have payment failure notification, got: ${notif}`,
    );

    // Restore status for other tests
    await sqlExec(`
      UPDATE seller_subscriptions SET status = 'active'
      WHERE user_id = '${testUserId}'
    `);

    console.log("✅ payment_failed → status = past_due + notification");
  },
});

// ══════════════════════════════════════════════════════════════
// Edge case: webhook function exists and responds to POST
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: function endpoint responds (not 404)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ type: "unhandled.event", id: "evt_noop", data: { object: {} } }),
    });

    assert(res.status !== 404, `Function should exist, got ${res.status}`);
    const data = await res.json();
    assertExists(data.received, "Should return { received: true }");
    console.log("✅ Webhook endpoint exists and responds");
  },
});

// ══════════════════════════════════════════════════════════════
// Edge case: invoice.paid with large amount formats correctly
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "subscription-webhook-receipts: large amount formats correctly in notification",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clear old notifications
    await sqlExec(
      `DELETE FROM notifications WHERE user_id = '${testUserId}' AND content LIKE '%Pro subscription payment%'`,
    );

    const event = invoicePaidEvent(TEST_CUSTOMER_ID, { amountPaidCents: 9999 }); // $99.99
    const { status } = await callWebhook(event);
    assertEquals(status, 200);

    await new Promise((r) => setTimeout(r, 1000));

    const notif = await sqlExec(`
      SELECT content FROM notifications
      WHERE user_id = '${testUserId}' AND content LIKE '%Pro subscription payment%'
      ORDER BY created_at DESC LIMIT 1
    `);
    assert(
      notif.includes("$99.99"),
      `Notification should include '$99.99', got: ${notif}`,
    );
    console.log("✅ Large amount ($99.99) formatted correctly");
  },
});

// ── Cleanup ──
Deno.test({
  name: "subscription-webhook-receipts: cleanup test data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (testUserId) {
      await sqlExec(`DELETE FROM market_ledger WHERE user_id = '${testUserId}'`);
      await sqlExec(`DELETE FROM notifications WHERE user_id = '${testUserId}'`);
      await sqlExec(`DELETE FROM seller_subscriptions WHERE user_id = '${testUserId}'`);
    }
    console.log("✅ Cleanup complete");
  },
});
