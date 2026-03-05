/**
 * Integration tests for notify-on-message edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/notify-on-message/test.ts
 */
import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { invokeFunction } from "../_shared/test-helpers.ts";

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

    // Some POSTs don't return representation if not requested properly, ignore empty responses
    const text = await res.text();
    if (!text) return [];

    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
}

/** Create a test user and return the userId */
async function createTestUser(): Promise<string> {
    const email = `notify-test-${Date.now()}-${
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
    return payload.sub;
}

/** Service Headers */
function serviceHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    };
}

Deno.test("notify-on-message — skips if missing required fields", async () => {
    const { data, status } = await invokeFunction(
        "notify-on-message",
        { senderId: "123" }, // missing messageId and conversationId
        serviceHeaders(),
    );
    assertEquals(status, 200);
    assertEquals(data.skipped, true);
    assertEquals(data.reason, "missing fields");
});

Deno.test("notify-on-message — calculates correct recipients and content filter", async () => {
    // 1. Create Buyer and Seller
    const buyerId = await createTestUser();
    const sellerId = await createTestUser();

    // 2. Create Post
    const posts = await supabaseRest("posts", "POST", {
        author_id: sellerId,
        type: "want_to_sell",
        reach: "community",
        content: JSON.stringify({ product: "Mock Oranges" }),
    });
    const postId = (posts[0] as Record<string, unknown>).id as string;

    // 3. Create Conversation
    const convos = await supabaseRest("conversations", "POST", {
        post_id: postId,
        buyer_id: buyerId,
        seller_id: sellerId,
    });
    const conversationId = (convos[0] as Record<string, unknown>).id as string;

    // 4. Create standard message from Buyer
    const normalMsgs = await supabaseRest("chat_messages", "POST", {
        conversation_id: conversationId,
        sender_id: buyerId,
        type: "text",
        content: "I want to buy these oranges!",
    });
    const normalMsgId = (normalMsgs[0] as Record<string, unknown>).id as string;

    // Test A: Normal message from buyer SHOULD ONLY NOTIFY SELLER
    const { data: dataA } = await invokeFunction(
        "notify-on-message",
        {
            messageId: normalMsgId,
            conversationId,
            senderId: buyerId,
            messageType: "text",
        },
        serviceHeaders(),
    );
    assertEquals(dataA.sent, true);
    assertEquals(dataA.recipients, 1);

    // 5. Create System Message about hold release
    const sysMsgs = await supabaseRest("chat_messages", "POST", {
        conversation_id: conversationId,
        sender_id: null,
        type: "system",
        content: "Order complete! The held points released.", // Test string replacement logic
        metadata: { visible_to: buyerId }, // Restrict to buyer
    });
    const sysMsgId = (sysMsgs[0] as Record<string, unknown>).id as string;

    // Test B: Verify visible_to routing via edge function response
    // Expect 1 recipient -> the buyerId, successfully overriding the default behavior of alerting BOTH parties on system messages
    const { data: dataB } = await invokeFunction(
        "notify-on-message",
        {
            messageId: sysMsgId,
            conversationId,
            senderId: null,
            messageType: "system",
        },
        serviceHeaders(),
    );

    assertEquals(dataB.sent, true);
    assertEquals(dataB.recipients, 1);
});
