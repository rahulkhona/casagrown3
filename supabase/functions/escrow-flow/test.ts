/**
 * Integration tests for the complete Order Escrow & Point Flow.
 *
 * Covers every financial scenario end-to-end:
 *   1. Order creation → escrow deducted from buyer
 *   2. Order acceptance → NO seller credit (points stay in escrow)
 *   3. Delivery confirmed → seller credited (total - 10% fee)
 *   4. Order cancelled (pending) → full refund to buyer
 *   5. Order cancelled (accepted) → full refund to buyer, qty restored, NO seller reversal
 *   6. Dispute + accept refund offer → buyer refunded, seller gets remainder minus fee
 *   7. Dispute + resolve without refund → seller gets full amount minus fee
 *   8. Full escalation flow: dispute → escalate → offer → accept
 *   9. Balance invariant: escrow = payment + fee (happy path)
 *   10. Balance invariant: escrow = refund + payment + fee (dispute path)
 *   11. Cannot cancel after delivery
 *   12. Cannot confirm delivery twice (double-pay protection)
 *
 * Run:
 *   deno test --allow-net --allow-env supabase/functions/escrow-flow/test.ts
 *
 * Prerequisites:
 *   - Local Supabase running (npx supabase start)
 *   - Edge functions serving (npx supabase functions serve)
 */
import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { invokeFunction } from "../_shared/test-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_o0BQy4UlCDU";

const PLATFORM_FEE_RATE = 0.10; // 10%
const SEED_POINTS = 2000;
const ORDER_QTY = 5;
const ORDER_PPU = 100; // points per unit
const ORDER_TOTAL = ORDER_QTY * ORDER_PPU; // 500
const EXPECTED_FEE = Math.floor(ORDER_TOTAL * PLATFORM_FEE_RATE); // 50
const EXPECTED_SELLER_PAYOUT = ORDER_TOTAL - EXPECTED_FEE; // 450

// ============================================================
// Helpers
// ============================================================

/** Supabase REST API helper (service role) */
async function supabaseRest(
    table: string,
    method: string,
    body?: Record<string, unknown>,
    queryParams?: string,
): Promise<Record<string, unknown>[]> {
    const url = `${SUPABASE_URL}/rest/v1/${table}${
        queryParams ? `?${queryParams}` : ""
    }`;
    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "apikey": SERVICE_ROLE_KEY,
            "Prefer": "return=representation",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [data];
    } catch {
        throw new Error(
            `supabaseRest(${table} ${method}) parse error: ${text}`,
        );
    }
}

/** Call an RPC via PostgREST */
async function callRpc(
    rpcName: string,
    params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${rpcName}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "apikey": SERVICE_ROLE_KEY,
            "Prefer": "return=representation",
        },
        body: JSON.stringify(params),
    });
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            `callRpc(${rpcName}) status=${res.status} response: ${text}`,
        );
    }
}

