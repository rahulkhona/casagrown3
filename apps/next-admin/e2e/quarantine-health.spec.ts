import { test, expect } from '@playwright/test';

test.describe('Quarantine Bot Health Dashboard', () => {
  test('should display orange schema drift banner when bot is degraded', async ({ page }) => {
    // Intercept ALL fetch requests to Supabase REST API that query quarantine_bot_health
    await page.route('**/*', async (route, request) => {
      const url = request.url();

      // Match Supabase REST queries for quarantine_bot_health
      if (url.includes('quarantine_bot_health') || url.includes('quarantine-bot-health')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'mock-uuid',
            run_started_at: new Date().toISOString(),
            run_ended_at: new Date().toISOString(),
            status: 'DEGRADED',
            schema_drift_detected: true,
            total_records: 42,
            error_log: {
              'CDFA_APHIS': {
                status: 'DEGRADED',
                records_fetched: 12,
                errors: [],
                warnings: ['Schema field ORGANISM not found'],
                schema_issues: [{ message: 'Field mapping changed' }]
              }
            }
          }]),
        });
        return;
      }

      // Also intercept internal admin API proxy calls
      if (url.includes('/api/admin') && request.method() === 'POST') {
        try {
          const postData = request.postDataJSON();
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
                  total_records: 42,
                  error_log: {
                    'CDFA_APHIS': {
                      status: 'DEGRADED',
                      records_fetched: 12,
                      errors: [],
                      warnings: ['Schema field ORGANISM not found'],
                      schema_issues: [{ message: 'Field mapping changed' }]
                    }
                  }
                }],
                error: null
              }),
            });
            return;
          }
        } catch {
          // Not JSON POST — let it through
        }
      }

      await route.continue();
    });

    // Navigate to quarantine zones page (auth is handled by auth.setup.ts)
    await page.goto('/quarantine-zones');
    await page.waitForLoadState('networkidle');

    // Verify the banner text — the page shows "⚠️ WARNING: Quarantine Bot Schema Drift Detected"
    const bannerTitle = page.locator('text=WARNING').first();
    await expect(bannerTitle).toBeVisible({ timeout: 15_000 });
  });
});
