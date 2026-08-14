import { test, expect } from '@playwright/test'

/**
 * Produce Demand & Supply Intelligence Radar — Playwright E2E Tests
 *
 * Covers:
 *  - Page header & 4 summary KPI metric cards
 *  - View mode switching (All 3 Tables, Buyer Demand, Seller Supply, Matched by ZIP)
 *  - Real-time search filtering by produce name and ZIP code
 *  - Category filter dropdown & minimum count threshold filter
 *  - Table (a) Buyer Demand rendering & column sorting
 *  - Table (b) Seller Supply rendering & column sorting
 *  - Table (c) Matched Liquidity rendering & column sorting
 *  - Interactive ZIP density pills & 1-click clipboard copy toasts
 *  - Console error & hydration validation
 */

test.describe('CRM — Produce Demand & Supply Radar Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm/produce-demand', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.crm-title', { state: 'visible', timeout: 15000 })
  })

  test('loads without console errors and renders header with 4 KPI cards', async ({ page }) => {
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
    // Default: All 3 Tables visible
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

    // Return to All 3 Tables
    await page.locator('button:has-text("All 3 Tables")').click()
    await expect(page.locator('text=Table (a) — Buyer Demand')).toBeVisible()
    await expect(page.locator('text=Table (b) — Seller Supply')).toBeVisible()
    await expect(page.locator('text=Table (c) — Matched Liquidity')).toBeVisible()
  })

  test('search filter narrows results across all 3 tables and can be cleared', async ({ page }) => {
    const searchInput = page.locator('.search-input')
    await expect(searchInput).toBeVisible()

    // Search for "Meyer Lemons"
    await searchInput.fill('Meyer Lemons')
    await expect(page.locator('#buyer-demand-table tbody tr').first()).toContainText('Meyer Lemons')
    await expect(page.locator('#buyer-demand-table tbody')).not.toContainText('Heirloom Tomatoes')
    await expect(page.locator('#seller-supply-table tbody tr').first()).toContainText('Meyer Lemons')

    // Search by ZIP code "95125"
    await searchInput.fill('95125')
    await expect(page.locator('#buyer-demand-table tbody').getByText('95125').first()).toBeVisible()

    // Clear search
    const clearBtn = page.locator('.clear-btn')
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()
    await expect(searchInput).toHaveValue('')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Heirloom Tomatoes')
  })

  test('category filter isolates produce categories accurately', async ({ page }) => {
    const categorySelect = page.locator('.filter-select').first()
    await expect(categorySelect).toBeVisible()

    // Filter by Citrus
    await categorySelect.selectOption('CITRUS')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Meyer Lemons')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Valencia Oranges')
    await expect(page.locator('#buyer-demand-table tbody')).not.toContainText('Heirloom Tomatoes')
    await expect(page.locator('#buyer-demand-table tbody')).not.toContainText('Fresh Sweet Basil')

    // Filter by Herbs
    await categorySelect.selectOption('HERBS')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Fresh Sweet Basil')
    await expect(page.locator('#buyer-demand-table tbody')).not.toContainText('Meyer Lemons')

    // Reset to All
    await categorySelect.selectOption('ALL')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Heirloom Tomatoes')
  })

  test('minimum count threshold filter restricts items', async ({ page }) => {
    const minCountSelect = page.locator('.filter-select').nth(1)
    await expect(minCountSelect).toBeVisible()

    // Select 40+ People
    await minCountSelect.selectOption('40')
    // Heirloom Tomatoes (84) and Lemons (68) should be visible, Raw Honey (36) should not
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Heirloom Tomatoes')
    await expect(page.locator('#buyer-demand-table tbody')).not.toContainText('Wildflower Honey')

    // Reset to Any
    await minCountSelect.selectOption('0')
    await expect(page.locator('#buyer-demand-table tbody')).toContainText('Wildflower Honey')
  })

  test('Table (a) Buyer Demand columns are interactive and sortable', async ({ page }) => {
    // Switch to Buyer Demand tab for isolated table testing
    await page.locator('button:has-text("(a) Buyer Demand")').click()

    const buyerTable = page.locator('#buyer-demand-table')
    await expect(buyerTable).toBeVisible()

    // Sort by Produce Name
    const nameHeader = buyerTable.locator('th:has-text("Produce Name")')
    await nameHeader.click()
    await expect(buyerTable.locator('tbody tr').first()).toContainText('Fresh Sweet Basil')

    await nameHeader.click()
    await expect(buyerTable.locator('tbody tr').first()).toContainText('Wildflower Honey')

    // Sort by Number of Buyers
    const buyersHeader = buyerTable.locator('th:has-text("Number of Buyers")')
    await buyersHeader.click()
    // Should be sorted by buyers count asc
    await expect(buyerTable.locator('tbody tr').first()).toContainText('Wildflower Honey')

    await buyersHeader.click()
    // Should be sorted by buyers count desc
    await expect(buyerTable.locator('tbody tr').first()).toContainText('Heirloom Tomatoes')
  })

  test('Table (b) Seller Supply columns are sortable', async ({ page }) => {
    await page.locator('button:has-text("(b) Seller Supply")').click()

    const sellerTable = page.locator('#seller-supply-table')
    await expect(sellerTable).toBeVisible()

    // Sort by Number of Sellers
    const sellersHeader = sellerTable.locator('th:has-text("Number of Sellers")')
    await sellersHeader.click()
    await expect(sellerTable.locator('tbody tr').first()).toContainText('Wildflower Honey')

    await sellersHeader.click()
    await expect(sellerTable.locator('tbody tr').first()).toContainText('Heirloom Tomatoes')
  })

  test('Table (c) Matched Liquidity displays ratios, badges, and sorts properly', async ({ page }) => {
    await page.locator('button:has-text("(c) Matched by ZIP")').click()

    const overlapTable = page.locator('#overlap-matches-table')
    await expect(overlapTable).toBeVisible()

    // Verify market state badges
    await expect(page.locator('.state-badge.deficit').first()).toBeVisible()
    await expect(page.locator('.state-badge.deficit').first()).toContainText('Buyer Deficit')

    // Sort by ZIP Code
    const zipHeader = overlapTable.locator('th:has-text("ZIP Code & Area")')
    await zipHeader.click()
    await expect(overlapTable.locator('tbody tr').first()).toContainText('94022')

    // Sort by Buyers in ZIP
    const buyersZipHeader = overlapTable.locator('th:has-text("Buyers in ZIP")')
    await buyersZipHeader.click() // Toggles to asc (lowest)
    await expect(overlapTable.locator('tbody tr').first()).toContainText('Satsuma Mandarins')

    await buyersZipHeader.click() // Toggles back to desc (highest)
    await expect(overlapTable.locator('tbody tr').first()).toContainText('Heirloom Tomatoes')
  })

  test('Copy ZIPs button triggers clipboard action and displays toast notification', async ({ page }) => {
    // Switch to Buyer Demand tab
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
})