/** Create a test user and return userId */
async function createTestUser(): Promise<{
    userId: string;
    headers: Record<string, string>;
}> {
    const email = `escrow-test-${Date.now()}-${
        Math.random().toString(36).slice(2)
    }@test.com`;
    const password = "TestPassword123!";

    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!data.access_token) {
        throw new Error(`Failed to create test user: ${JSON.stringify(data)}`);
    }

    const payload = JSON.parse(atob(data.access_token.split(".")[1]!));
    return {
        userId: payload.sub,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${data.access_token}`,
        },
    };
}

/** Seed points for a user */
async function seedPoints(userId: string, amount: number): Promise<void> {
    await supabaseRest("point_ledger", "POST", {
        user_id: userId,
        type: "reward",
        amount: amount,
        balance_after: 0,
        metadata: { reason: "Test seed points" },
    });
}

/** Create a seller's post */
async function createSellerPost(sellerId: string): Promise<string> {
    const rows = await supabaseRest("posts", "POST", {
        author_id: sellerId,
        type: "want_to_sell",
        reach: "community",
        content: JSON.stringify({
            produceName: "Test Oranges",
            description: "Fresh oranges for escrow test",
        }),
    });
    const postId = (rows[0] as Record<string, unknown>).id as string;

    await supabaseRest("want_to_sell_details", "POST", {
        post_id: postId,
        category: "fruits",
        produce_name: "Test Oranges",
        unit: "box",
        total_quantity_available: 20,
        points_per_unit: ORDER_PPU,
    });

    return postId;
}

/** Get balance for a user by summing all ledger entries */
async function getUserBalance(userId: string): Promise<number> {
    const allRows = await supabaseRest(
        "point_ledger",
        "GET",
        undefined,
        `user_id=eq.${userId}&select=amount`,
    );
    return allRows.reduce((sum, row) => sum + Number(row.amount), 0);
}

/** Get ledger entries for a specific order */
async function getOrderLedger(
    orderId: string,
): Promise<{ user_id: string; type: string; amount: number }[]> {
    const rows = await supabaseRest(
        "point_ledger",
        "GET",
        undefined,
        `reference_id=eq.${orderId}&select=user_id,type,amount&order=created_at.asc`,
    );
    return rows.map((r) => ({
        user_id: r.user_id as string,
        type: r.type as string,
        amount: Number(r.amount),
    }));
}

/** Get chat messages for a conversation */
async function getChatMessages(
    conversationId: string,
): Promise<{ sender_id: string | null; content: string; type: string }[]> {
    const rows = await supabaseRest(
        "chat_messages",
        "GET",
        undefined,
        `conversation_id=eq.${conversationId}&select=sender_id,content,type&order=created_at.asc`,
    );
    return rows.map((r) => ({
        sender_id: r.sender_id as string | null,
        content: r.content as string,
        type: r.type as string,
    }));
}

/** Create a full test order (buyer places order → returns orderId, conversationId) */
async function createTestOrder(
    buyerHeaders: Record<string, string>,
    sellerId: string,
    postId: string,
): Promise<{ orderId: string; conversationId: string }> {
    const { data, status } = await invokeFunction(
        "create-order",
        {
            postId,
            sellerId,
            quantity: ORDER_QTY,
            pointsPerUnit: ORDER_PPU,
            totalPrice: ORDER_TOTAL,
            category: "fruits",
            product: "Test Oranges",
            deliveryDate: "2026-03-01",
            deliveryAddress: "123 Test St",
            deliveryInstructions: "Leave at door",
        },
        buyerHeaders,
    );

    assertEquals(status, 200, `Create order failed: ${JSON.stringify(data)}`);
    assertExists(data.orderId);
    assertExists(data.conversationId);

    return {
        orderId: data.orderId as string,
        conversationId: data.conversationId as string,
    };
}

/** Accept an order via RPC */
async function acceptTestOrder(orderId: string): Promise<void> {
    const result = await callRpc("accept_order_versioned", {
        p_order_id: orderId,
        p_expected_version: 1,
    });
    assert(
        !(result as Record<string, unknown>).error,
        `Accept failed: ${JSON.stringify(result)}`,
    );
}

/**
 * Mark order as delivered via RPC.
 * Creates the media asset and calls mark_order_delivered.
 */
async function markDelivered(orderId: string, sellerId: string): Promise<void> {
    // Create a dummy media asset via service-role REST
    const mediaRows = await supabaseRest("media_assets", "POST", {
        owner_id: sellerId,
        media_type: "image",
        storage_path: `delivery-proofs/test-${Date.now()}-${
            Math.random().toString(36).slice(2)
        }.jpg`,
        metadata: { test: true },
    });

    const mediaId = (mediaRows[0] as Record<string, unknown>).id as string;
    if (!mediaId) {
        throw new Error(
            `Failed to create media asset: ${JSON.stringify(mediaRows)}`,
        );
    }

    const result = await callRpc("mark_order_delivered", {
        p_order_id: orderId,
        p_seller_id: sellerId,
        p_proof_media_id: mediaId,
    });

    if ((result as Record<string, unknown>).error) {
        throw new Error(`Mark delivered failed: ${JSON.stringify(result)}`);
    }

    // Verify the status actually changed
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(
        orders[0]!.status,
        "delivered",
        `markDelivered: order status should be 'delivered' but got '${
            orders[0]!.status
        }'`,
    );
}

