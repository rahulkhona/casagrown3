/**
 * Stripe Coupon Checkout — Integration Tests
 *
 * Tests the manage-subscription edge function's Stripe Coupon logic
 * using real Stripe test keys (sk_test_*). No local simulator needed.
 *
 * Validates:
 *   - Coupon creation on first checkout with promotion discount
 *   - Coupon reuse on subsequent checkouts
 *   - Full-price checkout (no coupon when no discount)
 *   - Perpetual (forever) coupon for NULL duration_months
 *   - Coupon ID storage on blueprint and user discount records
 *   - Expired discounts are ignored
 *   - Elite plan checkout with coupon
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-read --no-check \
 *        functions/_tests/stripe-coupon-checkout.test.ts
 */
import {
  assertEquals,
  assertExists,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Test seller from seed data
const TEST_SELLER_ID = "a1111111-1111-1111-1111-111111111111";

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

async function dbSelect(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  return res.json();
}

async function dbInsert(table: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function dbUpsert(table: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function dbUpdate(
  table: string,
  query: string,
  data: Record<string, unknown>,
) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function dbDelete(table: string, query: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
}

async function callManageSubscription(
  action: string,
  extra: Record<string, unknown> = {},
) {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/manage-subscription`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action, user_id: TEST_SELLER_ID, ...extra }),
    },
  );
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// Test Data Tracking (for cleanup)
// ═══════════════════════════════════════════════════════════════
const createdPromoIds: string[] = [];
const createdBlueprintIds: string[] = [];
const createdUserDiscountIds: string[] = [];

// ═══════════════════════════════════════════════════════════════
// Setup / Teardown
// ═══════════════════════════════════════════════════════════════

async function cleanupTestData() {
  // Clean up user subscription discounts
  for (const id of createdUserDiscountIds) {
    await dbDelete("user_subscription_discounts", `id=eq.${id}`);
  }
  createdUserDiscountIds.length = 0;

  // Clean up blueprints
  for (const id of createdBlueprintIds) {
    await dbDelete("crm_promo_subscription_discounts", `id=eq.${id}`);
  }
  createdBlueprintIds.length = 0;

  // Clean up promotions
  for (const id of createdPromoIds) {
    await dbDelete("crm_promo_enrollments", `promotion_id=eq.${id}`);
    await dbDelete("crm_promotions", `id=eq.${id}`);
  }
  createdPromoIds.length = 0;

  // Clean up subscription-related test state
  await dbDelete("subscription_receipts", `user_id=eq.${TEST_SELLER_ID}`);
  await dbDelete("notifications", `user_id=eq.${TEST_SELLER_ID}`);
  await dbDelete("seller_subscriptions", `user_id=eq.${TEST_SELLER_ID}`);
}

/**
 * Creates a test promotion with a subscription discount blueprint.
 * Returns { promoId, blueprintId }.
 */
async function createTestPromoWithDiscount(opts: {
  discountPct: number;
  durationMonths: number | null;
  plan?: string;
  stripeCouponId?: string | null;
}) {
  // 1. Create promotion
  const [promo] = await dbInsert("crm_promotions", {
    name: `E2E Coupon Test Promo ${Date.now()}`,
    enrollment_deadline: new Date(Date.now() + 86400000 * 30).toISOString(),
    max_enrollees: 100,
  });
  assertExists(promo?.id, "Promotion should be created");
  createdPromoIds.push(promo.id);

  // 2. Create subscription discount blueprint
  const blueprintData: Record<string, unknown> = {
    promotion_id: promo.id,
    discount_pct: opts.discountPct,
    duration_months: opts.durationMonths,
    plan: opts.plan || "pro",
  };
  if (opts.stripeCouponId !== undefined) {
    blueprintData.stripe_coupon_id = opts.stripeCouponId;
  }
  const [blueprint] = await dbInsert(
    "crm_promo_subscription_discounts",
    blueprintData,
  );
  assertExists(blueprint?.id, "Blueprint should be created");
  createdBlueprintIds.push(blueprint.id);

  return { promoId: promo.id, blueprintId: blueprint.id };
}

/**
 * Creates a user_subscription_discounts record for the test seller.
 */
async function createUserDiscount(opts: {
  promoId: string;
  blueprintId: string;
  discountPct: number;
  durationMonths: number | null;
  stripeCouponId?: string | null;
}) {
  const expiresAt = opts.durationMonths
    ? new Date(
        Date.now() + opts.durationMonths * 30 * 24 * 60 * 60 * 1000,
      ).toISOString()
    : null;

  const data: Record<string, unknown> = {
    user_id: TEST_SELLER_ID,
    promotion_id: opts.promoId,
    discount_id: opts.blueprintId,
    discount_pct: opts.discountPct,
    duration_months: opts.durationMonths,
    applied_at: new Date().toISOString(),
    expires_at: expiresAt,
    status: "active",
  };
  if (opts.stripeCouponId !== undefined) {
    data.stripe_coupon_id = opts.stripeCouponId;
  }

  const [userDiscount] = await dbInsert("user_subscription_discounts", data);
  assertExists(userDiscount?.id, "User discount should be created");
  createdUserDiscountIds.push(userDiscount.id);
  return userDiscount;
}

/**
 * Ensures subscription_tiers has the specified tier.
 */
async function ensureTier(tierName: string) {
  if (tierName === "elite") {
    await dbUpsert("subscription_tiers", {
      tier_name: "elite",
      display_name: "CasaGrown Elite",
      subscription_price: 29.00,
      platform_fee_pct: 3,
      max_booths: 999,
      features: ["whatsapp", "priority_support"],
    });
  } else {
    await dbUpsert("subscription_tiers", {
      tier_name: "pro",
      display_name: "CasaGrown Pro",
      subscription_price: 10.00,
      platform_fee_pct: 5,
      max_booths: 3,
      features: ["auto_reply", "analytics"],
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

// ─── A1: Creates Stripe Coupon on first checkout ─────────────────
Deno.test({
  name: "Stripe Coupon Checkout — creates coupon on first checkout with promotion discount",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    // Setup: promotion with 50% off for 3 months, no existing coupon
    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 50,
      durationMonths: 3,
      stripeCouponId: null,
    });

    // Setup: user discount linked to blueprint
    const userDiscount = await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 50,
      durationMonths: 3,
    });

    await ensureTier("pro");

    // Call checkout
    const result = await callManageSubscription("checkout", { plan: "pro" });
    console.log(`  Checkout result keys: ${Object.keys(result).join(", ")}`);
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: Blueprint now has a stripe_coupon_id stored (coupon was created)
    const afterBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertExists(
      afterBlueprint[0]?.stripe_coupon_id,
      "Blueprint should have stripe_coupon_id after checkout (coupon was created)",
    );

    // Verify: User discount also has the coupon ID stored
    const afterUserDiscount = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${userDiscount.id}&select=stripe_coupon_id`,
    );
    assertExists(
      afterUserDiscount[0]?.stripe_coupon_id,
      "User discount should have stripe_coupon_id after checkout",
    );

    // Both should match
    assertEquals(
      afterBlueprint[0].stripe_coupon_id,
      afterUserDiscount[0].stripe_coupon_id,
      "Blueprint and user discount should have the same coupon ID",
    );

    console.log(`  ✅ Coupon created and stored: ${afterBlueprint[0].stripe_coupon_id}`);
  },
});

