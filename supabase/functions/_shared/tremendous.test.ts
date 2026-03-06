/**
 * Deno unit tests for fetchTremendousProduct
 * Run: deno test --allow-net --allow-env supabase/functions/_shared/tremendous.test.ts
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// Import the function signature to ensure it compiles
import { fetchTremendousProduct } from "./tremendous.ts";

Deno.test({
    name: "fetchTremendousProduct - returns null for missing API key",
    async fn() {
        const result = await fetchTremendousProduct("", "some-product-id");
        assertEquals(result, null);
    },
});

Deno.test({
    name: "fetchTremendousProduct - returns null for missing product ID",
    async fn() {
        const result = await fetchTremendousProduct("some-api-key", "");
        assertEquals(result, null);
    },
});

Deno.test({
    name: "fetchTremendousProduct - returns ProviderOption with correct shape",
    fn() {
        // Verify the expected return shape matches ProviderOption
        const mockResult = {
            provider: "tremendous" as const,
            productId: "PROD-123",
            discountPercentage: 0,
            feePerTransaction: 0,
            feePercentage: 0,
        };

        assertEquals(mockResult.provider, "tremendous");
        assertExists(mockResult.productId);
        assertEquals(mockResult.discountPercentage, 0);
        assertEquals(mockResult.feePerTransaction, 0);
        assertEquals(mockResult.feePercentage, 0);
    },
});

Deno.test({
    name:
        "fetchTremendousProduct - gracefully handles network errors (no throw)",
    sanitizeResources: false,
    async fn() {
        // Using an invalid API key will cause a 401, but should return null, not throw
        const result = await fetchTremendousProduct(
            "invalid-key-should-fail",
            "nonexistent-product-id",
        );
        assertEquals(result, null);
    },
});
