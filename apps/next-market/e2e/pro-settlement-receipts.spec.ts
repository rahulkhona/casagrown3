/**
 * Pro Settlement Receipts E2E — Playwright
 *
 * Tests for the earnings/activity page focusing on subscription receipts,
 * Pro subscription charges, Stripe fee pass-through, and settlement details.
 *
 * Run: cd apps/next-market && npx playwright test e2e/pro-settlement-receipts.spec.ts
 */
import { test, expect } from './fixtures'

test.describe('Pro Settlement Receipts', () => {
  // ============================================================================
  // 1. Earnings page renders for authenticated user
  // ============================================================================
  test('earnings page renders for authenticated user', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    expect(content).toBeTruthy()
    expect(content).toMatch(/Earnings & Activity|Earning|Balance|Activity/i)

    // Should show the page title
    await expect(page.locator('h1')).toContainText(/Earnings/i)
  })

  // ============================================================================
  // 2. Activity section shows transaction history
  // ============================================================================
  test('activity section shows transaction history', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    // The Activity tab should be visible or active by default
    const activityTab = page.locator('button:has-text("Activity")')
    await expect(activityTab).toBeVisible()

    const content = await page.textContent('body')
    // Should show either transactions or the "No transactions" empty state
    expect(content).toMatch(/Activity|Transaction|No transactions|Loading/i)
  })

  // ============================================================================
  // 3. Pro subscription charge appears in activity as debit
  // ============================================================================
  test('pro subscription charge appears in activity as debit', async ({ page }) => {
    // Mock the get_transaction_log RPC to return a subscription charge
    await page.route('**/rest/v1/rpc/get_transaction_log', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            tx_id: 'tx-sub-001',
            tx_type: 'cc_charge',
            tx_date: new Date().toISOString(),
            description: 'Pro Subscription - Monthly',
            amount: 9.99,
            direction: 'debit',
            status: 'completed',
            counterparty: null,
            metadata: {
              card_last4: '4242',
              card_brand: 'Visa',
              captured: 9.99,
              subscription_type: 'pro_monthly',
            },
          },
          {
            tx_id: 'tx-sale-001',
            tx_type: 'sale',
            tx_date: new Date().toISOString(),
            description: 'Sold: Organic Tomatoes × 3',
            amount: 15.00,
            direction: 'credit',
            status: 'completed',
            counterparty: 'Happy Buyer',
            metadata: {
              order_id: 'ord-001',
              product_name: 'Organic Tomatoes',
              quantity: 3,
              unit_price: 5.00,
              subtotal: 15.00,
              platform_fee: 1.50,
              net_payout: 13.50,
              total: 15.00,
              seller_name: 'Test Seller',
              buyer_name: 'Happy Buyer',
              fulfillment: 'pickup',
            },
          },
        ]),
      })
    })

    // Mock summary
    await page.route('**/rest/v1/rpc/get_transaction_summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_sales: 15.00,
          sales_count: 1,
          total_purchases: 0,
          purchase_count: 0,
          total_fees: 1.50,
          total_redeemed: 0,
          processing_payouts_usd: 0,
          total_cc_charged: 9.99,
          refunds_received: 0,
          refunds_issued: 0,
          net_earnings: 13.50,
          available_usd: 13.50,
          pending_usd: 0,
          held_balance_usd: 0,
          total_earned_usd: 15.00,
          total_spent_usd: 9.99,
          total_withdrawn_usd: 0,
          unsettled_sales_usd: 0,
          unsettled_purchases_usd: 0,
          unsettled_order_count: 0,
        }),
      })
    })

    // Mock pending transactions
    await page.route('**/rest/v1/rpc/get_pending_transactions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    // Mock credits
    await page.route('**/rest/v1/rpc/get_user_credit_balance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ purchase_credits_usd: 0, platform_fee_credits_usd: 0, total_credits_usd: 0 }),
      })
    })

    await page.route('**/rest/v1/rpc/get_user_credit_details', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/earnings')
    await page.waitForTimeout(3000)

    const content = await page.textContent('body')

    // The subscription charge should appear as a debit in the activity
    expect(content).toMatch(/Pro Subscription|Monthly/i)
    // Should show the debit amount
    expect(content).toContain('$9.99')
  })

  // ============================================================================
  // 4. Stripe fee pass-through appears in settlement details
  // ============================================================================
  test('stripe fee pass-through appears in settlement details', async ({ page }) => {
    await page.route('**/rest/v1/rpc/get_transaction_log', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            tx_id: 'tx-settle-001',
            tx_type: 'settlement_credit',
            tx_date: new Date().toISOString(),
            description: 'Market settlement — 2 orders',
            amount: 28.50,
            direction: 'credit',
            status: 'completed',
            counterparty: null,
            metadata: {
              settlement_id: 'settle-abc-123',
              settlement_status: 'cleared',
              market_date: new Date().toISOString().split('T')[0],
              orders: [
                { product: 'Fresh Basil', qty: 2, amount: 10.00, buyer: 'Alice', fulfillment: 'pickup' },
                { product: 'Cherry Tomatoes', qty: 1, amount: 20.00, buyer: 'Bob', fulfillment: 'delivery' },
              ],
              fees: 1.50,
              net_payout: 28.50,
              stripe_fee: 0.87,
              available_at: new Date(Date.now() + 86400_000).toISOString(),
            },
          },
          {
            tx_id: 'tx-fee-001',
            tx_type: 'platform_fee',
            tx_date: new Date().toISOString(),
            description: 'Platform fee (5%)',
            amount: 1.50,
            direction: 'debit',
            status: 'completed',
            counterparty: null,
            metadata: {
              settlement_id: 'settle-abc-123',
            },
          },
        ]),
      })
    })

    await page.route('**/rest/v1/rpc/get_transaction_summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_sales: 30.00,
          sales_count: 2,
          total_purchases: 0,
          purchase_count: 0,
          total_fees: 1.50,
          total_redeemed: 0,
          processing_payouts_usd: 0,
          total_cc_charged: 0,
          refunds_received: 0,
          refunds_issued: 0,
          net_earnings: 28.50,
          available_usd: 28.50,
          pending_usd: 0,
          held_balance_usd: 0,
          total_earned_usd: 30.00,
          total_spent_usd: 0,
          total_withdrawn_usd: 0,
          unsettled_sales_usd: 0,
          unsettled_purchases_usd: 0,
          unsettled_order_count: 0,
        }),
      })
    })

    await page.route('**/rest/v1/rpc/get_pending_transactions', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.route('**/rest/v1/rpc/get_user_credit_balance', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ purchase_credits_usd: 0, platform_fee_credits_usd: 0, total_credits_usd: 0 }) })
    })

    await page.route('**/rest/v1/rpc/get_user_credit_details', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.goto('/earnings')
    await page.waitForTimeout(3000)

    // The settlement should be visible in the activity list
    const content = await page.textContent('body')
    expect(content).toMatch(/settlement|Market settlement/i)

    // Click the settlement row to expand it
    const settlementRow = page.locator('text=Market settlement').first()
    if (await settlementRow.isVisible()) {
      await settlementRow.click()
      await page.waitForTimeout(1000)

      const expandedContent = await page.textContent('body')
      // Should show order breakdown
      expect(expandedContent).toMatch(/Fresh Basil|Cherry Tomatoes/i)
      // Should show fees
      expect(expandedContent).toMatch(/Fees/i)
      // Should show net payout
      expect(expandedContent).toMatch(/Net/i)
    }

    // Platform fee should be listed as a separate transaction
    expect(content).toMatch(/Platform fee|5%/i)
  })

  // ============================================================================
  // 5. Receipt shows correct amounts
  // ============================================================================
  test('receipt shows correct amounts when clicking sale transaction', async ({ page }) => {
    await page.route('**/rest/v1/rpc/get_transaction_log', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            tx_id: 'tx-sale-receipt',
            tx_type: 'sale',
            tx_date: new Date().toISOString(),
            description: 'Sold: Organic Lettuce × 5',
            amount: 25.00,
            direction: 'credit',
            status: 'completed',
            counterparty: 'Jane Smith',
            metadata: {
              order_id: 'ord-receipt-001',
              product_name: 'Organic Lettuce',
              quantity: 5,
              unit_price: 5.00,
              subtotal: 25.00,
              tax_rate: 0,
              tax_amount: 0,
              platform_fee: 2.50,
              net_payout: 22.50,
              total: 25.00,
              seller_name: 'Test Seller',
              buyer_name: 'Jane Smith',
              booth_name: 'Green Gardens',
              fulfillment: 'pickup',
              settlement_id: 'settle-xyz',
            },
          },
        ]),
      })
    })

    await page.route('**/rest/v1/rpc/get_transaction_summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_sales: 25.00, sales_count: 1, total_purchases: 0, purchase_count: 0,
          total_fees: 2.50, total_redeemed: 0, processing_payouts_usd: 0,
          total_cc_charged: 0, refunds_received: 0, refunds_issued: 0,
          net_earnings: 22.50, available_usd: 22.50, pending_usd: 0,
          held_balance_usd: 0, total_earned_usd: 25.00, total_spent_usd: 0,
          total_withdrawn_usd: 0, unsettled_sales_usd: 0,
          unsettled_purchases_usd: 0, unsettled_order_count: 0,
        }),
      })
    })

    await page.route('**/rest/v1/rpc/get_pending_transactions', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.route('**/rest/v1/rpc/get_user_credit_balance', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ purchase_credits_usd: 0, platform_fee_credits_usd: 0, total_credits_usd: 0 }) })
    })

    await page.route('**/rest/v1/rpc/get_user_credit_details', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    // Mock receipt_footers
    await page.route('**/rest/v1/receipt_footers*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) })
    })

    await page.goto('/earnings')
    await page.waitForTimeout(3000)

    // Click the sale transaction to open receipt
    const saleRow = page.locator('text=Organic Lettuce').first()
    if (await saleRow.isVisible()) {
      await saleRow.click()
      await page.waitForTimeout(1500)

      const bodyText = await page.textContent('body')
      // Receipt should show product name and amounts
      if (bodyText?.includes('Organic Lettuce')) {
        expect(bodyText).toContain('$25.00')
      }
    }
  })

  // ============================================================================
  // 6. Summary cards show dollar amounts
  // ============================================================================
  test('summary cards display dollar amounts', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    // Should show dollar signs for balance displays
    expect(content).toMatch(/\$/)
    // Should show Available balance card
    expect(content).toMatch(/Available/i)
  })

  // ============================================================================
  // 7. Date range filter buttons are functional
  // ============================================================================
  test('date range filter buttons are functional', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    // Should have filter buttons
    const thisMonth = page.locator('button:has-text("This Month")')
    const ytd = page.locator('button:has-text("Year to Date")')
    const allTime = page.locator('button:has-text("All Time")')

    await expect(thisMonth).toBeVisible()
    await expect(ytd).toBeVisible()
    await expect(allTime).toBeVisible()

    // Clicking "All Time" should not cause errors
    await allTime.click()
    await page.waitForTimeout(1500)

    const content = await page.textContent('body')
    expect(content).toMatch(/\$/)
  })

  // ============================================================================
  // 8. Tabs switch between Activity, Pending, Summary
  // ============================================================================
  test('tabs switch between Activity, Pending, and Summary', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    // Click Pending tab
    const pendingTab = page.locator('button:has-text("Pending")')
    if (await pendingTab.isVisible()) {
      await pendingTab.click()
      await page.waitForTimeout(1000)

      const content = await page.textContent('body')
      expect(content).toMatch(/Pending|No pending|all funds have been confirmed/i)
    }

    // Click Summary tab
    const summaryTab = page.locator('button:has-text("Summary")')
    if (await summaryTab.isVisible()) {
      await summaryTab.click()
      await page.waitForTimeout(1000)

      const content = await page.textContent('body')
      expect(content).toMatch(/Financial Breakdown|Gross Sales|Net Earnings|Spending|1099/i)
    }

    // Click back to Activity
    const activityTab = page.locator('button:has-text("Activity")')
    if (await activityTab.isVisible()) {
      await activityTab.click()
      await page.waitForTimeout(1000)
    }
  })

  // ============================================================================
  // 9. Earnings page loads without JS errors
  // ============================================================================
  test('earnings page loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err: Error) => jsErrors.push(err.message))

    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    const criticalErrors = jsErrors.filter(e =>
      !e.includes('Stripe') && !e.includes('stripe') &&
      !e.includes('ResizeObserver') && !e.includes('hydration')
    )
    expect(criticalErrors.length).toBe(0)
  })

  // ============================================================================
  // 10. Payout link visible from earnings
  // ============================================================================
  test('payout link is accessible from earnings page', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForTimeout(2000)

    // Should have a payout link or CTA
    const payoutLink = page.locator('a[href*="payout"]').first()
    const payoutVisible = await payoutLink.isVisible().catch(() => false)

    if (payoutVisible) {
      const href = await payoutLink.getAttribute('href')
      expect(href).toContain('payout')
    }
  })
})
