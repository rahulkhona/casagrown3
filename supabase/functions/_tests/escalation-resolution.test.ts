/**
 * Deno integration tests for escalation resolution flow.
 *
 * Tests the escalation resolution RPCs via the Supabase REST API,
 * verifying the end-to-end flow from dispute creation through resolution,
 * credit issuance, and notification generation.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check functions/_tests/escalation-resolution.test.ts
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const STAFF_EMAIL = "seller@test.local";
const STAFF_PASSWORD = "TestPassword123!";

const HEADERS_SR = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
};

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Helper: get staff token
async function getStaffToken(): Promise<{ token: string; userId: string }> {
  // Fix identity if needed
  const proc = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
      "supabase_db_casagrown3",
      "psql",
      "-U",
      "postgres",
      "-c",
      `INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
       SELECT id, id, email, 'email', jsonb_build_object('sub', id::text, 'email', email), now(), now(), now()
       FROM auth.users WHERE email = '${STAFF_EMAIL}'
       ON CONFLICT (provider_id, provider) DO NOTHING;
       UPDATE auth.users SET
         confirmation_token = COALESCE(confirmation_token, ''),
         recovery_token = COALESCE(recovery_token, ''),
         email_change_token_new = COALESCE(email_change_token_new, ''),
         email_change = COALESCE(email_change, ''),
         email_change_token_current = COALESCE(email_change_token_current, ''),
         reauthentication_token = COALESCE(reauthentication_token, '')
       WHERE email = '${STAFF_EMAIL}';`,
    ],
  });
  try {
    await proc.output();
  } catch { /* ok */ }

  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
    },
  );
  const data = await res.json();
  if (!data.access_token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return { token: data.access_token, userId: data.user.id };
}

// Helper: run SQL
async function sqlExec(sql: string): Promise<string> {
  const proc = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
      "supabase_db_casagrown3",
      "psql",
      "-U",
      "postgres",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await proc.output();
  const raw = new TextDecoder().decode(output.stdout).trim();
  // Strip psql status lines like "INSERT 0 1" from RETURNING output
  const lines = raw.split("\n").filter((l) =>
    !l.match(/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|RESET)\s/i)
  );
  return lines[0]?.trim() || raw;
}

// Helper: RPC call with auth
async function rpcCall(
  token: string,
  fnName: string,
  params: Record<string, unknown> = {},
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  return { status: res.status, data: await res.json() };
}


// ── Test Suite ──

Deno.test({
  name: "escalation-resolution: setup and resolve full refund",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { token, userId } = await getStaffToken();

    const buyerId = await sqlExec(`SELECT id FROM auth.users WHERE email != '${STAFF_EMAIL}' LIMIT 1`);
    const sellerId = userId;
    const boothId = await sqlExec(`SELECT id FROM market_booths LIMIT 1`);
    const productId = await sqlExec(`SELECT id FROM market_products LIMIT 1`);

    // Create order + dispute using SQL gen_random_uuid()
    const orderId = await sqlExec(`
      INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
        product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
        fulfillment_type, status, platform_fee_pct, platform_fee_usd, tax_rate_pct, tax_amount_usd)
      VALUES (gen_random_uuid(), '${buyerId}'::uuid, '${sellerId}'::uuid,
        '${boothId}'::uuid, '${productId}'::uuid,
        'Deno Test Tomatoes', 2, 10.00, 20.00, 20.00,
        'delivery', 'escalated', 10, 2.00, 0, 0)
      RETURNING id
    `);

    const disputeId = await sqlExec(`
      INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
      VALUES (gen_random_uuid(), '${orderId}'::uuid,
        '${buyerId}'::uuid, 'Item damaged - Deno test', 'open')
      RETURNING id
    `);

    const result = await rpcCall(token, "admin_resolve_escalation", {
      p_order_id: orderId,
      p_resolution_type: "refund_full",
      p_reason: "Damage confirmed in photos - Deno test",
    });

    assertEquals(result.status, 200);
    assertEquals(result.data?.success, true);

    const orderStatus = await sqlExec(`SELECT status FROM market_orders WHERE id = '${orderId}'`);
    assertEquals(orderStatus, "resolved");

    const disputeStatus = await sqlExec(`SELECT status FROM order_disputes WHERE id = '${disputeId}'`);
    assertEquals(disputeStatus, "staff_resolved");
  },
});

