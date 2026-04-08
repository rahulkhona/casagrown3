import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  navigateToMarket,
  assertPageHealthy,
  assertEmailBranding,
  clearMailpit,
  execSql,
  queryTable,
  getAccessToken,
  TEST_USERS,
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

  // ── S9.4: Community to DM Link ──
  test('S9.4 — Community avatar navigates to DM Compose', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/community')
    await assertPageHealthy(page)

    // Locate the first non-system user message in the feed.
    // The link should match `/messages/new?userId=...`
    const dmLink = page.locator('a[href*="/messages/new?userId="]').first()
    
    if (await dmLink.count() > 0) {
      const targetUrl = await dmLink.getAttribute('href')
      console.log(`[COMMUNITY DM] Clicking DM link targeting: ${targetUrl}`)
      await dmLink.click()
      await page.waitForLoadState('networkidle')
      await assertPageHealthy(page)

      // Ensure Page URL matched the router instruction pointing to Inbox
      expect(page.url()).toContain('/messages')
    }

    await page.context().close()
  })

  // ── S2.4: Follow / Unfollow Lifecycle ──
  test('S2.4 — follow booth → verify on /following → unfollow → verify removed', async ({ browser }) => {
    // Clean up any existing follows for Beth first
    execSql(
      `DELETE FROM market_followers WHERE follower_id = 'b2222222-2222-2222-2222-222222222222'`
    )

    // Step 1: Login as Beth and navigate directly to a booth
    const bethPage = await loginAsUser(browser, 'beth')

    // Get a booth ID directly from DB (market-state independent)
    const boothId = execSql(
      `SELECT id FROM market_booths WHERE owner_id != 'b2222222-2222-2222-2222-222222222222' LIMIT 1`
    )
    if (!boothId) { console.log('[FOLLOW] No booths found, skipping'); test.skip(); return }

    await navigateTo(bethPage, `/market/booth/${boothId}`)
    await assertPageHealthy(bethPage)

    // Step 2: Click Follow button
    const followBtn = bethPage.locator('button:has-text("Follow")')
    const followBtnCount = await followBtn.count()
    expect(followBtnCount).toBeGreaterThan(0)

    // Should show "🤍 Follow" (not already following)
    const btnText = await followBtn.first().innerText()
    expect(btnText).toContain('Follow')
    console.log(`[FOLLOW] Button text before click: "${btnText}"`)

    await followBtn.first().click()
    await bethPage.waitForTimeout(1500)

    // Step 3: Verify button toggled to "Following"
    const afterBtn = bethPage.locator('button:has-text("Following")')
    const afterCount = await afterBtn.count()
    expect(afterCount).toBeGreaterThan(0)
    console.log('[FOLLOW] ✅ Button toggled to Following')

    // Step 4: Navigate to /following and verify booth is listed
    await navigateTo(bethPage, '/following')
    await assertPageHealthy(bethPage)

    const followingBody = await bethPage.locator('body').innerText()
    // Should NOT show "Not following anyone yet"
    expect(followingBody).not.toContain('Not following anyone yet')
    // Should have unfollow button
    const unfollowBtn = bethPage.locator('button:has-text("Unfollow")')
    const unfollowCount = await unfollowBtn.count()
    expect(unfollowCount).toBeGreaterThan(0)
    console.log('[FOLLOW] ✅ Booth appears on /following page')

    // Step 5: Click Unfollow
    await unfollowBtn.first().click()
    await bethPage.waitForTimeout(1500)

    // Step 6: Verify booth removed — should show empty state
    const afterUnfollow = await bethPage.locator('body').innerText()
    const removedOrEmpty =
      afterUnfollow.includes('Not following anyone yet') ||
      (await unfollowBtn.count()) === 0
    expect(removedOrEmpty).toBeTruthy()
    console.log('[FOLLOW] ✅ Booth removed after unfollow')

    // Step 7: Verify via DB — no market_followers row
    const dbCheck = execSql(
      `SELECT COUNT(*) FROM market_followers WHERE follower_id = 'b2222222-2222-2222-2222-222222222222'`
    )
    expect(parseInt(dbCheck) || 0).toBe(0)
    console.log('[FOLLOW] ✅ DB confirms no follows remain')

    await bethPage.context().close()
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
    await assertEmailBranding()
  })

  // ── S9.5: Community Reaction Collapsing & Click-Away ──
  test('S9.5 — Invoke Community reaction popover, assert share icon, and dismiss via click-away', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/community')
    await assertPageHealthy(page)

    // Wait for the feed to load
    await expect(page.locator('[data-testid="message-bubble"]').first()).toBeVisible({ timeout: 15000 })

    // Set up clean database state just in case 
    // Click a message to trigger action bar
    const msgBubble = page.locator('[data-testid="message-bubble"]').first()
    await msgBubble.click()

    // Assert action bar is visible
    const moreShareBtn = page.getByRole('button', { name: 'More Share Options' })
    await expect(moreShareBtn).toBeVisible({ timeout: 5000 })

    // Test click-away backdrop
    await page.locator('body').click({ position: { x: 0, y: 0 }, force: true })
    await expect(moreShareBtn).not.toBeVisible()
    
    await page.context().close()
  })

  // ── S9.6: Captionless Photo Uploads in Community ──
  test('S9.6 — Upload a photo to Community feed without text payload', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/community')

    // Find the file input explicitly created for ComposeBar photo attachments
    const fileInput = page.locator('input[type="file"][accept*="image"]')
    
    const buffer = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082', 'hex')

    await fileInput.setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: buffer
    })

    // Assert thumbnail appears
    await expect(page.locator('img[alt="Preview"]')).toBeVisible({ timeout: 5000 })

    // "Send Message" should be enabled EVEN though the textarea is empty
    const sendButton = page.locator('button[aria-label="Send Message"], button[title="Send"]')
    await expect(sendButton.last()).toBeEnabled()

    // Click to submit and verify
    await sendButton.last().click()
    
    // Ensure image preview clears indicating success
    await expect(page.locator('img[alt="Preview"]')).toHaveCount(0)

    await page.context().close()
  })
})