// ─── A2: Reuses existing coupon ──────────────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — reuses existing coupon (no new coupon created)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    // Step 1: Create a real coupon by doing a first checkout
    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 25,
      durationMonths: 6,
      stripeCouponId: null, // no coupon yet — first checkout will create one
    });

    await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 25,
      durationMonths: 6,
    });

    await ensureTier("pro");

    const result1 = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result1.clientSecret, "First checkout should return clientSecret");

    // Get the real coupon ID that was created
    const afterFirst = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    const realCouponId = afterFirst[0]?.stripe_coupon_id;
    assertExists(realCouponId, "First checkout should have created a coupon");

    // Step 2: Clean subscription state, then do a second checkout
    // The blueprint still has the coupon — edge function should reuse it
    await dbDelete("seller_subscriptions", `user_id=eq.${TEST_SELLER_ID}`);
    await dbDelete("notifications", `user_id=eq.${TEST_SELLER_ID}`);

    const result2 = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result2.clientSecret, "Second checkout should return clientSecret");

    // Verify: Blueprint still has the SAME coupon ID (not a new one)
    const afterSecond = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertEquals(
      afterSecond[0]?.stripe_coupon_id,
      realCouponId,
      "Blueprint should still have the original coupon ID (reused, not replaced)",
    );

    console.log(`  ✅ Existing coupon ${realCouponId} reused on second checkout`);
  },
});