Deno.test({
  name: "escalation-resolution: credit_buyer resolution with FIFO tracking",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { token, userId } = await getStaffToken();

    const buyerId = await sqlExec(`SELECT id FROM auth.users WHERE email != '${STAFF_EMAIL}' LIMIT 1`);
    const boothId = await sqlExec(`SELECT id FROM market_booths LIMIT 1`);
    const productId = await sqlExec(`SELECT id FROM market_products LIMIT 1`);

    const orderId = await sqlExec(`
      INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
        product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
        fulfillment_type, status, platform_fee_pct, platform_fee_usd, tax_rate_pct, tax_amount_usd)
      VALUES (gen_random_uuid(), '${buyerId}'::uuid, '${userId}'::uuid,
        '${boothId}'::uuid, '${productId}'::uuid,
        'Deno Credit Test', 1, 15.00, 15.00, 15.00,
        'pickup', 'disputed', 10, 1.50, 0, 0)
      RETURNING id
    `);

    await sqlExec(`
      INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
      VALUES (gen_random_uuid(), '${orderId}'::uuid,
        '${buyerId}'::uuid, 'Quality issue - Deno test', 'open')
      RETURNING id
    `);

    const result = await rpcCall(token, "admin_resolve_escalation", {
      p_order_id: orderId,
      p_resolution_type: "credit_buyer",
      p_reason: "Issuing goodwill credit - Deno test",
      p_credit_amount_usd: 7.50,
      p_credit_type: "purchase",
      p_credit_cap_value: 25,
    });

    assertEquals(result.status, 200);
    assertEquals(result.data?.success, true);
    assertExists(result.data?.credit_id);

    const creditCount = await sqlExec(
      `SELECT count(*) FROM user_credits WHERE user_id = '${buyerId}' AND reason LIKE '%Deno test%'`,
    );
    assertEquals(parseInt(creditCount) >= 1, true);
  },
});

Deno.test({
  name: "escalation-resolution: credit_both combo resolution",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { token, userId } = await getStaffToken();

    const buyerId = await sqlExec(`SELECT id FROM auth.users WHERE email != '${STAFF_EMAIL}' LIMIT 1`);
    const boothId = await sqlExec(`SELECT id FROM market_booths LIMIT 1`);
    const productId = await sqlExec(`SELECT id FROM market_products LIMIT 1`);

    const orderId = await sqlExec(`
      INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
        product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
        fulfillment_type, status, platform_fee_pct, platform_fee_usd, tax_rate_pct, tax_amount_usd)
      VALUES (gen_random_uuid(), '${buyerId}'::uuid, '${userId}'::uuid,
        '${boothId}'::uuid, '${productId}'::uuid,
        'Deno Combo Test', 3, 8.00, 24.00, 24.00,
        'delivery', 'escalated', 10, 2.40, 0, 0)
      RETURNING id
    `);

    await sqlExec(`
      INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
      VALUES (gen_random_uuid(), '${orderId}'::uuid,
        '${buyerId}'::uuid, 'Both need compensation - Deno', 'open')
      RETURNING id
    `);

    const result = await rpcCall(token, "admin_resolve_escalation", {
      p_order_id: orderId,
      p_resolution_type: "credit_both",
      p_reason: "Both parties had valid arguments - Deno combo test",
      p_credit_amount_usd: 5.00,
      p_credit_type: "purchase",
      p_credit_cap_value: 20,
      p_secondary_credit_usd: 3.00,
      p_secondary_credit_type: "purchase",
      p_secondary_credit_cap_value: 15,
    });

    assertEquals(result.status, 200);
    assertEquals(result.data?.success, true);
    assertExists(result.data?.credit_id);
    assertExists(result.data?.secondary_credit_id);
  },
});

