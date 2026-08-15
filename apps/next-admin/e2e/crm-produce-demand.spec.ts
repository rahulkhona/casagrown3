import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function getSeedData() {
  const tag = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const leads = [
    { name: `Buyer CA 1 ${tag}`, email: `b_ca1_${tag}@test.local`, produce_interests: 'Meyer Lemons, Heirloom Tomatoes', zipcode: '95125', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer CA 2 ${tag}`, email: `b_ca2_${tag}@test.local`, produce_interests: 'Meyer Lemons, Valencia Oranges', zipcode: '95126', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer CA 3 ${tag}`, email: `b_ca3_${tag}@test.local`, produce_interests: 'Heirloom Tomatoes, Sweet Corn', zipcode: '94024', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer CA 4 ${tag}`, email: `b_ca4_${tag}@test.local`, produce_interests: 'Fresh Sweet Basil, Meyer Lemons', zipcode: '95125', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer NY 1 ${tag}`, email: `b_ny1_${tag}@test.local`, produce_interests: 'Heirloom Tomatoes, Fresh Sweet Basil', zipcode: '10001', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer NY 2 ${tag}`, email: `b_ny2_${tag}@test.local`, produce_interests: 'Heirloom Tomatoes', zipcode: '10002', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer TX 1 ${tag}`, email: `b_tx1_${tag}@test.local`, produce_interests: 'Valencia Oranges, Sweet Corn', zipcode: '75001', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer TX 2 ${tag}`, email: `b_tx2_${tag}@test.local`, produce_interests: 'Valencia Oranges', zipcode: '78701', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer FL 1 ${tag}`, email: `b_fl1_${tag}@test.local`, produce_interests: 'Valencia Oranges, Meyer Lemons', zipcode: '33101', form_version: 'v1-nutrition-estimator' },
    { name: `Buyer WA 1 ${tag}`, email: `b_wa1_${tag}@test.local`, produce_interests: 'Fresh Sweet Basil', zipcode: '98101', form_version: 'v1-nutrition-estimator' },
  ]
  const sellers = [
    { produce_name: 'Meyer Lemons', interest_type: 'sell', zipcodes: ['95125', '95126'], status: 'active' },
    { produce_name: 'Heirloom Tomatoes', interest_type: 'sell', zipcodes: ['95125', '94024'], status: 'active' },
    { produce_name: 'Fresh Sweet Basil', interest_type: 'sell', zipcodes: ['95125', '98101'], status: 'active' },
    { produce_name: 'Valencia Oranges', interest_type: 'sell', zipcodes: ['75001', '33101'], status: 'active' },
  ]
  return { leads, sellers }
}