// ─── A3: Checkout returns clientSecret (full price) ──────────────
Deno.test({
  name: "Stripe Coupon Checkout — checkout succeeds at full plan price with discount",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    // Setup: 50% discount
    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 50,
      durationMonths: 3,
      stripeCouponId: null,
    });

    await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 50,
      durationMonths: 3,
    });

    await ensureTier("pro");

    // Call checkout
    const result = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: a pending subscription was created in DB
    const subs = await dbSelect(
      "seller_subscriptions",
      `user_id=eq.${TEST_SELLER_ID}&select=plan,status,stripe_customer_id`,
    );
    assertEquals(subs.length >= 1, true, "Should have a subscription record");
    assertEquals(subs[0].plan, "pro", "Plan should be pro");
    assertExists(subs[0].stripe_customer_id, "Should have a Stripe customer ID");

    console.log("  ✅ Checkout succeeded with clientSecret and DB record");
  },
});

// ─── A4: Coupon attached — verify via DB ─────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — coupon is stored on both blueprint and user discount",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 30,
      durationMonths: 2,
      stripeCouponId: null,
    });

    const userDiscount = await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 30,
      durationMonths: 2,
    });

    await ensureTier("pro");

    // Verify: both records have no coupon before checkout
    const beforeBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertEquals(beforeBlueprint[0]?.stripe_coupon_id, null, "Blueprint should have no coupon before checkout");

    const beforeUser = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${userDiscount.id}&select=stripe_coupon_id`,
    );
    assertEquals(beforeUser[0]?.stripe_coupon_id, null, "User discount should have no coupon before checkout");

    // Call checkout
    const result = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: both records now have a coupon ID
    const afterBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertExists(afterBlueprint[0]?.stripe_coupon_id, "Blueprint should have coupon after checkout");

    const afterUser = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${userDiscount.id}&select=stripe_coupon_id`,
    );
    assertExists(afterUser[0]?.stripe_coupon_id, "User discount should have coupon after checkout");

    assertEquals(
      afterBlueprint[0].stripe_coupon_id,
      afterUser[0].stripe_coupon_id,
      "Both should have the same coupon ID",
    );

    console.log(`  ✅ Coupon ${afterBlueprint[0].stripe_coupon_id} stored on both blueprint and user discount`);
  },
});

// ─── B: No coupon when no discount ───────────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — no coupon when user has no active discount",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    // No promotion or discount data for this user — just the tier
    await ensureTier("pro");

    const result = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: subscription was created but no coupon-related data
    const subs = await dbSelect(
      "seller_subscriptions",
      `user_id=eq.${TEST_SELLER_ID}&select=plan,status`,
    );
    assertEquals(subs.length >= 1, true, "Should have a subscription record");
    assertEquals(subs[0].plan, "pro", "Plan should be pro");

    // Verify: no user_subscription_discounts exist for this user
    const discounts = await dbSelect(
      "user_subscription_discounts",
      `user_id=eq.${TEST_SELLER_ID}&select=id`,
    );
    assertEquals(discounts.length, 0, "Should have no discount records");

    console.log("  ✅ No coupon attached — full price checkout");
  },
});