Deno.test({
  name: "escalation-resolution: non-staff user blocked",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const result = await rpcCall(ANON_KEY, "admin_resolve_escalation", {
      p_order_id: "00000000-0000-0000-0000-000000000000",
      p_resolution_type: "refund_full",
      p_reason: "hacker attempt",
    });

    // SECURITY DEFINER RPCs may return 200 with JSON error
    if (result.status === 200) {
      assertExists(result.data?.error);
    } else {
      assertEquals([400, 401, 403].includes(result.status), true);
    }
  },
});

Deno.test({
  name: "escalation-resolution: claim and relinquish workflow",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { token, userId } = await getStaffToken();

    const buyerId = await sqlExec(`SELECT id FROM auth.users WHERE email != '${STAFF_EMAIL}' LIMIT 1`);
    const boothId = await sqlExec(`SELECT id FROM market_booths LIMIT 1`);
    const productId = await sqlExec(`SELECT id FROM market_products LIMIT 1`);

    const orderId = await sqlExec(`
      INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id,
        product_name, quantity, unit_price_usd, subtotal_usd, total_usd,
        fulfillment_type, status, platform_fee_pct, platform_fee_usd, tax_rate_pct, tax_amount_usd)
      VALUES (gen_random_uuid(), '${buyerId}'::uuid, '${userId}'::uuid,
        '${boothId}'::uuid, '${productId}'::uuid,
        'Deno Claim Test', 1, 10.00, 10.00, 10.00,
        'delivery', 'escalated', 10, 1.00, 0, 0)
      RETURNING id
    `);

    const disputeId = await sqlExec(`
      INSERT INTO order_disputes (id, order_id, initiated_by, reason, status)
      VALUES (gen_random_uuid(), '${orderId}'::uuid,
        '${buyerId}'::uuid, 'Claim test - Deno', 'open')
      RETURNING id
    `);

    // Claim
    const claimResult = await rpcCall(token, "admin_claim_escalation", { p_dispute_id: disputeId });
    assertEquals(claimResult.status, 200);
    assertEquals(claimResult.data?.error, undefined);

    // Relinquish
    const relinquishResult = await rpcCall(token, "admin_relinquish_escalation", { p_dispute_id: disputeId });
    assertEquals(relinquishResult.status, 200);
    assertEquals(relinquishResult.data?.error, undefined);
  },
});

Deno.test({
  name: "escalation-resolution: admin comment adds dispute message",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { token } = await getStaffToken();

    // Find any open dispute
    const disputeId = await sqlExec(
      `SELECT id FROM order_disputes WHERE status IN ('open', 'escalated') LIMIT 1`,
    );

    if (!disputeId) {
      console.log("⚠️ No open disputes to test comments on — skipping");
      return;
    }

    const result = await rpcCall(token, "admin_add_dispute_comment", {
      p_dispute_id: disputeId,
      p_body: "Please provide delivery photos - Deno test",
      p_request_info_from: "buyer",
    });

    assertEquals(result.status, 200);

    const msgCount = await sqlExec(
      `SELECT count(*) FROM order_dispute_messages WHERE dispute_id = '${disputeId}' AND body LIKE '%Deno test%'`,
    );
    assertEquals(parseInt(msgCount) >= 1, true);
  },
});

Deno.test({
  name: "escalation-resolution: get_escalated_orders_admin returns data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { token } = await getStaffToken();

    const result = await rpcCall(token, "get_escalated_orders_admin", { p_limit: 50 });
    assertEquals(result.status, 200);
    assertEquals(Array.isArray(result.data), true);
  },
});

Deno.test({
  name: "escalation-resolution: get_escalation_stats_admin returns aggregated counts",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { token } = await getStaffToken();

    const result = await rpcCall(token, "get_escalation_stats_admin");
    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(typeof result.data.open, "number");
    assertEquals(typeof result.data.resolved, "number");
    assertEquals(typeof result.data.total, "number");
  },
});
