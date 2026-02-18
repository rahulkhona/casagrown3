import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for CasaGrown web app.
 * Runs against the local Next.js dev server on port 3000.
 */
export default defineConfig({
    testDir: "./tests",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",
    timeout: 30_000,

    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },

    projects: [
        // Auth setup — runs once to create signed-in storage states
        { name: "setup", testMatch: /.*\.setup\.ts/ },
        {
            name: "seller",
            use: {
                ...devices["Desktop Chrome"],
                storageState: "e2e/playwright/.auth/seller.json",
            },
            dependencies: ["setup"],
        },
        {
            name: "buyer",
            use: {
                ...devices["Desktop Chrome"],
                storageState: "e2e/playwright/.auth/buyer.json",
            },
            dependencies: ["setup"],
        },
    ],
    // NOTE: Start the dev server separately before running tests.
    // In local dev: `yarn web` is typically already running.
    // In CI: start it before the Playwright step.
    // webServer: {
    //     command: "yarn web",
    //     url: "http://localhost:3000",
    //     reuseExistingServer: true,
    //     timeout: 120_000,
    // },
});
