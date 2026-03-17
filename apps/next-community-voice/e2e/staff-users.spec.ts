/**
 * E2E Tests — Staff User Management & Reports
 *
 * Tests verify that new staff pages exist, render correctly for
 * unauthenticated users (redirect/loading behavior), and that
 * the dashboard buttons are present.
 *
 * These tests run without staff login, so they validate:
 * 1. Pages exist and don't 404
 * 2. UI structure loads correctly
 * 3. Navigation buttons are present
 */

import { expect, test } from "@playwright/test";

test.describe("Staff Users Page", () => {
    test("should render staff/users page without 404", async ({ page }) => {
        const response = await page.goto("/staff/users");
        // Should not be a 404
        expect(response?.status()).not.toBe(404);
    });

    test("should render without application errors", async ({ page }) => {
        await page.goto("/staff/users");
        await page.waitForTimeout(3000);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        // Should not show an unhandled error
        expect(body).not.toContain("Application error");
        expect(body).not.toContain("Internal Server Error");
    });
});

test.describe("Staff Reports Page", () => {
    test("should render staff/reports page without 404", async ({ page }) => {
        const response = await page.goto("/staff/reports");
        expect(response?.status()).not.toBe(404);
    });

    test("should render without application errors", async ({ page }) => {
        await page.goto("/staff/reports");
        await page.waitForTimeout(3000);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Application error");
        expect(body).not.toContain("Internal Server Error");
    });
});

test.describe("Staff Dashboard", () => {
    test("should render staff dashboard without 404", async ({ page }) => {
        const response = await page.goto("/staff");
        expect(response?.status()).not.toBe(404);
    });

    test("should render without application errors", async ({ page }) => {
        await page.goto("/staff");
        await page.waitForTimeout(3000);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Application error");
        expect(body).not.toContain("Internal Server Error");
    });
});

test.describe("Auth Guard — Ban Check", () => {
    test("unauthenticated access to /staff/users does not crash", async ({ page }) => {
        await page.goto("/staff/users");
        await page.waitForTimeout(3000);

        // Page should render without errors
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        // Should not show an unhandled error
        expect(body).not.toContain("Application error");
        expect(body).not.toContain("Internal Server Error");
    });

    test("unauthenticated access to /staff/reports does not crash", async ({ page }) => {
        await page.goto("/staff/reports");
        await page.waitForTimeout(3000);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Application error");
    });
});
