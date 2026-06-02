/**
 * Product Detail Page — Distance Checker & DM Button
 *
 * Tests:
 * PDP1  Distance checker button appears on PDP for non-owner buyer
 * PDP2  DM button visible for authenticated buyer on another seller's product
 * PDP3  DM button NOT visible when viewing own product
 * PDP4  Q&A section shows 💬 icon in title
 *
 * Strategy:
 * - Beth (buyer) views a seller's PDP that offers both pickup and delivery
 * - Verifies distance checker UI and DM button exist
 * - Maria (seller) views her own PDP to verify DM is hidden
 */
import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  navigateTo,
  execSql,
  TEST_USERS,
} from './scenario-helpers'

test.describe('PDP — Distance Checker & DM Button', () => {
  // Find a product that offers both pickup and delivery
  let productId = ''
  let boothId = ''

  test.beforeAll(async () => {
    // Find a product from a seller who offers both delivery and pickup
    const row = execSql(
      `SELECT p.id, b.id FROM market_products p
       JOIN market_booths b ON b.owner_id = p.seller_id
       WHERE p.is_active = true
         AND b.offers_delivery = true
         AND b.offers_pickup = true
         AND p.seller_id != 'b2222222-2222-2222-2222-222222222222'
       LIMIT 1`
    ).trim()

    if (row) {
      const parts = row.split('|').map(s => s.trim())
      productId = parts[0]
      boothId = parts[1]
    }
  })

  test('PDP1 — Distance checker button appears on PDP for buyer', async ({ browser }) => {
    if (!productId) { test.skip(); return }
    const page = await loginAsUser(browser, 'beth')

    await navigateTo(page, `/market/booth/${boothId}/product/${productId}`)
    await page.waitForTimeout(3000)

    // The distance checker form renders as either:
    // "📍 Check your distance" (when no distance calculated yet)
    // "🔄 Check another address" (when distance already calculated from profile/market search)
    // Or it may auto-compute from the buyer's saved address
    const body = await page.locator('body').innerText()
    const lower = body.toLowerCase()

    const hasDistanceChecker =
      lower.includes('check your distance') ||
      lower.includes('check another address') ||
      lower.includes('miles away') ||
      lower.includes('within range') ||
      lower.includes('outside range')

    console.log(`[PDP1] Distance checker visible: ${hasDistanceChecker}`)
    expect(hasDistanceChecker).toBe(true)

    await page.context().close()
  })

  test('PDP2 — DM button visible for buyer on another seller\'s product', async ({ browser }) => {
    if (!productId) { test.skip(); return }
    const page = await loginAsUser(browser, 'beth')

    await navigateTo(page, `/market/booth/${boothId}/product/${productId}`)
    await page.waitForTimeout(2000)

    // Should see DM button (💬 DM <seller name>) — it's a <button>, not <a>
    const dmBtn = page.locator('button:has-text("💬 DM")')
    const visible = await dmBtn.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`[PDP2] DM button visible for buyer: ${visible}`)
    expect(visible).toBe(true)

    // Verify the button text contains "DM" (button uses router.push, not href)
    if (visible) {
      const btnText = await dmBtn.textContent()
      console.log(`[PDP2] DM button text: ${btnText}`)
      expect(btnText).toContain('DM')
    }

    await page.context().close()
  })

  test('PDP3 — DM button NOT visible when viewing own product', async ({ browser }) => {
    // Find Maria's own product
    const mariaId = execSql(
      `SELECT id FROM auth.users WHERE email = '${TEST_USERS.maria.email}'`
    ).trim()

    const mariaProduct = execSql(
      `SELECT p.id, b.id FROM market_products p
       JOIN market_booths b ON b.owner_id = p.seller_id
       WHERE p.seller_id = '${mariaId}' AND p.is_active = true
       LIMIT 1`
    ).trim()

    if (!mariaProduct) { test.skip(); return }

    const [mProductId, mBoothId] = mariaProduct.split('|').map(s => s.trim())
    const page = await loginAsUser(browser, 'maria')

    await navigateTo(page, `/market/booth/${mBoothId}/product/${mProductId}`)
    await page.waitForTimeout(2000)

    // DM button should NOT be visible for own product
    const dmBtn = page.locator('button:has-text("💬 DM")')
    const visible = await dmBtn.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`[PDP3] DM button visible for own product: ${visible}`)
    expect(visible).toBe(false)

    await page.context().close()
  })

  test('PDP4 — Q&A section shows 💬 icon in title', async ({ browser }) => {
    if (!productId) { test.skip(); return }
    const page = await loginAsUser(browser, 'beth')

    await navigateTo(page, `/market/booth/${boothId}/product/${productId}`)
    await page.waitForTimeout(2000)

    // Q&A section title should have 💬
    const qaTitle = page.getByText('💬 Questions & Answers')
    const visible = await qaTitle.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`[PDP4] Q&A title with 💬 icon: ${visible}`)
    expect(visible).toBe(true)

    await page.context().close()
  })
})
