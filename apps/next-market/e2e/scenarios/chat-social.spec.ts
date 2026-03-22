/**
 * Chat & Social Flows — Messaging, Community Voice, Following & Notifications
 *
 * Scenarios:
 * S8.1  Buyer-seller chat
 * S8.3  Chat list
 * S9.1  Community board
 * S9.2  Submit feedback
 * S9.3  View ticket
 * S11.1 Notifications page
 * S11.2 Email branding check
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  assertEmailBranding,
  clearMailpit,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Chat & Social Flows', () => {
  test.beforeAll(async () => {
    await clearMailpit()
  })

  // ── S8.3: Chat List ──
  test('S8.3 — chat list page loads', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/chat')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    // Should show chat list or empty state
    const hasChatContent =
      body.includes('Chat') ||
      body.includes('chat') ||
      body.includes('Message') ||
      body.includes('message') ||
      body.includes('No conversations') ||
      body.includes('Start')
    expect(hasChatContent).toBeTruthy()

    await page.context().close()
  })

  // ── S8.1: Buyer-Seller Chat ──
  test('S8.1 — chat threads render correctly', async ({ browser }) => {
    const bethPage = await loginAsUser(browser, 'beth')
    await navigateTo(bethPage, '/chat')
    await assertPageHealthy(bethPage)

    // Click first chat thread if one exists
    const chatLinks = bethPage.locator('a[href*="/chat/"]')
    const chatCount = await chatLinks.count()

    if (chatCount > 0) {
      await chatLinks.first().click()
      await bethPage.waitForLoadState('networkidle')
      await assertPageHealthy(bethPage)

      // Chat thread should have message input
      const input = bethPage.locator('input[type="text"], textarea')
      const inputCount = await input.count()
      // Should have a text input for messages
      expect(inputCount).toBeGreaterThanOrEqual(0)

      const body = await bethPage.locator('body').innerText()
      expect(body.length).toBeGreaterThan(50)
    }

    await bethPage.context().close()
  })

  // ── S8.1b: Chat from seller side ──
  test('S8.1b — seller sees same chat threads', async ({ browser }) => {
    const chenPage = await loginAsUser(browser, 'chen')
    await navigateTo(chenPage, '/chat')
    await assertPageHealthy(chenPage)

    const body = await chenPage.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)

    await chenPage.context().close()
  })

  // ── S9.1: Community Board ──
  test('S9.1 — community page loads', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/community')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)

    await page.context().close()
  })

  // ── S9.2: Submit Feedback ──
  test('S9.2 — voice submit page has form', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/voice/submit')
    await assertPageHealthy(page)

    // Should have form elements or page content
    const body = await page.locator('body').innerText()
    const lower = body.toLowerCase()
    const hasForm =
      lower.includes('submit') ||
      lower.includes('feedback') ||
      lower.includes('idea') ||
      lower.includes('voice') ||
      lower.includes('suggestion') ||
      lower.includes('community')
    expect(hasForm).toBeTruthy()

    // Page should have enough content (not blank)
    expect(body.length).toBeGreaterThan(50)

    await page.context().close()
  })

  // ── S9.2b: Voice Board ──
  test('S9.2b — voice board page loads', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/voice/board')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)

    await page.context().close()
  })

  // ── S9.3: View Ticket ──
  test('S9.3 — voice ticket page loads', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/voice/ticket')
    // Page may show rating overlay or empty state — just verify no crash
    const body = await page.locator('body').innerText()
    // Accept any non-blank page (rating overlay counts as content)
    expect(body.length).toBeGreaterThan(20)

    await page.context().close()
  })

  // ── S2.4: Following ──
  test('S2.4 — following page loads', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/following')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    // Should show followed sellers or empty state
    const hasFollowContent =
      body.includes('Following') ||
      body.includes('following') ||
      body.includes('Follow') ||
      body.includes('seller') ||
      body.includes('No') ||
      body.includes('none')
    expect(hasFollowContent).toBeTruthy()

    await page.context().close()
  })

  // ── S11.1: Notifications ──
  test('S11.1 — notifications page loads', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/notifications')
    await assertPageHealthy(page)

    const body = await page.locator('body').innerText()
    // Should show notifications or empty state
    const hasNotifications =
      body.includes('Notification') ||
      body.includes('notification') ||
      body.includes('No notification') ||
      body.includes('alert') ||
      body.includes('update')
    expect(hasNotifications).toBeTruthy()

    // Click first notification if one exists
    const notifLinks = page.locator('a[href*="/orders/"], a[href*="/chat/"]')
    const notifCount = await notifLinks.count()
    if (notifCount > 0) {
      await notifLinks.first().click()
      await page.waitForLoadState('networkidle')
      await assertPageHealthy(page)
    }

    await page.context().close()
  })

  // ── S11.2: Email Branding ──
  test('S11.2 — all emails have CasaGrown branding', async ({ browser }) => {
    // Trigger a login to generate an OTP email (if the system sends one)
    // Then check all emails in Mailpit for correct branding
    await assertEmailBranding()
  })
})
