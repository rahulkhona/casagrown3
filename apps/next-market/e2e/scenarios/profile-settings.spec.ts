/**
 * Profile, Settings & Onboarding Flows
 *
 * Scenarios:
 * S10.1  Profile page
 * S10.2  Settings
 * S10.3  Terms, Guide, Helping
 * S1.2   Onboarding & Get Started
 * S12.1  Auth guards (unauthenticated redirects)
 * S12.3  Persistence after reload
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  BASE_URL,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Profile, Settings & Onboarding', () => {
  // ── S10.1: Profile Page ──
  test('S10.1 — profile page shows user info', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/profile')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()

    // Should show user info
    const hasProfileContent =
      body.includes('Sam') ||
      body.includes('Seller') ||
      body.includes('seller@test') ||
      body.includes('Profile') ||
      body.includes('profile')
    expect(hasProfileContent).toBeTruthy()

    // No undefined fields
    expect(body).not.toContain('undefined')

    await page.context().close()
  })

  // ── S10.3: Terms, Guide, Helping ──
  test('S10.3 — terms page renders', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/terms')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(100)

    await page.context().close()
  })

  test('S10.3b — guide page renders', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/guide')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)

    await page.context().close()
  })

  test('S10.3c — helping page renders', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/helping')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)

    await page.context().close()
  })

  // ── S1.2: Onboarding ──
  test('S1.2 — get-started page loads for authenticated user', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/get-started')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)

    await page.context().close()
  })

  // ── S12.1: Auth Guards ──
  test('S12.1 — unauthenticated users redirected from protected pages', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    const protectedPaths = ['/orders', '/earnings', '/chat', '/my-booth', '/profile']

    for (const path of protectedPaths) {
      await test.step(`Unauthenticated → ${path}`, async () => {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)

        const url = page.url()
        const body = await page.locator('body').innerText()

        // Should either redirect to login or show "sign in" message
        const isGuarded =
          url.includes('/login') ||
          body.toLowerCase().includes('sign in') ||
          body.toLowerCase().includes('log in') ||
          body.toLowerCase().includes('login')
        expect(isGuarded).toBeTruthy()
      })
    }

    await context.close()
  })

  // ── S12.3: Persistence After Reload ──
  test('S12.3 — user stays authenticated after page reload', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')

    // Navigate to a protected page
    await navigateTo(page, '/earnings')
    await assertPageHealthy(page)
    const beforeBody = await page.locator('body').innerText()
    expect(beforeBody).toContain('Earnings')

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // Should still be on the same page, authenticated
    const afterBody = await page.locator('body').innerText()
    const stillAuthenticated =
      afterBody.includes('Earnings') ||
      afterBody.includes('Available') ||
      !afterBody.toLowerCase().includes('sign in')
    expect(stillAuthenticated).toBeTruthy()

    await page.context().close()
  })

  // ── S12.2: Logout ──
  test('logout page works', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/logout')
    await page.waitForTimeout(3000)

    // Should redirect to login or home after logout
    const url = page.url()
    const body = await page.locator('body').innerText()
    const isLoggedOut =
      url.includes('/login') ||
      url === `${BASE_URL}/` ||
      body.toLowerCase().includes('sign in') ||
      body.toLowerCase().includes('log in')
    expect(isLoggedOut).toBeTruthy()

    await page.context().close()
  })
})
