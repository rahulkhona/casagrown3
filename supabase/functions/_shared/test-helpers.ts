/**
 * test-helpers.ts — Shared helpers for edge function integration tests
 *
 * These tests run against a LIVE local Supabase instance.
 * Prerequisite: `npx supabase functions serve` must be running.
 *
 * Run all tests:
 *   deno test --allow-net --allow-env supabase/functions/
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_o0BQy4UlCDU";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Base URL for invoking edge functions */
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/** Headers for service-role (no user auth) */
export function serviceHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    };
}

/**
 * Sign up (or sign in) a test user and return the access token.
 * Uses a unique email per test run to avoid collisions.
 */
export async function getTestUserToken(): Promise<string> {
    const email = `edge-test-${Date.now()}@test.com`;
    const password = "TestPassword123!";

    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!data.access_token) {
        throw new Error(`Failed to create test user: ${JSON.stringify(data)}`);
    }
    return data.access_token;
}

/** Headers for an authenticated user */
export async function authHeaders(): Promise<Record<string, string>> {
    const token = await getTestUserToken();
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
    };
}

/** Invoke an edge function and return parsed JSON */
export async function invokeFunction(
    functionName: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
    const res = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    const data = await res.json();
    return { status: res.status, data };
}

/** Send an OPTIONS request and return response headers */
export async function optionsPreflight(
    functionName: string,
): Promise<Headers> {
    const res = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
        method: "OPTIONS",
    });
    await res.text(); // drain body
    return res.headers;
}
