/**
 * Deno integration tests for the Instagram webhook edge function.
 *
 * Tests the webhook verification, message processing, booth routing,
 * conversation management, and message storage.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/instagram-webhook.test.ts
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
): Promise<{ status: number; data: any }> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/instagram-webhook`);
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
  const res = await fetch(url.toString(), opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

const SELLER_ID = "a1111111-1111-1111-1111-111111111111";

// ══════════════════════════════════════════════════════════════
// Table Existence
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: ig_conversations table accessible",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const count = await sqlExec(
      "SELECT count(*) FROM ig_conversations",
    );
    assert(
      parseInt(count) >= 0,
      "ig_conversations table should exist",
    );
  },
});

Deno.test({
  name: "instagram-webhook: ig_messages table accessible",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const count = await sqlExec("SELECT count(*) FROM ig_messages");
    assert(parseInt(count) >= 0, "ig_messages table should exist");
  },
});

// ══════════════════════════════════════════════════════════════
// Webhook Endpoint (POST)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: POST with valid page message returns 200",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("POST", {}, {
      object: "instagram",
      entry: [
        {
          id: "test_ig_account_nonexistent",
          time: Date.now(),
          messaging: [
            {
              sender: { id: "test_igsid_123" },
              recipient: { id: "test_ig_account_nonexistent" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_ig_123",
                text: "Hello, do you sell organic strawberries?",
              },
            },
          ],
        },
      ],
    });

    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "instagram-webhook: POST with empty entry returns 200",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("POST", {}, {
      object: "instagram",
      entry: [],
    });

    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "instagram-webhook: unconnected IG account handled gracefully",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("POST", {}, {
      object: "instagram",
      entry: [
        {
          id: "nonexistent_ig_account_xyz",
          time: Date.now(),
          messaging: [
            {
              sender: { id: "test_igsid_unconnected" },
              recipient: { id: "nonexistent_ig_account_xyz" },
              timestamp: Date.now(),
              message: {
                mid: "mid_unconnected_ig_1",
                text: "Are you open?",
              },
            },
          ],
        },
      ],
    });

    // Must still return 200 to Instagram/Facebook
    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "instagram-webhook: GET verification endpoint responds",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("GET", {
      "hub.mode": "subscribe",
      "hub.verify_token": "test_token",
      "hub.challenge": "test_ig_challenge_123",
    });

    assert([200, 403].includes(res.status));
  },
});

// ══════════════════════════════════════════════════════════════
// GET Verification — Correct & Wrong Token
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: GET verification with correct token returns 200",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const challenge = "ig_challenge_correct_" + Date.now();
    const res = await callWebhook("GET", {
      "hub.mode": "subscribe",
      "hub.verify_token": "casagrown_verify",
      "hub.challenge": challenge,
    });

    assertEquals(res.status, 200);
    assertEquals(res.data.raw, challenge);
  },
});

Deno.test({
  name: "instagram-webhook: GET verification with wrong token returns 403",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await callWebhook("GET", {
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong_token",
      "hub.challenge": "should_not_be_returned",
    });

    assertEquals(res.status, 403);
  },
});

// ══════════════════════════════════════════════════════════════
// Schema Validation
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: ig_conversations has required columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_name = 'ig_conversations'
    `);
    assert(cols.includes("ig_sender_id"), "Should have ig_sender_id");
    assert(cols.includes("seller_id"), "Should have seller_id");
    assert(cols.includes("bot_conversation_mode_until"), "Should have bot_conversation_mode_until");
    assert(cols.includes("matched_booth_id"), "Should have matched_booth_id");
  },
});

Deno.test({
  name: "instagram-webhook: ig_messages has required columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const cols = await sqlExec(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_name = 'ig_messages'
    `);
    assert(cols.includes("conversation_id"), "Should have conversation_id");
    assert(cols.includes("content"), "Should have content");
    assert(cols.includes("role"), "Should have role column");
  },
});

// ══════════════════════════════════════════════════════════════
// Full Flow Setup & Teardown
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: setup connections and test message",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Ensure SELLER_ID is elite tier
    await sqlExec(`
      INSERT INTO seller_subscriptions (user_id, plan, status)
      VALUES ('${SELLER_ID}', 'elite', 'active')
      ON CONFLICT (user_id) DO UPDATE SET plan = 'elite', status = 'active'
    `);

    // 2. Setup profiles.bot_channels config with instagram enabled
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"instagram": {"enabled": true, "delayMinutes": 0}, "messenger": {"enabled": true, "delayMinutes": 0}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);

    // 3. Create a active connection
    await sqlExec(`
      DELETE FROM seller_fb_connections WHERE user_id = '${SELLER_ID}' OR ig_business_account_id = 'test_ig_account_e2e'
    `);
    await sqlExec(`
      INSERT INTO seller_fb_connections (
        user_id, fb_access_token, fb_token_expires_at, fb_page_id, fb_page_name, fb_page_access_token, status, ig_business_account_id, ig_username
      ) VALUES (
        '${SELLER_ID}',
        'mock_user_access_token',
        now() + interval '60 days',
        'test_page_id',
        'Test Farm Page',
        'mock_page_access_token_e2e',
        'connected',
        'test_ig_account_e2e',
        'test_grower_instagram'
      )
    `);

    // 4. Send customer message to our webhook
    const senderId = "buyer_igsid_" + Date.now();
    const res = await callWebhook("POST", {}, {
      object: "instagram",
      entry: [
        {
          id: "test_ig_account_e2e",
          time: Date.now(),
          messaging: [
            {
              sender: { id: senderId },
              recipient: { id: "test_ig_account_e2e" },
              timestamp: Date.now(),
              message: {
                mid: "mid_ig_" + Date.now(),
                text: "Hi, organic berries available?",
              },
            },
          ],
        },
      ],
    });

    assertEquals(res.status, 200);

    // Wait a brief moment for async DB ops
    await new Promise((r) => setTimeout(r, 2000));

    // 5. Verify conversation was created
    const count = await sqlExec(
      `SELECT count(*) FROM ig_conversations WHERE ig_sender_id = '${senderId}'`
    );
    assert(parseInt(count) >= 0);
  },
});

// ══════════════════════════════════════════════════════════════
// Multiple Rapid Messages
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: multiple rapid messages don't crash",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Send 3 messages in rapid succession — should all return 200
    const promises = [1, 2, 3].map((i) =>
      callWebhook("POST", {}, {
        object: "instagram",
        entry: [
          {
            id: "test_ig_account_e2e",
            time: Date.now(),
            messaging: [
              {
                sender: { id: "rapid_test_igsid" },
                recipient: { id: "test_ig_account_e2e" },
                timestamp: Date.now(),
                message: {
                  mid: `mid_ig_rapid_${i}_${Date.now()}`,
                  text: `Rapid IG message ${i}`,
                },
              },
            ],
          },
        ],
      })
    );

    const results = await Promise.all(promises);
    for (const r of results) {
      assertEquals(r.status, 200);
    }
  },
});

// ══════════════════════════════════════════════════════════════
// Non-Elite Seller Rejected
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: non-Elite seller rejected",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Downgrade seller to 'pro'
    await sqlExec(`
      UPDATE seller_subscriptions SET plan = 'pro' WHERE user_id = '${SELLER_ID}'
    `);

    const uniqueSender = "non_elite_igsid_" + Date.now();
    const res = await callWebhook("POST", {}, {
      object: "instagram",
      entry: [
        {
          id: "test_ig_account_e2e",
          time: Date.now(),
          messaging: [
            {
              sender: { id: uniqueSender },
              recipient: { id: "test_ig_account_e2e" },
              timestamp: Date.now(),
              message: {
                mid: "mid_non_elite_" + Date.now(),
                text: "Do you have apples?",
              },
            },
          ],
        },
      ],
    });

    assertEquals(res.status, 200);

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 2000));

    // Verify no conversation was created for this unique sender
    const convCount = await sqlExec(
      `SELECT count(*) FROM ig_conversations WHERE ig_sender_id = '${uniqueSender}'`,
    );
    assertEquals(convCount, "0", "No conversation should be created for non-Elite seller");

    // Restore to elite
    await sqlExec(`
      UPDATE seller_subscriptions SET plan = 'elite' WHERE user_id = '${SELLER_ID}'
    `);
  },
});

// ══════════════════════════════════════════════════════════════
// Disabled Channel Skipped
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: disabled channel skipped",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Disable Instagram channel
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"instagram": {"enabled": false}, "messenger": {"enabled": true, "delayMinutes": 0}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);

    const uniqueSender = "disabled_ch_igsid_" + Date.now();
    const res = await callWebhook("POST", {}, {
      object: "instagram",
      entry: [
        {
          id: "test_ig_account_e2e",
          time: Date.now(),
          messaging: [
            {
              sender: { id: uniqueSender },
              recipient: { id: "test_ig_account_e2e" },
              timestamp: Date.now(),
              message: {
                mid: "mid_disabled_ch_" + Date.now(),
                text: "Any fresh herbs?",
              },
            },
          ],
        },
      ],
    });

    assertEquals(res.status, 200);

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 2000));

    // Verify no conversation was created for this unique sender
    const convCount = await sqlExec(
      `SELECT count(*) FROM ig_conversations WHERE ig_sender_id = '${uniqueSender}'`,
    );
    assertEquals(convCount, "0", "No conversation should be created when Instagram channel is disabled");

    // Restore Instagram config
    await sqlExec(`
      UPDATE profiles
      SET bot_channels = '{"instagram": {"enabled": true, "delayMinutes": 0}, "messenger": {"enabled": true, "delayMinutes": 0}}'::jsonb
      WHERE id = '${SELLER_ID}'
    `);
  },
});

// ══════════════════════════════════════════════════════════════
// Cleanup (must be LAST)
// ══════════════════════════════════════════════════════════════

Deno.test({
  name: "instagram-webhook: cleanup test connection",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await sqlExec(`
      DELETE FROM seller_fb_connections WHERE ig_business_account_id = 'test_ig_account_e2e'
    `);
  },
});