// ============================================================
// Test 1: Order creation → escrow deducted from buyer
// ============================================================

Deno.test("escrow-flow — 1: order creation deducts escrow from buyer", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const balanceBefore = await getUserBalance(buyer.userId);
    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );

    // Verify escrow entry
    const ledger = await getOrderLedger(orderId);
    const escrowEntry = ledger.find((e) =>
        e.type === "escrow" && e.user_id === buyer.userId
    );
    assertExists(escrowEntry, "Escrow entry should exist");
    assertEquals(
        escrowEntry!.amount,
        -ORDER_TOTAL,
        "Escrow should deduct full order total",
    );

    // Verify NO seller entries at this point
    const sellerEntries = ledger.filter((e) => e.user_id === seller.userId);
    assertEquals(
        sellerEntries.length,
        0,
        "Seller should have no ledger entries at order creation",
    );

    // Verify buyer balance decreased
    const balanceAfter = await getUserBalance(buyer.userId);
    assertEquals(
        balanceAfter,
        balanceBefore - ORDER_TOTAL,
        "Buyer balance should decrease by order total",
    );
});

// ============================================================
// Test 2: Accept order → NO seller credit
// ============================================================

Deno.test("escrow-flow — 2: accepting order does NOT credit seller", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    const sellerBalanceBefore = await getUserBalance(seller.userId);

    await acceptTestOrder(orderId);

    // Verify seller balance unchanged
    const sellerBalanceAfter = await getUserBalance(seller.userId);
    assertEquals(
        sellerBalanceAfter,
        sellerBalanceBefore,
        "Seller balance must NOT change on acceptance",
    );

    // Verify no payment entries for seller on this order
    const ledger = await getOrderLedger(orderId);
    const sellerPayments = ledger.filter((e) =>
        e.user_id === seller.userId && e.type === "payment"
    );
    assertEquals(
        sellerPayments.length,
        0,
        "No payment should exist for seller after acceptance",
    );

    // Verify order status is accepted
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(orders[0]!.status, "accepted");
});

// ============================================================
// Test 3: Confirm delivery → seller gets total - 10% fee
// ============================================================

Deno.test("escrow-flow — 3: confirm delivery credits seller with platform fee deduction", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId, conversationId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    const sellerBalanceBefore = await getUserBalance(seller.userId);

    // Buyer confirms delivery
    const result = await callRpc("confirm_order_delivery", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
    });
    assert(
        !(result as Record<string, unknown>).error,
        `Confirm failed: ${JSON.stringify(result)}`,
    );

    // Verify order completed
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(orders[0]!.status, "completed");

    // Verify seller received payout minus fee
    const ledger = await getOrderLedger(orderId);
    const sellerPayment = ledger.find((e) =>
        e.user_id === seller.userId && e.type === "payment"
    );
    assertExists(sellerPayment, "Seller payment entry should exist");
    assertEquals(
        sellerPayment!.amount,
        EXPECTED_SELLER_PAYOUT,
        `Seller should receive ${EXPECTED_SELLER_PAYOUT} pts`,
    );

    // Verify platform fee entry
    const feeEntry = ledger.find((e) =>
        e.user_id === seller.userId && e.type === "platform_fee"
    );
    assertExists(feeEntry, "Platform fee entry should exist");
    assertEquals(
        feeEntry!.amount,
        -EXPECTED_FEE,
        `Platform fee should be -${EXPECTED_FEE}`,
    );

    // Verify seller balance: net effect = payout + fee_debit = 450 + (-50) = +400
    const sellerBalanceAfter = await getUserBalance(seller.userId);
    assertEquals(
        sellerBalanceAfter,
        sellerBalanceBefore + EXPECTED_SELLER_PAYOUT + (-EXPECTED_FEE),
        "Seller net balance increase should be payout minus fee",
    );

    // Verify system messages
    const messages = await getChatMessages(conversationId);
    const systemMessages = messages.filter((m) => m.type === "system");
    const buyerMsg = systemMessages.find((m) =>
        m.content.includes("escrowed points")
    );
    const sellerMsg = systemMessages.find((m) =>
        m.content.includes("Payment received")
    );
    assertExists(
        buyerMsg,
        "Buyer system message about escrow release should exist",
    );
    assertExists(sellerMsg, "Seller system message about payment should exist");
    assert(
        sellerMsg!.content.includes(String(EXPECTED_SELLER_PAYOUT)),
        `Seller message should mention payout ${EXPECTED_SELLER_PAYOUT}`,
    );
    assert(
        sellerMsg!.content.includes(String(EXPECTED_FEE)),
        `Seller message should mention fee ${EXPECTED_FEE}`,
    );
});

