/**
 * Deno integration tests for process-bot-replies edge function.
 *
 * Tests expired draft processing across messenger, instagram, and whatsapp
 * channels, seller-replied cancellation, and future draft protection.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/process-bot-replies.test.ts
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

const SELLER_ID = "a1111111-1111-1111-1111-111111111111";

// Unique test identifiers to avoid conflicts with other test files
const TEST_PREFIX = "pbr_test";
const TEST_MESSENGER_CONV_ID = "c0000000-0000-0000-0000-300000000001";
const TEST_IG_CONV_ID = "c0000000-0000-0000-0000-300000000002";
const TEST_WA_CONV_ID = "c0000000-0000-0000-0000-300000000003";
const TEST_FB_SENDER_ID = `${TEST_PREFIX}_fb_sender`;
const TEST_IG_SENDER_ID = `${TEST_PREFIX}_ig_sender`;
const TEST_WA_SENDER_PHONE = "16505550199";
const TEST_PAGE_ID = `${TEST_PREFIX}_page_id`;

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

// Helper: call process-bot-replies edge function
async function callProcessBotReplies(
  body: Record<string, unknown> = {},
): Promise<{ status: number; data: any }> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/process-bot-replies`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: setup — create test data for all channels",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Ensure seller is elite with active subscription
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status, current_period_start, current_period_end)
      VALUES ('${SELLER_ID}', 'elite', 'active', now() - interval '15 days', now() + interval '15 days')
      ON CONFLICT (user_id) DO UPDATE SET plan = 'elite', status = 'active',
        current_period_end = now() + interval '15 days'
    `);

    // 2. Setup profiles.bot_channels with all channels enabled
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"messenger": {"enabled": true, "delayMinutes": 5}, "instagram": {"enabled": true, "delayMinutes": 5}, "whatsapp": {"enabled": true, "delayMinutes": 5}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);

    // 3. Get or verify default booth
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );
    assertExists(boothId, "Seller must have a default booth");

    // 4. Create FB connection with mock tokens
    await sqlExec(`
      DELETE FROM seller_fb_connections WHERE fb_page_id = '${TEST_PAGE_ID}'
    `);
    await sqlExec(`
      INSERT INTO seller_fb_connections (
        user_id, fb_access_token, fb_token_expires_at,
        fb_page_id, fb_page_name, fb_page_access_token, status,
        ig_business_account_id, ig_username,
        wa_phone_number_id, wa_display_phone
      ) VALUES (
        '${SELLER_ID}',
        'mock_user_access_token_pbr',
        now() + interval '60 days',
        '${TEST_PAGE_ID}',
        'Process Bot Test Page',
        'mock_page_access_token_pbr',
        'connected',
        '${TEST_PREFIX}_ig_biz_acct',
        'test_grower_pbr',
        '${TEST_PREFIX}_wa_phone_id',
        '+16505550199'
      )
    `);

    // 5. Create messenger_conversations
    await sqlExec(`
      INSERT INTO messenger_conversations (id, seller_id, fb_sender_id, last_message_at, message_count)
      VALUES ('${TEST_MESSENGER_CONV_ID}', '${SELLER_ID}', '${TEST_FB_SENDER_ID}', now(), 1)
      ON CONFLICT (id) DO NOTHING
    `);

    // 6. Create ig_conversations
    await sqlExec(`
      INSERT INTO ig_conversations (id, seller_id, ig_sender_id, last_message_at, message_count)
      VALUES ('${TEST_IG_CONV_ID}', '${SELLER_ID}', '${TEST_IG_SENDER_ID}', now(), 1)
      ON CONFLICT (id) DO NOTHING
    `);

    // 7. Create wa_conversations
    await sqlExec(`
      INSERT INTO wa_conversations (id, seller_id, wa_sender_phone, last_message_at, message_count)
      VALUES ('${TEST_WA_CONV_ID}', '${SELLER_ID}', '${TEST_WA_SENDER_PHONE}', now(), 1)
      ON CONFLICT (id) DO NOTHING
    `);

    // 8. Clean up any old drafts from previous test runs
    await sqlExec(`
      DELETE FROM bot_reply_drafts
      WHERE conversation_ref IN (
        'messenger_${TEST_MESSENGER_CONV_ID}',
        'instagram_${TEST_IG_CONV_ID}',
        'whatsapp_${TEST_WA_CONV_ID}'
      )
    `);

    console.log("✅ Setup complete for process-bot-replies tests");
  },
});

// ══════════════════════════════════════════════════════════════
// Expired Messenger Draft
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: expired messenger draft is processed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // Insert a pending draft with auto_send_at in the past
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (
        channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message
      ) VALUES (
        'messenger', 'messenger_${TEST_MESSENGER_CONV_ID}', NULL,
        '${boothId}', '${SELLER_ID}', '["Hello from bot! Fresh produce available."]',
        now() - interval '2 minutes', 'pending', 'Do you have tomatoes?'
      )
      RETURNING id
    `);

    assert(draftId && draftId.length > 10, `Draft should be created, got: ${draftId}`);

    // Call process-bot-replies
    const { status, data } = await callProcessBotReplies({});

    assertEquals(status, 200);
    assert(data.sent >= 1 || data.total >= 1, `Should process at least 1 draft, got: ${JSON.stringify(data)}`);

    // Wait for processing
    await new Promise((r) => setTimeout(r, 1500));

    // Verify draft status changed (sent if API succeeds, expired if mock token fails)
    const draftStatus = await sqlExec(`
      SELECT status FROM bot_reply_drafts WHERE id = '${draftId}'
    `);
    assert(
      draftStatus === "sent" || draftStatus === "expired",
      `Draft should be processed (sent or expired), got: ${draftStatus}`,
    );

    // Cleanup
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE id = '${draftId}'`);
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id = '${TEST_MESSENGER_CONV_ID}' AND role = 'bot'`);
  },
});

// ══════════════════════════════════════════════════════════════
// Expired Instagram Draft
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: expired Instagram draft is processed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // Insert a pending draft with auto_send_at in the past
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (
        channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message
      ) VALUES (
        'instagram', 'instagram_${TEST_IG_CONV_ID}', NULL,
        '${boothId}', '${SELLER_ID}', '["Welcome! Check out our fresh picks on Instagram."]',
        now() - interval '2 minutes', 'pending', 'Do you have organic berries?'
      )
      RETURNING id
    `);

    assert(draftId && draftId.length > 10, `Draft should be created, got: ${draftId}`);

    // Call process-bot-replies
    const { status, data } = await callProcessBotReplies({});

    assertEquals(status, 200);
    assert(data.sent >= 1 || data.total >= 1, `Should process at least 1 draft, got: ${JSON.stringify(data)}`);

    // Wait for processing
    await new Promise((r) => setTimeout(r, 1500));

    // Verify draft status changed (sent if API succeeds, expired if mock token fails)
    const draftStatus = await sqlExec(`
      SELECT status FROM bot_reply_drafts WHERE id = '${draftId}'
    `);
    assert(
      draftStatus === "sent" || draftStatus === "expired",
      `Draft should be processed (sent or expired), got: ${draftStatus}`,
    );

    // Cleanup
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE id = '${draftId}'`);
    await sqlExec(`DELETE FROM ig_messages WHERE conversation_id = '${TEST_IG_CONV_ID}' AND role = 'bot'`);
  },
});

// ══════════════════════════════════════════════════════════════
// Expired WhatsApp Draft
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: expired WhatsApp draft is processed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // Insert a pending draft with auto_send_at in the past
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (
        channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message
      ) VALUES (
        'whatsapp', 'whatsapp_${TEST_WA_CONV_ID}', NULL,
        '${boothId}', '${SELLER_ID}', '["Hi from WhatsApp! We offer local delivery."]',
        now() - interval '2 minutes', 'pending', 'Do you deliver via WhatsApp?'
      )
      RETURNING id
    `);

    assert(draftId && draftId.length > 10, `Draft should be created, got: ${draftId}`);

    // Call process-bot-replies
    const { status, data } = await callProcessBotReplies({});

    assertEquals(status, 200);
    assert(data.sent >= 1 || data.total >= 1, `Should process at least 1 draft, got: ${JSON.stringify(data)}`);

    // Wait for processing
    await new Promise((r) => setTimeout(r, 1500));

    // Verify draft status changed (sent if API succeeds, expired if mock token fails)
    const draftStatus = await sqlExec(`
      SELECT status FROM bot_reply_drafts WHERE id = '${draftId}'
    `);
    assert(
      draftStatus === "sent" || draftStatus === "expired",
      `Draft should be processed (sent or expired), got: ${draftStatus}`,
    );

    // Cleanup
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE id = '${draftId}'`);
    await sqlExec(`DELETE FROM wa_messages WHERE conversation_id = '${TEST_WA_CONV_ID}' AND role = 'bot'`);
  },
});

// ══════════════════════════════════════════════════════════════
// Seller-Replied Draft Cancellation
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: seller-replied draft is cancelled",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // Insert a pending draft with auto_send_at in the past
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (
        channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message,
        created_at
      ) VALUES (
        'messenger', 'messenger_${TEST_MESSENGER_CONV_ID}', NULL,
        '${boothId}', '${SELLER_ID}', '["Bot auto-reply suggestion"]',
        now() - interval '1 minute', 'pending', 'I need help with my order',
        now() - interval '3 minutes'
      )
      RETURNING id
    `);

    assert(draftId && draftId.length > 10, `Draft should be created, got: ${draftId}`);

    // Insert a seller message AFTER the draft was created (seller replied manually)
    await sqlExec(`
      INSERT INTO messenger_messages (conversation_id, role, content, created_at)
      VALUES ('${TEST_MESSENGER_CONV_ID}', 'seller', 'I am handling this personally!', now() - interval '30 seconds')
    `);

    // Call process-bot-replies
    const { status, data } = await callProcessBotReplies({});

    assertEquals(status, 200);

    // Wait for processing
    await new Promise((r) => setTimeout(r, 1500));

    // Verify draft status changed to 'seller_replied'
    const draftStatus = await sqlExec(`
      SELECT status FROM bot_reply_drafts WHERE id = '${draftId}'
    `);
    assertEquals(draftStatus, "seller_replied");

    // Cleanup
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE id = '${draftId}'`);
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id = '${TEST_MESSENGER_CONV_ID}' AND role = 'seller'`);
  },
});

// ══════════════════════════════════════════════════════════════
// Future Draft NOT Processed
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: future draft is NOT processed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // Insert a pending draft with auto_send_at in the FUTURE
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (
        channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message
      ) VALUES (
        'messenger', 'messenger_${TEST_MESSENGER_CONV_ID}', NULL,
        '${boothId}', '${SELLER_ID}', '["This should NOT be sent yet"]',
        now() + interval '30 minutes', 'pending', 'Future question'
      )
      RETURNING id
    `);

    assert(draftId && draftId.length > 10, `Draft should be created, got: ${draftId}`);

    // Call process-bot-replies
    const { status, data } = await callProcessBotReplies({});

    assertEquals(status, 200);

    // Wait briefly
    await new Promise((r) => setTimeout(r, 500));

    // Verify draft is STILL pending (not sent)
    const draftStatus = await sqlExec(`
      SELECT status FROM bot_reply_drafts WHERE id = '${draftId}'
    `);
    assertEquals(draftStatus, "pending");

    // Cleanup
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE id = '${draftId}'`);
  },
});

// ══════════════════════════════════════════════════════════════
// No Pending Drafts — Empty Batch
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: no pending drafts returns sent=0",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clean all drafts for our test conversations first
    await sqlExec(`
      DELETE FROM bot_reply_drafts
      WHERE conversation_ref IN (
        'messenger_${TEST_MESSENGER_CONV_ID}',
        'instagram_${TEST_IG_CONV_ID}',
        'whatsapp_${TEST_WA_CONV_ID}'
      )
    `);

    const { status, data } = await callProcessBotReplies({});

    assertEquals(status, 200);
    assertEquals(data.sent, 0);
  },
});

// ══════════════════════════════════════════════════════════════
// Cleanup
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "process-bot-replies: cleanup — delete all test data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Clean up drafts
    await sqlExec(`
      DELETE FROM bot_reply_drafts
      WHERE conversation_ref IN (
        'messenger_${TEST_MESSENGER_CONV_ID}',
        'instagram_${TEST_IG_CONV_ID}',
        'whatsapp_${TEST_WA_CONV_ID}'
      )
    `);

    // Clean up messages
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id = '${TEST_MESSENGER_CONV_ID}'`);
    await sqlExec(`DELETE FROM ig_messages WHERE conversation_id = '${TEST_IG_CONV_ID}'`);
    await sqlExec(`DELETE FROM wa_messages WHERE conversation_id = '${TEST_WA_CONV_ID}'`);

    // Clean up conversations
    await sqlExec(`DELETE FROM messenger_conversations WHERE id = '${TEST_MESSENGER_CONV_ID}'`);
    await sqlExec(`DELETE FROM ig_conversations WHERE id = '${TEST_IG_CONV_ID}'`);
    await sqlExec(`DELETE FROM wa_conversations WHERE id = '${TEST_WA_CONV_ID}'`);

    // Clean up FB connection
    await sqlExec(`DELETE FROM seller_fb_connections WHERE fb_page_id = '${TEST_PAGE_ID}'`);

    console.log("✅ Cleanup complete for process-bot-replies tests");
  },
});
