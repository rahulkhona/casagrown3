import { test as base, expect, Page } from '@playwright/test'

/**
 * Extended Playwright test with auto-dismissal of the Alpha modal.
 * 
 * The AlphaBanner component shows a modal on first visit requiring explicit
 * acknowledgment. After that, it shows a small non-blocking badge.
 * This fixture sets localStorage to bypass the modal so tests aren't blocked.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // After every page.goto, dismiss the alpha modal if visible
    const originalGoto = page.goto.bind(page)
    page.goto = async (url: string, options?: any) => {
      const result = await originalGoto(url, options)
      // Set localStorage to skip the alpha modal on all future navigations
      await page.evaluate(() => {
        try { localStorage.setItem('casagrown_alpha_ack', 'true') } catch {}
      })
      // If the modal is already showing, click through it
      const btn = page.locator('[data-testid="alpha-banner-close"]')
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(100)
      }
      return result
    }
    await use(page)
  },
})

export { expect }
export type { Page }
