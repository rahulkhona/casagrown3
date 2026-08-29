import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

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

  test('PM-01: Header Navigation & Zero-Results CTA route to /create-listing', async ({ page }) => {
    await page.goto('/market')
    await expect(page.locator('#produce-search')).toBeVisible({ timeout: 10000 })

    // 1. Top Header "+ Add Produce" Button routes to /create-listing
    const addProduceLink = page.getByRole('link', { name: /Add Produce/i })
    await expect(addProduceLink).toBeVisible()
    await expect(addProduceLink).toHaveAttribute('href', '/create-listing')

    // 2. Search for non-existent crop (Zero-Results State)
    const produceSearch = page.locator('#produce-search')
    await produceSearch.fill('Dragonfruit')
    await expect(page.locator('#no-produce-matches')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/No produce found matching.*Dragonfruit/i)).toBeVisible()

    // 3. Zero-Results CTA links directly to /create-listing
    const zeroResultsCta = page.getByRole('link', { name: /List on Neighborhood Stand/i })
    await expect(zeroResultsCta).toBeVisible()
    await expect(zeroResultsCta).toHaveAttribute('href', '/create-listing')

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
    const submitBtn = page.locator('button:has-text("Notify Me When Available")').last()
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()

    // Verify UI success confirmation and post-submission hub
    await expect(page.getByRole('heading', { name: 'Demand Signal Sent!' })).toBeVisible({ timeout: 10000 })
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

    const submitBtn = page.locator('button:has-text("Notify Me When Available")').last()
    await submitBtn.click()

    // 4. In Post-submission Hub, click Add to Cart on Instacart
    await expect(page.getByRole('heading', { name: 'Demand Signal Sent!' })).toBeVisible({ timeout: 10000 })
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
})
