/**
 * Deno integration tests for Post-Checkout Messenger engagement.
 *
 * Tests the post-checkout-messenger edge function, verifying that it:
 * 1. Skips non-pro sellers.
 * 2. Skips orders without fb_psid in metadata.
 * 3. Sends follow-up messages and logs them in conversation history.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/post-checkout-messenger.test.ts
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

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
  const err = new TextDecoder().decode(output.stderr).trim();
  if (err) {
    console.log(`[SQL-DEBUG] SQL: ${sql}\nStderr: ${err}`);
  }
  const lines = raw.split("\n").filter((l) =>
    !l.match(/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|RESET)\s/i)
  );
  return lines[0]?.trim() || raw;
}

// Helper: call edge function
async function callPostCheckoutMessenger(orderId: string): Promise<{ status: number; data: any }> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/post-checkout-messenger`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ orderId }),
    },
  );
  let data;
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text() };
  }
  if (res.status !== 200) {
    console.log(`[DEBUG-TEST] Non-200 response for orderId ${orderId}: Status = ${res.status}, Body =`, data);
  }
  return { status: res.status, data };
}

const TEST_SELLER_ID = "e5555555-5555-5555-5555-555555555555";
const TEST_BUYER_ID = "b2222222-2222-2222-2222-222222222222";
let TEST_BOOTH_ID = "";
let TEST_PRODUCT_ID = "";

Deno.test({
  name: "post-checkout-messenger: setup environment and dependencies",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Disable trigger to prevent background pg_net requests from double-calling the function
    await sqlExec(`ALTER TABLE market_orders DISABLE TRIGGER trg_market_order_checkout_messenger_engage`);

    // 1. Clean up stale test orders / connections / conversations
    await sqlExec(`DELETE FROM market_orders WHERE product_name IN ('Test Strawberries', 'Test Blueberries', 'Local Organic Apples')`);
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id IN (SELECT id FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}')`);
    await sqlExec(`DELETE FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}'`);
    await sqlExec(`DELETE FROM seller_fb_connections WHERE user_id = '${TEST_SELLER_ID}' OR fb_page_id = 'test_page_checkout_e2e'`);

    // Get a valid booth_id for TEST_SELLER_ID
    TEST_BOOTH_ID = await sqlExec(`SELECT id FROM market_booths WHERE owner_id = '${TEST_SELLER_ID}' LIMIT 1`);
    assertExists(TEST_BOOTH_ID, "Seller should have a booth");

    // Get or create a valid product_id for TEST_SELLER_ID
    TEST_PRODUCT_ID = await sqlExec(`SELECT id FROM market_products WHERE seller_id = '${TEST_SELLER_ID}' LIMIT 1`);
    if (!TEST_PRODUCT_ID || TEST_PRODUCT_ID === "") {
      TEST_PRODUCT_ID = await sqlExec(`
        INSERT INTO market_products (seller_id, booth_id, market_date, name, category, price_usd, unit, inventory, moderation_status)
        VALUES ('${TEST_SELLER_ID}', '${TEST_BOOTH_ID}', CURRENT_DATE, 'Post-Checkout Test Apples', 'produce', 2.50, 'lb', 100, 'approved')
        RETURNING id
      `);
    }
    assertExists(TEST_PRODUCT_ID, "Seller should have a product");

    // 2. Ensure test seller has a subscription
    await sqlExec(`DELETE FROM seller_subscriptions WHERE user_id = '${TEST_SELLER_ID}'`);
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status)
      VALUES ('${TEST_SELLER_ID}', 'pro', 'active')
    `);

    // 3. Create connected seller FB Page connection
    await sqlExec(`
      INSERT INTO seller_fb_connections (
        user_id, fb_access_token, fb_token_expires_at, fb_page_id, fb_page_name, fb_page_access_token, status
      ) VALUES (
        '${TEST_SELLER_ID}',
        'mock_user_access_token',
        now() + interval '60 days',
        'test_page_checkout_e2e',
        'Checkout Test Farm Page',
        'mock_page_access_token_checkout',
        'connected'
      )
    `);

    const status = await sqlExec(`SELECT status FROM seller_fb_connections WHERE fb_page_id = 'test_page_checkout_e2e'`);
    assertEquals(status, "connected");
  },
});

Deno.test({
  name: "post-checkout-messenger: skips non-pro sellers",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Insert a mock order under free plan
    const orderId = await sqlExec(`
      INSERT INTO market_orders (
        buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd,
        total_usd, fulfillment_type, status, seller_plan, fb_metadata
      ) VALUES (
        '${TEST_BUYER_ID}',
        '${TEST_SELLER_ID}',
        '${TEST_BOOTH_ID}',
        '${TEST_PRODUCT_ID}',
        'Test Strawberries',
        2,
        4.50,
        9.00,
        9.00,
        'pickup',
        'pending',
        'free',
        '{"fb_psid": "test_psid_free", "fb_page_id": "test_page_checkout_e2e"}'::jsonb
      )
      RETURNING id
    `);

    assertExists(orderId);

    // 2. Trigger the edge function
    const res = await callPostCheckoutMessenger(orderId);
    assertEquals(res.status, 200);
    assertEquals(res.data.skipped, true);
    assertEquals(res.data.reason, "not_pro_or_elite");

    // Cleanup
    await sqlExec(`DELETE FROM market_orders WHERE id = '${orderId}'`);
  },
});

Deno.test({
  name: "post-checkout-messenger: skips when no PSID is present in order",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Insert an order with empty fb_metadata
    const orderId = await sqlExec(`
      INSERT INTO market_orders (
        buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd,
        total_usd, fulfillment_type, status, seller_plan, fb_metadata
      ) VALUES (
        '${TEST_BUYER_ID}',
        '${TEST_SELLER_ID}',
        '${TEST_BOOTH_ID}',
        '${TEST_PRODUCT_ID}',
        'Test Blueberries',
        1,
        6.00,
        6.00,
        6.00,
        'pickup',
        'pending',
        'pro',
        '{}'::jsonb
      )
      RETURNING id
    `);

    assertExists(orderId);

    // 2. Call edge function
    const res = await callPostCheckoutMessenger(orderId);
    assertEquals(res.status, 200);
    assertEquals(res.data.skipped, true);
    assertEquals(res.data.reason, "no_psid");

    // Cleanup
    await sqlExec(`DELETE FROM market_orders WHERE id = '${orderId}'`);
  },
});

Deno.test({
  name: "post-checkout-messenger: executes successfully, sends thank-you and log history",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Insert a complete Pro order with valid Messenger metadata
    const orderId = await sqlExec(`
      INSERT INTO market_orders (
        buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd,
        total_usd, fulfillment_type, status, seller_plan, fb_metadata
      ) VALUES (
        '${TEST_BUYER_ID}',
        '${TEST_SELLER_ID}',
        '${TEST_BOOTH_ID}',
        '${TEST_PRODUCT_ID}',
        'Local Organic Apples',
        3,
        2.50,
        7.50,
        7.50,
        'pickup',
        'pending',
        'pro',
        '{"fb_psid": "test_psid_apples_123", "fb_page_id": "test_page_checkout_e2e"}'::jsonb
      )
      RETURNING id
    `);

    assertExists(orderId);

    // 2. Call edge function
    const res = await callPostCheckoutMessenger(orderId);
    assertEquals(res.status, 200);
    assertEquals(res.data.success, true);
    assert(res.data.thankYouText.includes("3x Local Organic Apples"));
    assert(res.data.followPageText.includes("test_page_checkout_e2e"));

    // 3. Verify conversation was logged and message count incremented
    const convCount = await sqlExec(`
      SELECT count(*) FROM messenger_conversations 
      WHERE seller_id = '${TEST_SELLER_ID}' AND fb_sender_id = 'test_psid_apples_123'
    `);
    assertEquals(convCount, "1");

    // Verify messages are recorded in history
    const convId = await sqlExec(`
      SELECT id FROM messenger_conversations 
      WHERE seller_id = '${TEST_SELLER_ID}' AND fb_sender_id = 'test_psid_apples_123'
    `);

    const msgCount = await sqlExec(`
      SELECT count(*) FROM messenger_messages WHERE conversation_id = '${convId}' AND role = 'bot'
    `);
    assertEquals(msgCount, "2"); // Thank you note + Follow link

    // Cleanup
    await sqlExec(`DELETE FROM market_orders WHERE id = '${orderId}'`);
  },
});

Deno.test({
  name: "post-checkout-messenger: cleanup final test data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Re-enable trigger
    await sqlExec(`ALTER TABLE market_orders ENABLE TRIGGER trg_market_order_checkout_messenger_engage`);

    await sqlExec(`DELETE FROM market_orders WHERE product_name IN ('Test Strawberries', 'Test Blueberries', 'Local Organic Apples')`);
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id IN (SELECT id FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}')`);
    await sqlExec(`DELETE FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}'`);
    await sqlExec(`DELETE FROM seller_fb_connections WHERE fb_page_id = 'test_page_checkout_e2e'`);
    // Restore original subscription for safety
    await sqlExec(`DELETE FROM seller_subscriptions WHERE user_id = '${TEST_SELLER_ID}'`);
  },
});
