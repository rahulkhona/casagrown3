/**
 * Auth-aware navigation helper for Playwright E2E tests.
 *
 * Many tests skip when page.url() contains "/login", which can happen
 * because Next.js SSR redirects to /login before the client-side auth
 * from localStorage kicks in. This helper navigates to a URL and waits
 * for auth redirect resolution before returning.
 */

import type { Page, TestInfo } from "@playwright/test";

/**
 * Navigate to a URL and wait for auth to resolve.
 *
 * After going to the target URL, if the page ends up on /login,
 * waits up to `authTimeout` ms for the client-side auth to read
 * localStorage and redirect away. Returns true if navigation
 * succeeded (not on /login), false otherwise.
 *
 * Usage:
 *   const ok = await gotoWithAuth(page, "/create-post");
 *   if (!ok) { test.skip(); return; }
 */
export async function gotoWithAuth(
    page: Page,
    path: string,
    opts?: { authTimeout?: number; waitAfter?: number },
): Promise<boolean> {
    const authTimeout = opts?.authTimeout ?? 10_000;
    const waitAfter = opts?.waitAfter ?? 2000;

    // Navigate with domcontentloaded (faster than waiting for full load)
    await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
    });

    // Give the app time to hydrate and pick up the auth token
    await page.waitForTimeout(waitAfter);

    // If we're on /login, wait for redirect away
    if (page.url().includes("/login")) {
        try {
            await page.waitForURL(
                (url) => !url.pathname.includes("/login"),
                { timeout: authTimeout },
            );
        } catch {
            // Auth redirect didn't happen — genuinely not authenticated
            return false;
        }
    }

    return true;
}
