import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for CasaGrown web + admin apps.
 *
 * Community app tests (seller/buyer): http://localhost:3000
 * Admin app tests (admin-*):          http://localhost:3003
 */
export default defineConfig({
    testDir: "./tests",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1,
    workers: process.env.CI ? 1 : 3,
    reporter: "html",
    timeout: 60_000,

    use: {
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        navigationTimeout: 45_000,
    },

    projects: [
        // ── Community app auth setup (port 3000) ──
        {
            name: "setup",
            testMatch: /auth\.setup\.ts/,
            use: { baseURL: "http://localhost:3000" },
        },
        {
            name: "seller",
            testIgnore: /admin-.*\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                baseURL: "http://localhost:3000",
                storageState: "e2e/playwright/.auth/seller.json",
            },
            dependencies: ["setup"],
        },
        {
            name: "buyer",
            testIgnore: /admin-.*\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                baseURL: "http://localhost:3000",
                storageState: "e2e/playwright/.auth/buyer.json",
            },
            dependencies: ["setup"],
        },

        // ── Admin app auth setup (port 3003) ──
        {
            name: "admin-setup",
            testMatch: /admin\.setup\.ts/,
            use: { baseURL: "http://localhost:3003" },
        },
        {
            name: "admin",
            testMatch: /admin-.*\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                baseURL: "http://localhost:3003",
                storageState: "e2e/playwright/.auth/admin.json",
            },
            dependencies: ["admin-setup"],
        },
    ],
});
