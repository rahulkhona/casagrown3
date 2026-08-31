import { test, expect } from '@playwright/test'
import { BASE_URL, loginAsUser, refreshBrowserAuth, execSql } from './scenario-helpers'

test.describe('Produce Market Interest & Want Flow E2E', () => {

  test('Guest flow: Want opens ungated, delivery requires address with Save CTA, and triggers QuickSetup gate', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    await page.goto(`${BASE_URL}/market`)
    await page.waitForLoadState('networkidle')

    // 1. Search for produce
    const searchInput = page.locator('input#produce-search, input[placeholder*="Search produce"]').first()
    await expect(searchInput).toBeVisible({ timeout: 10000 })
    await searchInput.fill('Apple')
    await page.waitForTimeout(500)

    // 2. Click "💚 Want" on the crop card — should open ungated
    const wantBtn = page.locator('button:has-text("Want")').first()
    await expect(wantBtn).toBeVisible()
    await wantBtn.click()

    // 3. Verify Want modal opened freely
    const modal = page.locator('[role="dialog"], [class*="modalOverlay"], div[style*="position: fixed"]').first()
    await expect(modal).toBeVisible({ timeout: 5000 })

    // 4. Select Delivery fulfillment preference
    const deliveryBtn = page.locator('button:has-text("Delivery")').first()
    await expect(deliveryBtn).toBeVisible()
    await deliveryBtn.click()

    // 5. Verify "Enter Delivery Address (Required)" prompt appears
    const enterAddressBtn = page.locator('button:has-text("Enter Delivery Address")').first()
    await expect(enterAddressBtn).toBeVisible()

    // 6. Attempt to submit without address -> blocks and shows validation prompt / opens address modal
    const submitBtn = page.locator('button:has-text("Find sellers in my neighborhood")').first()
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()

    // Verify Address Modal opens with updated copy and CTA
    const addressModalTitle = page.locator('h3:has-text("Enter Delivery Address")').first()
    await expect(addressModalTitle).toBeVisible({ timeout: 5000 })

    const saveAddressBtn = page.locator('button:has-text("Save Delivery Address")').first()
    await expect(saveAddressBtn).toBeVisible()

    // 7. Enter address in Address Modal
    const streetInput = page.locator('input[placeholder*="Street Address"]').first()
    await streetInput.fill('789 Blossom Hill Rd')

    const zipInput = page.locator('input[placeholder*="ZIP"], input[placeholder*="Zip"]').first()
    if (await zipInput.isVisible()) {
      await zipInput.fill('95123')
    }

    await saveAddressBtn.click()
    await page.waitForTimeout(500)

    // 8. Verify Address Modal closed and Delivery Address card shows the entered address
    await expect(page.locator('text=789 Blossom Hill Rd')).toBeVisible()
    await expect(page.locator('button:has-text("Change Address")')).toBeVisible()

    // 9. Click "Find sellers in my neighborhood" -> triggers QuickSetup gate for guest
    await submitBtn.click()
    const quickSetupModal = page.locator('text=Quick Setup').or(page.locator('text=Sign in')).or(page.locator('text=Create Account')).first()
    await expect(quickSetupModal).toBeVisible({ timeout: 5000 })

    await context.close()
  })

  test('Pickup fulfillment flow: Address is optional and submits without address prompt', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    await page.goto(`${BASE_URL}/market`)
    await page.waitForLoadState('networkidle')

    const wantBtn = page.locator('button:has-text("Want")').first()
    await expect(wantBtn).toBeVisible({ timeout: 10000 })
    await wantBtn.click()

    // Select Pickup Only
    const pickupBtn = page.locator('button:has-text("Pickup")').first()
    await expect(pickupBtn).toBeVisible()
    await pickupBtn.click()

    // Verify Address required banner is NOT displayed
    await expect(page.locator('button:has-text("Enter Delivery Address (Required)")')).not.toBeVisible()

    // Verify no buyer schedule hour matrix tables
    await expect(page.locator('text=Tap hour cells')).not.toBeVisible()

    await context.close()
  })

  test('Authenticated user: entering delivery address persists and pre-populates across multiple crops', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await refreshBrowserAuth(page, 'buyer@test.local')

    await page.goto(`${BASE_URL}/market`)
    await expect(page.locator('.produce-card, [class*="produceCard"]').first()).toBeVisible({ timeout: 10000 })

    // 1. Open Want on First Crop
    const firstCropWantBtn = page.locator('button:has-text("Want")').first()
    await expect(firstCropWantBtn).toBeVisible({ timeout: 10000 })
    await firstCropWantBtn.click()

    const modal = page.locator('[role="dialog"], [class*="modalOverlay"], div[style*="position: fixed"]').first()
    await expect(modal).toBeVisible({ timeout: 5000 })

    // If active listings view is shown, switch to signal form
    const signalLink = page.getByRole('button', { name: /Find Sellers/i })
    if (await signalLink.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signalLink.click()
    }

    // Select Delivery
    const deliveryBtn = page.locator('button:has-text("Delivery")').first()
    await expect(deliveryBtn).toBeVisible()
    await deliveryBtn.click()

    // If address is not already saved, enter it
    const enterAddressBtn = page.locator('button:has-text("Enter Delivery Address")').first()
    if (await enterAddressBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await enterAddressBtn.click()
      const streetInput = page.locator('input[placeholder*="Street Address"]').first()
      await streetInput.fill('456 Willow Glen Way')
      const saveAddressBtn = page.locator('button:has-text("Save Delivery Address")').first()
      await saveAddressBtn.click()
      await page.waitForTimeout(500)
    }

    // Verify address card is visible
    await expect(page.locator('text=Willow Glen').or(page.locator('text=456')).or(page.locator('button:has-text("Change Address")')).first()).toBeVisible({ timeout: 5000 })

    // 2. Submit signal
    const submitBtn = page.locator('button:has-text("Find sellers in my neighborhood")').first()
    await submitBtn.click()

    // 3. Verify post-submission confirmation hub
    await expect(page.getByRole('heading', { name: /Neighbors notified/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Instacart/i)).toBeVisible({ timeout: 10000 })

    // Close modal
    const closeBtn = page.locator('button[aria-label="Close modal"]')
    await closeBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    // 4. Open Want on Second Crop
    const secondCropWantBtn = page.locator('button:has-text("Want")').nth(1)
    if (await secondCropWantBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await secondCropWantBtn.click()
      await expect(modal).toBeVisible({ timeout: 5000 })

      if (await signalLink.isVisible({ timeout: 1000 }).catch(() => false)) {
        await signalLink.click()
      }

      // Select Delivery
      const deliveryBtn2 = page.locator('button:has-text("Delivery")').first()
      await deliveryBtn2.click()

      // 5. Verify address is ALREADY pre-populated on second crop without re-prompting
      await expect(page.locator('button:has-text("Change Address")').first()).toBeVisible({ timeout: 5000 })
      await expect(page.locator('button:has-text("Enter Delivery Address (Required)")')).not.toBeVisible()
    }

    await page.context().close()
  })

})
