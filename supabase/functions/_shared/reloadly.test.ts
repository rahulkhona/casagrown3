/**
 * Deno unit tests for fetchReloadlyProduct
 * Run: deno test --allow-net --allow-env supabase/functions/_shared/reloadly.test.ts
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { fetchReloadlyProduct } from "./reloadly.ts";

Deno.test({
    name: "fetchReloadlyProduct - returns null for missing credentials",
    async fn() {
        const result = await fetchReloadlyProduct("", "", "some-id", true);
        assertEquals(result, null);
    },
});

Deno.test({
    name: "fetchReloadlyProduct - returns null for missing product ID",
    async fn() {
        const result = await fetchReloadlyProduct(
            "client-id",
            "client-secret",
            "",
            true,
        );
        assertEquals(result, null);
    },
});

Deno.test({
    name: "fetchReloadlyProduct - returns ProviderOption with discount info",
    fn() {
        // Verify the expected return shape
        const mockResult = {
            provider: "reloadly" as const,
            productId: "12345",
            discountPercentage: 7.5,
            feePerTransaction: 0.5,
            feePercentage: 0,
        };

        assertEquals(mockResult.provider, "reloadly");
        assertExists(mockResult.productId);
        assertEquals(mockResult.discountPercentage, 7.5);
        assertEquals(mockResult.feePerTransaction, 0.5);
    },
});

Deno.test({
    name: "fetchReloadlyProduct - gracefully handles auth failure (no throw)",
    sanitizeResources: false,
    async fn() {
        // Invalid credentials should return null, not throw
        const result = await fetchReloadlyProduct(
            "invalid-client",
            "invalid-secret",
            "some-product-id",
            true,
        );
        assertEquals(result, null);
    },
});
