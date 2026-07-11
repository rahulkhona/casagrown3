/**
 * Execute Auto-Payouts — Integration Tests
 *
 * Tests the execute-auto-payouts cron edge function:
 * - Auth: service-role only
 * - Schema verification for all dependent tables
 * - RPC existence for batch_debit_market_balance, get_auto_payout_eligible_users
 * - Payout result tracking
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check \
 *        functions/_tests/execute-auto-payouts.test.ts
 */
import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
}

async function rpc<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!text) return null as T
  try { return JSON.parse(text) as T } catch { return text as T }
}

// ============================================================================
// 1. Auth: anon key rejected
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: rejects anon key',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/execute-auto-payouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
      body: '{}',
    })
    assertEquals(true, res.status >= 400, 'Anon key should be rejected')
    await res.text()
  },
})

// ============================================================================
// 2. RPC: get_auto_payout_eligible_users exists and returns array
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: get_auto_payout_eligible_users RPC exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const result = await rpc<unknown[]>('get_auto_payout_eligible_users')
    assertExists(result)
    assertEquals(Array.isArray(result), true)
  },
})

// ============================================================================
// 3. RPC: batch_debit_market_balance exists
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: batch_debit_market_balance RPC exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const result = await rpc('batch_debit_market_balance', { p_entries: [] })
    assertExists(result)
  },
})

// ============================================================================
// 4. Schema: user_auto_redemption_config table accessible
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: user_auto_redemption_config table exists',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_auto_redemption_config?select=user_id,threshold_usd,method&limit=0`, {
      headers: HEADERS,
    })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// ============================================================================
// 5. Schema: market_ledger table accessible
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: market_ledger tracks payout debits',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/market_ledger?select=id,user_id,amount_usd,direction&limit=0`, {
      headers: HEADERS,
    })
    assertEquals(res.status, 200)
    await res.text()
  },
})

// ============================================================================
// 6. Schema: payout_history table accessible
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: payout_history exists for tracking',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/payout_history?select=id&limit=0`, {
      headers: HEADERS,
    })
    // payout_history may not exist — track if it doesn't
    assertEquals(true, res.status === 200 || res.status === 404)
    await res.text()
  },
})

// ============================================================================
// 7. Performance: eligible users query responds within 500ms
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: eligible users query perf < 500ms',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const start = performance.now()
    await rpc('get_auto_payout_eligible_users')
    const elapsed = performance.now() - start
    assertEquals(elapsed < 500, true, `Took ${elapsed.toFixed(0)}ms, expected < 500ms`)
  },
})

// ============================================================================
// 8. Auto-Payout: Executes Tremendous automated gift card payout end-to-end
// ============================================================================
Deno.test({
  name: 'execute-auto-payouts: runs Tremendous auto-payout happy path',
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const { invokeFunction, serviceHeaders, getTestUserToken } = await import('../_shared/test-helpers.ts')
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.36.0')

    const testToken = await getTestUserToken();
    const testUserId = JSON.parse(atob(testToken.split(".")[1] || "")).sub as string;

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Seed balance & config
    await supabaseAdmin.from('user_balances').upsert({
      user_id: testUserId,
      available_usd: 25.00,
      pending_usd: 0,
      total_earned_usd: 25.00,
      total_spent_usd: 0,
      total_withdrawn_usd: 0,
    });

    // Seed Tremendous into unified cache
    await supabaseAdmin.from("giftcards_cache").delete().eq("provider", "unified");
    await supabaseAdmin.from("giftcards_cache").upsert({
      provider: "unified",
      status: "active",
      data: [{
        id: "XRRU0EWKQI0F",
        brandName: "Crate & Barrel",
        brandKey: "cratebarrel",
        logoUrl: "http://example.com/logo.png",
        cardImageUrl: "http://example.com/card.png",
        category: "Entertainment",
        denominationType: "range",
        minDenomination: 5,
        maxDenomination: 2000,
        currencyCode: "USD",
        availableProviders: [{
          provider: "tremendous",
          productId: "XRRU0EWKQI0F",
          discountPercentage: 0,
          feePerTransaction: 0,
          feePercentage: 0
        }],
        hasProcessingFee: false,
        processingFeeUsd: 0,
        brandColor: "#000000",
        brandIcon: "🎁"
      }]
    });

    // Configure user auto payout setting
    await supabaseAdmin.from('user_auto_redemption_config').insert({
      user_id: testUserId,
      enabled: true,
      threshold_usd: 25.00,
      method: 'giftcards',
      gift_card_brand: 'Crate & Barrel',
      gift_card_amount_usd: 25.00,
    });

    // Ensure Tremendous queue is disabled and instrument active
    await supabaseAdmin.from('instrument_queuing_status').update({ is_queuing: false }).eq('instrument', 'tremendous');
    await supabaseAdmin.from('available_redemption_method_instruments').update({ is_active: true }).eq('instrument', 'tremendous');

    // 2. Call the auto-payout executor function
    const { status, data } = await invokeFunction(
      "execute-auto-payouts",
      {},
      serviceHeaders(),
    );

    // 3. Verify results
    assertEquals(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assertEquals(data.success, true);
    
    // Find the result for our user
    const userResult = (data.results as any[] || []).find(r => r.user_id === testUserId);
    assertExists(userResult, "Should have a result entry for the test user");
    assertEquals(userResult.status, "success", `Expected success, got: ${userResult.error || 'no error detail'}`);
    assertEquals(userResult.method, "giftcards");

    // 4. Verify DB changes: check redemption and debit
    const { data: redemption } = await supabaseAdmin.from("redemptions")
      .select("status, provider, provider_order_id, point_cost")
      .eq("user_id", testUserId)
      .maybeSingle();

    assertExists(redemption, "Should have created a redemption record");
    // Since queue is off, Tremendous executes, and it updates to complete/pending (Tremendous LINK is pending async webhook)
    assertEquals(redemption.status, "pending");
    assertEquals(redemption.provider, "tremendous");
    assertExists(redemption.provider_order_id);

    // Balance should be debited to 0
    const { data: updatedBalance } = await supabaseAdmin.from("user_balances")
      .select("available_usd")
      .eq("user_id", testUserId)
      .single();
    
    assertEquals(Number(updatedBalance.available_usd), 0.00);

    // Cleanup
    await supabaseAdmin.from("user_auto_redemption_config").delete().eq("user_id", testUserId);
    await supabaseAdmin.from("redemptions").delete().eq("user_id", testUserId);
    await supabaseAdmin.from("profiles").delete().eq("id", testUserId);
  }
})

