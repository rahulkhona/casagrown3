/**
 * Deno integration tests for send-transaction-email edge function.
 *
 * Verifies that credit information is correctly rendered in buyer and seller
 * receipt emails — specifically the "Credit Applied" and "Fee Credit Applied"
 * lines, and that all values use $ (not pts).
 *
 * Run: cd supabase && deno test --allow-env --allow-net --no-check functions/_tests/send-transaction-email.test.ts
 */

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/send-transaction-email`;

const BASE_ORDER = {
  transactionId: "test-txn-001",
  date: "2026-04-21T15:30:00Z",
  product: "Meyer Lemons",
  quantity: 3,
  unit: "lb",
  pointsPerUnit: 4.5,
  subtotal: 13.5,
  tax: 1.15,
  total: 14.65,
  sellerName: "Maria Garcia",
  sellerZip: "95129",
  buyerName: "James Wilson",
  buyerZip: "95130",
  platformFee: 1.35,
  feeRate: 0.1,
  sellerPayout: 12.15,
  delegated: false,
  receiptFooter: "CA AB-626",
};

async function sendEmail(
  role: string,
  orderOverrides: Record<string, unknown> = {},
): Promise<{ status: number; body: string }> {
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      recipients: [{ email: `${role}@test-credit.local`, role }],
      orderData: { ...BASE_ORDER, ...orderOverrides },
    }),
  });
  return { status: res.status, body: await res.text() };
}

// Helper: fetch last email HTML from Mailpit
async function getLastEmailHtml(
  recipientEmail: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `http://127.0.0.1:54324/api/v1/search?query=to:${recipientEmail}&limit=1`,
    );
    const data = await res.json();
    if (!data.messages || data.messages.length === 0) return null;

    const msgId = data.messages[0].ID;
    const msgRes = await fetch(
      `http://127.0.0.1:54324/api/v1/message/${msgId}`,
    );
    const msg = await msgRes.json();
    return msg.HTML || msg.Text || "";
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Test 1: Buyer receipt with credit applied shows "$" values
// ═══════════════════════════════════════════════════════════

Deno.test({
  name:
    "send-transaction-email: buyer receipt renders credit line with $ formatting",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, body } = await sendEmail("buyer", {
      creditApplied: 2.5,
      sellerFeeCredit: 0,
    });

    const parsed = JSON.parse(body);
    assertEquals(parsed.sent, 1, `Send failed: ${body}`);

    // Check Mailpit for the rendered HTML
    await new Promise((r) => setTimeout(r, 500));
    const html = await getLastEmailHtml("buyer@test-credit.local");
    if (html) {
      assertStringIncludes(html, "Credit Applied", "Missing 'Credit Applied' label");
      assertStringIncludes(html, "-$2.50", "Missing '-$2.50' credit value");
      assertStringIncludes(html, "$13.5", "Missing '$13.5' subtotal");
      assertStringIncludes(html, "$4.5", "Missing '$4.5' price per unit");
      // Must NOT contain "pts"
      assertEquals(html.includes(" pts"), false, "Should not contain 'pts' label");
    }
  },
});

// ═══════════════════════════════════════════════════════════
// Test 2: Buyer receipt without credit — no credit row shown
// ═══════════════════════════════════════════════════════════

Deno.test({
  name:
    "send-transaction-email: buyer receipt hides credit row when creditApplied is 0",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, body } = await sendEmail("buyer", {
      creditApplied: 0,
      sellerFeeCredit: 0,
    });

    const parsed = JSON.parse(body);
    assertEquals(parsed.sent, 1, `Send failed: ${body}`);

    await new Promise((r) => setTimeout(r, 500));
    const html = await getLastEmailHtml("buyer@test-credit.local");
    if (html) {
      assertEquals(
        html.includes("Credit Applied"),
        false,
        "Credit Applied row should be hidden when creditApplied is 0",
      );
    }
  },
});

// ═══════════════════════════════════════════════════════════
// Test 3: Seller receipt with fee credit shows Fee Credit Applied
// ═══════════════════════════════════════════════════════════

Deno.test({
  name:
    "send-transaction-email: seller receipt renders Fee Credit Applied with $ formatting",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, body } = await sendEmail("seller", {
      platformFee: 0.35,
      sellerPayout: 13.15,
      sellerFeeCredit: 1.0,
    });

    const parsed = JSON.parse(body);
    assertEquals(parsed.sent, 1, `Send failed: ${body}`);

    await new Promise((r) => setTimeout(r, 500));
    const html = await getLastEmailHtml("seller@test-credit.local");
    if (html) {
      assertStringIncludes(html, "Fee Credit Applied", "Missing 'Fee Credit Applied' line");
      assertStringIncludes(html, "-$1.00", "Missing '-$1.00' fee credit value");
      assertStringIncludes(html, "-$0.35", "Missing '-$0.35' platform fee");
      assertStringIncludes(html, "$13.15", "Missing '$13.15' payout");
      assertEquals(html.includes(" pts"), false, "Should not contain 'pts' label");
    }
  },
});

// ═══════════════════════════════════════════════════════════
// Test 4: Seller receipt without fee credit — no fee credit row
// ═══════════════════════════════════════════════════════════

Deno.test({
  name:
    "send-transaction-email: seller receipt hides fee credit row when sellerFeeCredit is 0",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, body } = await sendEmail("seller", {
      sellerFeeCredit: 0,
    });

    const parsed = JSON.parse(body);
    assertEquals(parsed.sent, 1, `Send failed: ${body}`);

    await new Promise((r) => setTimeout(r, 500));
    const html = await getLastEmailHtml("seller@test-credit.local");
    if (html) {
      assertEquals(
        html.includes("Fee Credit Applied"),
        false,
        "Fee Credit Applied row should be hidden when sellerFeeCredit is 0",
      );
    }
  },
});
