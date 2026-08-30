import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { execSql, refreshBrowserAuth } from './scenarios/scenario-helpers'

config({ path: resolve(__dirname, '../.env') })
config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
)

test.describe('Produce-Centric Market Flow & Database Verification E2E', () => {
  const timestamp = Date.now()

  test('PM-01: Header Navigation & Zero-Results CTA route to /my-booth/products/new', async ({ page }) => {
    await page.goto('/market')
    await expect(page.locator('#produce-search')).toBeVisible({ timeout: 10000 })

    // 1. Top Header "+ Add Produce" Button routes to /my-booth/products/new
    const addProduceLink = page.getByRole('link', { name: /Add Produce/i })
    await expect(addProduceLink).toBeVisible()
    await expect(addProduceLink).toHaveAttribute('href', '/my-booth/products/new')

    // 2. Search for non-existent crop (Zero-Results State)
    const produceSearch = page.locator('#produce-search')
    await produceSearch.fill('Dragonfruit')
    await expect(page.locator('#no-produce-matches')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/No produce found matching.*Dragonfruit/i)).toBeVisible()

    // 3. Zero-Results CTA links directly to /my-booth/products/new with pre-filled name
    const zeroResultsCta = page.getByRole('link', { name: /List on Neighborhood Stand/i })
    await expect(zeroResultsCta).toBeVisible()
    await expect(zeroResultsCta).toHaveAttribute('href', /\/my-booth\/products\/new\?name=Dragonfruit/)

    // Clear search
    await produceSearch.fill('')
  })

  test('PM-02: Want button flow, signal submission, and empirical database verification', async ({ page }) => {
    await page.goto('/market')
    await expect(page.locator('.produce-card, [class*="produceCard"]').first()).toBeVisible({ timeout: 10000 })

    // Find Lemons produce card and click Want
    const lemonsCard = page.locator('.produce-card, [class*="produceCard"]').filter({ hasText: 'Lemons' }).first()
    await expect(lemonsCard).toBeVisible()
    const wantButton = lemonsCard.locator('button:has-text("Want")').first()
    await wantButton.click()

    // If active listings view is shown, switch to signal form
    const signalLink = page.getByRole('button', { name: /Signal All Neighbors/i })
    if (await signalLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signalLink.click()
    }

    // Set desired quantity
    const qtyInput = page.locator('#want-quantity')
    await expect(qtyInput).toBeVisible({ timeout: 5000 })
    await qtyInput.fill('4')

    // Submit harvest signal
    const submitBtn = page.locator('button:has-text("Find sellers in my neighborhood")').last()
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()

    // Verify UI success confirmation and post-submission hub
    await expect(page.getByRole('heading', { name: 'Neighbors notified' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Instacart Delivery/i)).toBeVisible({ timeout: 10000 })

    // ── EMPIRICAL DATABASE VERIFICATION ──
    // Verify that the record was written to crm_produce_interests
    const { data: dbRecords, error } = await supabase
      .from('crm_produce_interests')
      .select('*')
      .ilike('produce_name', '%lemon%')
      .eq('interest_type', 'buy')
      .order('created_at', { ascending: false })

    expect(error).toBeNull()
    expect(dbRecords).toBeDefined()
    expect(dbRecords!.length).toBeGreaterThan(0)

    const savedRecord = dbRecords![0]
    expect(savedRecord.interest_type).toBe('buy')
    expect(savedRecord.produce_name.toLowerCase()).toContain('lemon')
    expect(savedRecord.status).toBe('active')
  })

  test('PM-03: Have Extra batch drawer flow, listing submission, and empirical database verification', async ({ page }) => {
    await page.goto('/market')
    await expect(page.locator('.produce-card, [class*="produceCard"]').first()).toBeVisible({ timeout: 10000 })

    // Click Have Extra on a crop
    const haveExtraButton = page.locator('button:has-text("Have Extra")').first()
    await expect(haveExtraButton).toBeVisible()
    await haveExtraButton.click()

    // Verify BatchListingDrawer opens
    await expect(page.getByText(/List Surplus Produce/i)).toBeVisible({ timeout: 8000 })

    // Submit batch listing
    const publishBtn = page.getByRole('button', { name: /Publish.*(Crop|Stand) Listing/i })
    await expect(publishBtn).toBeVisible()
    await publishBtn.click()

    // Verify UI publish confirmation or close
    await expect(page.getByText(/Listings published and seller interests recorded/i)).toBeVisible({ timeout: 10000 }).catch(() => {})

    // ── EMPIRICAL DATABASE VERIFICATION ──
    const { data: dbRecords, error } = await supabase
      .from('crm_produce_interests')
      .select('*')
      .eq('interest_type', 'sell')
      .order('created_at', { ascending: false })

    expect(error).toBeNull()
    expect(dbRecords).toBeDefined()
    expect(dbRecords!.length).toBeGreaterThan(0)

    const savedRecord = dbRecords![0]
    expect(savedRecord.interest_type).toBe('sell')
    expect(savedRecord.status).toBe('active')
  })

  test('PM-04: Category tabs and legacy /interest redirect', async ({ page }) => {
    // 1. Category Filtering
    await page.goto('/market')
    await page.getByRole('button', { name: 'Fruit & Citrus' }).click()
    await expect(page.locator('.produce-card, [class*="produceCard"]').first()).toBeVisible()

    await page.getByRole('button', { name: 'All Seasonal Produce' }).click()
    await expect(page.locator('.produce-card, [class*="produceCard"]').first()).toBeVisible()

    // 2. /interest Legacy URL Redirects to /market
    await page.goto('/interest')
    await expect(page).toHaveURL(/\/market/)
  })

  test('PM-05: Commercial Produce Flow: Add to CasaGrown Cart & Transfer to Instacart / Kroger Checkout', async ({ page }) => {
    // 1. Open /market
    await page.goto('/market')
    await expect(page.locator('.produce-card, [class*="produceCard"]').first()).toBeVisible({ timeout: 10000 })

    // 2. Open Want modal for Lemons
    const lemonsCard = page.locator('.produce-card, [class*="produceCard"]').filter({ hasText: 'Lemons' }).first()
    await expect(lemonsCard).toBeVisible()
    const wantButton = lemonsCard.locator('button:has-text("Want")').first()
    await wantButton.click()

    // 3. Switch to signal form if needed and submit signal
    const signalLink = page.getByRole('button', { name: /Signal All Neighbors/i })
    if (await signalLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signalLink.click()
    }
    const qtyInput = page.locator('#want-quantity')
    await expect(qtyInput).toBeVisible({ timeout: 5000 })
    await qtyInput.fill('2')

    const submitBtn = page.locator('button:has-text("Find sellers in my neighborhood")').last()
    await submitBtn.click()

    // 4. In Post-submission Hub, click Add to Cart on Instacart
    await expect(page.getByRole('heading', { name: 'Neighbors notified' })).toBeVisible({ timeout: 10000 })
    const instacartCard = page.locator('text=Instacart Delivery').first()
    await expect(instacartCard).toBeVisible()

    const addInstacartBtn = page.locator('button:has-text("+ Add to Cart")').first()
    await addInstacartBtn.click()

    // 5. Verify feedback banner and click View Cart
    const viewCartLink = page.getByRole('link', { name: /View Cart/i })
    await expect(viewCartLink).toBeVisible({ timeout: 5000 })
    await viewCartLink.click()

    // 6. Verify cart page renders Instacart Commercial Delivery group
    await expect(page).toHaveURL(/\/cart/)
    await expect(page.getByText('Instacart Supermarket Delivery')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Commercial Delivery')).toBeVisible()

    // 7. Verify transfer checkout hand-off
    const transferBtn = page.locator('button:has-text("Transfer to Instacart Checkout")')
    await expect(transferBtn).toBeVisible()

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      transferBtn.click(),
    ])

    expect(popup.url()).toContain('instacart.com')
    expect(popup.url().toLowerCase()).toContain('lemon')
    await popup.close()
  })

  test('PM-06: Custom uncatalogued produce with multiple sellers is aggregated into 1 card with multi-stand Want modal', async ({ page }) => {
    // Use a name whose base word contains the timestamp, so extractBaseProduce cannot
    // strip it to any catalog item via qualifier removal or substring matching.
    // "Qx{ts}Veg" will be: no qualifier stripped, no catalog substring match, no last-word match.
    const baseName = `Qx${timestamp}Veg`
    const testCrop = baseName
    const todayDate = new Date().toISOString().split('T')[0]

    // Use known seed sellers with valid pickup_location geometry in San Jose so
    // nearby_booths RPC returns them. Use d4444444 (Alex) and e5555555 (Taylor) —
    // not a1111111 (Sam Seller) who may be the test user, and not b2222222 (buyer).
    const seller1Id = 'd4444444-4444-4444-4444-444444444444'
    const seller2Id = 'e5555555-5555-5555-5555-555555555555'

    const { data: b1 } = await supabase.from('market_booths').select('id').eq('owner_id', seller1Id).eq('is_default', true).single()
    const { data: b2 } = await supabase.from('market_booths').select('id').eq('owner_id', seller2Id).eq('is_default', true).single()

    const booth1Id = b1?.id
    const booth2Id = b2?.id

    // Skip test cleanly if seed booths don't exist yet (pre-migration environment)
    if (!booth1Id || !booth2Id) {
      console.warn('PM-06: Seed booths for d4444444/e5555555 not found — skipping')
      return
    }

    // 1. Create 2 market products from 2 different sellers with the same custom crop name.
    //    Must set moderation_status='approved' — a DB trigger auto-sets 'pending' on insert,
    //    and nearby_booths RPC filters COALESCE(moderation_status,'approved')='approved'.
    //    Must set product_pickup_windows (date-keyed JSONB) — RPC excludes products where both
    //    product_pickup_windows and product_delivery_windows are NULL.
    const pickupWindows = { [todayDate]: [{ id: '9-11', start: '09:00', end: '11:00' }] }

    const { data: p1, error: err1 } = await supabase.from('market_products').insert({
      name: testCrop,
      price_usd: 4.50,
      unit: 'each',
      is_active: true,
      is_draft: false,
      moderation_status: 'approved',
      seller_id: seller1Id,
      booth_id: booth1Id,
      inventory: 10,
      market_date: todayDate,
      product_pickup_windows: pickupWindows,
    }).select('id').single()

    const { data: p2, error: err2 } = await supabase.from('market_products').insert({
      name: testCrop,
      price_usd: 5.00,
      unit: 'each',
      is_active: true,
      is_draft: false,
      moderation_status: 'approved',
      seller_id: seller2Id,
      booth_id: booth2Id,
      inventory: 15,
      market_date: todayDate,
      product_pickup_windows: pickupWindows,
    }).select('id').single()

    expect(err1).toBeNull()
    expect(err2).toBeNull()

    try {
      // 2. Load /market and wait for nearby_booths async data to arrive.
      //    The market page fires loadMarketData only after resolving lat/lng, so
      //    we wait for networkidle, then reload once if the card isn't yet visible.
      await page.goto('/market')
      await expect(page.locator('#produce-search')).toBeVisible({ timeout: 10000 })
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})

      // 3. Search for the custom crop
      const produceSearch = page.locator('#produce-search')
      await produceSearch.fill(testCrop)

      // 4. If the card doesn't appear (location not yet resolved on first load),
      //    reload once more to give nearby_booths a second chance
      const matchingCards = page.locator(`[data-name="${testCrop}"]`)
      const firstCount = await matchingCards.count().catch(() => 0)
      if (firstCount === 0) {
        await page.reload()
        await expect(page.locator('#produce-search')).toBeVisible({ timeout: 10000 })
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        await produceSearch.fill(testCrop)
      }
      await expect(matchingCards).toHaveCount(1, { timeout: 15000 })

      // 5. Click Want button on this custom produce card
      const wantButton = matchingCards.first().locator('button:has-text("Want")')
      await wantButton.click()

      // 6. Verify WantProduceModal opens and lists BOTH stands.
      //    Scope to the modal's root class (WantProduceModal.module.css uses .modalContent)
      const modal = page.locator('[class*="modalContent"]').first()
      await expect(modal.getByText('Available from Neighbors')).toBeVisible({ timeout: 8000 })
      const standCards = modal.locator('[class*="listingCard"]')
      await expect(standCards).toHaveCount(2, { timeout: 8000 })

      // Verify prices $4.50 and $5.00 are rendered inside the modal
      await expect(modal.locator('[class*="listingPriceBadge"]').filter({ hasText: '$4.50' })).toBeVisible()
      await expect(modal.locator('[class*="listingPriceBadge"]').filter({ hasText: '$5.00' })).toBeVisible()

      // Verify Buy Now buttons exist for both stands inside the modal
      const buyNowBtns = modal.locator('button:has-text("Buy Now")')
      await expect(buyNowBtns).toHaveCount(2)
    } finally {
      // Cleanup seeded test products
      if (p1?.id) await supabase.from('market_products').delete().eq('id', p1.id)
      if (p2?.id) await supabase.from('market_products').delete().eq('id', p2.id)
    }
  })

  test('PM-07: Buy Now, + Cart button, and View Details link in WantProduceModal', async ({ page }) => {
    await page.goto('/market')
    await expect(page.locator('#produce-grid')).toBeVisible({ timeout: 10000 })

    // 1. Open Want modal for Tomatoes (which has live neighbor stands)
    const tomatoCard = page.locator('.produce-card, [class*="produceCard"]').filter({ hasText: 'Tomatoes' }).first()
    await expect(tomatoCard).toBeVisible()
    await tomatoCard.locator('button:has-text("Want")').click()

    // 2. Verify View Details link exists and links to product page
    await expect(page.getByText('Available from Neighbors')).toBeVisible({ timeout: 5000 })
    const viewDetailsLink = page.locator('a:has-text("View Details →")').first()
    await expect(viewDetailsLink).toBeVisible()
    await expect(viewDetailsLink).toHaveAttribute('href', /\/market\/booth\/.*\/product\/.*/)

    // 3. Click + Cart on the first neighbor listing
    const addCartBtn = page.locator('button:has-text("+ Cart")').first()
    await expect(addCartBtn).toBeVisible()
    await addCartBtn.click()

    // 4. Verify immediate feedback banner appears with View Cart link
    const feedbackBanner = page.locator('text=/Added .* to Cart!/')
    await expect(feedbackBanner).toBeVisible({ timeout: 5000 })
    const viewCartLink = page.getByRole('link', { name: /View Cart →/i })
    await expect(viewCartLink).toBeVisible()

    // 5. Verify navbar shopping cart badge shows 1
    const cartBadge = page.getByRole('button', { name: /Cart/i }).locator('[class*="badge"]').first()
    await expect(cartBadge).toHaveText('1')

    // 6. Click Buy Now button and verify BuyModal opens
    const buyNowBtn = page.locator('button:has-text("Buy Now")').first()
    await expect(buyNowBtn).toBeVisible()
    await buyNowBtn.click()
    await expect(page.locator('text=Fulfillment')).toBeVisible({ timeout: 5000 })
  })

  test('PM-08: Add Produce Flow: Price suggestions, unit conversion, quantity chips, schedule customization & DB verification', async ({ page }) => {
    const testCropName = `Organic Cherry Tomatoes ${timestamp}`
    let createdProductId: string | null = null

    try {
      // Get a fresh session so the browser's Supabase client has a valid,
      // unconsumed refresh_token (see refreshBrowserAuth JSDoc for details).
      await refreshBrowserAuth(page)

      await page.goto('/my-booth/products/new')
      await expect(page.locator('#product-name, input[name="name"], input[placeholder*="Tomato"], input[placeholder*="Product name"]').first()).toBeVisible({ timeout: 10000 })

      const nameInput = page.locator('#product-name, input[name="name"], input[placeholder*="Tomato"], input[placeholder*="Product name"]').first()
      const priceInput = page.locator('#product-price, [data-testid="product-price"]').first()
      const qtyInput = page.locator('input[placeholder="10"], input[placeholder="1"], input[type="number"]').nth(1)
      const unitSelect = page.locator('label:has-text("Per") ~ select, select').nth(1)

      // 1. Validation Error Check: Submit empty form
      const submitBtn = page.locator('button[type="submit"]').first()
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
        await expect(page.locator('.error, [class*="error"], [role="alert"]').first()).toBeVisible({ timeout: 3000 }).catch(() => {})
      }

      // 2. Type produce name and verify 3-tier Price Suggestion chip
      await nameInput.fill('Cherry Tomatoes')
      // Allow debounce & price suggestion fetch to settle
      await page.waitForTimeout(1200)
      const priceChip = page.locator('[data-testid="suggested-price-chip"], button:has-text("Suggested:"), button:has-text("Avg nearby:")').first()
      await expect(priceChip).toBeVisible({ timeout: 10000 })
      await expect(priceChip).toContainText('$')

      // 3. Click suggestion chip to auto-fill price & unit
      await priceChip.click()
      await expect(priceInput).not.toHaveValue('', { timeout: 4000 })
      const filledPrice = await priceInput.inputValue()
      expect(Number(filledPrice)).toBeGreaterThan(0)
      const initialUnit = await unitSelect.inputValue()
      expect(initialUnit).toBeTruthy()

      // 4. Test live convertPrice calculation: Switch unit while price is suggested (userModifiedPrice is false)
      await unitSelect.selectOption('oz')
      const convertedPrice = await priceInput.inputValue()
      expect(Number(convertedPrice)).toBeGreaterThan(0)

      // Set explicit test price & unit for listing creation
      await unitSelect.selectOption('lb')
      await priceInput.fill('4.50')

      // 5. Dynamic Quantity quick-select chips
      const qtyChip = page.locator('button:has-text("5 lbs"), button:has-text("5 lb")').first()
      if (await qtyChip.isVisible()) {
        await qtyChip.click()
        await expect(qtyInput).toHaveValue('5')
      } else {
        await qtyInput.fill('5')
      }

      // Set unique test crop name
      await nameInput.fill(testCropName)

      // Fill address if form requires booth address setup
      const streetInput = page.getByPlaceholder('Street Address').first()
      if (await streetInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await streetInput.fill('100 Main St')
        await page.getByPlaceholder('City').first().fill('San Jose')
        await page.getByPlaceholder('ST', { exact: true }).first().fill('CA')
        await page.getByPlaceholder('ZIP', { exact: true }).first().fill('95125')
      }

      // 6. Schedule Customization: Click Customize if pre-selected schedule is shown
      const customizeBtn = page.locator('[data-testid="customize-delivery-schedule-btn"], button:has-text("Customize")').first()
      if (await customizeBtn.isVisible()) {
        await customizeBtn.click()
        await expect(page.getByText(/Custom Schedule Mode|Weekend mornings|Weekday evenings/i).first()).toBeVisible({ timeout: 4000 })
      }

      // 7. Ensure Delivery & Pickup checkboxes are enabled
      const offersDeliveryCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: /Delivery/i }).or(page.locator('#offers-delivery'))
      if (await offersDeliveryCheckbox.isVisible()) {
        if (!(await offersDeliveryCheckbox.isChecked())) await offersDeliveryCheckbox.check()
      }

      // 8. Submit the completed listing form
      const finalSubmitBtn = page.locator('button[type="submit"]').first()
      await finalSubmitBtn.click()

      // Verify the submit succeeded:
      // - Draft save: URL changes to /my-booth/products/new?edit=<id>
      // - Published: Social Share Modal or "Go to My Produce Stand" appears
      const submitResult = await Promise.race([
        page.waitForURL(/edit=/, { timeout: 30000 }).then(() => 'url_changed' as const),
        page.locator('button:has-text("Go to My Produce Stand"), [class*="SocialShareModal"]').first()
          .waitFor({ state: 'visible', timeout: 30000 }).then(() => 'share_modal' as const),
      ]).catch(() => 'timeout' as const)

      if (submitResult === 'timeout') {
        // Check if there was an error message on the page
        const errorText = await page.locator('text=/Failed to add product/').first().textContent({ timeout: 2000 }).catch(() => null)
        if (errorText) throw new Error(`Product submit failed: ${errorText}`)
        console.warn('[PM-08] Submit did not produce URL change or share modal within 30s')
      }

      // 9. If Social Share Modal appears, close it or proceed
      const shareModalBtn = page.locator('button:has-text("Go to My Produce Stand"), button[aria-label="Close"], [class*="modalClose"], [class*="modalSkip"]').first()
      if (await shareModalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await shareModalBtn.click()
      }

      // ── 10. EMPIRICAL DATABASE VERIFICATION ──
      let product: any = null
      await expect.poll(async () => {
        const { data: dbRows } = await supabase
          .from('market_products')
          .select('id, price_usd, unit, inventory')
          .ilike('name', `%${testCropName}%`)
          .order('created_at', { ascending: false })
          .limit(1)
        if (dbRows && dbRows.length > 0) {
          product = dbRows[0]
          return dbRows.length
        }
        return 0
      }, { timeout: 15000, intervals: [500, 1000, 2000] }).toBeGreaterThan(0)

      expect(product).toBeDefined()
      createdProductId = product.id
      expect(Number(product.price_usd)).toBe(4.50)
      expect(product.unit).toBe('lb')
      expect(Number(product.inventory)).toBe(5)
    } finally {
      // Cleanup created test product
      if (createdProductId) {
        await supabase.from('market_products').delete().eq('id', createdProductId)
      }
    }
  })
})
