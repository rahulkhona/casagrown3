/**
 * Auth Setup — runs once before all tests.
 *
 * Signs in the test seller via Supabase password auth by:
 *   1. Getting a fresh JWT from the Supabase REST API
 *   2. Injecting the session into localStorage under all possible key formats
 *   3. Reloading the page to let the app pick up the session
 *   4. Saving the authenticated storage state for reuse
 *
 * The resulting storage state is saved to `.auth/seller.json` and reused
 * by all test files in the "chromium" project.
 */

import { expect, test as setup } from "@playwright/test";
import { signInWithPassword, TEST_BUYER, TEST_SELLER } from "../helpers/auth";

const sellerAuthFile = "e2e/playwright/.auth/seller.json";
const buyerAuthFile = "e2e/playwright/.auth/buyer.json";

async function injectSession(
    page: import("@playwright/test").Page,
    session: {
        access_token: string;
        refresh_token: string;
        user: { id: string; email: string };
    },
) {
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
}

setup("authenticate as test seller", async ({ page }) => {
    const session = await signInWithPassword(
        TEST_SELLER.email,
        TEST_SELLER.password,
    );

    await page.goto("/login");
    await page.waitForTimeout(2000);
    await injectSession(page, session);
    await page.reload();

    try {
        await page.waitForURL(/\/(feed|wizard|profile)/, { timeout: 15_000 });
    } catch {
        console.log(
            "Auth setup: could not auto-login seller. URL:",
            page.url(),
        );
    }

    await page.context().storageState({ path: sellerAuthFile });
});

setup("authenticate as test buyer", async ({ page }) => {
    const session = await signInWithPassword(
        TEST_BUYER.email,
        TEST_BUYER.password,
    );

    await page.goto("/login");
    await page.waitForTimeout(2000);
    await injectSession(page, session);
    await page.reload();

    try {
        await page.waitForURL(/\/(feed|wizard|profile)/, { timeout: 15_000 });
    } catch {
        console.log(
            "Auth setup: could not auto-login buyer. URL:",
            page.url(),
        );
    }

    await page.context().storageState({ path: buyerAuthFile });
});