// ============================================================
// Test 4: Cancel pending order → full refund to buyer
// ============================================================

Deno.test("escrow-flow — 4: cancel pending order refunds buyer fully", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    const buyerBalanceBefore = await getUserBalance(buyer.userId);

    const result = await callRpc("cancel_order_with_message", {
        p_order_id: orderId,
        p_user_id: buyer.userId,
    });
    assert(
        !(result as Record<string, unknown>).error,
        `Cancel failed: ${JSON.stringify(result)}`,
    );

    // Verify full refund
    const ledger = await getOrderLedger(orderId);
    const refundEntry = ledger.find((e) =>
        e.user_id === buyer.userId && e.type === "refund"
    );
    assertExists(refundEntry, "Refund entry should exist");
    assertEquals(
        refundEntry!.amount,
        ORDER_TOTAL,
        "Refund should equal full order total",
    );

    // Verify buyer balance restored
    const buyerBalanceAfter = await getUserBalance(buyer.userId);
    assertEquals(
        buyerBalanceAfter,
        buyerBalanceBefore + ORDER_TOTAL,
        "Buyer balance should be restored",
    );

    // Verify no seller entries
    const sellerEntries = ledger.filter((e) => e.user_id === seller.userId);
    assertEquals(
        sellerEntries.length,
        0,
        "Seller should have no entries on cancelled order",
    );

    // Verify order status
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(orders[0]!.status, "cancelled");
});

// ============================================================
// Test 5: Cancel accepted order → refund buyer, restore qty, NO seller reversal
// ============================================================

Deno.test("escrow-flow — 5: cancel accepted order refunds buyer, restores qty, no seller reversal", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    // Check initial quantity
    const detailsBefore = await supabaseRest(
        "want_to_sell_details",
        "GET",
        undefined,
        `post_id=eq.${postId}&select=total_quantity_available`,
    );
    const qtyBefore = Number(detailsBefore[0]!.total_quantity_available);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);

    // Quantity should be reduced after acceptance
    const detailsAfterAccept = await supabaseRest(
        "want_to_sell_details",
        "GET",
        undefined,
        `post_id=eq.${postId}&select=total_quantity_available`,
    );
    assertEquals(
        Number(detailsAfterAccept[0]!.total_quantity_available),
        qtyBefore - ORDER_QTY,
        "Qty should decrease after acceptance",
    );

    // Cancel after acceptance
    const result = await callRpc("cancel_order_with_message", {
        p_order_id: orderId,
        p_user_id: seller.userId,
    });
    assert(
        !(result as Record<string, unknown>).error,
        `Cancel failed: ${JSON.stringify(result)}`,
    );

    // Verify buyer refund
    const ledger = await getOrderLedger(orderId);
    const refund = ledger.find((e) =>
        e.user_id === buyer.userId && e.type === "refund"
    );
    assertExists(refund);
    assertEquals(refund!.amount, ORDER_TOTAL);

    // Verify NO seller reversal (seller was never credited)
    const sellerEntries = ledger.filter((e) => e.user_id === seller.userId);
    assertEquals(
        sellerEntries.length,
        0,
        "Seller should have no entries — never credited",
    );

    // Verify quantity restored
    const detailsAfterCancel = await supabaseRest(
        "want_to_sell_details",
        "GET",
        undefined,
        `post_id=eq.${postId}&select=total_quantity_available`,
    );
    assertEquals(
        Number(detailsAfterCancel[0]!.total_quantity_available),
        qtyBefore,
        "Qty should be restored after cancel",
    );
});

