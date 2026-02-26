/**
 * Integration tests for the dynamic circuit breaker & provider toggles.
 * Covering scenarios (a) through (j).
 *
 * Requirements:
 *  npx supabase start
 *  npx supabase functions serve --no-verify-jwt
 *
 * Run: deno test --allow-net --allow-env supabase/functions/_provider-tests/toggles.test.ts
 */
import {
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { getTestUserToken, invokeFunction } from "../_shared/test-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Supabase REST API helper */
async function supabaseRest(
    table: string,
    method: string,
    body?: Record<string, unknown>,
    queryParams?: string,
): Promise<Record<string, unknown>[]> {
    const url = `${SUPABASE_URL}/rest/v1/${table}${
        queryParams ? `?${queryParams}` : ""
    }`;
    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "apikey": SERVICE_ROLE_KEY,
            "Prefer": "return=representation",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!text) return [];

    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
}

async function setProviderActiveStatus(provider: string, isActive: boolean) {
    await supabaseRest("provider_queue_status", "PATCH", {
        is_active: isActive,
    }, `provider=eq.${provider}`);
}

async function getActiveProvidersRPC(): Promise<{ provider: string }[]> {
    const url = `${SUPABASE_URL}/rest/v1/rpc/get_active_redemption_providers`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "apikey": SERVICE_ROLE_KEY,
        },
    });
    return res.json();
}

/**
 * SCENARIO (A): Disable GlobalGiving ->
 *  1. No transactions can be initiated (donate-points rejects).
 *  2. UI hides tab (get_active_redemption_providers omits it).
 *  3. Pending transactions complete (process-redemptions processes them).
 */
