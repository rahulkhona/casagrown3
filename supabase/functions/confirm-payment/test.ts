/**
 * Integration tests for confirm-payment edge function.
 *
 * Prerequisite: `npx supabase functions serve` + local Supabase running.
 * Run: deno test --allow-net --allow-env supabase/functions/confirm-payment/test.ts
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

Deno.test("confirm-payment — CORS preflight returns correct headers", async () => {
    const headers = await optionsPreflight("confirm-payment");
    assertEquals(headers.get("access-control-allow-origin"), "*");
    const allowHeaders = headers.get("access-control-allow-headers") ?? "";
    assertEquals(allowHeaders.includes("authorization"), true);
    assertEquals(allowHeaders.includes("content-type"), true);
});

Deno.test("confirm-payment — rejects empty body", async () => {
    const { status, data } = await invokeFunction(
        "confirm-payment",
        {},
        serviceHeaders(),
    );
    assertExists(data.error);
    assertEquals(
        (data.error as string).includes("paymentTransactionId"),
        true,
    );
});

Deno.test("confirm-payment — rejects nonexistent transaction", async () => {
    const { data } = await invokeFunction(
        "confirm-payment",
        { paymentTransactionId: "00000000-0000-0000-0000-000000000000" },
        serviceHeaders(),
    );
    assertExists(data.error);
    assertEquals(
        (data.error as string).includes("not found"),
        true,
    );
});

Deno.test("confirm-payment — full payment lifecycle (create + confirm)", async () => {
    const headers = await authHeaders();

    // Step 1: Create a mock payment intent
    const { data: intent } = await invokeFunction(
        "create-payment-intent",
        { amountCents: 299, pointsAmount: 50, provider: "mock" },
        headers,
    );
    assertExists(intent.transactionId, "Should return transactionId");
    assertEquals(intent.provider, "mock");

    // Step 2: Confirm the payment
    const { data: result } = await invokeFunction(
        "confirm-payment",
        { paymentTransactionId: intent.transactionId },
        serviceHeaders(),
    );
    assertEquals(result.success, true);
    assertEquals(result.pointsAmount, 50);
    assertExists(result.newBalance, "Should return newBalance");
    assertExists(result.ledgerEntryId, "Should return ledgerEntryId");

    // Step 3: Confirm again (idempotency check)
    const { data: duplicate } = await invokeFunction(
        "confirm-payment",
        { paymentTransactionId: intent.transactionId },
        serviceHeaders(),
    );
    assertEquals(duplicate.success, true);
    assertEquals(duplicate.alreadyProcessed, true);
});
