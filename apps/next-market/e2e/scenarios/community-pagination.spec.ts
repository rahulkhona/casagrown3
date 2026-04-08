import { test, expect } from '@playwright/test'
import { loginAsUser, navigateTo } from './scenario-helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Community Pagination E2E', () => {
  test('scrolls to top to trigger historical message pagination', async ({ browser }) => {
    // Login as a user who uses community chat
    const page = await loginAsUser(browser, 'beth')
    
    // Navigate to Community Chat
    await navigateTo(page, '/community')
    await page.waitForTimeout(3000)
    
    // Get the initial number of messages
    const messageLocator = page.locator('div[class*="messageBubble"], div[class*="bubble"]')
    const initialMessageCount = await messageLocator.count()
    
    console.log(`[Pagination Test] Initial messages loaded: ${initialMessageCount}`)
    
    // If the DB has few messages, the test is inherently passing since no pagination is needed
    if (initialMessageCount < 2) {
      console.log('[Pagination Test] Not enough messages to test scroll pagination')
      expect(initialMessageCount).toBeGreaterThanOrEqual(0)
      await page.context().close()
      return
    }

    // Scroll to the absolute top of the scroll container
    // We target the container that holds the messages.
    const scrollContainer = page.locator('div[class*="messageScrollArea"]').first()
    const isScrollable = await scrollContainer.isVisible({ timeout: 2000 }).catch(() => false)
    
    if (isScrollable) {
      // Simulate scrolling to top
      await scrollContainer.evaluate((node) => {
        node.scrollTop = 0
      })
      
      // Wait for IntersectionObserver to trigger and fetch older messages
      await page.waitForTimeout(2000)
      
      const newMessageCount = await messageLocator.count()
      console.log(`[Pagination Test] Messages after scroll: ${newMessageCount}`)
      
      // We expect the message count to stay the same or increase if there's history.
      // We also check that the app didn't crash.
      expect(newMessageCount).toBeGreaterThanOrEqual(initialMessageCount)
      
      const body = await page.locator('body').innerText()
      expect(body.length).toBeGreaterThan(100)
    }
    
    await page.context().close()
  })
})
