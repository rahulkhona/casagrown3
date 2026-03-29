import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  clearMailpit,
  execSql,
  TEST_USERS,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Direct Messaging & Block Flows', () => {
  test.beforeAll(async () => {
    await clearMailpit()
    // Clean up any test blocks or test conversations involving Beth or Sam
    execSql(`DELETE FROM market_blocks WHERE blocker_id IN (SELECT id FROM auth.users WHERE email IN ('seller@test.local', 'buyer@test.local')) OR blocked_id IN (SELECT id FROM auth.users WHERE email IN ('seller@test.local', 'buyer@test.local'))`)
  })

  // ── S12.1: Inbox Default Load ──
  test('S12.1 — Access direct messaging inbox and see default network list', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    // Click on Messages from Nav (or navigate directly)
    await navigateTo(page, '/messages')
    await assertPageHealthy(page)

    // Wait for the inbox layout to mount
    await expect(page.locator('text=Messages').first()).toBeVisible()

    // Trigger New Chat Modal
    const newChatBtn = page.getByRole('button', { name: /new chat|new message/i })
    if (await newChatBtn.count() > 0) {
      await newChatBtn.first().click()
    } else {
      // In case we used an icon button, map by XPath or class if aria label is missing
      // For now, assume it's there based on typical structure.
      await page.locator('button').filter({ hasText: '➕' }).first().click()
    }

    // Wait for the modal list to settle and display actual neighbors
    await page.waitForTimeout(1000)
    
    // Verify the modal opened successfully by checking for its core search input
    const searchInput = page.getByPlaceholder('Search neighbors by name...')
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await page.context().close()
  })

  // ── S12.2 & S12.3: Search & Send Message ──
  test('S12.2 & 12.3 — Filter specific user, start chat, and send message', async ({ browser }) => {
    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, '/messages')
    const newChatBtn = page.getByRole('button', { name: /new chat|new message/i })
    await newChatBtn.first().click()
    // Explicit search for Beth
    const searchInput = page.getByPlaceholder('Search neighbors by name...')
    await searchInput.fill('Beth Buyer')
    
    // Wait for debounce to finish
    await page.waitForTimeout(600)
    
    const targetUserBtn = page.getByRole('button', { name: /Beth Buyer/i }).first()
    await expect(targetUserBtn).toBeVisible()
    
    // Navigate into the Thread
    await targetUserBtn.click()
    await page.waitForLoadState('networkidle')
    await assertPageHealthy(page)
    
    // Expect to be inside the chat layout
    await expect(page.locator('text=Beth Buyer').first()).toBeVisible()

    // Compose message
    const msgInput = page.locator('input[type="text"], textarea').last()
    await msgInput.fill('Hello from Playwright automated tests!')
    await page.locator('button[type="submit"]').last().click({ force: true })

    // Message appears dynamically in the feed
    const sentMsg = page.getByText('Hello from Playwright automated tests!')
    await expect(sentMsg).toBeVisible()

    await page.context().close()
  })

  // ── S12.4: Blocking Lifecycle ──
  test('S12.4 — Block a user via Header and verify Unblock toggle', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await navigateTo(page, '/messages')
    
    // Find Sam's conversation and click it
    const samThread = page.getByText('Sam Seller').first()
    await samThread.click()
    await page.waitForLoadState('networkidle')
    await assertPageHealthy(page)

    // Click Block button on the header
    const blockButton = page.getByRole('button', { name: '🚫 Block' })
    await expect(blockButton).toBeVisible()
    await blockButton.click()

    // Modal pops up
    const confirmBlock = page.getByRole('button', { name: 'Confirm Block' })
    await expect(confirmBlock).toBeVisible()
    await confirmBlock.click()

    // Button should now morph to Unblock
    const unblockButton = page.getByRole('button', { name: '🔓 Unblock' })
    await expect(unblockButton).toBeVisible({ timeout: 5000 })

    // Unblock to leave things clean
    await unblockButton.click()
    await expect(page.getByRole('button', { name: '🚫 Block' })).toBeVisible({ timeout: 5000 })

    await page.context().close()
  })
})
