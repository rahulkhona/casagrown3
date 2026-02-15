/**
 * Integration tests for stripe-webhook edge function.
 *
 * Note: These tests verify the function handles requests correctly
 * without a real Stripe connection. The webhook will only be fully
 * active in production with a valid STRIPE_WEBHOOK_SECRET.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/stripe-webhook/test.ts
 */
import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
    invokeFunction,
    optionsPreflight,
    serviceHeaders,
} from "../_shared/test-helpers.ts";

const FUNCTIONS_URL = Deno.env.get("SUPABASE_URL")
    ? `${Deno.env.get("SUPABASE_URL")}/functions/v1`
    : "http://127.0.0.1:54321/functions/v1";

// ── CORS ────────────────────────────────────────────────────────────────────

Deno.test("stripe-webhook — CORS preflight", async () => {
    const headers = await optionsPreflight("stripe-webhook");
    assertEquals(headers.get("access-control-allow-origin"), "*");
    // Must include stripe-signature in allowed headers
    const allowHeaders = headers.get("access-control-allow-headers") ?? "";
    assertEquals(allowHeaders.includes("stripe-signature"), true);
});

// ── Webhook event handling ──────────────────────────────────────────────────

Deno.test("stripe-webhook — handles payment_intent.succeeded with unknown stripe ID", async () => {
    // Send a mock Stripe webhook event. Since STRIPE_WEBHOOK_SECRET is not
    // set in local dev, signature verification is skipped.
    const res = await fetch(`${FUNCTIONS_URL}/stripe-webhook`, {
        method: "POST",
        headers: {
            ...serviceHeaders(),
        },
        body: JSON.stringify({
            id: "evt_test_123",
            type: "payment_intent.succeeded",
            data: {
                object: {
                    id: "pi_nonexistent_test",
                    amount: 1000,
                    currency: "usd",
                    status: "succeeded",
                },
            },
        }),
    });

    const data = await res.json();
    // Should return 200 with warning since the PI doesn't exist in our DB
    assertEquals(res.status, 200);
    assertEquals(data.received, true);
    assertExists(data.warning);
});

Deno.test("stripe-webhook — handles payment_intent.payment_failed gracefully", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/stripe-webhook`, {
        method: "POST",
        headers: {
            ...serviceHeaders(),
        },
        body: JSON.stringify({
            id: "evt_test_fail_123",
            type: "payment_intent.payment_failed",
            data: {
                object: {
                    id: "pi_nonexistent_fail",
                    amount: 500,
                    currency: "usd",
                    status: "requires_payment_method",
                    last_payment_error: {
                        message: "Your card was declined.",
                    },
                },
            },
        }),
    });

    const data = await res.json();
    // Should return 200 — we handle failures gracefully
    assertEquals(res.status, 200);
    assertEquals(data.received, true);
});

Deno.test("stripe-webhook — handles unrecognized event type", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/stripe-webhook`, {
        method: "POST",
        headers: {
            ...serviceHeaders(),
        },
        body: JSON.stringify({
            id: "evt_test_unknown",
            type: "customer.subscription.created",
            data: {
                object: { id: "sub_123" },
            },
        }),
    });

    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.received, true);
});

Deno.test("stripe-webhook — rejects invalid JSON body", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/stripe-webhook`, {
        method: "POST",
        headers: {
            ...serviceHeaders(),
        },
        body: "this is not json",
    });

    // Should return error status (500 since errorStatus is set to 500)
    assertEquals(res.status, 500);
    const data = await res.json();
    assertExists(data.error);
});