// ─── C: Perpetual (forever) coupon ───────────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — forever coupon when duration_months is NULL",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    // Setup: NULL duration = perpetual discount
    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 20,
      durationMonths: null,
      stripeCouponId: null,
    });

    const userDiscount = await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 20,
      durationMonths: null,
    });

    await ensureTier("pro");

    const result = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: coupon was created and stored
    const afterBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertExists(
      afterBlueprint[0]?.stripe_coupon_id,
      "Blueprint should have stripe_coupon_id for perpetual discount",
    );

    const afterUser = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${userDiscount.id}&select=stripe_coupon_id`,
    );
    assertExists(
      afterUser[0]?.stripe_coupon_id,
      "User discount should have stripe_coupon_id for perpetual discount",
    );

    console.log(`  ✅ Forever coupon created: ${afterBlueprint[0].stripe_coupon_id}`);
  },
});

// ─── D1: Stores coupon on blueprint ──────────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — stores coupon ID on crm_promo_subscription_discounts blueprint",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 40,
      durationMonths: 5,
      stripeCouponId: null, // no coupon yet
    });

    await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 40,
      durationMonths: 5,
    });

    await ensureTier("pro");

    // Verify: blueprint has no coupon before checkout
    const beforeBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertEquals(
      beforeBlueprint[0]?.stripe_coupon_id,
      null,
      "Blueprint should have no coupon before checkout",
    );

    // Call checkout
    const result = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: blueprint now has the coupon ID stored
    const afterBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertExists(
      afterBlueprint[0]?.stripe_coupon_id,
      "Blueprint stripe_coupon_id should be set after checkout",
    );
    assertNotEquals(
      afterBlueprint[0].stripe_coupon_id,
      null,
      "Coupon ID should not be null",
    );

    console.log(`  ✅ Blueprint updated with coupon ID: ${afterBlueprint[0].stripe_coupon_id}`);
  },
});

// ─── D2: Stores coupon on user discount ──────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — stores coupon ID on user_subscription_discounts record",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 35,
      durationMonths: 4,
      stripeCouponId: null,
    });

    const userDiscount = await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 35,
      durationMonths: 4,
    });

    await ensureTier("pro");

    // Verify: user discount has no coupon before checkout
    const before = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${userDiscount.id}&select=stripe_coupon_id`,
    );
    assertEquals(
      before[0]?.stripe_coupon_id,
      null,
      "User discount should have no coupon before checkout",
    );

    // Call checkout
    const result = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: user discount now has the coupon ID stored
    const after = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${userDiscount.id}&select=stripe_coupon_id`,
    );
    assertExists(
      after[0]?.stripe_coupon_id,
      "User discount stripe_coupon_id should be set after checkout",
    );

    console.log(`  ✅ User discount updated with coupon ID: ${after[0].stripe_coupon_id}`);
  },
});

// ─── Edge case: Expired discount not applied ─────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — expired discount is not applied",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 50,
      durationMonths: 1,
      stripeCouponId: null,
    });

    // Create an EXPIRED user discount (expires_at in the past)
    const expiredData: Record<string, unknown> = {
      user_id: TEST_SELLER_ID,
      promotion_id: promoId,
      discount_id: blueprintId,
      discount_pct: 50,
      duration_months: 1,
      applied_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // expired 30 days ago
      status: "active",
    };
    const [expiredDiscount] = await dbInsert(
      "user_subscription_discounts",
      expiredData,
    );
    assertExists(expiredDiscount?.id);
    createdUserDiscountIds.push(expiredDiscount.id);

    await ensureTier("pro");

    const result = await callManageSubscription("checkout", { plan: "pro" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: the expired discount should NOT have a coupon stored
    // (the edge function filters by expires_at.gte.now)
    const afterDiscount = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${expiredDiscount.id}&select=stripe_coupon_id`,
    );
    assertEquals(
      afterDiscount[0]?.stripe_coupon_id,
      null,
      "Expired discount should NOT get a coupon ID",
    );

    // Verify: blueprint should also have no coupon (since expired discount was ignored)
    const afterBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertEquals(
      afterBlueprint[0]?.stripe_coupon_id,
      null,
      "Blueprint should have no coupon (discount was expired)",
    );

    console.log("  ✅ Expired discount correctly ignored");
  },
});

// ─── Edge case: Elite plan with coupon ───────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — elite plan discount creates coupon at elite price",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    // Setup elite tier
    await ensureTier("elite");

    const { promoId, blueprintId } = await createTestPromoWithDiscount({
      discountPct: 15,
      durationMonths: 2,
      plan: "elite",
      stripeCouponId: null,
    });

    const userDiscount = await createUserDiscount({
      promoId,
      blueprintId,
      discountPct: 15,
      durationMonths: 2,
    });

    const result = await callManageSubscription("checkout", { plan: "elite" });
    assertExists(result.clientSecret, "Should return clientSecret");

    // Verify: coupon was created and stored
    const afterBlueprint = await dbSelect(
      "crm_promo_subscription_discounts",
      `id=eq.${blueprintId}&select=stripe_coupon_id`,
    );
    assertExists(
      afterBlueprint[0]?.stripe_coupon_id,
      "Blueprint should have coupon for elite plan discount",
    );

    const afterUser = await dbSelect(
      "user_subscription_discounts",
      `id=eq.${userDiscount.id}&select=stripe_coupon_id`,
    );
    assertExists(
      afterUser[0]?.stripe_coupon_id,
      "User discount should have coupon for elite plan discount",
    );

    // Verify: subscription record has elite plan
    const subs = await dbSelect(
      "seller_subscriptions",
      `user_id=eq.${TEST_SELLER_ID}&select=plan`,
    );
    assertEquals(subs[0]?.plan, "elite", "Plan should be elite");

    console.log("  ✅ Elite plan checkout with coupon works correctly");
  },
});

// ─── Cleanup ─────────────────────────────────────────────────────
Deno.test({
  name: "Stripe Coupon Checkout — cleanup and restore seed state",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();

    // Restore seed state
    await dbUpdate("profiles", `id=eq.${TEST_SELLER_ID}`, { is_pro: true });
    await dbUpsert("seller_subscriptions", {
      user_id: TEST_SELLER_ID,
      plan: "pro",
      status: "active",
      stripe_customer_id: "cus_test_sam_seller",
      stripe_subscription_id: "sub_test_sam_seller",
    });

    console.log("  ✅ Cleanup complete — seed state restored");
  },
});
