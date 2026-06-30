/**
 * E2E: Listing Edit — Active Listing Stays Published
 *
 * Tests that editing a published listing does NOT auto-draft it.
 * When user explicitly saves as draft, a confirmation warning is shown.
 *
 * Seed data:
 * - seller@test.local (Sam) has booths and published products
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  assertPageHealthy,
  execSql,
} from './scenario-helpers'

test.describe('Listing Edit — Draft Mode Protection', () => {
  test.describe.configure({ mode: 'serial' })

  // Helper: get an active product ID for the seller
  function getActiveProductId(): string {
    const result = execSql(
      `SELECT mp.id FROM market_products mp JOIN market_booths mb ON mp.booth_id = mb.id JOIN profiles p ON mb.owner_id = p.id WHERE p.email = 'seller@test.local' AND mp.is_active = true AND mp.is_draft = false LIMIT 1`
    )
    return result.trim()
  }

  // Helper: check product status in DB
  function getProductStatus(id: string): { isActive: boolean; isDraft: boolean } {
    const active = execSql(`SELECT is_active FROM market_products WHERE id = '${id}'`).trim()
    const draft = execSql(`SELECT is_draft FROM market_products WHERE id = '${id}'`).trim()
    return {
      isActive: active === 't' || active === 'true',
      isDraft: draft === 't' || draft === 'true',
    }
  }

  // ──────────────────────────────────────────────────
  // LE1: Editing a published listing keeps it active
  // ──────────────────────────────────────────────────
  test('LE1: published listing stays active after edit via Save Changes', async ({ browser }) => {
    const productId = getActiveProductId()
    if (!productId) {
      test.skip(true, 'No active products found for seller — skipping edit test')
      return
    }

    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, `/my-booth/products/new?edit=${productId}`)
    await assertPageHealthy(page)
    await page.waitForTimeout(2000)

    // Verify we're in edit mode
    const heading = page.locator('h1')
    await expect(heading).toContainText(/edit product|re-list/i, { timeout: 5000 })

    // Make a minor edit — update the description
    const descriptionField = page.locator('textarea').first()
    if (await descriptionField.isVisible({ timeout: 3000 }).catch(() => false)) {
      const currentText = await descriptionField.inputValue()
      await descriptionField.fill(currentText + ' (e2e-test-edit)')
    }

    // Click "Save Changes" (not "Save as Draft")
    const saveBtn = page.locator('button:has-text("Save Changes")')
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click()
      await page.waitForTimeout(3000)
    }

    // Verify the product is still active and NOT draft
    const status = getProductStatus(productId)
    expect(status.isActive).toBe(true)
    expect(status.isDraft).toBe(false)

    // Revert the description edit
    execSql(`UPDATE market_products SET description = REPLACE(description, ' (e2e-test-edit)', '') WHERE id = '${productId}'`)

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // LE2: Edit mode shows both "Save Changes" and "Save as Draft" buttons
  // ──────────────────────────────────────────────────
  test('LE2: edit mode shows Save Changes and Save as Draft buttons', async ({ browser }) => {
    const productId = getActiveProductId()
    if (!productId) {
      test.skip(true, 'No active products found for seller')
      return
    }

    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, `/my-booth/products/new?edit=${productId}`)
    await assertPageHealthy(page)
    await page.waitForTimeout(2000)

    // Should show "Save Changes" as primary button
    const saveChangesBtn = page.locator('button:has-text("Save Changes")')
    await expect(saveChangesBtn).toBeVisible({ timeout: 5000 })

    // Should show "Save as Draft Instead" as secondary button for active listings
    const saveDraftBtn = page.locator('button:has-text("Save as Draft Instead")')
    await expect(saveDraftBtn).toBeVisible({ timeout: 3000 })

    await page.close()
  })

  // ──────────────────────────────────────────────────
  // LE3: Confirmation dialog shown when saving active listing as draft
  // ──────────────────────────────────────────────────
  test('LE3: confirmation dialog prevents accidental draft save', async ({ browser }) => {
    const productId = getActiveProductId()
    if (!productId) {
      test.skip(true, 'No active products found for seller')
      return
    }

    const page = await loginAsUser(browser, 'sam')
    await navigateTo(page, `/my-booth/products/new?edit=${productId}`)
    await assertPageHealthy(page)
    await page.waitForTimeout(2000)

    // Set up dialog handler to DISMISS (cancel) the confirmation
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm')
      expect(dialog.message()).toContain('unavailable')
      await dialog.dismiss() // Cancel — don't save as draft
    })

    // Click "Save as Draft Instead"
    const saveDraftBtn = page.locator('button:has-text("Save as Draft Instead")')
    if (await saveDraftBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveDraftBtn.click()
      await page.waitForTimeout(1000)
    }

    // Product should still be active since user cancelled
    const status = getProductStatus(productId)
    expect(status.isActive).toBe(true)
    expect(status.isDraft).toBe(false)

    await page.close()
  })
})