// ============================================================
// Test 6: Dispute + accept refund offer → partial refund
// ============================================================

Deno.test("escrow-flow — 6: dispute + accept refund offer: correct point distribution", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId, conversationId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    // Buyer disputes
    const disputeResult = await callRpc("dispute_order_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
        p_reason: "Items were damaged",
    });
    assert(
        !(disputeResult as Record<string, unknown>).error,
        `Dispute failed: ${JSON.stringify(disputeResult)}`,
    );

    // Seller makes refund offer of 200 points
    const REFUND_AMOUNT = 200;
    const offerResult = await callRpc("make_refund_offer_with_message", {
        p_order_id: orderId,
        p_seller_id: seller.userId,
        p_amount: REFUND_AMOUNT,
        p_message: "Sorry about the damage",
    });
    assert(
        !(offerResult as Record<string, unknown>).error,
        `Make offer failed: ${JSON.stringify(offerResult)}`,
    );
    const offerId = (offerResult as Record<string, unknown>).offer_id as string;
    assertExists(offerId);

    // Record balances before acceptance
    const buyerBalanceBefore = await getUserBalance(buyer.userId);
    const sellerBalanceBefore = await getUserBalance(seller.userId);

    // Buyer accepts the offer
    const acceptResult = await callRpc("accept_refund_offer_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
        p_offer_id: offerId,
    });
    assert(
        !(acceptResult as Record<string, unknown>).error,
        `Accept offer failed: ${JSON.stringify(acceptResult)}`,
    );

    // Calculate expected amounts
    const sellerAmount = ORDER_TOTAL - REFUND_AMOUNT; // 300
    const fee = Math.floor(sellerAmount * PLATFORM_FEE_RATE); // 30
    const sellerPayout = sellerAmount - fee; // 270

    // Verify order completed
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(orders[0]!.status, "completed");

    // Verify point ledger entries
    const ledger = await getOrderLedger(orderId);

    // Buyer refund
    const buyerRefund = ledger.find((e) =>
        e.user_id === buyer.userId && e.type === "refund"
    );
    assertExists(buyerRefund, "Buyer refund entry should exist");
    assertEquals(
        buyerRefund!.amount,
        REFUND_AMOUNT,
        `Buyer refund should be ${REFUND_AMOUNT}`,
    );

    // Seller payment
    const sellerPayment = ledger.find((e) =>
        e.user_id === seller.userId && e.type === "payment"
    );
    assertExists(sellerPayment, "Seller payment entry should exist");
    assertEquals(
        sellerPayment!.amount,
        sellerPayout,
        `Seller payout should be ${sellerPayout}`,
    );

    // Platform fee
    const feeEntry = ledger.find((e) =>
        e.user_id === seller.userId && e.type === "platform_fee"
    );
    assertExists(feeEntry, "Platform fee entry should exist");
    assertEquals(feeEntry!.amount, -fee, `Platform fee should be -${fee}`);

    // Verify balances
    const buyerBalanceAfter = await getUserBalance(buyer.userId);
    const sellerBalanceAfter = await getUserBalance(seller.userId);
    assertEquals(
        buyerBalanceAfter,
        buyerBalanceBefore + REFUND_AMOUNT,
        "Buyer balance should increase by refund amount",
    );
    assertEquals(
        sellerBalanceAfter,
        sellerBalanceBefore + sellerPayout + (-fee),
        "Seller balance should increase by payout minus fee",
    );

    // Verify system messages
    const messages = await getChatMessages(conversationId);
    const systemMsgs = messages.filter((m) => m.type === "system");
    const buyerMsg = systemMsgs.find((m) =>
        m.content.includes("Dispute resolved")
    );
    const sellerMsg = systemMsgs.find((m) =>
        m.content.includes("Dispute resolved:") &&
        m.content.includes("credited")
    );
    assertExists(buyerMsg, "Buyer dispute resolution message should exist");
    assertExists(sellerMsg, "Seller payment message should exist");
});

