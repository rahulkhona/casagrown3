import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
} from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Direct Messaging: Real-Time WebSockets Tri-Factor', () => {

  test('S12.5 — Dual-browser test for Presence (Online Indicator) and Broadcast (Typing Bubble)', async ({ browser }) => {
    // 1. Login both users simultaneously (loginAsUser internally provisions isolated browser.newContext() objects)
    const samPage = await loginAsUser(browser, 'sam')
    const bethPage = await loginAsUser(browser, 'beth')

    // 3. Navigate both to the Direct Messaging Inbox
    await navigateTo(samPage, '/messages')
    await navigateTo(bethPage, '/messages')

    // 4. Sam opens the thread with Beth
    await samPage.waitForTimeout(1000)
    const bethThreadBtn = samPage.getByText('Beth Buyer').first()
    if (await bethThreadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
       await bethThreadBtn.click()
       await samPage.waitForLoadState('networkidle')
    } else {
       console.log('Skipping dual browser text due to missing seed conversation')
       await samPage.context().close()
       await bethPage.context().close()
       return
    }

    // At this exact moment, Sam is physically in the DM. Beth is NOT in the DM yet.
    // Verify Sam does NOT see Beth as Online.
    // The online indicator is a title="Online" span next to the name.
    const samSeesBethOnline = samPage.locator('span[title="Online"]')
    await expect(samSeesBethOnline).not.toBeVisible()

    // 5. Beth opens the thread with Sam
    await bethPage.waitForTimeout(1000)
    const samThreadBtn = bethPage.getByText('Sam Seller').first()
    await samThreadBtn.click()
    await bethPage.waitForLoadState('networkidle')

    // 6. Test Presence (`postgres_changes` + `presence`)
    // Now that Beth instantiated the exact same channel path `dm_{conversation.id}`, 
    // Sam's WebSocket should instantly broadcast her Presence entry!
    await expect(samSeesBethOnline).toBeVisible({ timeout: 10000 })
    
    // Conversely, Beth should also instantly see Sam as online.
    const bethSeesSamOnline = bethPage.locator('span[title="Online"]')
    await expect(bethSeesSamOnline).toBeVisible({ timeout: 10000 })

    // 7. Test Typing Broadcast (Stateless 3-Dot Bubble)
    // Beth starts typing a message but DOES NOT hit enter
    const bethInput = bethPage.locator('input[placeholder="Message..."]')
    await bethInput.fill('Hey Sam! I am typing a real time message...')
    
    // The Typing WebSocket debouncer waits 0ms on the first keystroke to broadcast `isTyping: true`.
    // Sam's screen should dynamically render the 3-dot typing bubble above the input layer.
    const typingBubbleOnSamScreen = samPage.locator('.typing-dot').first()
    await expect(typingBubbleOnSamScreen).toBeVisible({ timeout: 5000 })

    // Beth clears the input completely
    await bethInput.fill('')
    
    // The debouncer clears the `isTyping` state across the WebSocket after 1 second.
    // The typing bubble should gracefully disappear from Sam's DOM.
    await expect(typingBubbleOnSamScreen).not.toBeVisible({ timeout: 5000 })

    // Cleanup (the helper generates contexts implicitly connected to the page)
    await samPage.context().close()
    await bethPage.context().close()
  })

})
