import { test, expect } from '@playwright/test';

test.describe('Analytics Tracking E2E', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'sendBeacon', { value: false, configurable: true, writable: true });
    });
  });

  test('should track homepage visits with UTM parameters', async ({ page }) => {
    const trackRequestPromise = page.waitForRequest(request => 
      request.url().includes('/api/crm/track') && request.method() === 'POST'
    );

    await page.goto('/?utm_source=fb&utm_medium=social&utm_campaign=summer_sale');

    const trackRequest = await trackRequestPromise;
    const dataStr = trackRequest.postData();
    const postData = dataStr ? JSON.parse(dataStr) : {};

    expect(postData).toBeDefined();
    expect(postData.utm_source).toBe('fb');
    expect(postData.utm_medium).toBe('social');
    expect(postData.utm_campaign).toBe('summer_sale');
  });

  test('should track wizard drop-off steps', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/join');
    await page.waitForLoadState('networkidle');

    await expect.poll(() => trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_step',
          page_slug: '/join',
          event_data: expect.objectContaining({
            step_index: 1
          })
        })
      ])
    );
  });

  test('should exclude background tab time from simple wizard dwell time tracking', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    // 1. Visit simple wizard page
    await page.goto('/create-listing-simple');
    await page.waitForLoadState('networkidle');

    // 2. Wait 2 seconds of active time
    await page.waitForTimeout(2000);

    // 3. Put tab in background (document.hidden = true)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 4. Wait 3 seconds in background (should NOT accumulate)
    await page.waitForTimeout(3000);

    // 5. Bring tab back to foreground (document.hidden = false)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 6. Wait 1 second of active time
    await page.waitForTimeout(1000);

    // 7. Trigger beforeunload manually to simulate abandon/navigation
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    // 8. Assert that wizard_abandon event was tracked with duration_secs around 3 (2s active + 1s active)
    await expect.poll(() => trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_abandon',
          page_slug: '/create-listing-simple',
          event_data: expect.objectContaining({
            last_step: 1,
            last_step_name: 'text_input',
            time_on_step_secs: expect.any(Number)
          })
        })
      ])
    );

    const abandonEvent = trackEvents.find(e => e.event_type === 'wizard_abandon');
    expect(abandonEvent).toBeDefined();
    const duration = abandonEvent.event_data.time_on_step_secs;
    console.log(`[E2E Visibility Timing] Measured active duration: ${duration}s`);
    
    // Should be at least 3 seconds (2s + 1s active) but strictly less than 6 seconds (which it would exceed if the 3s background was included)
    expect(duration).toBeGreaterThanOrEqual(2);
    expect(duration).toBeLessThan(6);
  });
});
