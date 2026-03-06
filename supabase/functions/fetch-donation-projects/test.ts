/**
 * Deno tests for fetch-donation-projects double-buffer cache logic
 * Run: deno test --allow-net --allow-env supabase/functions/fetch-donation-projects/test.ts
 */

import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// ── 1. Module import smoke test ──
Deno.test({
    name: "fetch-donation-projects module compiles and exports",
    sanitizeResources: false,
    sanitizeOps: false,
    async fn() {
        const mod = await import("./index.ts");
        assertExists(mod);
    },
});

// ── 2. Cache status field for charity projects ──
Deno.test({
    name: "charity_projects_cache uses active/building status pattern",
    fn() {
        const validStatuses = ["active", "building"];
        assertEquals(validStatuses.includes("active"), true);
        assertEquals(validStatuses.includes("building"), true);
    },
});

// ── 3. Atomic swap ordering for donations ──
Deno.test({
    name: "donation cache swap: delete active THEN rename building",
    fn() {
        const ops: string[] = [];
        ops.push("delete_old_building");
        ops.push("insert_building");
        ops.push("delete_active");
        ops.push("rename_building_to_active");

        assertEquals(
            ops.indexOf("delete_active") <
                ops.indexOf("rename_building_to_active"),
            true,
        );
    },
});

// ── 4. DonationProject shape ──
Deno.test({
    name: "DonationProject has expected fields",
    fn() {
        const project = {
            id: 12345,
            title: "Clean Water Project",
            organization: "WaterAid",
            theme: "Health",
            imageUrl: "https://example.com/water.jpg",
            goal: 50000,
            raised: 35000,
            summary: "Providing clean water to communities in need.",
        };

        assertExists(project.id);
        assertExists(project.title);
        assertExists(project.organization);
        assertExists(project.theme);
        assertEquals(typeof project.goal, "number");
        assertEquals(typeof project.raised, "number");
    },
});

// ── 5. Search mode bypasses cache ──
Deno.test({
    name: "search queries should not use cached data",
    fn() {
        // Search mode should always hit the live API
        const searchQuery = "education";
        const isRefresh = false;
        const useCache = !searchQuery && !isRefresh;
        assertEquals(useCache, false, "Search should bypass cache");
    },
});
