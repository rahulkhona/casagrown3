/**
 * Deno integration tests for Automated Buyer Inactivity Nudges.
 *
 * Tests the "messenger_nudge" action inside the market-cron edge function,
 * verifying that it:
 * 1. Correctly selects cold conversations (last user message > 30m ago).
 * 2. Skips conversations where the last message was already from the bot/seller.
 * 3. Sends a friendly nudge (Gemini mock fallback) and updates tracking states.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/messenger-nudge.test.ts
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

// Helper: call market-cron edge function
async function callMessengerNudge(): Promise<{ status: number; data: any }> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/market-cron`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action: "messenger_nudge" }),
    },
  );
  let data;
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text() };
  }
  if (res.status !== 200) {
    console.log(`[DEBUG-TEST] Non-200 response for messenger_nudge: Status = ${res.status}, Body =`, data);
  }
  return { status: res.status, data };
}

const TEST_SELLER_ID = "a1111111-1111-1111-1111-111111111111";
const MOCK_PSID = "nudge_test_psid_999";
let TEST_BOOTH_ID = "";

Deno.test({
  name: "messenger-nudge: setup test environment and seller page connection",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Clean up old test data
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id IN (SELECT id FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}')`);
    await sqlExec(`DELETE FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}'`);
    await sqlExec(`DELETE FROM seller_fb_connections WHERE user_id = '${TEST_SELLER_ID}' OR fb_page_id = 'test_page_nudge_e2e'`);

    // Get seller booth ID
    TEST_BOOTH_ID = await sqlExec(`SELECT id FROM market_booths WHERE owner_id = '${TEST_SELLER_ID}' LIMIT 1`);
    assertExists(TEST_BOOTH_ID, "Seller should have a booth");

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
        'test_page_nudge_e2e',
        'Nudge Test Farm Page',
        'mock_page_access_token_nudge',
        'connected'
      )
    `);

    const status = await sqlExec(`SELECT status FROM seller_fb_connections WHERE fb_page_id = 'test_page_nudge_e2e'`);
    assertEquals(status, "connected");
  },
});

Deno.test({
  name: "messenger-nudge: ignores non-cold conversations (< 30 minutes)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Create a fresh conversation with last_message_at = now()
    const convId = await sqlExec(`
      INSERT INTO messenger_conversations (
        fb_sender_id, seller_id, last_message_at, message_count, nudge_sent_at, matched_booth_id
      ) VALUES (
        '${MOCK_PSID}_warm',
        '${TEST_SELLER_ID}',
        now(),
        1,
        NULL,
        '${TEST_BOOTH_ID}'
      )
      RETURNING id
    `);
    assertExists(convId);

    // Insert user message
    await sqlExec(`
      INSERT INTO messenger_messages (conversation_id, role, content)
      VALUES ('${convId}', 'user', 'Do you have fresh carrots?')
    `);

    // 2. Trigger nudge cron
    const res = await callMessengerNudge();
    assertEquals(res.status, 200);
    
    // 3. Verify no nudge was sent
    const updatedNudgeSentAt = await sqlExec(`SELECT nudge_sent_at FROM messenger_conversations WHERE id = '${convId}'`);
    assertEquals(updatedNudgeSentAt, ""); // Should still be NULL

    // Cleanup
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id = '${convId}'`);
    await sqlExec(`DELETE FROM messenger_conversations WHERE id = '${convId}'`);
  },
});

Deno.test({
  name: "messenger-nudge: ignores cold conversations where the last message was from the bot",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Create a cold conversation last_message_at = 45m ago
    const convId = await sqlExec(`
      INSERT INTO messenger_conversations (
        fb_sender_id, seller_id, last_message_at, message_count, nudge_sent_at, matched_booth_id
      ) VALUES (
        '${MOCK_PSID}_bot_last',
        '${TEST_SELLER_ID}',
        now() - interval '45 minutes',
        2,
        NULL,
        '${TEST_BOOTH_ID}'
      )
      RETURNING id
    `);
    assertExists(convId);

    // Insert user message first, then a bot message as the last message
    await sqlExec(`
      INSERT INTO messenger_messages (conversation_id, role, content, created_at)
      VALUES ('${convId}', 'user', 'Hi', now() - interval '50 minutes')
    `);
    await sqlExec(`
      INSERT INTO messenger_messages (conversation_id, role, content, created_at)
      VALUES ('${convId}', 'bot', 'How can I help?', now() - interval '45 minutes')
    `);

    // 2. Trigger nudge cron
    const res = await callMessengerNudge();
    assertEquals(res.status, 200);

    // 3. Verify no nudge was sent (nudge_sent_at remains null)
    const updatedNudgeSentAt = await sqlExec(`SELECT nudge_sent_at FROM messenger_conversations WHERE id = '${convId}'`);
    assertEquals(updatedNudgeSentAt, "");

    // Cleanup
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id = '${convId}'`);
    await sqlExec(`DELETE FROM messenger_conversations WHERE id = '${convId}'`);
  },
});

Deno.test({
  name: "messenger-nudge: successfully nudges cold conversation with user last message",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Create cold conversation (45 mins ago, last message from user)
    const convId = await sqlExec(`
      INSERT INTO messenger_conversations (
        fb_sender_id, seller_id, last_message_at, message_count, nudge_sent_at, matched_booth_id
      ) VALUES (
        '${MOCK_PSID}_cold_user',
        '${TEST_SELLER_ID}',
        now() - interval '45 minutes',
        1,
        NULL,
        '${TEST_BOOTH_ID}'
      )
      RETURNING id
    `);
    assertExists(convId);

    // Insert user message as the last message
    await sqlExec(`
      INSERT INTO messenger_messages (conversation_id, role, content, created_at)
      VALUES ('${convId}', 'user', 'Do you have fresh tomatoes?', now() - interval '45 minutes')
    `);

    // 2. Trigger nudge cron
    const res = await callMessengerNudge();
    assertEquals(res.status, 200);
    assertEquals(res.data.nudged, 1);

    // 3. Verify nudge_sent_at has been updated to non-null timestamp
    const updatedNudgeSentAt = await sqlExec(`SELECT nudge_sent_at FROM messenger_conversations WHERE id = '${convId}'`);
    assert(updatedNudgeSentAt.length > 5, "nudge_sent_at should be populated");

    // Verify nudge bot message exists in message history
    const botMsgs = await sqlExec(`
      SELECT content FROM messenger_messages WHERE conversation_id = '${convId}' AND role = 'bot' ORDER BY created_at DESC LIMIT 1
    `);
    assertExists(botMsgs);
    assert(botMsgs.length > 10, "Nudge message should have a populated body");

    // Verify url tracking works in the nudge message IF there are URLs present
    if (botMsgs.includes("http")) {
      assert(botMsgs.includes(`fb_psid=${MOCK_PSID}_cold_user`), "Nudge url tracking parameter fb_psid should be appended");
      assert(botMsgs.includes("fb_page_id=test_page_nudge_e2e") || botMsgs.includes("fb_page=test_page_nudge_e2e"), "Nudge url tracking parameter fb_page should be appended");
    }

    // Cleanup
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id = '${convId}'`);
    await sqlExec(`DELETE FROM messenger_conversations WHERE id = '${convId}'`);
  },
});

Deno.test({
  name: "messenger-nudge: cleanup final test data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await sqlExec(`DELETE FROM messenger_messages WHERE conversation_id IN (SELECT id FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}')`);
    await sqlExec(`DELETE FROM messenger_conversations WHERE seller_id = '${TEST_SELLER_ID}'`);
    await sqlExec(`DELETE FROM seller_fb_connections WHERE fb_page_id = 'test_page_nudge_e2e'`);
    // Restore original subscription for safety
    await sqlExec(`DELETE FROM seller_subscriptions WHERE user_id = '${TEST_SELLER_ID}'`);
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status)
      VALUES ('${TEST_SELLER_ID}', 'pro', 'active')
    `);
  },
});
