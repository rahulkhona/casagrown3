/**
 * Admin auth setup for Playwright.
 *
 * Uses Supabase Admin API to generate a magic link for seller@test.local
 * (who has admin role via staff_members table), then exchanges it for
 * a session. This works regardless of bcrypt password state.
 */

import { test as setup } from "@playwright/test";

const ADMIN_AUTH_FILE = "e2e/playwright/.auth/admin.json";
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const ADMIN_EMAIL = "seller@test.local";

setup("authenticate as admin", async ({ page }) => {
    setup.setTimeout(60_000);

    // 1. Generate magic link via Admin API
    const linkRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/generate_link`,
        {
            method: "POST",
            headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
        },
    );

    if (!linkRes.ok) {
        throw new Error(
            `generate_link failed: ${linkRes.status} ${await linkRes.text()}`,
        );
    }

    const linkData = await linkRes.json();
    const hashedToken = linkData.hashed_token;

    if (!hashedToken) {
        throw new Error("No hashed_token in generate_link response");
    }

    // 2. Exchange token for session via verify endpoint
    const verifyRes = await fetch(
        `${SUPABASE_URL}/auth/v1/verify`,
        {
            method: "POST",
            headers: {
                apikey: ANON_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                type: "magiclink",
                token_hash: hashedToken,
            }),
        },
    );

    if (!verifyRes.ok) {
        throw new Error(
            `verify failed: ${verifyRes.status} ${await verifyRes.text()}`,
        );
    }

    const session = await verifyRes.json();

    if (!session.access_token) {
        throw new Error(
            `No access_token in verify response: ${JSON.stringify(session)}`,
        );
    }

    // 3. Navigate to admin app and inject session
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);

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
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            user: session.user,
        },
    );

    // 4. Reload to pick up auth
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(3000);

    await page.context().storageState({ path: ADMIN_AUTH_FILE });
});
