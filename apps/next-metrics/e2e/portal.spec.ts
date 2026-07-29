import { test, expect } from '@playwright/test'

test.describe('New Metrics Portal — Interactive Tabs & Page-Specific Retention Controls', () => {
  test('mounts root Metrics Portal and verifies page-specific retention bounds & interactions', async ({ page }) => {
    // 1. Load Root Portal
    await page.goto('/?tab=business')
    await page.waitForLoadState('networkidle')

    // Verify sidebar section label and links are present
    await expect(page.locator('.sidebar-logo-text')).toContainText('Metrics')
    await expect(page.locator('.sidebar')).toContainText('New Metrics Portal')

    // 2. State of Business View (Permanent Unrestricted Data)
    await page.goto('/?tab=business')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('State of Business')

    // 3. Trends View
    await page.goto('/?tab=trends')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Business Trends')

    // 4. Attributions View
    await page.goto('/?tab=attributions')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Attributions')

    // 5. Attribution Trends View
    await page.goto('/?tab=attribution-trends')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Attribution Trends')

    // 6. Traffic Trends View (60-Day Retention Bound & Route Filter UX)
    await page.goto('/?tab=traffic')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Traffic Trends')
    await expect(page.locator('body')).toContainText('60-Day Retention Bound')

    // Interact with route selector dropdown if options loaded
    const routeSelect = page.locator('select').first()
    if (await routeSelect.isVisible()) {
      const optionElements = routeSelect.locator('option')
      const count = await optionElements.count()
      if (count > 1) {
        const val = await optionElements.nth(1).getAttribute('value')
        if (val) {
          await routeSelect.selectOption(val)
        }
      }
    }

    // 7. Wizard Drop-offs View (14-Day Retention Bound & Wizard Selector UX)
    await page.goto('/?tab=wizard')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Wizard Drop-offs')
    await expect(page.locator('body')).toContainText('14-Day Retention Bound')

    // Interact with 7 Days and 14 Days preset buttons
    await page.click('button:has-text("7 Days")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("14 Days (Max)")')
    await page.waitForTimeout(300)

    // Interact with Wizard Selector dropdown
    const wizardSelect = page.locator('select').filter({ hasText: 'Listing Creation Wizard' })
    if (await wizardSelect.isVisible()) {
      await wizardSelect.selectOption({ value: '/join' })
      await page.waitForTimeout(300)
      await wizardSelect.selectOption({ value: '/sell' })
    }

    // 8. Multi-Arm Bandit (MAB) Stats View
    await page.goto('/?tab=mab')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Multi-Arm Bandit')

    // 9. Drip Campaign Stats View
    await page.goto('/?tab=drip')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Drip Campaign Stats')

    // 10. Log Search View & Payload Inspector Modal
    await page.goto('/?tab=logs')
    await page.waitForSelector('h1', { timeout: 20000 })
    await expect(page.locator('h1')).toContainText('Log Search')

    // Click Category filter buttons
    await page.click('button:has-text("Visit Sessions")')
    await page.waitForTimeout(200)
    await page.click('button:has-text("Client UI Errors")')
    await page.waitForTimeout(200)
    await page.click('button:has-text("Edge Audit Logs")')
    await page.waitForTimeout(200)
    await page.click('button:has-text("User Page Events")')

    // Test payload inspector modal if any log rows exist
    const viewPayloadBtn = page.locator('button:has-text("View Payload")').first()
    if (await viewPayloadBtn.isVisible()) {
      await viewPayloadBtn.click()
      await expect(page.locator('text=Inspect Log Event Payload')).toBeVisible()
      await page.click('button:has-text("Close")')
    }
  })
})