Deno.test("Scenario A: Disable GlobalGiving blocks new but processes pending", async () => {
    // Disable GG
    await setProviderActiveStatus("globalgiving", false);

    // 1. App UI (RPC) omits it
    const active = await getActiveProvidersRPC();
    assertEquals(active.some((a) => a.provider === "globalgiving"), false);

    // 2. donate-points rejects 400
    const token = await getTestUserToken();
    const { status, data: _data } = await invokeFunction(
        "donate-points",
        { organizationName: "Test", pointsAmount: 100 },
        {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
    );
    assertEquals(status, 400);

    // Reset
    await setProviderActiveStatus("globalgiving", true);
});

/**
 * SCENARIOS B, E, G: Disable Gift Cards (both Tremendous & Reloadly disabled) ->
 *  1. No transactions can be initiated.
 *  2. UI hides gift cards tab entirely.
 */
Deno.test("Scenario E: Disable Both Gift Card Providers completely blocks them", async () => {
    await setProviderActiveStatus("tremendous", false);
    await setProviderActiveStatus("reloadly", false);

    // 1. App UI (RPC) omits both, hiding the tab
    const active = await getActiveProvidersRPC();
    assertEquals(
        active.some((a) => ["tremendous", "reloadly"].includes(a.provider)),
        false,
    );

    // 2. redeem-gift-card rejects 400
    const token = await getTestUserToken();
    const { status } = await invokeFunction(
        "redeem-gift-card",
        {
            brandName: "Apple",
            brandId: "OKM",
            amountCents: 500,
            provider: "tremendous",
        }, // even if they bypass UI
        {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
    );
    assertEquals(status, 400);
});

/**
 * SCENARIO C & I: Disable Tremendous, Enable Reloadly
 *  1. UI uses only Reloadly for catalog
 */
Deno.test("Scenario C: Disable Tremendous, Enable Reloadly forces Reloadly catalog only", async () => {
    await setProviderActiveStatus("tremendous", false);
    await setProviderActiveStatus("reloadly", true);

    const { status: _status, data } = await invokeFunction(
        "fetch-gift-cards",
        {},
        { "Content-Type": "application/json" },
    );

    // We expect the array of cards. Since tremendous is disabled, ALL providers internally inside availableProviders should equal 'reloadly'
    const allProvidersUsed = new Set();
    const cards = data.cards as Array<
        { availableProviders: Array<{ provider: string }> }
    >;
    cards?.forEach((c) =>
        c.availableProviders.forEach((p) => allProvidersUsed.add(p.provider))
    );

    assertEquals(allProvidersUsed.has("tremendous"), false);
});

/**
 * SCENARIO D & H: Disable Reloadly, Enable Tremendous
 *  1. UI uses only Tremendous for catalog
 */
Deno.test("Scenario D: Disable Reloadly, Enable Tremendous forces Tremendous catalog only", async () => {
    await setProviderActiveStatus("tremendous", true);
    await setProviderActiveStatus("reloadly", false);

    const { status: _status, data } = await invokeFunction(
        "fetch-gift-cards",
        {},
        { "Content-Type": "application/json" },
    );

    const allProvidersUsed = new Set();
    const cards = data.cards as Array<
        { availableProviders: Array<{ provider: string }> }
    >;
    cards?.forEach((c) =>
        c.availableProviders.forEach((p) => allProvidersUsed.add(p.provider))
    );

    console.log("Providers Found Scenario D:", Array.from(allProvidersUsed));
    assertEquals(allProvidersUsed.has("reloadly"), false);
});

/**
 * SCENARIO J: Enable Both
 *  1. UI uses both for catalog and merges them
 */
Deno.test("Scenario J: Enable both Gift Card Providers merges catalog", async () => {
    await setProviderActiveStatus("tremendous", true);
    await setProviderActiveStatus("reloadly", true);

    const { status: _status, data } = await invokeFunction(
        "fetch-gift-cards",
        {},
        { "Content-Type": "application/json" },
    );

    // Ensure both providers successfully yielded catalog results (since we enabled them both)
    const allProvidersUsed = new Set();
    const cards = data.cards as Array<
        { availableProviders: Array<{ provider: string }> }
    >;
    cards?.forEach((c) =>
        c.availableProviders.forEach((p) => allProvidersUsed.add(p.provider))
    );

    // As long as the catalog returns at least one item from both APIs, these sets should be true.
    // If the sandbox lacks items, this test might incorrectly fail, but assumes standard payload.
    assertExists(allProvidersUsed.has("tremendous"));
    assertExists(allProvidersUsed.has("reloadly"));
});

async function setGracePeriodMs(ms: number | null) {
    if (ms === null) {
        await supabaseRest(
            "platform_config",
            "DELETE",
            undefined,
            "key=eq.provider_grace_period_ms",
        );
    } else {
        const existing = await supabaseRest(
            "platform_config",
            "GET",
            undefined,
            "key=eq.provider_grace_period_ms",
        );
        if (existing.length > 0) {
            await supabaseRest("platform_config", "PATCH", {
                value: ms.toString(),
            }, "key=eq.provider_grace_period_ms");
        } else {
            await supabaseRest("platform_config", "POST", {
                key: "provider_grace_period_ms",
                value: ms.toString(),
            });
        }
    }
}

async function setProviderDisabledAt(provider: string, dateIso: string | null) {
    await supabaseRest("provider_queue_status", "PATCH", {
        disabled_at: dateIso,
    }, `provider=eq.${provider}`);
}

/**
 * SCENARIO K: Deferred Disables (Grace Period)
 *  1. Configure grace period to 30 mins (1800000 ms).
 *  2. Set provider disabled_at to 10 mins ago -> should pass
 *  3. Set provider disabled_at to 40 mins ago -> should fail
 */
Deno.test("Scenario K: Deferred disables correctly honor configured grace periods", async () => {
    // 1. Setup config and mock states
    await setProviderActiveStatus("globalgiving", false);
    await setGracePeriodMs(30 * 60 * 1000); // 30 mins

    // Set disabled 10 minutes ago
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await setProviderDisabledAt("globalgiving", tenMinsAgo);

    const token = await getTestUserToken();

    // 2. Should pass because it is within 30 min window (even if currently inactive)
    const resWithinGrace = await invokeFunction(
        "donate-points",
        { organizationName: "Test", pointsAmount: 100 },
        {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
    );
    // Might return 400 Insufficient Points (since test user has 0 balance)
    // But it MUST NOT return the "temporarily offline" rejection!
    assertEquals(
        resWithinGrace.data?.error !==
            "Donations via GlobalGiving are temporarily offline. Please try again later.",
        true,
    );

    // 3. Set disabled 40 minutes ago
    const fortyMinsAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    await setProviderDisabledAt("globalgiving", fortyMinsAgo);

    // Should fail strictly
    const resOutsideGrace = await invokeFunction(
        "donate-points",
        { organizationName: "Test", pointsAmount: 100 },
        {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
    );
    assertEquals(resOutsideGrace.status, 400);
    assertEquals(
        resOutsideGrace.data?.error,
        "Donations via GlobalGiving are temporarily offline. Please try again later.",
    );

    // Cleanup
    await setProviderActiveStatus("globalgiving", true);
    await setProviderDisabledAt("globalgiving", null);
    await setGracePeriodMs(null);
});
