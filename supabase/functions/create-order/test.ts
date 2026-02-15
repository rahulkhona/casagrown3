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
