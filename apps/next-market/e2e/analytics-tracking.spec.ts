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
});
