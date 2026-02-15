/**
 * Integration tests for resolve-pending-payments edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/resolve-pending-payments/test.ts
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

Deno.test("resolve-pending-payments — CORS preflight", async () => {
    const headers = await optionsPreflight("resolve-pending-payments");
    assertEquals(headers.get("access-control-allow-origin"), "*");
});

Deno.test("resolve-pending-payments — rejects unauthenticated requests", async () => {
    const { data } = await invokeFunction(
        "resolve-pending-payments",
        {},
        serviceHeaders(),
    );
    assertEquals(data.error, "Authentication required");
});

Deno.test("resolve-pending-payments — returns empty for fresh user", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "resolve-pending-payments",
        {},
        headers,
    );
    assertEquals(data.message, "No pending transactions");
    assertEquals((data.resolved as unknown[]).length, 0);
    assertEquals((data.pending as unknown[]).length, 0);
});

Deno.test("resolve-pending-payments — resolves mock pending payment", async () => {
    const headers = await authHeaders();

    // Create a mock payment (stays pending until confirmed)
    const { data: intent } = await invokeFunction(
        "create-payment-intent",
        { amountCents: 199, pointsAmount: 25, provider: "mock" },
        headers,
    );
    assertExists(intent.transactionId);

    // Now resolve — should auto-confirm the mock payment
    const { data } = await invokeFunction(
        "resolve-pending-payments",
        {},
        headers,
    );
    assertEquals((data.resolved as unknown[]).length, 1);
    assertEquals(
        (data.resolved as Array<{ id: string }>)[0]!.id,
        intent.transactionId,
    );
});
