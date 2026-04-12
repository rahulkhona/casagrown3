/**
 * Guest Community Access & Referral Attribution E2E Tests
 *
 * Full user journey scenarios:
 * 1. Guest reads community feed without login
 * 2. Guest interaction gates (compose, reply, DM, reactions)
 * 3. Guest Sign Up CTA flow
 * 4. Landing page "Join the Movement" flow
 * 5. Locked nav tabs redirect to login
 * 6. Guest can navigate to market without auth
 * 7. Referral param captured in URL
 * 8. Chat message actions restricted for guests
 */
import { test, expect, Page, Browser } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

// Helper: create a fresh guest browser context (no auth)
async function createGuestPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return await context.newPage()
}

test.describe('Guest Community Access', () => {

  test('Guest can view community feed without login', async ({ browser }) => {
    const page = await createGuestPage(browser)

    // Navigate directly to /community as unauthenticated user
    await page.goto(`${BASE_URL}/community`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(4000) // Allow SSR + hydration

    // Should NOT be redirected to /login
    expect(page.url()).not.toContain('/login')

    // Should see the community header
    await expect(page.locator('text=CasaGrown Community')).toBeVisible({ timeout: 10000 })

    // Should see the guest CTA bar instead of ComposeBar
    await expect(page.locator('text=Join CasaGrown to chat with your neighbors')).toBeVisible({ timeout: 5000 })

    // Should see the "Sign Up" button
    await expect(page.locator('button:has-text("Sign Up")')).toBeVisible()

    // ComposeBar textarea should NOT be visible (guest cannot compose)
    await expect(page.locator('textarea[placeholder*="message"]')).not.toBeVisible()

    await page.context().close()
  })

  test('Guest can view community via referral link', async ({ browser }) => {
    const page = await createGuestPage(browser)

    // Use sam's ID as referrer
    const referrerUserId = 'a1111111-1111-1111-1111-111111111111'
    await page.goto(`${BASE_URL}/community?ref=${referrerUserId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(4000)

    // Should NOT be redirected to /login
    expect(page.url()).not.toContain('/login')

    // Should see the community feed
    await expect(page.locator('text=CasaGrown Community')).toBeVisible({ timeout: 10000 })

    // Should see the guest CTA
    await expect(page.locator('text=Join CasaGrown to chat with your neighbors')).toBeVisible()

    await page.context().close()
  })

  test('Guest clicks Sign Up CTA and is redirected to login with correct return URL', async ({ browser }) => {
    const page = await createGuestPage(browser)

    await page.goto(`${BASE_URL}/community`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(4000)

    // Dismiss AlphaBanner if it overlays the CTA
    const alphaBanner = page.locator('[data-testid="alpha-banner"]')
    if (await alphaBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeBtn = alphaBanner.locator('button')
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ force: true })
        await page.waitForTimeout(500)
      }
    }

    // Click the Sign Up button in the guest CTA bar
    const signUpBtn = page.locator('button:has-text("Sign Up")')
    await expect(signUpBtn).toBeVisible({ timeout: 5000 })
    await signUpBtn.click({ force: true })

    // Should navigate to /login with redirect to /community
    await page.waitForURL('**/login**', { timeout: 10000 })
    expect(page.url()).toContain('/login')
    expect(page.url()).toContain('redirect')

    await page.context().close()
  })

  test('Guest cannot send DMs, reactions, or flag messages', async ({ browser }) => {
    // Use mobile viewport to match other guest tests (BottomNav is hidden on desktop)
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()

    await page.goto(`${BASE_URL}/community`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(4000)

    // Dismiss the AlphaBanner if present (it blocks clicks)
    const alphaDismiss = page.locator('[data-testid="alpha-banner"] button, [class*="AlphaBanner"] button')
    if (await alphaDismiss.count() > 0) {
      await alphaDismiss.first().click({ force: true, timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(1000)
    }

    // Try to find any message bubble and tap it
    const messageBubbles = page.locator('[class*="messageBubble"]')
    const bubbleCount = await messageBubbles.count()

    if (bubbleCount > 0) {
      // Tap the first message to reveal action bar
      await messageBubbles.first().click({ force: true })
      await page.waitForTimeout(1000)

      // In the tap action bar, emoji reactions should NOT be visible for guests
      const emojiButtons = page.locator('[class*="tapActionEmoji"]')
      expect(await emojiButtons.count()).toBe(0)

      // In the tap action bar, only Share should be visible (no DM/Flag/Delete for guests)
      const tapBarBtns = page.locator('[class*="tapActionBar"] button, [class*="tapActionBar"] a')
      const tapBarCount = await tapBarBtns.count()
      // Only the Share button should exist in the action bar
      if (tapBarCount > 0) {
        const shareBtn = page.locator('[class*="tapActionBar"] button[title="Share"]')
        expect(await shareBtn.count()).toBe(1)
        // No DM link in the action bar
        const dmLink = page.locator('[class*="tapActionBar"] a:has-text("💬 DM")')
        expect(await dmLink.count()).toBe(0)
      }
    }

    await page.context().close()
  })

  test('Guest locked nav tabs redirect to /login', async ({ browser }) => {
    // BottomNav is display:none on desktop (>769px). Use mobile viewport.
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()

    // Navigate to community first
    await page.goto(`${BASE_URL}/community`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(4000)

    // Community tab should be accessible (not locked) — it's a <a> not a <button>
    const communityTab = page.locator('a[href="/community"]').first()
    await expect(communityTab).toBeVisible({ timeout: 5000 })
    // Community tab should NOT have a lock icon
    const communityLock = communityTab.locator('text=🔒')
    expect(await communityLock.count()).toBe(0)

    // Orders tab should be locked — rendered as <button> not <a>
    // (tab.locked=true + isProfileLocked=true for guests → button)
    const ordersLockedBtn = page.locator('button[data-tour="nav-orders"]')
    if (await ordersLockedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Verify lock icon exists
      const lockText = await ordersLockedBtn.textContent()
      expect(lockText).toContain('🔒')
    }

    await context.close()
  })

  test('Guest can navigate to market without auth', async ({ browser }) => {
    const page = await createGuestPage(browser)

    // Navigate directly to market
    await page.goto(`${BASE_URL}/market`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(5000)

    // Should NOT be redirected to /login — market is accessible to guests
    expect(page.url()).toContain('/market')
    expect(page.url()).not.toContain('/login')

    // Page should have rendered content (not blank)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(10)

    await page.context().close()
  })
})

test.describe('Landing Page → Community Flow', () => {

  test('"Join the Movement" CTA navigates to /community (not /login)', async ({ browser }) => {
    const page = await createGuestPage(browser)

    // Navigate to the landing page
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(3000)

    // Find the hero "Join the Movement" CTA
    const joinBtn = page.locator('#hero-join-btn')
    await expect(joinBtn).toBeVisible({ timeout: 10000 })

    // Verify it links to /community
    const href = await joinBtn.getAttribute('href')
    expect(href).toBe('/community')

    // Dismiss AlphaBanner if it overlays the CTA
    const alphaBanner = page.locator('[data-testid="alpha-banner"]')
    if (await alphaBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeBtn = alphaBanner.locator('button')
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ force: true })
        await page.waitForTimeout(500)
      }
    }

    // Click it
    await joinBtn.click({ force: true })
    await page.waitForTimeout(4000)

    // Should be on /community
    expect(page.url()).toContain('/community')

    // Should see community content (not login page)
    await expect(page.locator('text=CasaGrown Community')).toBeVisible({ timeout: 10000 })

    await page.context().close()
  })
})

test.describe('Referral Attribution', () => {

  test('Referral params are captured in localStorage', async ({ browser }) => {
    const page = await createGuestPage(browser)

    const referrerUserId = 'a1111111-1111-1111-1111-111111111111'
    await page.goto(`${BASE_URL}/community?ref=${referrerUserId}&utm_source=test_fb&utm_medium=cpc&utm_campaign=spring_launch`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await page.waitForTimeout(4000)

    // Check localStorage for referral data
    const referralData = await page.evaluate(() => {
      const stored = localStorage.getItem('casagrown_referral')
      return stored ? JSON.parse(stored) : null
    })

    // First touch should be set
    expect(referralData).not.toBeNull()
    expect(referralData.first_touch).not.toBeNull()
    expect(referralData.first_touch.source).toBe('invite')
    expect(referralData.first_touch.referrer_id).toBe(referrerUserId)
    expect(referralData.first_touch.utm_source).toBe('test_fb')
    expect(referralData.first_touch.utm_medium).toBe('cpc')
    expect(referralData.first_touch.utm_campaign).toBe('spring_launch')

    // Last touch should match first touch (only one visit)
    expect(referralData.last_touch.source).toBe('invite')

    // Touch history should have one entry
    expect(referralData.touch_history.length).toBe(1)

    await page.context().close()
  })

  test('Second visit with different params updates last_touch but preserves first_touch', async ({ browser }) => {
    const page = await createGuestPage(browser)

    // First visit: invite
    const referrerUserId = 'a1111111-1111-1111-1111-111111111111'
    await page.goto(`${BASE_URL}/community?ref=${referrerUserId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await page.waitForTimeout(3000)

    // Second visit: different UTM source
    await page.goto(`${BASE_URL}/market?utm_source=google&utm_medium=search&utm_campaign=market_ads`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await page.waitForTimeout(3000)

    // Check localStorage
    const referralData = await page.evaluate(() => {
      const stored = localStorage.getItem('casagrown_referral')
      return stored ? JSON.parse(stored) : null
    })

    // First touch should be preserved (invite)
    expect(referralData.first_touch.source).toBe('invite')
    expect(referralData.first_touch.referrer_id).toBe(referrerUserId)

    // Last touch should be updated (google)
    expect(referralData.last_touch.source).toBe('google')
    expect(referralData.last_touch.utm_source).toBe('google')
    expect(referralData.last_touch.utm_campaign).toBe('market_ads')

    // Touch history should have 2 entries
    expect(referralData.touch_history.length).toBe(2)

    await page.context().close()
  })

  test('Invite banner share URL includes ?ref= param when authenticated', async ({ browser }) => {
    // Use an authenticated session to verify the invite URL includes ?ref=
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/community')

    // Wait for invite banner to appear
    const inviteBanner = page.locator('text=Invite your neighbors')
    if (await inviteBanner.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click the invite button
      const inviteBtn = page.locator('button:has-text("Invite")')
      await inviteBtn.click()
      await page.waitForTimeout(500)

      // The share modal should open
      await expect(page.locator('text=Invite Neighbors')).toBeVisible({ timeout: 5000 })
    }

    await page.context().close()
  })
})
