import { test, expect } from '@playwright/test';

test.describe('Quarantine Bot Health Dashboard', () => {
  test('should display orange schema drift banner when bot is degraded', async ({ page }) => {
    // Intercept the admin API call that fetches quarantine_bot_health
    await page.route('**/api/admin', async (route, request) => {
      const postData = request.postDataJSON();

      // Only intercept the quarantine_bot_health select — let all other requests pass through
      if (postData?.table === 'quarantine_bot_health') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [{
              id: 'mock-uuid',
              run_started_at: new Date().toISOString(),
              run_ended_at: new Date().toISOString(),
              status: 'DEGRADED',
              schema_drift_detected: true,
              total_records: 42
            }],
            error: null
          })
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to quarantine zones page (auth is handled by auth.setup.ts)
    await page.goto('/quarantine-zones');
    await page.waitForTimeout(5000);

    // Verify the banner text
    const bannerTitle = page.locator('text=WARNING');
    await expect(bannerTitle).toBeVisible({ timeout: 15_000 });
  });
});
