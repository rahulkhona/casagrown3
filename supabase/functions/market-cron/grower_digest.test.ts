import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleGrowerDigest } from "./index.ts";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

// ───────────────────────────────────────────────
// Mock Factories
// ───────────────────────────────────────────────

function createMockSupabase(batchSize: number = 1) {
  return {
    rpc: async (func: string, args: any) => {
      if (func === "claim_daily_digest_batch") {
        if (batchSize === 0) return { data: [], error: null };
        const mockBatch = [];
        for (let i = 0; i < batchSize; i++) {
            mockBatch.push({
              user_id: MOCK_USER_ID,
              seller_claims: [{ keyword: "Tomatoes" }],
              buyer_claims: [{ keyword: "Corn" }],
            });
        }
        return { data: mockBatch, error: null };
      }
      return { data: null, error: "unknown rpc" };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { email: "test@casagrown.com" } },
        }),
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { email: "test@casagrown.com", full_name: "Test User" },
          }),
        }),
      }),
    }),
  };
}

// ───────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────

Deno.test("Test 1: Mailpit Fallback (No Postmark Token) routes via Send-Market-Email", async () => {
  let fetchCallHeaders: any = null;
  let fetchCallUrl: string = "";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    fetchCallUrl = url.toString();
    fetchCallHeaders = init?.headers;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  // No POSTMARK token
  const mockEnv = (key: string) => {
    if (key === "POSTMARK_BROADCAST_TOKEN") return undefined;
    if (key === "SUPABASE_URL") return "http://mock-supabase.local";
    return undefined;
  };

  try {
    const res = await handleGrowerDigest(
      createMockSupabase(1),
      mockEnv,
      {},
      "http://localhost:3000"
    );

    const data = await res.json();
    
    // Asserts that the handler successfully executed but formatted 0 Array payloads
    assertEquals(data.emails, 0);
    
    // Asserts that it hit the local internal edge function rather than Postmark API
    assertEquals(fetchCallUrl, "http://mock-supabase.local/functions/v1/send-market-email");
  } finally {
    globalThis.fetch = originalFetch; // Restore fetch
  }
});

Deno.test("Test 2: Production Postmark Batching Mode correctly aggregates Array Payload", async () => {
  let postmarkRequestBody: any = null;
  let fetchCallUrl: string = "";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    // Only intercept the Postmark call so we don't block the Push Notification fetch calls
    if (url.toString().includes("api.postmarkapp.com")) {
      fetchCallUrl = url.toString();
      postmarkRequestBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  // Active POSTMARK token
  const mockEnv = (key: string) => {
    if (key === "POSTMARK_BROADCAST_TOKEN") return "prod-token-123";
    if (key === "POSTMARK_FROM_EMAIL") return "batch@casagrown.com";
    return undefined;
  };

  try {
    const res = await handleGrowerDigest(
      createMockSupabase(1),
      mockEnv,
      {},
      "http://localhost:3000"
    );

    const data = await res.json();
    
    // Asserts success
    assertEquals(data.emails, 1);
    
    // Asserts formatting and targeting
    assertEquals(fetchCallUrl, "https://api.postmarkapp.com/email/batch");
    assertEquals(postmarkRequestBody.length, 1);
    assertEquals(postmarkRequestBody[0].From, "batch@casagrown.com");
    assertEquals(postmarkRequestBody[0].To, "test@casagrown.com");
    
    // Asserts body includes keyword injections
    const html: string = postmarkRequestBody[0].HtmlBody;
    assertEquals(html.includes("Tomatoes"), true);
    assertEquals(html.includes("Corn"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Test 3: Infinite Recusion Bounds cleanly triggers self-fork limit", async () => {
  let forkTriggered = false;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (url.toString().includes("market-cron") && init?.method === "POST") {
      forkTriggered = true;
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  const mockEnv = () => undefined;

  try {
    // 500 triggers exactly the limit threshold
    const res = await handleGrowerDigest(
      createMockSupabase(500),
      mockEnv,
      {},
      "http://localhost:3000"
    );

    const data = await res.json();
    
    assertEquals(data.forkedNext, true);
    assertEquals(data.batchSize, 500);
    assertEquals(forkTriggered, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
