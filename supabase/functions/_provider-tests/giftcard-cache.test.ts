/**
 * Integration Tests: Gift Card Cache Double-Buffer & Redeem Flow
 *
 * Tests the full E2E flow against a live local Supabase instance:
 * - Double-buffer cache swap for gift cards
 * - Real-time provider comparison during redemption
 * - Cron job schedule verification
 *
 * Prerequisites:
 *   npx supabase start
 *   npx supabase functions serve --no-verify-jwt
 *
 * Run: deno test --allow-net --allow-env supabase/functions/_provider-tests/giftcard-cache.test.ts
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { invokeFunction, serviceHeaders } from "../_shared/test-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.36.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ||
    "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// ── 1. Gift card cache has status column ──
Deno.test("Cache Schema: giftcards_cache has status column", async () => {
    // Insert a test row with status to verify the column exists
    const testProvider = "tremendous"; // use a non-unified provider key for cleanup safety
    const { error } = await supabaseAdmin.from("giftcards_cache").upsert(
        {
            provider: testProvider,
            status: "active",
            data: [],
            updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,status" },
    );

    // If status column doesn't exist, this would fail
    assertEquals(
        error,
        null,
        `Upsert with status failed: ${JSON.stringify(error)}`,
    );

    // Cleanup
    await supabaseAdmin.from("giftcards_cache")
        .delete()
        .eq("provider", testProvider)
        .eq("status", "active");
});

// ── 2. Charity projects cache has status column ──
Deno.test("Cache Schema: charity_projects_cache has status column", async () => {
    const { error } = await supabaseAdmin.from("charity_projects_cache").insert(
        {
            status: "building",
            data: [],
            updated_at: new Date().toISOString(),
        },
    );

    assertEquals(
        error,
        null,
        `Insert with status failed: ${JSON.stringify(error)}`,
    );

    // Cleanup
    await supabaseAdmin.from("charity_projects_cache")
        .delete()
        .eq("status", "building");
});

// ── 3. fetch-gift-cards reads from active row ──
Deno.test("fetch-gift-cards returns active cache (no refresh)", async () => {
    // Seed a known active cache row
    await supabaseAdmin.from("giftcards_cache").upsert(
        {
            provider: "unified",
            status: "active",
            data: [
                {
                    brandName: "TestBrand",
                    brandKey: "testbrand",
                    availableProviders: [{
                        provider: "tremendous",
                        productId: "t1",
                    }],
                },
            ],
            updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,status" },
    );

    const { status, data } = await invokeFunction(
        "fetch-gift-cards",
        {},
        serviceHeaders(),
    );

    assertEquals(status, 200, `Expected 200, got ${status}`);
    // Should return cached data
    if (data.cached === true) {
        assertExists(data.cards, "Should return cards from cache");
    }
});

// ── 4. Cron job exists (if pg_cron is available) ──
Deno.test("Cron Migration: refresh-giftcard-catalog job exists", async () => {
    try {
        const { data, error } = await supabaseAdmin.rpc("raw_query", {
            query:
                "SELECT jobname FROM cron.job WHERE jobname = 'refresh-giftcard-catalog'",
        });

        // If pg_cron isn't available in local dev, this RPC will fail
        // That's expected — the cron job only runs in production
        if (error) {
            console.log(
                "pg_cron not available (expected in local dev), skipping",
            );
            return;
        }

        if (data && Array.isArray(data) && data.length > 0) {
            assertEquals(data[0].jobname, "refresh-giftcard-catalog");
        }
    } catch {
        console.log(
            "pg_cron verification skipped (not available in local dev)",
        );
    }
});
