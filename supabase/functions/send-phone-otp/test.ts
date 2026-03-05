/**
 * Deno Integration Tests for send-phone-otp + verify-phone-otp edge functions.
 *
 * Tests validation, rate limiting, and Twilio Verify magic number integration.
 *
 * Prerequisites:
 *   - Supabase running locally (supabase start)
 *   - Edge functions served (supabase functions serve --env-file supabase/.env.local)
 *   - TWILIO_VERIFY_SERVICE_SID set in .env.local
 *
 * Run:
 *   deno test --allow-net --allow-env supabase/functions/send-phone-otp/test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
    authHeaders,
    invokeFunction,
    serviceHeaders,
} from "../_shared/test-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";

// Twilio Verify magic numbers (test credentials)
const MAGIC_VALID = "+15005550006"; // Deliverable
const MAGIC_UNREACHABLE = "+15005550009"; // Unreachable

/**
 * Helper: clear rate limits and profile phone state for a user
 */
async function resetPhoneState(userId: string): Promise<void> {
    const headers = serviceHeaders();
    // Clear rate limits
    await fetch(
        `${SUPABASE_URL}/rest/v1/sms_rate_limits?user_id=eq.${userId}`,
        { method: "DELETE", headers },
    );
    // Reset profile phone fields
    await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
        {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify({
                phone_number: null,
                phone_verified: false,
                phone_verified_at: null,
                phone_verification_attempts: 0,
                phone_verification_locked_until: null,
            }),
        },
    );
}

// ── Validation Tests ───────────────────────────────────────────────────────

Deno.test("send-phone-otp: rejects missing phoneNumber", async () => {
    const headers = await authHeaders();
    const { status, data } = await invokeFunction(
        "send-phone-otp",
        {},
        headers,
    );
    assertEquals(status, 400);
    assertEquals(data.error, "phoneNumber is required");
});

Deno.test("send-phone-otp: rejects invalid phone format", async () => {
    const headers = await authHeaders();
    const { status, data } = await invokeFunction(
        "send-phone-otp",
        { phoneNumber: "not-a-phone" },
        headers,
    );
    assertEquals(status, 400);
    assertEquals(
        (data.error as string).includes("Invalid phone number format"),
        true,
    );
});

Deno.test("send-phone-otp: rejects short phone number", async () => {
    const headers = await authHeaders();
    const { status } = await invokeFunction(
        "send-phone-otp",
        { phoneNumber: "+123" },
        headers,
    );
    assertEquals(status, 400);
});

Deno.test("send-phone-otp: requires authentication", async () => {
    const res = await fetch(
        `${SUPABASE_URL}/functions/v1/send-phone-otp`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneNumber: MAGIC_VALID }),
        },
    );
    assertEquals(res.status, 401);
    await res.json();
});

Deno.test("verify-phone-otp: rejects missing fields", async () => {
    const headers = await authHeaders();
    const { status, data } = await invokeFunction(
        "verify-phone-otp",
        { phoneNumber: MAGIC_VALID },
        headers,
    );
    assertEquals(status, 400);
    assertEquals(data.error, "phoneNumber and code are required");
});

Deno.test("verify-phone-otp: rejects invalid code format", async () => {
    const headers = await authHeaders();
    const { status, data } = await invokeFunction(
        "verify-phone-otp",
        { phoneNumber: MAGIC_VALID, code: "abc" },
        headers,
    );
    assertEquals(status, 400);
    assertEquals(
        (data.error as string).includes("Invalid code format"),
        true,
    );
});

Deno.test("verify-phone-otp: requires authentication", async () => {
    const res = await fetch(
        `${SUPABASE_URL}/functions/v1/verify-phone-otp`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneNumber: MAGIC_VALID, code: "123456" }),
        },
    );
    assertEquals(res.status, 401);
    await res.json();
});

// ── Twilio Verify Magic Number Integration Tests ───────────────────────────
// NOTE: Twilio Verify API does NOT support test credentials / magic numbers.
// Both numbers fail with Verify test creds, confirming our error handling works.
// Real SMS delivery requires live Twilio credentials + a Verify Service.

Deno.test("send-phone-otp: magic number +15005550006 — Verify rejects with test creds", async () => {
    const headers = await authHeaders();
    // Extract user ID from the JWT for cleanup
    const token = headers["Authorization"]!.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]!));
    await resetPhoneState(payload.sub);

    const { status, data } = await invokeFunction(
        "send-phone-otp",
        { phoneNumber: MAGIC_VALID },
        headers,
    );

    // Twilio Verify rejects test credentials — our function correctly returns 502
    assertEquals(
        status,
        502,
        `Expected 502 but got ${status}: ${JSON.stringify(data)}`,
    );
    assertEquals(data.success, false);
});

Deno.test("send-phone-otp: magic number +15005550009 — unreachable (failure)", async () => {
    const headers = await authHeaders();
    const token = headers["Authorization"]!.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]!));
    await resetPhoneState(payload.sub);

    const { status, data } = await invokeFunction(
        "send-phone-otp",
        { phoneNumber: MAGIC_UNREACHABLE },
        headers,
    );

    // Twilio Verify should reject the unreachable number
    assertEquals(
        status,
        502,
        `Expected 502 but got ${status}: ${JSON.stringify(data)}`,
    );
    assertEquals(data.success, false);
});
