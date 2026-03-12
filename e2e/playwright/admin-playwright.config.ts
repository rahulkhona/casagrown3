import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for CasaGrown Admin Dashboard.
 * Runs against the local admin Next.js dev server on port 3003.
 */
export default defineConfig({
    testDir: "./tests",
    testMatch: /admin-.*\.spec\.ts$/,
    fullyParallel: false, // Admin tests mutate shared state — run sequentially
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: "html",
    timeout: 45_000,

    use: {
        baseURL: "http://localhost:3003",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },

    projects: [
        {
            name: "admin-setup",
            testMatch: /admin\.setup\.ts$/,
        },
        {
            name: "admin",
            use: {
                ...devices["Desktop Chrome"],
                storageState: "e2e/playwright/.auth/admin.json",
            },
            dependencies: ["admin-setup"],
        },
    ],
});
