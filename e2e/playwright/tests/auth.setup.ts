/**
 * Auth Setup — runs once before all tests.
 *
 * Signs in the test users via Supabase password auth, injects the session
 * as both a cookie and localStorage entries, dismisses all UI overlays,
 * and saves the authenticated storage state for reuse.
 */

import { expect, test as setup } from "@playwright/test";
import { signInWithPassword, TEST_BUYER, TEST_SELLER } from "../helpers/auth";

const sellerAuthFile = "e2e/playwright/.auth/seller.json";
const buyerAuthFile = "e2e/playwright/.auth/buyer.json";

/** Cookie key that @supabase/ssr uses: sb-<hostname-first-segment>-auth-token */
const COOKIE_KEY = "sb-127-auth-token";

async function injectSession(
    page: import("@playwright/test").Page,
    session: {
        access_token: string;
        refresh_token: string;
        user: { id: string; email: string };
    },
) {
    await page.evaluate(
        ({ cookieKey, accessToken, refreshToken, user }) => {
            const sessionPayload = JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                token_type: "bearer",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user,
            });

            // PRIMARY: @supabase/ssr reads from document.cookie
            document.cookie = `${cookieKey}=${encodeURIComponent(sessionPayload)}; path=/; max-age=34560000; samesite=lax`;

            // FALLBACK: Also set in localStorage for any legacy reads
            const keys = [
                "sb-127.0.0.1-auth-token",
                "sb-127-auth-token",
                "sb-localhost-auth-token",
                "supabase.auth.token",
            ];
            for (const key of keys) {
                localStorage.setItem(key, sessionPayload);
            }

            // Dismiss all UI overlays that block test interactions
            localStorage.setItem("casagrown_alpha_ack", "true");
            localStorage.setItem("casagrown_tutorial_done", new Date().toISOString());
            // Skip RatingReminder for 1 year
            localStorage.setItem("rating_skip_until", new Date(Date.now() + 365 * 86400000).toISOString());
        },
        {
            cookieKey: COOKIE_KEY,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            user: session.user,
        },
    );
}

setup("authenticate as test seller", async ({ page }) => {
    setup.setTimeout(60_000);
    const session = await signInWithPassword(
        TEST_SELLER.email,
        TEST_SELLER.password,
    );

    await page.goto("/login", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });
    await page.waitForTimeout(1500);

    await injectSession(page, session);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(3000);

    await page.context().storageState({ path: sellerAuthFile });
});

setup("authenticate as test buyer", async ({ page }) => {
    setup.setTimeout(60_000);
    const session = await signInWithPassword(
        TEST_BUYER.email,
        TEST_BUYER.password,
    );

    await page.goto("/login", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });
    await page.waitForTimeout(1500);

    await injectSession(page, session);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(3000);

    await page.context().storageState({ path: buyerAuthFile });
});
