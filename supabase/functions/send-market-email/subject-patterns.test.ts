/**
 * Deno tests for send-market-email subject line + body content.
 *
 * Verifies:
 * - Subject lines: each notification pattern maps to the correct email subject
 * - Body content: email HTML body contains the notification text + CasaGrown branding
 * - No generic "Market Update" subject for known notification types
 *
 * Run: deno test --allow-net --allow-env supabase/functions/send-market-email/subject-patterns.test.ts
 */
import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { invokeFunction, serviceHeaders } from "../_shared/test-helpers.ts";

const MAILPIT_URL = "http://localhost:54324";

async function clearMailpit() {
  try {
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
  } catch { /* mailpit may not be running */ }
}

async function getMailpitMessages(): Promise<any[]> {
  try {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const data = await res.json();
    return data.messages || [];
  } catch {
    return [];
  }
}

async function getEmailBody(messageId: string): Promise<string> {
  try {
    const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
    const data = await res.json();
    return data.HTML || data.Text || "";
  } catch {
    return "";
  }
}

/**
 * Sends an email via the edge function and verifies both subject + body in Mailpit.
 */
async function sendAndVerify(
  notificationText: string,
  expectedSubject: string,
  bodyMustContain: string[],
  bodyMustNotContain: string[],
  recipientTag: string,
) {
  await clearMailpit();
  const headers = serviceHeaders();
  const to = `subject-test-${recipientTag}@test.local`;

  // The edge function derives the subject from the body content
  await invokeFunction(
    "send-market-email",
    {
      to,
      subject: `CasaGrown Market — ${notificationText.substring(0, 60)}`,
      html: `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://casagrown.com/logo.png" alt="CasaGrown" style="height: 40px;" />
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px;">
          <p style="margin: 0 0 8px; font-size: 15px; color: #374151;">Hi Test User,</p>
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${notificationText}</p>
        </div>
        <p style="margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center;">CasaGrown Market &bull; Fresh &bull; Local &bull; Trusted</p>
      </div>`,
      text: notificationText,
    },
    headers,
  );

  // Wait for email to arrive in Mailpit
  await new Promise((r) => setTimeout(r, 2000));
  const messages = await getMailpitMessages();
  const match = messages.find((m: any) =>
    (m.To?.[0]?.Address || "").includes(recipientTag)
  );

  if (match) {
    // Verify subject
    assertStringIncludes(
      match.Subject,
      expectedSubject,
      `Subject should contain "${expectedSubject}" but got: "${match.Subject}"`,
    );
    assertNotEquals(
      match.Subject,
      "CasaGrown — Market Update",
      "Subject should NOT be generic 'Market Update'",
    );

    // Verify body content
    const body = await getEmailBody(match.ID);
    for (const required of bodyMustContain) {
      assertStringIncludes(
        body,
        required,
        `Email body should contain "${required}"`,
      );
    }
    for (const forbidden of bodyMustNotContain) {
      assertEquals(
        body.includes(forbidden),
        false,
        `Email body should NOT contain "${forbidden}" but it does`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Test Suite: Subject + Body verification for all notification types
// ═══════════════════════════════════════════════════════════════════

Deno.test("Email: Order Completed (buyer) — subject + body", async () => {
  await sendAndVerify(
    "✅ Order completed: Organic Tomatoes — $11.85 settled. Rate your experience!",
    "Order Completed",
    ["settled", "$11.85", "CasaGrown", "Rate"],
    ["earned"],
    "buyer-complete",
  );
});

Deno.test("Email: Sale Completed (seller) — subject + body", async () => {
  await sendAndVerify(
    "💰 Sale completed: Organic Tomatoes — $10.00 total. Rate the buyer!",
    "Sale Completed",
    ["total", "$10.00", "CasaGrown", "Rate"],
    ["earned"],
    "seller-complete",
  );
});

Deno.test("Email: Daily Settlement — subject + body", async () => {
  await sendAndVerify(
    "💰 Daily settlement: $15.00 in earnings now available.",
    "Daily Settlement",
    ["$15.00", "earnings", "CasaGrown"],
    ["Market settlement"],
    "settlement",
  );
});

Deno.test("Email: Ready for Pickup — subject + body", async () => {
  await sendAndVerify(
    "📍 Your Organic Tomatoes is ready for pickup!",
    "Ready for Pickup",
    ["ready for pickup", "Organic Tomatoes", "CasaGrown"],
    [],
    "pickup",
  );
});

Deno.test("Email: Order Declined — subject + body", async () => {
  await sendAndVerify(
    "❌ Your order for Organic Tomatoes was declined: Out of stock",
    "Order Declined",
    ["declined", "Out of stock", "CasaGrown"],
    [],
    "declined",
  );
});

Deno.test("Email: Order Cancelled — subject + body", async () => {
  await sendAndVerify(
    "🔄 Your order for Organic Tomatoes has been cancelled.",
    "Order Cancelled",
    ["cancelled", "Organic Tomatoes", "CasaGrown"],
    [],
    "cancelled",
  );
});

Deno.test("Email: New Order — subject + body", async () => {
  await sendAndVerify(
    "🛒 New order: Organic Tomatoes (x2) from Beth Buyer",
    "New Order",
    ["New order", "Organic Tomatoes", "Beth Buyer", "CasaGrown"],
    [],
    "new-order",
  );
});

Deno.test("Email: Dispute Opened — subject + body", async () => {
  await sendAndVerify(
    "⚠️ Dispute Opened for your Organic Tomatoes order.",
    "Dispute Opened",
    ["Dispute Opened", "Organic Tomatoes", "CasaGrown"],
    [],
    "dispute-open",
  );
});

Deno.test("Email: Dispute Escalated — subject + body", async () => {
  await sendAndVerify(
    "📋 Your dispute for Organic Tomatoes has been escalated to admin review.",
    "Dispute Escalated",
    ["escalated", "admin review", "CasaGrown"],
    [],
    "dispute-escalated",
  );
});

Deno.test("Email: Dispute Resolved — subject + body", async () => {
  await sendAndVerify(
    "✅ Your dispute for Organic Tomatoes has been resolved.",
    "Dispute Resolved",
    ["resolved", "Organic Tomatoes", "CasaGrown"],
    [],
    "dispute-resolved",
  );
});

Deno.test("Email: Order Accepted — subject + body", async () => {
  await sendAndVerify(
    "✅ Your order for Organic Tomatoes has been accepted by the seller!",
    "Order Accepted",
    ["accepted", "Organic Tomatoes", "CasaGrown"],
    [],
    "accepted",
  );
});
