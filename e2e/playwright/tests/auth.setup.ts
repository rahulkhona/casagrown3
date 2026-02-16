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
import { signInWithPassword, TEST_SELLER } from "../helpers/auth";

const authFile = "e2e/playwright/.auth/seller.json";

setup("authenticate as test seller", async ({ page }) => {
    // 1. Get a fresh JWT from Supabase directly
    const session = await signInWithPassword(
        TEST_SELLER.email,
        TEST_SELLER.password,
    );

    // 2. Navigate to the app (login page)
    await page.goto("/login");
    await page.waitForTimeout(2000);

    // 3. Inject the session into localStorage under ALL key patterns
    //    that the GoTrueClient might check, based on the Supabase URL hostname.
    //    On web, the app uses http://127.0.0.1:54321, so GoTrueClient derives
    //    the storage key from that hostname.
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

            // Try all possible key patterns the GoTrueClient might use
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

    // 4. Reload to pick up the session
    await page.reload();

    // 5. Wait for the app to recognize the session
    //    It should navigate away from login to feed, wizard, or profile
    try {
        await page.waitForURL(/\/(feed|wizard|profile)/, { timeout: 15_000 });
    } catch {
        // If still on login, log the current URL for debugging
        console.log(
            "Auth setup: could not auto-login. URL:",
            page.url(),
        );
    }

    // 6. Save the authenticated storage state
    await page.context().storageState({ path: authFile });
});
