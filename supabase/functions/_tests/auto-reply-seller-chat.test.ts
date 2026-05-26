/**
 * Deno integration tests for auto-reply-seller-chat edge function.
 *
 * Tests copilot mode (delayed drafts), first responder mode (instant replies),
 * seller takeover, channel config, and escalation notifications.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/auto-reply-seller-chat.test.ts
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

// Helper: call edge function
async function callAutoReply(
  body: Record<string, unknown>,
): Promise<{ status: number; data: any }> {
  // Bypasses the active presence check by default to avoid flakiness from background heartbeat updates.
  // Tests that explicitly check active presence can pass isManual: false.
  const payload = { isManual: true, ...body };
  if (body.isManual === false) {
    delete payload.isManual;
  }
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/auto-reply-seller-chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    },
  );
  return { status: res.status, data: await res.json() };
}

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: setup — ensure seller is Pro with active subscription",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status, current_period_start, current_period_end)
      VALUES ('${SELLER_ID}', 'pro', 'active', now() - interval '15 days', now() + interval '15 days')
      ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', status = 'active',
        current_period_end = now() + interval '15 days'
    `);
    await sqlExec(
      `UPDATE profiles SET is_pro = true WHERE id = '${SELLER_ID}'`,
    );

    // Ensure seller has a booth with bot_channels
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );
    assertExists(boothId, "Seller must have a default booth");

    // Ensure the default booth has bot_reply_delay_minutes = 5
    await sqlExec(`
      UPDATE market_booths
      SET bot_reply_delay_minutes = 5
      WHERE owner_id = '${SELLER_ID}' AND is_default = true
    `);

    // Clean up any old drafts and messages for this test seller/buyer to prevent test contamination
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE seller_id = '${SELLER_ID}'`);
    await sqlExec(`DELETE FROM market_chat_messages WHERE sender_id IN ('${SELLER_ID}', '${BUYER_ID}')`);
    await sqlExec(`
      UPDATE market_conversations 
      SET seller_last_active_at = NULL 
      WHERE participant_a = '${SELLER_ID}' OR participant_b = '${SELLER_ID}'
    `);
    await sqlExec(`
      UPDATE messenger_conversations 
      SET seller_last_active_at = NULL 
      WHERE seller_id = '${SELLER_ID}'
    `);

    // Note: bot_channels JSONB column does not exist on market_booths.
    // The function reads it but gets null, defaulting to enabled=true, delayMinutes=5.
    // So ALL channels are always in copilot mode (delay=5) by default.
  },
});

// ══════════════════════════════════════════════════════════════
// Skip Cases
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: missing fields returns skipped",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data } = await callAutoReply({});
    assertEquals(data.skipped, true);
    assertEquals(data.reason, "missing_fields");
  },
});

Deno.test({
  name: "auto-reply: bot message is skipped (no infinite loop)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data } = await callAutoReply({
      type: "dm",
      messageId: "fake-id",
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      isBot: true,
    });
    assertEquals(data.skipped, true);
    assertEquals(data.reason, "bot_message");
  },
});

Deno.test({
  name: "auto-reply: non-Pro seller is skipped",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Buyer is not a Pro seller
    const msgId = await sqlExec(`
      SELECT id FROM market_chat_messages LIMIT 1
    `);
    // Use a user who is definitely not Pro
    const { data } = await callAutoReply({
      type: "dm",
      messageId: msgId || "fake-id",
      senderId: "c3333333-3333-3333-3333-333333333333",
      recipientId: BUYER_ID, // buyer is NOT Pro
    });
    assertEquals(data.skipped, true);
    assertEquals(data.reason, "not_pro");
  },
});

// ══════════════════════════════════════════════════════════════
// First Responder Mode (DM, delay=0)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: DM copilot mode — draft created with pending status",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Without bot_channels column, function defaults to delay=5 (copilot mode)
    const convId = await sqlExec(`
      SELECT id FROM market_conversations
      WHERE (participant_a = '${BUYER_ID}' AND participant_b = '${SELLER_ID}')
         OR (participant_a = '${SELLER_ID}' AND participant_b = '${BUYER_ID}')
      LIMIT 1
    `);

    let conversationId = convId;
    if (!conversationId || conversationId === "") {
      conversationId = await sqlExec(`
        INSERT INTO market_conversations (participant_a, participant_b, last_message_at)
        VALUES ('${BUYER_ID}', '${SELLER_ID}', now())
        RETURNING id
      `);
    }

    const msgId = await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content)
      VALUES ('${conversationId}', '${BUYER_ID}', 'Do you have fresh tomatoes today?')
      RETURNING id
    `);

    const { status, data } = await callAutoReply({
      type: "dm",
      messageId: msgId,
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      conversationId,
    });

    assertEquals(status, 200);
    assertEquals(data.success, true);
    // Default delay is 5 since bot_channels column doesn't exist
    assertEquals(data.delayMinutes, 5);

    // Wait for processing
    await new Promise((r) => setTimeout(r, 1000));

    // Verify draft created with pending status (copilot mode)
    const draft = await sqlExec(`
      SELECT status FROM bot_reply_drafts
      WHERE conversation_ref = '${conversationId}'
        AND channel = 'dm'
        AND trigger_message_id = '${msgId}'
      ORDER BY created_at DESC LIMIT 1
    `);
    assertEquals(draft, "pending");
  },
});

// ══════════════════════════════════════════════════════════════
// Copilot Mode (Orders, delay=5)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: order chat copilot — draft created with pending status",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );
    const productId = await sqlExec(
      `SELECT id FROM market_products WHERE seller_id = '${SELLER_ID}' LIMIT 1`,
    );

    // Create a test order
    const orderId = await sqlExec(`
      INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
        product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
        fulfillment_type, status, platform_fee_pct, platform_fee_usd, tax_rate_pct, tax_amount_usd)
      VALUES (gen_random_uuid(), '${BUYER_ID}', '${SELLER_ID}',
        '${boothId}', '${productId}',
        'Bot Copilot Test Peppers', 2, 6.00, 12.00, 12.00,
        'delivery', 'delivered', 10, 1.20, 0, 0)
      RETURNING id
    `);

    // Insert a buyer order chat message
    const msgId = await sqlExec(`
      INSERT INTO order_chat_messages (order_id, sender_id, content)
      VALUES ('${orderId}', '${BUYER_ID}', 'Are these peppers spicy?')
      RETURNING id
    `);

    const { status, data } = await callAutoReply({
      type: "order",
      messageId: msgId,
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      orderId,
    });

    assertEquals(status, 200);
    assertEquals(data.success, true);
    assertEquals(data.delayMinutes, 5);

    // Verify draft created with pending status
    const draft = await sqlExec(`
      SELECT status FROM bot_reply_drafts
      WHERE conversation_ref = '${orderId}'
        AND channel = 'order'
      ORDER BY created_at DESC LIMIT 1
    `);
    assertEquals(draft, "pending");

    // Verify NO bot message inserted yet (copilot holds it)
    const botMsg = await sqlExec(`
      SELECT count(*) FROM order_chat_messages
      WHERE order_id = '${orderId}'
        AND sender_id = '${SELLER_ID}'
        AND is_bot = true
        AND created_at > now() - interval '30 seconds'
    `);
    assertEquals(botMsg, "0");

    // Cleanup
    await sqlExec(`DELETE FROM market_orders WHERE id = '${orderId}'`);
  },
});

// ══════════════════════════════════════════════════════════════
// Seller Takeover
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: seller reply cancels pending drafts",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const convId = await sqlExec(`
      SELECT id FROM market_conversations
      WHERE (participant_a = '${BUYER_ID}' AND participant_b = '${SELLER_ID}')
         OR (participant_a = '${SELLER_ID}' AND participant_b = '${BUYER_ID}')
      LIMIT 1
    `);

    if (!convId) {
      console.log("⚠️ No conversation found — skipping");
      return;
    }

    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // Create a pending draft directly
    const marker = `seller_takeover_${Date.now()}`;
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message)
      VALUES ('dm', '${convId}', NULL,
        '${boothId}', '${SELLER_ID}', '["Test suggestion"]',
        now() + interval '5 minutes', 'pending', '${marker}')
      RETURNING id
    `);

    // Verify draft was created
    assert(draftId && draftId.length > 10, `Draft should be created, got: ${draftId}`);

    // Seller sends their own message (senderId = recipientId)
    const msgId = await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content)
      VALUES ('${convId}', '${SELLER_ID}', 'I will respond myself')
      RETURNING id
    `);

    const { data } = await callAutoReply({
      type: "dm",
      messageId: msgId,
      senderId: SELLER_ID,
      recipientId: SELLER_ID,
      conversationId: convId,
    });

    assertEquals(data.skipped, true);
    assertEquals(data.reason, "seller_message_cancelled_draft");

    // Verify draft was cancelled
    await new Promise((r) => setTimeout(r, 500));
    const draftStatus = await sqlExec(`
      SELECT status FROM bot_reply_drafts
      WHERE id = '${draftId}'
    `);
    assertEquals(draftStatus, "seller_replied");
  },
});

// ══════════════════════════════════════════════════════════════
// Channel Disabled
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: channel config defaults to enabled when column missing",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Since bot_channels column doesn't exist, the function always defaults
    // to enabled=true and delayMinutes=5. This test verifies that behavior.
    const convId = await sqlExec(`
      SELECT id FROM market_conversations
      WHERE (participant_a = '${BUYER_ID}' AND participant_b = '${SELLER_ID}')
         OR (participant_a = '${SELLER_ID}' AND participant_b = '${BUYER_ID}')
      LIMIT 1
    `);

    const msgId = await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content)
      VALUES ('${convId}', '${BUYER_ID}', 'Testing default channel config')
      RETURNING id
    `);

    const { status, data } = await callAutoReply({
      type: "dm",
      messageId: msgId,
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      conversationId: convId,
    });

    assertEquals(status, 200);
    assertEquals(data.success, true);
    // Default delay is always 5 since bot_channels column doesn't exist
    assertEquals(data.delayMinutes, 5);
  },
});

// ══════════════════════════════════════════════════════════════
// Escalation Flag
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: response includes escalation flag",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const convId = await sqlExec(`
      SELECT id FROM market_conversations
      WHERE (participant_a = '${BUYER_ID}' AND participant_b = '${SELLER_ID}')
         OR (participant_a = '${SELLER_ID}' AND participant_b = '${BUYER_ID}')
      LIMIT 1
    `);

    const msgId = await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content)
      VALUES ('${convId}', '${BUYER_ID}', 'Hello, just checking on availability')
      RETURNING id
    `);

    const { status, data } = await callAutoReply({
      type: "dm",
      messageId: msgId,
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      conversationId: convId,
    });

    assertEquals(status, 200);
    assertEquals(data.success, true);
    assertEquals(typeof data.escalated, "boolean");
  },
});

// ══════════════════════════════════════════════════════════════
// Conversation Mode Integration Tests
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: conversation mode — instant response when seller has not replied",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const convId = await sqlExec(`
      SELECT id FROM market_conversations
      WHERE (participant_a = '${BUYER_ID}' AND participant_b = '${SELLER_ID}')
         OR (participant_a = '${SELLER_ID}' AND participant_b = '${BUYER_ID}')
      LIMIT 1
    `);

    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // Clean up old drafts and messages for this conversation to prevent test contamination
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE seller_id = '${SELLER_ID}'`);
    await sqlExec(`DELETE FROM market_chat_messages WHERE conversation_id = '${convId}'`);
    await sqlExec(`UPDATE market_conversations SET seller_last_active_at = NULL WHERE id = '${convId}'`);

    // 1. Create a "sent" draft to simulate previous bot auto-reply
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message, resolved_at, created_at)
      VALUES ('dm', '${convId}', NULL,
        '${boothId}', '${SELLER_ID}', '["Bot initial auto-reply option"]',
        now() - interval '10 minutes', 'sent', 'Buyer first message', now() - interval '10 minutes', now() - interval '10 minutes')
      RETURNING id
    `);

    assert(draftId && draftId.length > 10, "Sent draft must be created");

    // 2. Buyer sends a subsequent message
    const msgId = await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content)
      VALUES ('${convId}', '${BUYER_ID}', 'Buyer subsequent message')
      RETURNING id
    `);

    // 3. Trigger auto-reply edge function
    const { status, data } = await callAutoReply({
      type: "dm",
      messageId: msgId,
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      conversationId: convId,
      isManual: false,
    });

    assertEquals(status, 200);
    assertEquals(data.success, true);
    // Should reply instantly (delayMinutes = 0) since seller has not replied
    assertEquals(data.delayMinutes, 0);

    // Verify a bot message was actually inserted instantly (delay = 0 means immediate insert)
    const botCount = await sqlExec(`
      SELECT count(*) FROM market_chat_messages
      WHERE conversation_id = '${convId}'
        AND sender_id = '${SELLER_ID}'
        AND is_bot = true
        AND created_at > now() - interval '10 seconds'
    `);
    assertEquals(botCount, "1");
  },
});

Deno.test({
  name: "auto-reply: conversation mode — exits when seller has replied",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const convId = await sqlExec(`
      SELECT id FROM market_conversations
      WHERE (participant_a = '${BUYER_ID}' AND participant_b = '${SELLER_ID}')
         OR (participant_a = '${SELLER_ID}' AND participant_b = '${BUYER_ID}')
      LIMIT 1
    `);

    const boothId = await sqlExec(
      `SELECT id FROM market_booths WHERE owner_id = '${SELLER_ID}' AND is_default = true LIMIT 1`,
    );

    // 1. Create a "sent" draft
    const draftId = await sqlExec(`
      INSERT INTO bot_reply_drafts (channel, conversation_ref, trigger_message_id,
        booth_id, seller_id, suggestions, auto_send_at, status, buyer_message, resolved_at, created_at)
      VALUES ('dm', '${convId}', NULL,
        '${boothId}', '${SELLER_ID}', '["Bot sent option"]',
        now() - interval '15 minutes', 'sent', 'Buyer old message', now() - interval '15 minutes', now() - interval '15 minutes')
      RETURNING id
    `);

    assert(draftId && draftId.length > 10, "Sent draft must be created");

    // 2. Seller manually replies in the chat thread
    await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content, is_bot, created_at)
      VALUES ('${convId}', '${SELLER_ID}', 'Seller manual takeover reply', false, now() - interval '5 minutes')
    `);

    // 3. Buyer sends a subsequent message
    const msgId = await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content)
      VALUES ('${convId}', '${BUYER_ID}', 'Buyer subsequent message after seller reply')
      RETURNING id
    `);

    // 4. Trigger auto-reply edge function
    const { status, data } = await callAutoReply({
      type: "dm",
      messageId: msgId,
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      conversationId: convId,
    });

    assertEquals(status, 200);
    assertEquals(data.success, true);
    assertEquals(data.delayMinutes, 5);

    // Verify a pending draft WAS created for this message (back to standard delay)
    const draftCount = await sqlExec(`
      SELECT count(*) FROM bot_reply_drafts
      WHERE conversation_ref = '${convId}'
        AND trigger_message_id = '${msgId}'
        AND status = 'pending'
    `);
    assertEquals(draftCount, "1");
  },
});

Deno.test({
  name: "auto-reply: presence check — skips when seller is active in chat",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const convId = await sqlExec(`
      SELECT id FROM market_conversations
      WHERE (participant_a = '${BUYER_ID}' AND participant_b = '${SELLER_ID}')
         OR (participant_a = '${SELLER_ID}' AND participant_b = '${BUYER_ID}')
      LIMIT 1
    `);

    // 1. Set seller presence heartbeat to active (now)
    await sqlExec(`
      UPDATE market_conversations
      SET seller_last_active_at = now()
      WHERE id = '${convId}'
    `);

    // 2. Buyer sends a message
    const msgId = await sqlExec(`
      INSERT INTO market_chat_messages (conversation_id, sender_id, content)
      VALUES ('${convId}', '${BUYER_ID}', 'Hello, are you there?')
      RETURNING id
    `);

    // 3. Trigger auto-reply edge function
    const { status, data } = await callAutoReply({
      type: "dm",
      messageId: msgId,
      senderId: BUYER_ID,
      recipientId: SELLER_ID,
      conversationId: convId,
      isManual: false,
    });

    assertEquals(status, 200);
    assertEquals(data.skipped, true);
    assertEquals(data.reason, "seller_in_chat");

    // 4. Clean up presence heartbeat so it doesn't leak
    await sqlExec(`
      UPDATE market_conversations
      SET seller_last_active_at = NULL
      WHERE id = '${convId}'
    `);
  },
});

// ══════════════════════════════════════════════════════════════
// Teardown
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "auto-reply: teardown — clean up database after tests",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await sqlExec(`DELETE FROM bot_reply_drafts WHERE seller_id = '${SELLER_ID}'`);
    await sqlExec(`DELETE FROM market_chat_messages WHERE sender_id IN ('${SELLER_ID}', '${BUYER_ID}')`);
  },
});

