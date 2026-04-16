import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3004',
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    serviceWorkers: 'block'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:3004',
    reuseExistingServer: !process.env.CI,
  },
})
