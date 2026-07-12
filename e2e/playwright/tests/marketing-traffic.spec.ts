import { test, expect } from '@playwright/test';
import { signInWithPassword, TEST_SELLER } from '../helpers/auth';

const METRICS_URL = 'http://localhost:3004';
const COOKIE_KEY = 'sb-127-auth-token';

test.describe('Marketing Traffic & Conversion Analysis Portal', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Get a valid session for the staff user using Supabase email/password signin
    const session = await signInWithPassword(TEST_SELLER.email, TEST_SELLER.password);

    // 2. Go to the login page first so the browser has localhost:3004 context
    await page.goto(`${METRICS_URL}/login`);
    await page.waitForTimeout(1000);

    // 3. Inject the session payload into document cookie and localStorage
    await page.evaluate(
      ({ cookieKey, accessToken, refreshToken, user }) => {
        const sessionPayload = JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        });

        // Write cookie
        document.cookie = `${cookieKey}=${encodeURIComponent(sessionPayload)}; path=/; max-age=34560000; samesite=lax`;

        // Write localStorage keys
        const keys = [
          'sb-127.0.0.1-auth-token',
          'sb-127-auth-token',
          'sb-localhost-auth-token',
          'supabase.auth.token',
        ];
        for (const key of keys) {
          localStorage.setItem(key, sessionPayload);
        }
      },
      {
        cookieKey: COOKIE_KEY,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
      }
    );

    // 4. Navigate directly to the traffic dashboard
    await page.goto(`${METRICS_URL}/marketing/traffic`);
    await page.waitForTimeout(2000);
  });

  test('should display overview cards and active wizard filter', async ({ page }) => {
    // Check that header is visible
    await expect(page.locator('h1.page-title')).toContainText('Traffic & Conversion Analysis');

    // Check that executive summary cards render metrics
    await expect(page.locator('.metric-card').first()).toContainText('Wizard Funnel Stats');
    await expect(page.locator('.metric-card').nth(1)).toContainText('Wizard Drop-offs');
    await expect(page.locator('.metric-card').nth(2)).toContainText('Leads to Account Conversion');
  });

  test('should render cohort heatmaps with tabs and display drop-off metrics', async ({ page }) => {
    // Assert heatmap section title exists
    await expect(page.locator('.section-title', { hasText: /Cohort Heatmaps/i })).toBeVisible();

    // Verify default active tab is Leads
    const leadsTab = page.locator('.tab-btn.active', { hasText: 'Leads' });
    await expect(leadsTab).toBeVisible();

    // Select Listing Wizard Drop-offs tab
    const dropOffTab = page.locator('.tab-btn', { hasText: 'Listing Wizard Drop-offs' });
    await dropOffTab.click();

    // Check that the tab becomes active
    await expect(page.locator('.tab-btn.active', { hasText: 'Listing Wizard Drop-offs' })).toBeVisible();

    // Verify cell dimensions adjust for the counts and step details
    const cells = page.locator('.heatmap-table tbody td');
    const firstCell = cells.first();
    await expect(firstCell).toBeVisible();
  });

  test('should display 1D weekday and hourly break down tables', async ({ page }) => {
    // Day of the Week Analysis title
    await expect(page.locator('.section-title', { hasText: /Day of the Week Analysis/i })).toBeVisible();

    // Hourly Breakdown title
    await expect(page.locator('.section-title', { hasText: /Local Timezone Hourly Analysis/i })).toBeVisible();

    // Check table headers
    await expect(page.locator('th', { hasText: 'Starts' }).first()).toBeVisible();
    await expect(page.locator('th', { hasText: 'Same Session (<15m)' }).first()).toBeVisible();
  });

  test('should trigger AI conversion summary and generate report', async ({ page }) => {
    // Verify summarizing button exists
    const aiButton = page.locator('.btn-primary', { hasText: /Ask AI to Summarize/i });
    await expect(aiButton).toBeVisible();

    // Click to generate summary
    await aiButton.click();

    // Assert that the analyzer message/spinner appears or summary section populates
    await page.waitForTimeout(3000);
    
    // The summary container should render when loaded
    const summaryCard = page.locator('.ai-summary-card');
    await expect(summaryCard).toBeVisible();
  });

});
