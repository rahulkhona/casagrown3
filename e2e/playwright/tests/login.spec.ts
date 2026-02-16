/**
 * Login Flow E2E Tests — validate that the login page works correctly.
 *
 * These tests use a fresh browser context (no stored auth state)
 * to test the actual login flow.
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
        await expect(
            page.locator("text=Continue with Email").first(),
        ).toBeVisible();
    });

    test("can sign in via OTP email flow", async ({ page }) => {
        await page.goto("/login");
        await page.waitForTimeout(3000);

        // Step 1: Click Continue with Email using role-based selector
        const emailBtn = page.getByRole("button", {
            name: /Continue with Email/i,
        });
        await emailBtn.waitFor({ timeout: 10_000 });
        await emailBtn.click();
        await page.waitForTimeout(2000);

        // Step 2: Enter seller email
        const emailInput = page.locator("[data-testid='email_input']")
            .or(page.locator("input[placeholder='you@example.com']"))
            .first();
        await emailInput.waitFor({ state: "visible", timeout: 10_000 });
        await emailInput.fill(TEST_SELLER.email);

        // Step 3: Send code
        await page.getByRole("button", { name: /Send Verification Code/i })
            .click();

        // Step 4: Wait for OTP to arrive and fetch from Inbucket
        await page.waitForTimeout(2000);
        const otp = await getOtpFromInbucket(TEST_SELLER.email);

        // Step 5: Enter OTP
        const otpInput = page.locator("[data-testid='otp_input']")
            .or(page.locator("input[placeholder*='code']"))
            .first();
        await otpInput.waitFor({ state: "visible", timeout: 5_000 });
        await otpInput.fill(otp);

        // Step 6: Verify
        await page.getByRole("button", { name: /Verify/i }).click();

        // Should navigate past login
        await page.waitForURL(/\/(feed|wizard|profile)/, { timeout: 15_000 });
    });

    test("shows error for invalid credentials", async ({ page }) => {
        await page.goto("/login");
        await page.waitForTimeout(3000);

        // Click Continue with Email using role-based selector
        const emailBtn = page.getByRole("button", {
            name: /Continue with Email/i,
        });
        await emailBtn.waitFor({ timeout: 10_000 });
        await emailBtn.click();
        await page.waitForTimeout(2000);

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