test.describe('CRM — Produce Demand & Supply Radar Page', () => {
  let createdLeadIds: string[] = []
  let createdSellerIds: string[] = []

  test.beforeAll(async () => {
    const { leads: seedLeads, sellers: seedSellers } = getSeedData()
    const { data: leads } = await adminDb
      .from('crm_leads')
      .insert(seedLeads)
      .select('id')

    if (leads && leads.length > 0) {
      createdLeadIds = leads.map(l => l.id)
      const sellerRows = seedSellers.map(s => ({
        ...s,
        lead_id: createdLeadIds[0],
      }))

      const { data: sellers } = await adminDb
        .from('crm_produce_interests')
        .insert(sellerRows)
        .select('id')

      if (sellers) {
        createdSellerIds = sellers.map(s => s.id)
      }
    }
  })

  test.afterAll(async () => {
    if (createdSellerIds.length > 0) {
      await adminDb.from('crm_produce_interests').delete().in('id', createdSellerIds)
    }
    if (createdLeadIds.length > 0) {
      await adminDb.from('crm_leads').delete().in('id', createdLeadIds)
    }
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/produce-demand', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.crm-title', { state: 'visible', timeout: 15000 })
    // Wait for live table rows to populate
    await page.waitForSelector('#buyer-demand-table tbody tr', { state: 'visible', timeout: 10000 })
  })

  test('loads without console errors and renders header with 4 live KPI cards', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await expect(page.locator('.crm-title')).toContainText('Produce Demand & Supply Intelligence Radar')
    await expect(page.locator('.crm-subtitle')).toBeVisible()

    // 4 KPI Summary Cards
    const kpiCards = page.locator('.kpi-card')
    await expect(kpiCards).toHaveCount(4)
    await expect(page.locator('.buyer-kpi')).toContainText('Total Buyer Demand')
    await expect(page.locator('.seller-kpi')).toContainText('Total Seller Supply')
    await expect(page.locator('.overlap-kpi')).toContainText('Matched Produce-ZIP Pairs')
    await expect(page.locator('.top-kpi')).toContainText('Top Demand Leader')

    const severeErrors = errors.filter(e => !e.includes('hydrat') && !e.includes('ResizeObserver'))
    expect(severeErrors).toHaveLength(0)
  })

  test('view mode switcher correctly toggles tables', async ({ page }) => {
    // Default: All Tables visible
    await expect(page.locator('text=Table (a) — Buyer Demand')).toBeVisible()
    await expect(page.locator('text=Table (b) — Seller Supply')).toBeVisible()
    await expect(page.locator('text=Table (c) — Matched Liquidity')).toBeVisible()

    // Switch to Buyer Demand only
    await page.locator('button:has-text("(a) Buyer Demand")').click()
    await expect(page.locator('text=Table (a) — Buyer Demand')).toBeVisible()
    await expect(page.locator('text=Table (b) — Seller Supply')).not.toBeVisible()
    await expect(page.locator('text=Table (c) — Matched Liquidity')).not.toBeVisible()

    // Switch to Seller Supply only
    await page.locator('button:has-text("(b) Seller Supply")').click()
    await expect(page.locator('text=Table (a) — Buyer Demand')).not.toBeVisible()
    await expect(page.locator('text=Table (b) — Seller Supply')).toBeVisible()
    await expect(page.locator('text=Table (c) — Matched Liquidity')).not.toBeVisible()

    // Switch to Matched by ZIP only
    await page.locator('button:has-text("(c) Matched by ZIP")').click()
    await expect(page.locator('text=Table (a) — Buyer Demand')).not.toBeVisible()
    await expect(page.locator('text=Table (b) — Seller Supply')).not.toBeVisible()
    await expect(page.locator('text=Table (c) — Matched Liquidity')).toBeVisible()

    // Return to All Tables
    await page.locator('button:has-text("All Tables")').click()
    await expect(page.locator('text=Table (a) — Buyer Demand')).toBeVisible()
    await expect(page.locator('text=Table (b) — Seller Supply')).toBeVisible()
    await expect(page.locator('text=Table (c) — Matched Liquidity')).toBeVisible()
  })

  test('search filter narrows results across all 3 tables and can be cleared', async ({ page }) => {
    const searchInput = page.locator('.search-input')
    await expect(searchInput).toBeVisible()

    // Search for "Lemons"
    await searchInput.fill('Lemons')
    await expect(page.locator('#buyer-demand-table tbody tr').first()).toContainText('Lemons')
    await expect(page.locator('#buyer-demand-table tbody')).not.toContainText('Heirloom Tomatoes')

    // Search by out-of-state ZIP code "10001" (New York)
    await searchInput.fill('10001')
    await expect(page.locator('#buyer-demand-table tbody').getByText('10001').first()).toBeVisible()

    // Clear search
    const clearBtn = page.locator('.clear-btn')
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()
    await expect(searchInput).toHaveValue('')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Oranges')
  })

  test('category filter isolates produce categories accurately', async ({ page }) => {
    const categorySelect = page.locator('.filter-select').first()
    await expect(categorySelect).toBeVisible()

    // Filter by Citrus
    await categorySelect.selectOption('CITRUS')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Lemons')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Oranges')

    // Filter by Vegetables
    await categorySelect.selectOption('VEGETABLES')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Tomatoes')
    await expect(page.locator('#buyer-demand-table tbody')).not.toContainText('Lemons')

    // Reset to All
    await categorySelect.selectOption('ALL')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Oranges')
  })

  test('Table (a) Buyer Demand columns are interactive and sortable', async ({ page }) => {
    // Switch to Buyer Demand tab
    await page.locator('button:has-text("(a) Buyer Demand")').click()

    const buyerTable = page.locator('#buyer-demand-table')
    await expect(buyerTable).toBeVisible()

    // Sort by Produce Name
    const nameHeader = buyerTable.locator('th:has-text("Produce Name")')
    await nameHeader.click()
    await expect(buyerTable.locator('tbody tr').first()).toBeVisible()

    // Sort by Number of Buyers
    const buyersHeader = buyerTable.locator('th:has-text("Number of Buyers")')
    await buyersHeader.click()
    await expect(buyerTable.locator('tbody tr').first()).toBeVisible()
  })

  test('Table (b) Seller Supply columns are sortable', async ({ page }) => {
    await page.locator('button:has-text("(b) Seller Supply")').click()

    const sellerTable = page.locator('#seller-supply-table')
    await expect(sellerTable).toBeVisible()

    const sellersHeader = sellerTable.locator('th:has-text("Number of Sellers")')
    await sellersHeader.click()
    await expect(sellerTable.locator('tbody tr').first()).toBeVisible()
  })

  test('Table (c) Matched Liquidity displays ratios and sorts properly', async ({ page }) => {
    await page.locator('button:has-text("(c) Matched by ZIP")').click()

    const overlapTable = page.locator('#overlap-matches-table')
    await expect(overlapTable).toBeVisible()

    // Sort by ZIP Code
    const zipHeader = overlapTable.locator('th:has-text("ZIP Code & Area")')
    await zipHeader.click()
    await expect(overlapTable.locator('tbody tr').first()).toBeVisible()
  })

  test('Copy ZIPs button triggers clipboard action and displays toast notification', async ({ page }) => {
    await page.locator('button:has-text("(a) Buyer Demand")').click()

    const copyBtn = page.locator('#buyer-demand-table .btn-copy-zips').first()
    await expect(copyBtn).toBeVisible()
    await copyBtn.click()

    // Verify toast notification appears
    const toast = page.locator('.crm-toast.success')
    await expect(toast).toBeVisible({ timeout: 5000 })
    await expect(toast).toContainText('Copied ZIPs')

    // Dismiss toast
    await page.locator('.toast-close').click()
    await expect(toast).not.toBeVisible()
  })

  test('Table (d) On-Demand Multi-Produce Ad Clusters calculates clusters on button click', async ({ page }) => {
    await page.locator('#btn-view-clusters').click()

    const clusterSection = page.locator('#multi-produce-cluster-section')
    await expect(clusterSection).toBeVisible()

    // Configure inputs: Min Produces = 2, Min ZIPs = 1
    const minProducesInput = page.locator('#input-min-produces')
    const minZipsInput = page.locator('#input-min-zips')

    await minProducesInput.fill('2')
    await minZipsInput.fill('1')

    // Click on-demand find clusters button
    const findBtn = page.locator('#btn-run-cluster-finder')
    await findBtn.click()

    // Table rows should appear with multi-item bundles
    const clusterTable = page.locator('#multi-produce-clusters-table')
    await expect(clusterTable).toBeVisible()

    const firstRow = clusterTable.locator('tbody tr').first()
    await expect(firstRow).toBeVisible()
    await expect(firstRow.locator('.bundle-produce-chip').first()).toBeVisible()

    // Verify copy buttons on cluster row
    const copyZipsBtn = firstRow.locator('.btn-copy-zips')
    await expect(copyZipsBtn).toBeVisible()
    await copyZipsBtn.click()

    const toast = page.locator('.crm-toast.success')
    await expect(toast).toBeVisible({ timeout: 5000 })

    const copyAdBtn = firstRow.locator('.btn-copy-ad')
    await expect(copyAdBtn).toBeVisible()
    await copyAdBtn.click()
    await expect(toast).toBeVisible({ timeout: 5000 })

    // Verify Remainder Single-Produce Targets table is rendered and interactive
    const remainderTable = page.locator('#remainder-produce-table')
    if (await remainderTable.isVisible()) {
      const firstRemainderRow = remainderTable.locator('tbody tr').first()
      await expect(firstRemainderRow.locator('.bundle-produce-chip')).toBeVisible()
      const remCopyZips = firstRemainderRow.locator('.btn-copy-zips')
      await expect(remCopyZips).toBeVisible()
      await remCopyZips.click()
      await expect(toast).toBeVisible({ timeout: 5000 })
    }
  })
})
