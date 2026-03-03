/**
 * Login Flow E2E Tests — validate that the login page works correctly.
 *
 * These tests use a fresh browser context (no stored auth state)
 * to test the actual login flow.
 *
 * After social logins were removed, the login screen shows email input
 * and "Send Verification Code" directly (no "Continue with Email" step).
 */

import { expect, test } from "@playwright/test";
import { getOtpFromInbucket, TEST_SELLER } from "../helpers/auth";

// Override storage state — use a fresh context for login tests
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login Flow", () => {
    test("shows login page when not authenticated", async ({ page }) => {
        await page.goto("/feed");
        // Should redirect to login
        await page.waitForURL(/\/login/, { timeout: 10_000 });
        // The email input should be directly visible (no social login step)
        await expect(
            page.locator("[data-testid='email_input']")
                .or(page.locator("input[placeholder='you@example.com']"))
                .first(),
        ).toBeVisible({ timeout: 10_000 });
    });

    test("can sign in via OTP email flow", async ({ page }) => {
        await page.goto("/login");
        await page.waitForTimeout(3000);

        // Step 1: Enter seller email directly (no "Continue with Email" step)
        const emailInput = page.locator("[data-testid='email_input']")
            .or(page.locator("input[placeholder='you@example.com']"))
            .first();
        await emailInput.waitFor({ state: "visible", timeout: 10_000 });
        await emailInput.fill(TEST_SELLER.email);

        // Step 2: Send code
        await page.getByRole("button", { name: /Send Verification Code/i })
            .click();

        // Step 3: Wait for OTP to arrive and fetch from Inbucket
        await page.waitForTimeout(2000);
        const otp = await getOtpFromInbucket(TEST_SELLER.email);

        // Step 4: Enter OTP
        const otpInput = page.locator("[data-testid='otp_input']")
            .or(page.locator("input[placeholder*='code']"))
            .first();
        await otpInput.waitFor({ state: "visible", timeout: 5_000 });
        await otpInput.fill(otp);

        // Step 5: Verify
        await page.getByRole("button", { name: /Verify/i }).click();

        // Should navigate past login
        await page.waitForURL(/\/(feed|wizard|profile)/, { timeout: 15_000 });
    });

    test("shows error for invalid credentials", async ({ page }) => {
        await page.goto("/login");
        await page.waitForTimeout(3000);

        // Enter email directly (no "Continue with Email" step)
        const emailInput = page.locator("[data-testid='email_input']")
            .or(page.locator("input[placeholder='you@example.com']"))
            .first();
        await emailInput.waitFor({ state: "visible", timeout: 10_000 });
        await emailInput.fill("nonexistent@example.com");

        await page.getByRole("button", { name: /Send Verification Code/i })
            .click();

        // Wait for the code screen, then enter wrong code
        await page.waitForTimeout(2000);
        const otpInput = page.locator("[data-testid='otp_input']")
            .or(page.locator("input[placeholder*='code']"))
            .first();
        await otpInput.waitFor({ state: "visible", timeout: 5_000 });
        await otpInput.fill("000000");

        await page.getByRole("button", { name: /Verify/i }).click();

        // Should show error or still be on login page
        await page.waitForTimeout(3000);
        expect(page.url()).toContain("login");
    });
});