// ============================================================
// Test 7: Dispute + resolve without refund → seller gets full minus fee
// ============================================================

Deno.test("escrow-flow — 7: dispute + resolve without refund: seller gets full payout minus fee", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId, conversationId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    // Buyer disputes
    const dr = await callRpc("dispute_order_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
        p_reason: "Wrong items delivered",
    });
    assert(
        !(dr as Record<string, unknown>).error,
        `Dispute failed: ${JSON.stringify(dr)}`,
    );

    const sellerBalanceBefore = await getUserBalance(seller.userId);
    const buyerBalanceBefore = await getUserBalance(buyer.userId);

    // Buyer resolves without refund
    const resolveResult = await callRpc("resolve_dispute_with_message", {
        p_order_id: orderId,
        p_user_id: buyer.userId,
    });
    assert(
        !(resolveResult as Record<string, unknown>).error,
        `Resolve failed: ${JSON.stringify(resolveResult)}`,
    );

    // Verify order completed
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(orders[0]!.status, "completed");

    // Verify seller got full payout minus fee
    const ledger = await getOrderLedger(orderId);
    const sellerPayment = ledger.find((e) =>
        e.user_id === seller.userId && e.type === "payment"
    );
    assertExists(sellerPayment);
    assertEquals(sellerPayment!.amount, EXPECTED_SELLER_PAYOUT);

    const feeEntry = ledger.find((e) =>
        e.user_id === seller.userId && e.type === "platform_fee"
    );
    assertExists(feeEntry);
    assertEquals(feeEntry!.amount, -EXPECTED_FEE);

    // Verify buyer got NO refund
    const buyerRefunds = ledger.filter((e) =>
        e.user_id === buyer.userId && e.type === "refund"
    );
    assertEquals(
        buyerRefunds.length,
        0,
        "Buyer should get no refund when resolved without refund",
    );

    // Verify balances
    const sellerBalanceAfter = await getUserBalance(seller.userId);
    assertEquals(
        sellerBalanceAfter,
        sellerBalanceBefore + EXPECTED_SELLER_PAYOUT + (-EXPECTED_FEE),
    );

    const buyerBalanceAfter = await getUserBalance(buyer.userId);
    assertEquals(
        buyerBalanceAfter,
        buyerBalanceBefore,
        "Buyer balance should be unchanged",
    );

    // Verify system messages
    const messages = await getChatMessages(conversationId);
    const systemMsgs = messages.filter((m) => m.type === "system");
    const resolveMsg = systemMsgs.find((m) =>
        m.content.includes("resolved the dispute")
    );
    const paymentMsg = systemMsgs.find((m) =>
        m.content.includes("Payment received")
    );
    assertExists(resolveMsg, "Resolve message should exist");
    assertExists(paymentMsg, "Payment message should exist");
});

// ============================================================
// Test 8: Full escalation flow: dispute → escalate → offer → accept
// ============================================================

