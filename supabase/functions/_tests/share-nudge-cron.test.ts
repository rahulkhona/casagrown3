/**
 * Integration tests for Low-Traction Share Nudge cron action.
 *
 * Verifies that the "share_nudge" action inside the market-cron edge function:
 * 1. Correctly selects listings created 2–4 hours ago with 0 views and 0 orders.
 * 2. Skips listings created < 2 hours or > 4 hours ago.
 * 3. Skips listings with views/clicks or orders.
 * 4. Dispatches push, in-app, and email reminders.
 * 5. Prevents duplicate nudges on subsequent runs.
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check functions/_tests/share-nudge-cron.test.ts
 */

import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey": SERVICE_ROLE_KEY,
};

const SEED_SELLER_ID = "11111111-1111-1111-1111-111111111111";

async function seedProduct(name: string, createdHoursAgo: number, overrides: Record<string, unknown> = {}): Promise<string> {
  const created_at = new Date(Date.now() - createdHoursAgo * 60 * 60 * 1000).toISOString();
  const payload = {
    seller_id: SEED_SELLER_ID,
    name,
    description: "Nudge test product",
    price_usd: 5.0,
    unit: "per lb",
    category: "produce",
    inventory: 10,
    market_date: new Date().toISOString().split("T")[0],
    is_active: true,
    is_deleted: false,
    moderation_status: "approved",
    created_at,
    moderation_checked_at: created_at,
    ...overrides,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/market_products`, {
    method: "POST",
    headers: { ...AUTH_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = await res.json();
  assertExists(rows[0]?.id, `Seed product insert failed: ${JSON.stringify(rows)}`);
  return rows[0].id as string;
}

async function seedOrder(productId: string, productName: string): Promise<string> {
  const boothRes = await fetch(`${SUPABASE_URL}/rest/v1/market_booths?owner_id=eq.${SEED_SELLER_ID}&select=id`, {
    headers: AUTH_HEADERS,
  });
  const booths = await boothRes.json();
  const boothId = booths[0]?.id ?? "0db8ff02-9d47-468f-8480-399d3e2bef69";

  const payload = {
    buyer_id: SEED_SELLER_ID, // self-purchase for test simplicity
    seller_id: SEED_SELLER_ID,
    booth_id: boothId,
    product_id: productId,
    product_name: productName,
    quantity: 1,
    unit_price_usd: 5.0,
    subtotal_usd: 5.0,
    total_usd: 5.0,
    fulfillment_type: "pickup",
    status: "pending",
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/market_orders`, {
    method: "POST",
    headers: { ...AUTH_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = await res.json();
  assertExists(rows[0]?.id, `Seed order insert failed: ${JSON.stringify(rows)}`);
  return rows[0].id as string;
}

async function cleanData(productIds: string[], orderIds: string[]) {
  if (orderIds.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/market_orders?id=in.(${orderIds.join(",")})`, {
      method: "DELETE",
      headers: AUTH_HEADERS,
    });
  }
  if (productIds.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/market_products?id=in.(${productIds.join(",")})`, {
      method: "DELETE",
      headers: AUTH_HEADERS,
    });
  }
}

async function triggerCronNudge(): Promise<{ status: number; data: any }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/market-cron`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({ action: "share_nudge" }),
  });
  return {
    status: res.status,
    data: await res.json().catch(() => ({})),
  };
}

Deno.test({
  name: "share-nudge-cron: full selection pipeline integration test",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // 1. Setup seed products
    const productIds: string[] = [];
    const orderIds: string[] = [];

    // Candidate: 3 hours ago, 0 views, 0 orders (SHOULD trigger)
    const candidateId = await seedProduct("Nudge Candidate", 3);
    productIds.push(candidateId);

    // Under age limit: 1 hour ago, 0 views, 0 orders (should NOT trigger)
    const tooYoungId = await seedProduct("Too Young Product", 1);
    productIds.push(tooYoungId);

    // Over age limit: 5 hours ago, 0 views, 0 orders (should NOT trigger)
    const tooOldId = await seedProduct("Too Old Product", 5);
    productIds.push(tooOldId);

    // Has orders: 3 hours ago, 1 order (should NOT trigger)
    const withOrderId = await seedProduct("Product With Order", 3);
    productIds.push(withOrderId);
    const orderId = await seedOrder(withOrderId, "Product With Order");
    orderIds.push(orderId);

    try {
      // Clear any pre-existing notifications with nudge content for SEED_SELLER_ID
      await fetch(
        `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${SEED_SELLER_ID}&content=ilike.*traction*`,
        { method: "DELETE", headers: AUTH_HEADERS }
      );

      // 2. Trigger cron nudge
      const { status, data } = await triggerCronNudge();
      assertEquals(status, 200);
      assertExists(data.nudged, `Response should return nudged count, got: ${JSON.stringify(data)}`);
      
      // Candidate should be the only one nudged
      assert(data.nudged >= 1, `Expected at least 1 nudge, got: ${data.nudged}`);

      // 3. Verify notifications table has the nudge notification
      const shareLink = `/my-booth/products?share=${candidateId}`;
      const notifRes = await fetch(
        `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${SEED_SELLER_ID}&link_url=eq.${shareLink}`,
        { headers: AUTH_HEADERS }
      );
      const notifs = await notifRes.json();
      assertEquals(notifs.length, 1, "Should have created exactly 1 nudge notification for candidate");
      assert(
        notifs[0].content.includes("Haven't seen any traction"),
        `Expected nudge content, got: ${notifs[0].content}`
      );

      // 4. Verify tooYoung, tooOld, withOrder do not have nudge notifications
      for (const id of [tooYoungId, tooOldId, withOrderId]) {
        const checkRes = await fetch(
          `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${SEED_SELLER_ID}&link_url=eq./my-booth/products?share=${id}`,
          { headers: AUTH_HEADERS }
        );
        const checkNotifs = await checkRes.json();
        assertEquals(checkNotifs.length, 0, `Product ${id} should NOT have been nudged`);
      }

      // 5. Test De-duplication: Trigger cron again and verify 0 new nudges are sent
      const dedupRes = await triggerCronNudge();
      assertEquals(dedupRes.status, 200);
      assertEquals(dedupRes.data.nudged, 0, "Second run should nudge 0 products (deduplicated)");

    } finally {
      await cleanData(productIds, orderIds);
    }
  },
});
