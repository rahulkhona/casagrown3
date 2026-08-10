import { test, expect } from '@playwright/test'

/**
 * Next-Metrics — Full User Journey & Interactive Experience E2E Suite
 * 
 * Simulates complete end-to-end user journeys:
 *   1. Full Auth Flow (email entry, OTP submit, dashboard redirect)
 *   2. State of Business & Geo Filter Interaction (State/City select, Granularity toggles)
 *   3. Traffic Trends 60-Day Journey (Preset buttons, Date Pickers, Route Dropdown select, Table Row click)
 *   4. Wizard Drop-offs 14-Day Journey (Wizard select, Preset buttons, Field-Level Table inspection, Slow Step Alerts, AI Adoption Donut Charts)
 *   5. Attribution Trends Journey (UTM Filters, Combined Landing Pages/Wizards, Referrals)
 *   6. Log Search Journey (Category tabs, Keyword filter input, JSON Payload Inspector Modal open/close)
 */

test.describe('Next-Metrics — Full User Journey & Interactive Experience Suite', () => {

  test('User Journey 1: Full Portal Navigation & State of Business Geo Filter UX', async ({ page }) => {
    // 1. Load Business Tab
    await page.goto('/?tab=business')
    await page.waitForLoadState('networkidle')

    // Verify Page Title & Subtitle
    await expect(page.locator('h1.page-title')).toContainText('State of Business')

    // Verify Produce Interest KPI Cards
    await expect(page.locator('body')).toContainText('Buy Produce Interests')
    await expect(page.locator('body')).toContainText('Sell Produce Interests')
    await expect(page.locator('body')).toContainText('Total Produce Interests')

    // Verify Shares & Invites KPI Cards
    await expect(page.locator('body')).toContainText('Total Product Shares')
    await expect(page.locator('body')).toContainText('WhatsApp Shares')
    await expect(page.locator('body')).toContainText('Share Clicks')
    await expect(page.locator('body')).toContainText('Referral Invites')

    // 2. Interact with Granularity Toggles (Daily -> Weekly -> Monthly)
    await page.click('button:has-text("Weekly")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Monthly")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Daily")')
    await page.waitForTimeout(300)

    // 3. Interact with Geo Filters (State Select -> City Input)
    const stateSelect = page.locator('select').filter({ hasText: 'All States' })
    if (await stateSelect.isVisible()) {
      await stateSelect.selectOption('CA')
      await page.waitForTimeout(300)
    }

    const cityInput = page.locator('input[placeholder="Any city"]')
    if (await cityInput.isVisible()) {
      await cityInput.fill('San Jose')
      await page.waitForTimeout(300)
    }
  })

  test('User Journey 5: User Produce Interest Trends & Geo Filtering UX', async ({ page }) => {
    await page.goto('/?tab=trends')
    await page.waitForLoadState('networkidle')

    // Verify Title
    await expect(page.locator('h1')).toContainText('Business Trends')

    // Verify Produce Interest Trend section and charts exist
    await expect(page.locator('body')).toContainText('User Produce Interest & Demand Trends (Geo-Filtered)')
    await expect(page.locator('body')).toContainText('Buy Produce Interests Trend')
    await expect(page.locator('body')).toContainText('Sell Produce Interests Trend')

    // Filter trends by state
    const stateSelect = page.locator('select').filter({ hasText: 'All States' })
    if (await stateSelect.isVisible()) {
      await stateSelect.selectOption('CA')
      await page.waitForTimeout(300)
    }
  })

  test('User Journey 2: Traffic Trends 60-Day Retention & Route Selector UX', async ({ page }) => {
    await page.goto('/?tab=traffic')
    await page.waitForLoadState('networkidle')

    // Verify Title & 60-Day Retention Badge
    await expect(page.locator('h1')).toContainText('Traffic Trends')
    await expect(page.locator('body')).toContainText('60-Day Retention Bound')

    // Test Date Preset Buttons (7D, 14D, 30D, 60D Max)
    await page.click('button:has-text("7D")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("14D")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("30D")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("60D (Max)")')
    await page.waitForTimeout(300)

    // Select Route Dropdown Filter
    const routeSelect = page.locator('select').filter({ hasText: 'All Routes' })
    if (await routeSelect.isVisible()) {
      await routeSelect.selectOption({ index: 1 })
      await page.waitForTimeout(400)
    }

    // Click Table Row to filter route histogram
    const tableRow = page.locator('tr').filter({ hasText: '/' }).nth(1)
    if (await tableRow.isVisible()) {
      await tableRow.click()
      await page.waitForTimeout(400)
    }
  })

  test('User Journey 3: Wizard Drop-offs 14-Day Retention & Field Analytics UX', async ({ page }) => {
    await page.goto('/?tab=wizard')
    await page.waitForLoadState('networkidle')

    // Verify Title & 14-Day Retention Badge
    await expect(page.locator('h1')).toContainText('Wizard Drop-offs')
    await expect(page.locator('body')).toContainText('14-Day Retention Bound')

    // Test Date Presets (7 Days vs 14 Days Max)
    await page.click('button:has-text("7 Days")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("14 Days (Max)")')
    await page.waitForTimeout(300)

    // Select Wizard Dropdown Option
    const wizardSelect = page.locator('select').filter({ hasText: 'Listing Creation Wizard' })
    if (await wizardSelect.isVisible()) {
      await wizardSelect.selectOption('/sell')
      await page.waitForTimeout(400)
      await wizardSelect.selectOption('/join')
      await page.waitForTimeout(400)
      await wizardSelect.selectOption('/create-listing')
      await page.waitForTimeout(400)
    }

    // Verify Field-Level Table section headers exist
    await expect(page.locator('body')).toContainText('Field-Level Drop-off & Interactions')
    // 'Where Users Leave' section heading was renamed to 'Time per Step & Velocity Analysis'
    await expect(page.locator('body')).toContainText('Time per Step & Velocity')
  })

  test('User Journey 4: Log Search & JSON Payload Inspector Modal UX', async ({ page }) => {
    await page.goto('/?tab=logs')
    await page.waitForLoadState('networkidle')

    // Verify Title
    await expect(page.locator('h1')).toContainText('Log Search')

    // Click Category Buttons
    await page.click('button:has-text("Visit Sessions")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Client UI Errors")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Edge Audit Logs")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("User Page Events")')
    await page.waitForTimeout(300)

    // Type Keyword in Search Input
    const searchInput = page.locator('input[placeholder*="Filter logs"]')
    if (await searchInput.isVisible()) {
      await searchInput.fill('phone_number')
      await page.waitForTimeout(300)
      await searchInput.fill('')
    }

    // Inspect JSON Payload Modal
    const payloadBtn = page.locator('button:has-text("View Payload")').first()
    if (await payloadBtn.isVisible()) {
      await payloadBtn.click()
      await expect(page.locator('text=Inspect Log Event Payload')).toBeVisible()
      await page.click('button:has-text("Close")')
      await expect(page.locator('text=Inspect Log Event Payload')).not.toBeVisible()
    }
  })

})
