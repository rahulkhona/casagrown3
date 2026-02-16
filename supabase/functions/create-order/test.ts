/**
 * Integration tests for create-order edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/create-order/test.ts
 */
import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
    authHeaders,
    invokeFunction,
    optionsPreflight,
    serviceHeaders,
} from "../_shared/test-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_o0BQy4UlCDU";

/** Supabase REST API helper for direct table operations (service role) */
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
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
}

/** Create a test user and return { userId, headers } */
async function createTestUser(): Promise<{
    userId: string;
    headers: Record<string, string>;
}> {
    const email = `order-test-${Date.now()}-${
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

/** Seed points for a user via service-role direct insert */
async function seedBuyerPoints(userId: string, amount: number): Promise<void> {
    await supabaseRest("point_ledger", "POST", {
        user_id: userId,
        type: "reward",
        amount: amount,
        balance_after: 0, // overridden by trigger
        metadata: { reason: "Test seed points" },
    });
}

/** Create a seller's post with complete sell details via service-role */
async function createSellerPost(sellerId: string): Promise<string> {
    const rows = await supabaseRest("posts", "POST", {
        author_id: sellerId,
        type: "want_to_sell",
        reach: "community",
        content: JSON.stringify({
            produceName: "Fresh Tomatoes",
            description: "Fresh tomatoes for sale",
        }),
    });
    const postId = (rows[0] as Record<string, unknown>).id as string;

    // Insert sell details so the post displays price/quantity in the feed
    await supabaseRest("want_to_sell_details", "POST", {
        post_id: postId,
        category: "vegetables",
        produce_name: "Fresh Tomatoes",
        unit: "box",
        total_quantity_available: 10,
        points_per_unit: 25,
    });

    return postId;
}

// ============================================================
// Existing tests (unchanged)
// ============================================================

Deno.test("create-order — CORS preflight", async () => {
    const headers = await optionsPreflight("create-order");
    assertEquals(headers.get("access-control-allow-origin"), "*");
});

Deno.test("create-order — rejects unauthenticated requests", async () => {
    const { data } = await invokeFunction(
        "create-order",
        { postId: "test" },
        serviceHeaders(),
    );
    assertEquals(data.error, "Authentication required");
});

Deno.test("create-order — validates required fields", async () => {
    const headers = await authHeaders();

    // Missing postId
    const { data: r1 } = await invokeFunction("create-order", {}, headers);
    assertExists(r1.error);
    assertEquals((r1.error as string).includes("postId"), true);

    // Missing sellerId
    const { data: r2 } = await invokeFunction(
        "create-order",
        { postId: "test" },
        headers,
    );
    assertExists(r2.error);
    assertEquals((r2.error as string).includes("sellerId"), true);

    // Missing quantity
    const { data: r3 } = await invokeFunction(
        "create-order",
        { postId: "test", sellerId: "test" },
        headers,
    );
    assertExists(r3.error);
    assertEquals((r3.error as string).includes("quantity"), true);
});

Deno.test("create-order — rejects self-orders", async () => {
    // Sign up and get user ID from token
    const headers = await authHeaders();
    const token = headers["Authorization"]!.replace("Bearer ", "");
    // Decode JWT to get user ID (middle segment)
    const payload = JSON.parse(atob(token.split(".")[1]!));
    const userId = payload.sub;

    const { data } = await invokeFunction(
        "create-order",
        {
            postId: "test",
            sellerId: userId, // same as buyer
            quantity: 1,
            pointsPerUnit: 10,
            totalPrice: 10,
            category: "test",
            product: "test",
        },
        headers,
    );
    assertExists(data.error);
    assertEquals((data.error as string).includes("yourself"), true);
});

// ============================================================
// Happy-path test — full create-order flow with seeded data
// ============================================================

Deno.test("create-order — happy path: creates order atomically", async () => {
    // 1. Setup: create buyer and seller users
    const buyer = await createTestUser();
    const seller = await createTestUser();

    // 2. Seed buyer with 500 points
    await seedBuyerPoints(buyer.userId, 500);

    // 3. Create a post for the seller
    const postId = await createSellerPost(seller.userId);

    // 4. Call create-order
    const { data, status } = await invokeFunction(
        "create-order",
        {
            postId,
            sellerId: seller.userId,
            quantity: 3,
            pointsPerUnit: 10,
            totalPrice: 30,
            category: "vegetables",
            product: "Tomatoes",
            deliveryDate: "2026-03-01",
            deliveryAddress: "123 Main St",
            deliveryInstructions: "Leave at door",
        },
        buyer.headers,
    );

    // 5. Verify response shape
    // Note: new users get 50pt signup reward (auth_triggers migration),
    // so buyer balance = 0 (baseline) + 50 (signup) + 500 (seeded) = 550
    // After -30 escrow => 520
    assertEquals(status, 200);
    assertExists(data.orderId);
    assertExists(data.conversationId);
    assertEquals(data.newBalance, 520); // 550 - 30

    const orderId = data.orderId as string;
    const conversationId = data.conversationId as string;

    // 6. Verify order record exists in DB
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `id=eq.${orderId}&select=*`,
    );
    assertEquals(orders.length, 1);
    assertEquals(orders[0]!.buyer_id, buyer.userId);
    assertEquals(orders[0]!.seller_id, seller.userId);
    assertEquals(orders[0]!.product, "Tomatoes");
    assertEquals(orders[0]!.status, "pending");

    // 7. Verify conversation exists
    const convos = await supabaseRest(
        "conversations",
        "GET",
        undefined,
        `id=eq.${conversationId}&select=*`,
    );
    assertEquals(convos.length, 1);
    assertEquals(convos[0]!.buyer_id, buyer.userId);
    assertEquals(convos[0]!.seller_id, seller.userId);
    assertEquals(convos[0]!.post_id, postId);

    // 8. Verify offer exists
    const offers = await supabaseRest(
        "offers",
        "GET",
        undefined,
        `conversation_id=eq.${conversationId}&select=*`,
    );
    assertEquals(offers.length, 1);
    assertEquals(offers[0]!.created_by, buyer.userId);
    assertEquals(offers[0]!.status, "pending");

    // 9. Verify escrow ledger entry
    const escrowEntries = await supabaseRest(
        "point_ledger",
        "GET",
        undefined,
        `user_id=eq.${buyer.userId}&type=eq.escrow&select=*`,
    );
    assertEquals(escrowEntries.length, 1);
    assertEquals(escrowEntries[0]!.amount, -30);
    assertEquals(escrowEntries[0]!.reference_id, orderId);

    // 10. Verify system message in chat
    const messages = await supabaseRest(
        "chat_messages",
        "GET",
        undefined,
        `conversation_id=eq.${conversationId}&type=eq.system&select=*`,
    );
    assertEquals(messages.length, 1);
    assertEquals(
        (messages[0]!.content as string).includes("Tomatoes"),
        true,
    );
    assertEquals(
        (messages[0]!.content as string).includes("30 points"),
        true,
    );
});

// ============================================================
// Insufficient points test — verifies balance check in RPC
// ============================================================

Deno.test("create-order — rejects order with insufficient points", async () => {
    // Setup: buyer with 0 points (baseline only), seller with a post
    const buyer = await createTestUser();
    const seller = await createTestUser();
    const postId = await createSellerPost(seller.userId);

    const { data, status } = await invokeFunction(
        "create-order",
        {
            postId,
            sellerId: seller.userId,
            quantity: 5,
            pointsPerUnit: 100,
            totalPrice: 500,
            category: "vegetables",
            product: "Tomatoes",
        },
        buyer.headers,
    );

    // Should return 400 with insufficient points error
    assertEquals(status, 400);
    assertEquals(data.error, "Insufficient points");
    assertExists(data.currentBalance);
    assertEquals(data.required, 500);

    // Verify NO order was created (atomicity check)
    const orders = await supabaseRest(
        "orders",
        "GET",
        undefined,
        `buyer_id=eq.${buyer.userId}&select=id`,
    );
    assertEquals(orders.length, 0);
});
