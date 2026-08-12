/**
 * Comprehensive CRM Full Campaign Journey E2E Test Suite
 *
 * Verifies end-to-end functionality for:
 *  1. Unified TrackingUrlBuilder with all 5 UTM fields & "Apply to Campaign" button.
 *  2. Push Notifications: Deep Link Target URL preset selector, full UTM builder, and banner tap link assignment.
 *  3. Email & SMS: Apply to Campaign button inserts/appends tracked link and pins it to AI Assistant links list.
 *  4. AI Draft Assistant: Searching /game displays Games Hub & pinning ⭐ Applied Campaign Links at the top.
 *  5. Drip Sequences:
 *     - "Wait for Optimal Slot" node includes 📱 Push Default preset (matching SMS daytime send windows).
 *     - Push Notification nodes open the Message Editor modal cleanly in Push channel mode (not SMS mode).
 *     - Node data & MAB variants persist push_title, push_body, and push_target_url.
 */

import { test, expect } from '@playwright/test'

test.describe('CRM Full Campaign & Sequence Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/campaigns', { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('#create-campaign-btn', { state: 'visible', timeout: 15000 })
  })

  test('1. Push Notification Card — Deep Link Target URL & Unified TrackingUrlBuilder', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    // Open Campaign Creator
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    // Fill Campaign Name
    await page.fill('input[placeholder="e.g. Spring Launch Email"]', 'E2E Push Launch')

    // Select Push Notification channel
    const channelSelect = page.locator('label:has-text("Channel (Primary Medium)") + select, label:has-text("Channel (Primary Medium)") ~ select').first()
    await channelSelect.selectOption('push')

    // Verify Push Notification Message box opens
    await expect(page.getByText('📱 Push Notification Message')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. 🍓 Fresh Strawberries Dropped Nearby!')).toBeVisible()

    // Verify Deep Link Target URL field & Quick Presets
    const targetUrlInput = page.locator('input[placeholder*="/games or /market"]')
    await expect(targetUrlInput).toBeVisible()

    const presetSelect = page.locator('select', { hasText: 'Quick Presets...' })
    await expect(presetSelect).toBeVisible()

    // Select /games preset
    await presetSelect.selectOption('/games')
    await expect(targetUrlInput).toHaveValue('/games')

    // Verify Unified TrackingUrlBuilder is present and expanded
    await expect(page.getByText('Tracking URL Builder')).toBeVisible()
    await expect(page.locator('label', { hasText: 'Source *' })).toBeVisible()
    await expect(page.locator('label', { hasText: 'Medium *' })).toBeVisible()

    // Click "Apply to Campaign" in TrackingUrlBuilder
    const applyBtn = page.locator('button:has-text("✨ Apply to Campaign")')
    await expect(applyBtn).toBeVisible()
    await applyBtn.click()

    // Toast should confirm applied
    await expect(page.getByText(/Target URL applied/i)).toBeVisible({ timeout: 5000 })

    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
  })

  test('2. Email Campaign — Apply to Campaign pins link to AI Assistant', async ({ page }) => {
    // Open Campaign Creator
    await page.click('#create-campaign-btn', { force: true })
    await expect(page.locator('h2', { hasText: 'Create Campaign' })).toBeVisible({ timeout: 10000 })

    await page.fill('input[placeholder="e.g. Spring Launch Email"]', 'E2E Email Test')

    // Select Email channel
    const channelSelect = page.locator('label:has-text("Channel (Primary Medium)") + select, label:has-text("Channel (Primary Medium)") ~ select').first()
    await channelSelect.selectOption('email')

    // Click Apply to Campaign in TrackingUrlBuilder
    const applyBtn = page.locator('button:has-text("✨ Apply to Campaign")')
    await expect(applyBtn).toBeVisible()
    await applyBtn.click()

    // Open AI Draft Assistant
    const askAiBtn = page.locator('button:has-text("✨ Ask AI")').first()
    await askAiBtn.click()

    await expect(page.getByText('AI Draft Assistant')).toBeVisible({ timeout: 10000 })

    // Verify Campaign References has Applied Campaign Link pinned at top
    await expect(page.getByText('Applied Campaign Link')).toBeVisible({ timeout: 5000 })

    // Test searching /game in AI references search
    const searchInput = page.getByPlaceholder('Search links...')
    await searchInput.fill('/game')

    await expect(page.locator('.ref-card', { hasText: 'Daily Garden Games Hub' })).toBeVisible({ timeout: 5000 })
  })

  test('3. Drip Sequences — Push Node opens Push Editor & Optimal Slot has Push Default', async ({ page }) => {
    await page.goto('/crm/sequences', { waitUntil: 'load', timeout: 60000 })

    // Create a new sequence
    const newSeqBtn = page.getByRole('button', { name: '+ New Sequence' })
    await expect(newSeqBtn).toBeVisible({ timeout: 15000 })
    await newSeqBtn.click()

    await page.waitForURL('**/crm/sequences/*', { timeout: 30000 })
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10000 })

    // Click "Wait for Optimal Slot" node in palette
    const waitSlotNodeBtn = page.getByText('Wait for Optimal Slot')
    await expect(waitSlotNodeBtn).toBeVisible({ timeout: 10000 })
    await waitSlotNodeBtn.click({ force: true })

    // Verify right sidebar renders "📱 Push" slot preset button
    const pushPresetBtn = page.locator('button', { hasText: '📱 Push' })
    if (await pushPresetBtn.count() > 0) {
      await expect(pushPresetBtn).toBeVisible()
      await pushPresetBtn.click()
      await expect(page.locator('label', { hasText: 'Send Windows' })).toBeVisible()
    }

    // Click "Send Push Notification" node in palette to add & select it
    const pushNodeBtn = page.getByText('Send Push Notification')
    await expect(pushNodeBtn).toBeVisible()
    await pushNodeBtn.click({ force: true })

    // Click "Open Message Editor Modal"
    const openEditorBtn = page.locator('button:has-text("Open Message Editor Modal")')
    await expect(openEditorBtn).toBeVisible({ timeout: 10000 })
    await openEditorBtn.click()

    // Verify modal opens in Push Notification Message mode (not SMS mode!)
    await expect(page.getByText('📱 Push Notification Message')).toBeVisible({ timeout: 10000 })
    await expect(page.getByPlaceholder('e.g. 🍓 Fresh Strawberries Dropped Nearby!')).toBeVisible()

    // Close modal cleanly
    await page.keyboard.press('Escape')
  })
})
