/**
 * Integration tests for create-payment-intent edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/create-payment-intent/test.ts
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

Deno.test("create-payment-intent — CORS preflight", async () => {
    const headers = await optionsPreflight("create-payment-intent");
    assertEquals(headers.get("access-control-allow-origin"), "*");
});

Deno.test("create-payment-intent — rejects unauthenticated requests", async () => {
    const { data } = await invokeFunction(
        "create-payment-intent",
        { amountCents: 499, pointsAmount: 100 },
        serviceHeaders(), // service role doesn't have a "user"
    );
    assertExists(data.error);
    assertEquals(data.error, "Authentication required");
});

Deno.test("create-payment-intent — validates amountCents", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "create-payment-intent",
        { pointsAmount: 100 }, // missing amountCents
        headers,
    );
    assertExists(data.error);
});

Deno.test("create-payment-intent — validates minimum amount", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "create-payment-intent",
        { amountCents: 10, pointsAmount: 1 }, // below $0.50 minimum
        headers,
    );
    assertExists(data.error);
    assertEquals((data.error as string).includes("at least"), true);
});

Deno.test("create-payment-intent — creates mock payment successfully", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "create-payment-intent",
        { amountCents: 499, pointsAmount: 100, provider: "mock" },
        headers,
    );
    assertExists(data.transactionId, "Should return transactionId");
    assertExists(data.clientSecret, "Should return clientSecret");
    assertEquals(data.provider, "mock");
    assertEquals(
        (data.clientSecret as string).startsWith("mock_secret_"),
        true,
    );
});
