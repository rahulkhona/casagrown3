/**
 * Admin auth setup for Playwright.
 *
 * Generates an ES256 service_role JWT at runtime (Supabase CLI now uses
 * JWKS-based asymmetric signing, not HS256), then uses it to create a
 * magic link for the admin user and exchange it for a session.
 */

import { test as setup } from "@playwright/test";
import * as crypto from "crypto";

const ADMIN_AUTH_FILE = "e2e/playwright/.auth/admin.json";
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const ADMIN_EMAIL = "seller@test.local";
const COOKIE_KEY = "sb-127-auth-token";

/** JWKS private key from the local Supabase GoTrue container (ES256/P-256) */
const GOTRUE_JWKS_KEY = {
    kty: "EC" as const,
    kid: "b81269f1-21d8-4f2e-b719-c2240a840d90",
    use: "sig" as const,
    key_ops: ["sign" as const, "verify" as const],
    alg: "ES256",
    ext: true,
    d: "dIhR8wywJlqlua4y_yMq2SLhlFXDZJBCvFrY1DCHyVU",
    crv: "P-256" as const,
    x: "M5Sjqn5zwC9Kl1zVfUUGvv9boQjCGd45G8sdopBExB4",
    y: "P6IXMvA2WYXSHSOMTBH2jsw_9rrzGy89FjPf6oOsIxQ",
};

async function generateServiceRoleJWT(): Promise<string> {
    const privateKey = await crypto.subtle.importKey(
        "jwk",
        GOTRUE_JWKS_KEY,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
    );

    const header = { alg: "ES256", kid: GOTRUE_JWKS_KEY.kid, typ: "JWT" };
    const payload = {
        iss: "supabase-demo",
        role: "service_role",
        exp: 1983812996,
        iat: Math.floor(Date.now() / 1000),
    };

    const enc = (obj: unknown) =>
        Buffer.from(JSON.stringify(obj)).toString("base64url");
    const data = `${enc(header)}.${enc(payload)}`;
    const sig = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        Buffer.from(data),
    );

    return `${data}.${Buffer.from(sig).toString("base64url")}`;
}

setup("authenticate as admin", async ({ page }) => {
    setup.setTimeout(60_000);

    const serviceRoleKey = await generateServiceRoleJWT();

    const linkRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/generate_link`,
        {
            method: "POST",
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
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

    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);

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

            document.cookie = `${cookieKey}=${encodeURIComponent(sessionPayload)}; path=/; max-age=34560000; samesite=lax`;

            const keys = [
                "sb-127.0.0.1-auth-token",
                "sb-127-auth-token",
                "sb-localhost-auth-token",
                "supabase.auth.token",
            ];
            for (const key of keys) {
                localStorage.setItem(key, sessionPayload);
            }

            localStorage.setItem("casagrown_alpha_ack", "true");
            localStorage.setItem("casagrown_tutorial_done", new Date().toISOString());
            localStorage.setItem("rating_skip_until", new Date(Date.now() + 365 * 86400000).toISOString());
        },
        {
            cookieKey: COOKIE_KEY,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            user: session.user,
        },
    );

    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(3000);

    await page.context().storageState({ path: ADMIN_AUTH_FILE });
});