Deno.test("escrow-flow — 8: full escalation flow: dispute → escalate → offer → accept", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    // Dispute
    const dr = await callRpc("dispute_order_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
        p_reason: "Quality issues",
    });
    assert(
        !(dr as Record<string, unknown>).error,
        `Dispute failed: ${JSON.stringify(dr)}`,
    );

    // Escalate
    const escResult = await callRpc("escalate_order_with_message", {
        p_order_id: orderId,
        p_user_id: buyer.userId,
    });
    assert(
        !(escResult as Record<string, unknown>).error,
        `Escalate failed: ${JSON.stringify(escResult)}`,
    );

    // Verify escalated status
    let orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(orders[0]!.status, "escalated");

    // Seller makes offer during escalation
    const REFUND = 100;
    const offerResult = await callRpc("make_refund_offer_with_message", {
        p_order_id: orderId,
        p_seller_id: seller.userId,
        p_amount: REFUND,
    });
    assert(
        !(offerResult as Record<string, unknown>).error,
        `Offer failed: ${JSON.stringify(offerResult)}`,
    );
    const offerId = (offerResult as Record<string, unknown>).offer_id as string;

    // Buyer accepts during escalation
    const acceptResult = await callRpc("accept_refund_offer_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
        p_offer_id: offerId,
    });
    assert(
        !(acceptResult as Record<string, unknown>).error,
        `Accept failed: ${JSON.stringify(acceptResult)}`,
    );

    // Verify completed
    orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=status`,
    );
    assertEquals(orders[0]!.status, "completed");

    // Verify correct amounts
    const sellerAmount = ORDER_TOTAL - REFUND; // 400
    const fee = Math.floor(sellerAmount * PLATFORM_FEE_RATE); // 40
    const sellerPayout = sellerAmount - fee; // 360

    const ledger = await getOrderLedger(orderId);
    const payment = ledger.find((e) =>
        e.user_id === seller.userId && e.type === "payment"
    );
    assertExists(payment);
    assertEquals(payment!.amount, sellerPayout);
});

// ============================================================
// Test 9: Balance invariant — happy path: escrow out = payment in + fee
// ============================================================

Deno.test("escrow-flow — 9: balance invariant: |escrow| = seller_payout + fee", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    // Confirm delivery
    const cr = await callRpc("confirm_order_delivery", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
    });
    assert(
        !(cr as Record<string, unknown>).error,
        `Confirm failed: ${JSON.stringify(cr)}`,
    );

    // Get all ledger entries for this order
    const ledger = await getOrderLedger(orderId);

    const escrow = ledger.filter((e) => e.type === "escrow").reduce(
        (s, e) => s + e.amount,
        0,
    );
    const payments = ledger.filter((e) => e.type === "payment").reduce(
        (s, e) => s + e.amount,
        0,
    );
    const fees = ledger.filter((e) => e.type === "platform_fee").reduce(
        (s, e) => s + e.amount,
        0,
    );

    // Invariant: what the buyer paid (|escrow|) = what seller got + what platform got
    assertEquals(escrow, -ORDER_TOTAL, "Escrow should be negative order total");
    assertEquals(
        payments,
        EXPECTED_SELLER_PAYOUT,
        `Payment should be ${EXPECTED_SELLER_PAYOUT}`,
    );
    assertEquals(fees, -EXPECTED_FEE, `Fee should be -${EXPECTED_FEE}`);

    // The money that "left" the system = |escrow| - payments = fee magnitude
    // Equivalently: |escrow| = payments + |fees|
    assertEquals(-escrow, payments + (-fees), "escrow out = payment + fee");
});

// ============================================================
// Test 10: Balance invariant — dispute path: |escrow| = refund + payment + |fee|
// ============================================================

Deno.test("escrow-flow — 10: balance invariant for refund: |escrow| = refund + payment + |fee|", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    // Dispute
    const dr = await callRpc("dispute_order_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
        p_reason: "Damaged goods",
    });
    assert(
        !(dr as Record<string, unknown>).error,
        `Dispute failed: ${JSON.stringify(dr)}`,
    );

    // Offer 150 points refund
    const REFUND = 150;
    const offerResult = await callRpc("make_refund_offer_with_message", {
        p_order_id: orderId,
        p_seller_id: seller.userId,
        p_amount: REFUND,
    });
    assert(
        !(offerResult as Record<string, unknown>).error,
        `Offer failed: ${JSON.stringify(offerResult)}`,
    );
    const offerId = (offerResult as Record<string, unknown>).offer_id as string;

    // Accept
    const ar = await callRpc("accept_refund_offer_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
        p_offer_id: offerId,
    });
    assert(
        !(ar as Record<string, unknown>).error,
        `Accept failed: ${JSON.stringify(ar)}`,
    );

    // Verify invariant
    const ledger = await getOrderLedger(orderId);

    const escrow = ledger.filter((e) => e.type === "escrow").reduce(
        (s, e) => s + e.amount,
        0,
    );
    const refunds = ledger.filter((e) => e.type === "refund").reduce(
        (s, e) => s + e.amount,
        0,
    );
    const payments = ledger.filter((e) => e.type === "payment").reduce(
        (s, e) => s + e.amount,
        0,
    );
    const fees = ledger.filter((e) => e.type === "platform_fee").reduce(
        (s, e) => s + e.amount,
        0,
    );

    // Expected values
    const sellerAmount = ORDER_TOTAL - REFUND; // 350
    const fee = Math.floor(sellerAmount * PLATFORM_FEE_RATE); // 35
    const sellerPayout = sellerAmount - fee; // 315

    assertEquals(escrow, -ORDER_TOTAL);
    assertEquals(refunds, REFUND);
    assertEquals(payments, sellerPayout);
    assertEquals(fees, -fee);

    // Core invariant: |escrow| = refund + payment + |fee|
    assertEquals(
        -escrow,
        refunds + payments + (-fees),
        "|escrow| = refund + payment + |fee|",
    );
});

// ============================================================
// Test 11: Cancel after delivery should fail
// ============================================================

Deno.test("escrow-flow — 11: cannot cancel after delivery", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    // Try to cancel — should fail
    const result = await callRpc("cancel_order_with_message", {
        p_order_id: orderId,
        p_user_id: buyer.userId,
    }) as Record<string, unknown>;

    assertExists(result.error, "Should fail to cancel delivered order");
    assert(
        (result.error as string).includes("Cannot cancel"),
        `Error should mention cannot cancel, got: ${result.error}`,
    );
});

// ============================================================
// Test 12: Cannot confirm delivery twice (double-pay protection)
// ============================================================

Deno.test("escrow-flow — 12: cannot confirm delivery twice", async () => {
    const buyer = await createTestUser();
    const seller = await createTestUser();
    await seedPoints(buyer.userId, SEED_POINTS);
    const postId = await createSellerPost(seller.userId);

    const { orderId } = await createTestOrder(
        buyer.headers,
        seller.userId,
        postId,
    );
    await acceptTestOrder(orderId);
    await markDelivered(orderId, seller.userId);

    // First confirm
    const result1 = await callRpc("confirm_order_delivery", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
    }) as Record<string, unknown>;
    assert(
        !result1.error,
        `First confirm should succeed, got: ${result1.error}`,
    );

    // Second confirm — should fail
    const result2 = await callRpc("confirm_order_delivery", {
        p_order_id: orderId,
        p_buyer_id: buyer.userId,
    }) as Record<string, unknown>;
    assertExists(result2.error, "Second confirm should fail");

    // Verify seller was only paid once
    const ledger = await getOrderLedger(orderId);
    const payments = ledger.filter((e) =>
        e.user_id === seller.userId && e.type === "payment"
    );
    assertEquals(payments.length, 1, "Seller should only receive one payment");
});
