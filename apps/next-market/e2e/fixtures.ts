import { test as base, expect, Page } from '@playwright/test'

/**
 * Extended Playwright test with auto-dismissal of the Alpha banner.
 * 
 * The AlphaBanner component renders a sticky amber bar at the top of every page.
 * It shifts all content down and its close button can interfere with locators
 * in E2E tests. This fixture automatically dismisses it after each navigation.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // After every page.goto, dismiss the alpha banner if visible
    const originalGoto = page.goto.bind(page)
    page.goto = async (url: string, options?: any) => {
      const result = await originalGoto(url, options)
      // Dismiss the alpha banner if it's present
      const banner = page.locator('[data-testid="alpha-banner-close"]')
      if (await banner.isVisible({ timeout: 1000 }).catch(() => false)) {
        await banner.click()
        await page.waitForTimeout(100)
      }
      return result
    }
    await use(page)
  },
})

export { expect }
export type { Page }
