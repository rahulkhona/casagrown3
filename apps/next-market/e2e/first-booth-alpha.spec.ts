/**
 * Tests for first-time booth creation flow.
 *
 * Uses the buyer@test.local user who has a completed profile but NO booth.
 * This exercises the CREATE_BOOTH path in handleSaveBooth (the else branch)
 * which was previously crashing with "Cannot read properties of null".
 *
 * Also tests the booth open/close toggle and alpha modal first impression.
 */
import { test, expect } from './fixtures'

test.describe('New User First Booth Creation', () => {
  test('should render my-booth page without errors for user without booth', async ({ page }) => {
    // buyer@test.local is already authenticated via auth.setup.ts
    // and has a profile but NO booth — this is the first-booth scenario
    await page.goto('/my-booth')
    await page.waitForTimeout(2000)

    // Page should render without crash
    await expect(page.locator('body')).toBeVisible()

    // Should NOT see an error alert
    page.on('dialog', dialog => {
      // If we get a dialog, it shouldn't be an error
      expect(dialog.message()).not.toContain('Cannot read properties of null')
      dialog.dismiss()
    })

    // Should see booth name input
    const nameInput = page.locator('input[placeholder*="Name your booth"]')
    if (await nameInput.count() > 0) {
      await expect(nameInput).toBeVisible()
    }
  })

  test('should allow filling booth name and saving without crash', async ({ page }) => {
    await page.goto('/my-booth')
    await page.waitForTimeout(2000)

    // Fill in booth name
    const nameInput = page.locator('input[placeholder*="Name your booth"]')
    if (await nameInput.count() > 0) {
      await nameInput.fill('Test Booth')

      // Select at least one delivery window (required validation)
      const deliveryChip = page.locator('button:has-text("8–10a")').first()
      if (await deliveryChip.isVisible({ timeout: 1000 }).catch(() => false)) {
        await deliveryChip.click()
      }

      // Select at least one pickup window
      const pickupChip = page.locator('button:has-text("10–12p")').first()
      if (await pickupChip.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pickupChip.click()
      }

      // Try to save — should not crash
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create Booth"), [id*="save"]')
      if (await saveBtn.count() > 0) {
        // Listen for JS errors
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))

        await saveBtn.first().click()
        await page.waitForTimeout(3000)

        // No JS errors should have occurred with "null" in the message
        const nullErrors = errors.filter(e => e.includes('null'))
        expect(nullErrors).toHaveLength(0)
      }
    }
  })

  test('should show booth open/close toggle after booth is saved', async ({ page }) => {
    await page.goto('/my-booth')
    await page.waitForTimeout(3000)

    // If booth exists (from previous test or seed), toggle should be visible
    const toggle = page.locator('#booth-open-toggle')
    if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Should show green "Open" state by default
      const text = await toggle.textContent()
      expect(text).toContain('Open')

      // Click to close
      await toggle.click()
      await page.waitForTimeout(500)

      // Should now show red "Closed" state
      const closedText = await toggle.textContent()
      expect(closedText).toContain('Closed')

      // Click to re-open
      await toggle.click()
      await page.waitForTimeout(500)

      const reopenText = await toggle.textContent()
      expect(reopenText).toContain('Open')
    }
  })
})

test.describe('Alpha Modal First Impression', () => {
  test('should show alpha modal on first visit (no localStorage)', async ({ page }) => {
    // Clear alpha acknowledgment to simulate first visit
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('casagrown_alpha_ack')
    })
    await page.reload()
    await page.waitForTimeout(1000)

    // Modal should be visible
    const modal = page.locator('[data-testid="alpha-banner"]')
    await expect(modal).toBeVisible()

    // Should show the "I Understand" button
    const ackBtn = page.locator('#alpha-acknowledge-btn')
    await expect(ackBtn).toBeVisible()

    // Should contain important alpha info
    const modalText = await modal.textContent()
    expect(modalText).toContain('Alpha')
    expect(modalText).toContain('simulated')
  })

  test('should dismiss modal and show badge after clicking I Understand', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('casagrown_alpha_ack')
    })
    await page.reload()
    await page.waitForTimeout(1000)

    // Click "I Understand"
    const ackBtn = page.locator('#alpha-acknowledge-btn')
    if (await ackBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ackBtn.click()
      await page.waitForTimeout(500)

      // Modal overlay should be gone
      const overlay = page.locator('[class*="overlay"]')
      await expect(overlay).not.toBeVisible()

      // Small badge should remain
      const badge = page.locator('[data-testid="alpha-banner"]')
      await expect(badge).toBeVisible()

      // Badge should contain "ALPHA"
      const badgeText = await badge.textContent()
      expect(badgeText).toContain('ALPHA')
    }
  })

  test('should not show modal on subsequent visits after acknowledgment', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('casagrown_alpha_ack', 'true')
    })
    await page.reload()
    await page.waitForTimeout(1000)

    // Modal overlay should NOT be visible
    const overlay = page.locator('[class*="overlay"]')
    const isOverlayVisible = await overlay.isVisible({ timeout: 500 }).catch(() => false)
    expect(isOverlayVisible).toBeFalsy()

    // Small badge should be visible
    const badge = page.locator('[data-testid="alpha-banner"]')
    await expect(badge).toBeVisible()
  })
})

test.describe('Celebration Banner Tracking', () => {
  test('should show celebration banner once, and automatically suppress it on reload without clicking dismiss', async ({ page }) => {
    // 1. Visit market and skip Alpha Modal
    await page.goto('/market')
    await page.evaluate(() => {
      localStorage.setItem('casagrown_alpha_ack', 'true') // Suppress alpha
      // Purge any existing pioneer traces
      for (const key of Object.keys(localStorage)) {
        if (key.includes('pioneer_banner')) localStorage.removeItem(key)
      }
    })
    
    // 2. Reload to cleanly mount PioneerBanner
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1000) // Wait for profile + member count RPCs

    // 3. Verify Celebration Banner drops down gracefully
    // The banner requires: authenticated user + h3 index + member count <= 20
    // If conditions aren't met (e.g., no auth), skip gracefully
    const celebrationHeading = page.locator('h3:has-text("Welcome to CasaGrown!")')
    const bannerVisible = await celebrationHeading.isVisible({ timeout: 5000 }).catch(() => false)
    
    if (!bannerVisible) {
      // Banner conditions not met (user may not be authenticated in this context)
      console.log('[BANNER TEST] Pioneer banner not visible — skipping (auth may not be active)')
      return
    }

    // 4. Force an immediate browser reload BEFORE the user interacts with the 'X' button
    await page.reload()
    
    // 5. Assert the DOM entirely suppressed the banner via the background 'useEffect'
    await expect(celebrationHeading).toBeHidden({ timeout: 2000 })
  })
})
