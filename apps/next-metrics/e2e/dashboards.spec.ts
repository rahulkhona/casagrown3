import { test, expect } from '@playwright/test'

/**
 * Metrics — Operational Dashboards Suite
 * 
 * Navigates through all protected sub-dashboards to verify they mount fully authenticated,
 * load data successfully without DB errors, and render their key charts, tables, and KPI cards.
 */

test.describe('Metrics — Protected Navigations', () => {
  const protectedRoutes = [
    { 
      path: '/', 
      title: 'Overview Dashboard',
      charts: ['User Signups WoW', 'New Listings WoW', 'CRM Leads WoW'],
      kpis: ['User Growth (WoW)', 'Lead Growth (WoW)', 'Active Listings (WoW)', 'Total Sales (GMV)']
    },
    { 
      path: '/users', 
      title: 'User Growth',
      charts: ['New User Growth', 'Cumulative Users', 'User Acquisition by Region', 'Geographic Breakdown'],
      kpis: ['Total Users', 'New This Period', 'Avg Daily Signups']
    },
    { 
      path: '/sales', 
      title: 'Sales & Revenue',
      charts: ['Sales Growth (GMV)', 'Order Volume', 'Fulfillment Split', 'Top Products'],
      kpis: ['Total GMV', 'Total Orders', 'Avg Order Value', 'Tax Collected', 'Platform Fees']
    },
    { 
      path: '/payouts', 
      title: 'Payouts',
      charts: ['Payout Method Trends', 'Instrument Breakdown', 'Volume by Method', 'Success / Failure Rates'],
      kpis: []
    },
    { 
      path: '/activity', 
      title: 'Page Analytics & Drop-offs',
      charts: ['Per-Route Analytics'],
      kpis: []
    },
    { 
      path: '/health', 
      title: 'Marketplace Health',
      charts: ['Active Sellers Trend', 'Active Buyers Trend', 'Product Listings', 'Flag Activity', 'New Booths Created'],
      kpis: ['Active Sellers', 'Active Buyers', 'New Booths', 'Avg Seller Rating']
    },
    { 
      path: '/settlements', 
      title: 'Settlements',
      charts: ['Daily Clearing Summary'],
      kpis: ['Total Captured', 'Total Payouts', 'Total Refunded', 'Net Revenue']
    },
    { 
      path: '/community', 
      title: 'Community Chat',
      charts: ['Daily Active Users (DAU)', 'Cumulative Chat Users Growth'],
      kpis: ['Average Daily Active Users', 'Total Messages Sent']
    },
    { 
      path: '/attribution', 
      title: 'Attribution & Referral Tracking',
      charts: ['Signups by Source (Last-Touch)', 'UTM Source Breakdown', 'Top Referrers', 'Campaign Performance (UTM)', 'Recent Signups with Attribution'],
      kpis: ['Total Attributed Signups', 'Avg Touches Before Signup', 'Referral Signups', 'Organic Signups']
    },
    { 
      path: '/marketing', 
      title: 'Marketing Traffic',
      charts: ['By Landing Page', 'Traffic Sources'],
      kpis: ['Total Visits', 'Total Conversions', 'Avg Session Duration']
    },
    { 
      path: '/marketing/funnel', 
      title: 'Lead Conversion Funnel',
      charts: ['By Traffic Source'],
      kpis: ['Total Leads', 'Converted']
    },
    { 
      path: '/marketing/campaigns', 
      title: 'Campaign Performance',
      charts: ['Campaign Breakdown'],
      kpis: ['Total Sent', 'Opened', 'Clicked', 'Bounced']
    },
    { 
      path: '/marketing/ab', 
      title: 'Landing Page A/B Test Results',
      charts: [],
      kpis: [],
      extraSelectors: ['.ab-card, .empty-state']
    }
  ]

  for (const route of protectedRoutes) {
    test(`navigates securely to ${route.path} and verifies charts and KPIs are visible`, async ({ page }) => {
      // Navigate straight to the endpoint
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      
      // Wait to ensure redirect jail does not occur
      await page.waitForTimeout(2000)
      
      // Verify we have not been kicked back to login
      expect(page.url()).not.toContain('/login')

      // Ensure no framework errors
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      
      // Wait for the page title to appear
      const pageTitle = page.locator('h1').first()
      await expect(pageTitle).toBeVisible({ timeout: 15000 })
      await expect(pageTitle).toContainText(route.title)

      // Ensure the error card (Access Denied or Database Error) is NOT visible
      const errorCard = page.locator('text=Access Denied or Database Error')
      await expect(errorCard).not.toBeVisible()

      // Assert loading spinner/skeleton is gone
      const spinner = page.locator('.spinner, .skeleton')
      await expect(spinner).not.toBeVisible()

      // Verify specific charts are visible (or empty state is handled gracefully)
      for (const chartTitle of route.charts) {
        const chartLocator = page.locator(`.card:has-text("${chartTitle}"), .ab-card:has-text("${chartTitle}")`).first()
        const emptyState = page.locator('.empty-state').first()
        
        await expect(async () => {
          const isChartVisible = await chartLocator.isVisible()
          const isEmptyStateVisible = await emptyState.isVisible()
          expect(isChartVisible || isEmptyStateVisible).toBe(true)
        }).toPass({ timeout: 5000 })
      }

      // Verify specific KPIs are visible
      for (const kpiLabel of route.kpis) {
        const kpiLocator = page.locator(`.kpi-card:has-text("${kpiLabel}"), .stat-card:has-text("${kpiLabel}"), .funnel-stage:has-text("${kpiLabel}")`).first()
        await expect(kpiLocator).toBeVisible({ timeout: 5000 })
      }

      // Verify any extra selectors are visible
      for (const selector of route.extraSelectors || []) {
        const locator = page.locator(selector).first()
        await expect(locator).toBeVisible({ timeout: 5000 })
      }

      expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0)
    })
  }
})
