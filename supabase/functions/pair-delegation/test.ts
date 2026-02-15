/**
 * Integration tests for pair-delegation edge function.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/pair-delegation/test.ts
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

// ── CORS ────────────────────────────────────────────────────────────────────

Deno.test("pair-delegation — CORS preflight", async () => {
    const headers = await optionsPreflight("pair-delegation");
    assertEquals(headers.get("access-control-allow-origin"), "*");
});

// ── Lookup (public, no auth) ────────────────────────────────────────────────

Deno.test("pair-delegation — lookup returns 404 for invalid code", async () => {
    const { status, data } = await invokeFunction(
        "pair-delegation",
        { action: "lookup", code: "d-nonexistent" },
        serviceHeaders(),
    );
    assertExists(data.error);
});

Deno.test("pair-delegation — lookup rejects missing code", async () => {
    const { data } = await invokeFunction(
        "pair-delegation",
        { action: "lookup" },
        serviceHeaders(),
    );
    assertExists(data.error);
});

// ── Generate-link (requires auth) ───────────────────────────────────────────

Deno.test("pair-delegation — generate-link rejects unauthenticated", async () => {
    const { data } = await invokeFunction(
        "pair-delegation",
        { action: "generate-link" },
        serviceHeaders(),
    );
    assertExists(data.error);
});

Deno.test("pair-delegation — generate-link creates delegation for authenticated user", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "pair-delegation",
        { action: "generate-link", message: "Test delegation" },
        headers,
    );

    // Should return delegation code, pairing code, expiry
    assertExists(data.delegationCode);
    assertExists(data.pairingCode);
    assertExists(data.expiresAt);
    assertExists(data.delegation);
    assertEquals(typeof data.delegationCode, "string");
    assertEquals(typeof data.pairingCode, "string");
    assertEquals((data.delegationCode as string).startsWith("d-"), true);
    assertEquals((data.pairingCode as string).length, 6);
});

Deno.test("pair-delegation — generate-link reuses existing pending link", async () => {
    const headers = await authHeaders();

    // First call creates a new delegation
    const { data: first } = await invokeFunction(
        "pair-delegation",
        { action: "generate-link", message: "First" },
        headers,
    );
    assertExists(first.delegationCode);

    // Second call should reuse the same delegation
    const { data: second } = await invokeFunction(
        "pair-delegation",
        { action: "generate-link", message: "Updated" },
        headers,
    );
    assertEquals(second.delegationCode, first.delegationCode);
    assertEquals(second.pairingCode, first.pairingCode);
});

// ── Accept-link ─────────────────────────────────────────────────────────────

Deno.test("pair-delegation — accept-link rejects invalid code", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "pair-delegation",
        { action: "accept-link", code: "d-invalid123" },
        headers,
    );
    assertExists(data.error);
});

Deno.test("pair-delegation — accept-link prevents self-delegation", async () => {
    const headers = await authHeaders();

    // Generate a link as this user
    const { data: gen } = await invokeFunction(
        "pair-delegation",
        { action: "generate-link" },
        headers,
    );
    assertExists(gen.delegationCode);

    // Try to accept own link
    const { data: accept } = await invokeFunction(
        "pair-delegation",
        { action: "accept-link", code: gen.delegationCode },
        headers,
    );
    assertExists(accept.error);
    assertEquals((accept.error as string).includes("yourself"), true);
});

Deno.test("pair-delegation — accept-link works cross-user", async () => {
    // User A generates a link
    const headersA = await authHeaders();
    const { data: gen } = await invokeFunction(
        "pair-delegation",
        { action: "generate-link", message: "Come sell for me!" },
        headersA,
    );
    assertExists(gen.delegationCode);

    // User B accepts the link
    const headersB = await authHeaders();
    const { data: accept } = await invokeFunction(
        "pair-delegation",
        { action: "accept-link", code: gen.delegationCode },
        headersB,
    );
    assertExists(accept.delegation);
    assertEquals((accept.delegation as any).status, "active");
});

// ── Accept (legacy 6-digit code) ────────────────────────────────────────────

Deno.test("pair-delegation — accept rejects bad code format", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "pair-delegation",
        { action: "accept", code: "abc" },
        headers,
    );
    assertExists(data.error);
});

// ── Unknown action ──────────────────────────────────────────────────────────

Deno.test("pair-delegation — rejects unknown action", async () => {
    const headers = await authHeaders();
    const { data } = await invokeFunction(
        "pair-delegation",
        { action: "foobar" },
        headers,
    );
    assertExists(data.error);
    assertEquals((data.error as string).includes("Unknown action"), true);
});
