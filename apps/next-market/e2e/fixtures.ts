import { test as base, expect, Page } from '@playwright/test'

/**
 * Extended Playwright test with:
 * 1. Pre-JS auth token injection via addInitScript
 * 2. Auto-dismissal of the Alpha modal
 *
 * The @supabase/ssr createBrowserClient reads session from cookies/localStorage
 * during initialization. By the time page.evaluate() runs, the Supabase singleton
 * has already been created and getSession() has returned null.
 *
 * Fix: Use addInitScript to inject auth tokens into localStorage BEFORE any
 * page JavaScript executes. The bootstrap provider's localStorage fallback
 * (useBootstrap.tsx line 132-143) then picks up the session on first render.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject auth tokens before ANY page JavaScript runs.
    // This script executes in the browser context before the page loads,
    // ensuring localStorage has the auth token when React + Supabase initialize.
    await page.addInitScript(() => {
      try {
        // Read the token from storageState (Playwright restores this)
        const raw = localStorage.getItem('sb-127-auth-token')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.access_token) {
            // Set the legacy key that useBootstrap's fallback reads
            localStorage.setItem('supabase.auth.token', JSON.stringify({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
              user: parsed.user,
            }))
          }
        }
        // Dismiss alpha modal
        localStorage.setItem('casagrown_alpha_ack', 'true')
      } catch {}
    })

    // Override goto to handle alpha modal dismissal
    const originalGoto = page.goto.bind(page)
    page.goto = async (url: string, options?: any) => {
      const result = await originalGoto(url, { waitUntil: 'domcontentloaded', ...options })

      // Wait for React hydration
      await page.waitForTimeout(2000)

      // If the alpha modal is showing, dismiss it
      const btn = page.locator('[data-testid="alpha-banner-close"]')
      try {
        if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
          await btn.click({ force: true, timeout: 2000 })
          await page.waitForTimeout(200)
        }
      } catch {
        await page.evaluate(() => {
          try {
            localStorage.setItem('casagrown_alpha_ack', 'true')
            const overlay = document.querySelector('[class*="AlphaBanner"]')
            if (overlay) (overlay as HTMLElement).style.display = 'none'
          } catch {}
        })
      }
      return result
    }
    await use(page)
  },
})

export { expect }
export type { Page }

