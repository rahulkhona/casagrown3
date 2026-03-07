/**
 * Auth Setup — runs once before all Community Voice E2E tests.
 *
 * Signs in via the Supabase GoTrue REST API using email + password,
 * injects the session into localStorage, and saves the storage state
 * so all subsequent test files are authenticated.
 */

import { test as setup } from "@playwright/test";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TEST_BUYER = {
    email: "buyer@test.local",
    password: "TestPassword123!",
};

const authFile = "e2e/.auth/buyer.json";

setup("authenticate as test buyer", async ({ page }) => {
    setup.setTimeout(60_000);

    // 1. Get a fresh JWT from Supabase REST API
    const res = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                email: TEST_BUYER.email,
                password: TEST_BUYER.password,
            }),
        },
    );

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Supabase sign-in failed (${res.status}): ${body}`);
    }

    const data = await res.json();

    // 2. Navigate to login page to get a valid origin for localStorage
    await page.goto("/login", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });
    await page.waitForTimeout(2000);

    // 3. Inject session into localStorage under all possible key formats
    await page.evaluate(
        ({ accessToken, refreshToken, user }) => {
            const sessionPayload = JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                token_type: "bearer",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user,
            });

            const keys = [
                "sb-127.0.0.1-auth-token",
                "sb-127-auth-token",
                "sb-localhost-auth-token",
                "supabase.auth.token",
            ];
            for (const key of keys) {
                localStorage.setItem(key, sessionPayload);
            }
        },
        {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            user: { id: data.user.id, email: data.user.email },
        },
    );

    // 4. Reload to let the app pick up the session
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });

    try {
        await page.waitForURL(/\/(board|login)/, { timeout: 15_000 });
    } catch {
        console.log("CV Auth setup: URL after reload:", page.url());
    }

    // 5. Save authenticated storage state for reuse
    await page.context().storageState({ path: authFile });
});
