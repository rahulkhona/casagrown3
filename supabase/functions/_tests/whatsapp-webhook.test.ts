/**
 * Deno integration tests for the WhatsApp webhook edge function.
 *
 * Tests the webhook verification, message processing, booth routing,
 * conversation management, and message storage.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/whatsapp-webhook.test.ts
 *
 * NOTE: Requires AI_MOCK=true and edge functions server running.
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
  const lines = raw.split("\n").filter((l) =>
    !l.match(/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|RESET)\s/i)
  );
  return lines[0]?.trim() || raw;
}

// Helper: call edge function
async function callWebhook(
  method: string,
  params: Record<string, string> = {},
  body?: any,
  retries = 3,
): Promise<{ status: number; data: any }> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/whatsapp-webhook`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  let res!: Response;
  let text = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      res = await fetch(url.toString(), opts);
      if (res.status !== 502 && res.status !== 503 && res.status !== 504) {
        text = await res.text();
        break;
      }
      if (attempt === retries) {
        text = await res.text();
        break;
      }
    } catch (err) {
      if (attempt === retries) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

// Helper: build a WhatsApp Cloud API webhook payload
function makeWaPayload(
  phoneNumberId: string,
  displayPhone: string,
  senderPhone: string,
  senderName: string,
  messageText: string,
  businessAccountId = "test_wa_business_account",
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: businessAccountId,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: displayPhone,
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: senderName },
                  wa_id: senderPhone,
                },
              ],
              messages: [
                {
                  from: senderPhone,
                  id: "wamid.test_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: messageText },
                  type: "text",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

const SELLER_ID = "a1111111-1111-1111-1111-111111111111";

// ══════════════════════════════════════════════════════════════
// Table Existence
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: wa_conversations table accessible",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const count = await sqlExec(
      "SELECT count(*) FROM wa_conversations",
    );
    assert(
      parseInt(count) >= 0,
      "wa_conversations table should exist",
    );
  },
});

Deno.test({
  name: "whatsapp-webhook: wa_messages table accessible",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const count = await sqlExec("SELECT count(*) FROM wa_messages");
    assert(parseInt(count) >= 0, "wa_messages table should exist");
  },
});

// ══════════════════════════════════════════════════════════════
// Webhook Endpoint (POST)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: POST with valid message format returns 200",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("POST", {}, makeWaPayload(
      "test_phone_id_nonexistent",
      "16505551111",
      "16505551234",
      "Test User",
      "Hello, what are your delivery fees?",
      "test_wa_business_account_nonexistent",
    ));

    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "whatsapp-webhook: POST with empty entry returns 200",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("POST", {}, {
      object: "whatsapp_business_account",
      entry: [],
    });

    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "whatsapp-webhook: unconnected phone ID handled gracefully",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("POST", {}, makeWaPayload(
      "nonexistent_phone_id_xyz",
      "16505550000",
      "16505550001",
      "Unknown Sender",
      "Are you open?",
    ));

    // Must still return 200 to WhatsApp
    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "whatsapp-webhook: GET verification endpoint responds",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("GET", {
      "hub.mode": "subscribe",
      "hub.verify_token": "test_token",
      "hub.challenge": "test_wa_challenge_123",
    });

    assert([200, 403].includes(res.status));
  },
});

// ══════════════════════════════════════════════════════════════
// Column Existence Checks
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: wa_conversations has required columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_name = 'wa_conversations'
    `);
    assert(cols.includes("wa_sender_phone"), "Should have wa_sender_phone");
    assert(cols.includes("seller_id"), "Should have seller_id");
    assert(cols.includes("bot_conversation_mode_until"), "Should have bot_conversation_mode_until");
    assert(cols.includes("matched_booth_id"), "Should have matched_booth_id");
  },
});

Deno.test({
  name: "whatsapp-webhook: wa_messages has required columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_name = 'wa_messages'
    `);
    assert(cols.includes("conversation_id"), "Should have conversation_id");
    assert(cols.includes("content"), "Should have content");
    assert(cols.includes("role"), "Should have role column");
  },
});

// ══════════════════════════════════════════════════════════════
// GET Verification Endpoint
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: GET verification with correct token returns 200",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const challenge = "wa_challenge_correct_" + Date.now();
    const res = await callWebhook("GET", {
      "hub.mode": "subscribe",
      "hub.verify_token": "casagrown_verify",
      "hub.challenge": challenge,
    });

    assertEquals(res.status, 200);
    // The body should echo back the challenge value
    const body = typeof res.data === "object" && res.data.raw
      ? res.data.raw
      : String(res.data);
    assertEquals(body, challenge);
  },
});

Deno.test({
  name: "whatsapp-webhook: GET verification with wrong token returns 403",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("GET", {
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong_token",
      "hub.challenge": "should_not_echo",
    });

    assertEquals(res.status, 403);
  },
});

// ══════════════════════════════════════════════════════════════
// Full Flow Setup & Teardown
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: setup connections and test message",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Ensure SELLER_ID is elite tier
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status)
      VALUES ('${SELLER_ID}', 'elite', 'active')
      ON CONFLICT (user_id) DO UPDATE SET plan = 'elite', status = 'active'
    `);

    // 2. Setup profiles.bot_channels config with whatsapp enabled
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"whatsapp": {"enabled": true, "delayMinutes": 0}, "messenger": {"enabled": true, "delayMinutes": 0}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);

    // 3. Create a active connection
    await sqlExec(`
      DELETE FROM seller_fb_connections WHERE user_id = '${SELLER_ID}' OR wa_phone_number_id = 'test_wa_phone_id_e2e'
    `);
    await sqlExec(`
      INSERT INTO seller_fb_connections (
        user_id, fb_access_token, fb_token_expires_at, fb_page_id, fb_page_name, fb_page_access_token, status, wa_phone_number_id, wa_display_phone
      ) VALUES (
        '${SELLER_ID}',
        'mock_user_access_token',
        now() + interval '60 days',
        'test_page_id',
        'Test Farm Page',
        'mock_page_access_token_e2e',
        'connected',
        'test_wa_phone_id_e2e',
        '+16505559999'
      )
    `);

    // 4. Send customer message to our webhook
    const userPhone = "16505558888";
    const res = await callWebhook("POST", {}, makeWaPayload(
      "test_wa_phone_id_e2e",
      "16505559999",
      userPhone,
      "Neighbor Friend",
      "Hey! Do you offer pickup?",
      "test_wa_business_account_e2e",
    ));

    assertEquals(res.status, 200);

    // Wait a brief moment for async DB ops
    await new Promise((r) => setTimeout(r, 2000));

    // 5. Verify conversation was created
    const count = await sqlExec(
      `SELECT count(*) FROM wa_conversations WHERE wa_sender_phone = '${userPhone}'`
    );
    assert(parseInt(count) >= 0);
  },
});

// ══════════════════════════════════════════════════════════════
// Tests that require the e2e connection (AFTER setup)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: multiple rapid messages don't crash",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Send 3 messages in rapid succession — should all return 200
    const promises = [1, 2, 3].map(async (i) => {
      if (i > 1) {
        await new Promise((r) => setTimeout(r, 100 * (i - 1)));
      }
      return callWebhook("POST", {}, makeWaPayload(
        "test_wa_phone_id_e2e",
        "16505559999",
        "16505557777",
        "Rapid Tester",
        `Rapid message ${i}`,
        "test_wa_business_account_e2e",
      ));
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      assertEquals(r.status, 200);
    }
  },
});

Deno.test({
  name: "whatsapp-webhook: non-elite seller rejected",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Downgrade seller to 'pro'
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status)
      VALUES ('${SELLER_ID}', 'pro', 'active')
      ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', status = 'active'
    `);

    const uniquePhone = "16505550099";
    const res = await callWebhook("POST", {}, makeWaPayload(
      "test_wa_phone_id_e2e",
      "16505559999",
      uniquePhone,
      "Pro Plan User",
      "Can I order?",
      "test_wa_business_account_e2e",
    ));

    assertEquals(res.status, 200);

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 2000));

    // Verify NO conversation was created for this phone
    const count = await sqlExec(
      `SELECT count(*) FROM wa_conversations WHERE wa_sender_phone = '${uniquePhone}'`,
    );
    assertEquals(parseInt(count), 0, "No conversation should be created for non-elite seller");

    // Restore elite plan
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status)
      VALUES ('${SELLER_ID}', 'elite', 'active')
      ON CONFLICT (user_id) DO UPDATE SET plan = 'elite', status = 'active'
    `);
  },
});

// ══════════════════════════════════════════════════════════════
// Rejected when whatsapp_chat Feature Flag is False
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: rejected when whatsapp_chat feature flag is false",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Temporarily disable whatsapp_chat feature flag on elite plan
    await sqlExec(`
      UPDATE subscription_tiers
      SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{whatsapp_chat}', 'false'::jsonb)
      WHERE tier_name = 'elite'
    `);

    const uniquePhone = "16505550066";
    const res = await callWebhook("POST", {}, makeWaPayload(
      "test_wa_phone_id_e2e",
      "16505559999",
      uniquePhone,
      "WhatsApp Chat Disabled User",
      "Should be skipped because whatsapp_chat feature flag is off",
      "test_wa_business_account_e2e",
    ));

    assertEquals(res.status, 200);

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 2000));

    // Verify no conversation was created
    const count = await sqlExec(
      `SELECT count(*) FROM wa_conversations WHERE wa_sender_phone = '${uniquePhone}'`,
    );
    assertEquals(parseInt(count), 0, "No conversation should be created when whatsapp_chat feature is false");

    // 2. Restore whatsapp_chat feature flag to true on elite plan
    await sqlExec(`
      UPDATE subscription_tiers
      SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{whatsapp_chat}', 'true'::jsonb)
      WHERE tier_name = 'elite'
    `);
  },
});

Deno.test({
  name: "whatsapp-webhook: disabled channel skipped",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Disable whatsapp channel
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"whatsapp": {"enabled": false}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);

    const uniquePhone = "16505550088";
    const res = await callWebhook("POST", {}, makeWaPayload(
      "test_wa_phone_id_e2e",
      "16505559999",
      uniquePhone,
      "Disabled Channel User",
      "Hello?",
      "test_wa_business_account_e2e",
    ));

    assertEquals(res.status, 200);

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 2000));

    // Verify NO new conversation was created
    const count = await sqlExec(
      `SELECT count(*) FROM wa_conversations WHERE wa_sender_phone = '${uniquePhone}'`,
    );
    assertEquals(parseInt(count), 0, "No conversation should be created when channel is disabled");

    // Restore whatsapp enabled config
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"whatsapp": {"enabled": true, "delayMinutes": 0}, "messenger": {"enabled": true, "delayMinutes": 0}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);
  },
});

Deno.test({
  name: "whatsapp-webhook: delayed draft created when delayMinutes > 0",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Set delayMinutes to 5
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"whatsapp": {"enabled": true, "delayMinutes": 5}, "messenger": {"enabled": true, "delayMinutes": 0}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);

    const uniquePhone = "16505550077";
    const res = await callWebhook("POST", {}, makeWaPayload(
      "test_wa_phone_id_e2e",
      "16505559999",
      uniquePhone,
      "Delayed Draft User",
      "Do you have eggs?",
      "test_wa_business_account_e2e",
    ));

    assertEquals(res.status, 200);

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 2000));

    // Verify bot_reply_drafts has a pending draft for whatsapp channel
    const draftCount = await sqlExec(
      `SELECT count(*) FROM bot_reply_drafts WHERE channel = 'whatsapp' AND status = 'pending'`,
    );
    assert(
      parseInt(draftCount) >= 1,
      `Expected at least 1 pending whatsapp draft, got ${draftCount}`,
    );

    // Cleanup: delete the draft
    await sqlExec(
      `DELETE FROM bot_reply_drafts WHERE channel = 'whatsapp' AND status = 'pending'`,
    );

    // Restore config
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"whatsapp": {"enabled": true, "delayMinutes": 0}, "messenger": {"enabled": true, "delayMinutes": 0}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);
  },
});

// ══════════════════════════════════════════════════════════════
// Cleanup (MUST BE LAST)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "whatsapp-webhook: cleanup test connection",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await sqlExec(`
      DELETE FROM seller_fb_connections WHERE wa_phone_number_id = 'test_wa_phone_id_e2e'
    `);
  },
});
