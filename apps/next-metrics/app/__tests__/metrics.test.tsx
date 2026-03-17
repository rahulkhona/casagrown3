// @vitest-environment jsdom
/**
 * Unit tests for the CasaGrown Metrics App.
 * Tests: chart components, metrics service, login page, dashboard pages.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'

// ── Shared mocks ─────────────────────────────────────────────────────────
const mockRouter = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }
const mockPathname = vi.fn(() => '/')
const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => React.createElement('a', { href, ...props }, children),
}))

// Mock supabase
const mockSupabase = {
  rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({}),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
}

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => mockSupabase,
}))

// Mock the supabase re-export from @casagrown/app
vi.mock('@casagrown/app/utils/supabase', () => ({ supabase: mockSupabase }))
// Various depths: test is at app/__tests__/, pages import from different levels
vi.mock('../lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('../../lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('../../../lib/supabase', () => ({ supabase: mockSupabase }))

// Mock auth-hook for the shared package path
vi.mock('@casagrown/app/features/auth/auth-hook', () => ({
  supabase: mockSupabase,
  useAuth: () => ({ user: null, isAuthenticated: false, loading: false }),
}))

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { cleanup() })

function renderComponent(mod: any) {
  const Component = mod.default || mod
  const { container } = render(React.createElement(Component))
  return container
}

// ============================================================================
// CHART COMPONENTS
// ============================================================================
describe('Chart Components', () => {
  it('BarChart renders with data', async () => {
    const { BarChart } = await import('../../lib/charts')
    const data = [
      { date: '2026-03-01', value: 100 },
      { date: '2026-03-02', value: 200 },
      { date: '2026-03-03', value: 150 },
    ]
    const { container } = render(React.createElement(BarChart, { data, color: 'blue', height: 200 }))
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThanOrEqual(3)
  })

  it('BarChart shows empty state for no data', async () => {
    const { BarChart } = await import('../../lib/charts')
    const { container } = render(React.createElement(BarChart, { data: [] }))
    expect(container.textContent).toContain('No data')
  })

  it('LineChart renders with data', async () => {
    const { LineChart } = await import('../../lib/charts')
    const data = [
      { date: '2026-03-01', value: 50 },
      { date: '2026-03-02', value: 75 },
      { date: '2026-03-03', value: 100 },
    ]
    const { container } = render(React.createElement(LineChart, { data }))
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(1)
  })

  it('Sparkline renders', async () => {
    const { Sparkline } = await import('../../lib/charts')
    const { container } = render(React.createElement(Sparkline, {
      data: [10, 20, 15, 25, 30],
      width: 100,
      height: 32,
    }))
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('DonutChart renders segments', async () => {
    const { DonutChart } = await import('../../lib/charts')
    const data = [
      { label: 'A', value: 60, color: 'red' },
      { label: 'B', value: 40, color: 'blue' },
    ]
    const { container } = render(React.createElement(DonutChart, { data, size: 120 }))
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect(container.textContent).toContain('A')
    expect(container.textContent).toContain('B')
  })

  it('HBarChart renders bars', async () => {
    const { HBarChart } = await import('../../lib/charts')
    const data = [
      { label: 'California', value: 100 },
      { label: 'Texas', value: 75 },
    ]
    const { container } = render(React.createElement(HBarChart, { data }))
    expect(container.textContent).toContain('California')
    expect(container.textContent).toContain('Texas')
  })

  it('formatNumber formats correctly', async () => {
    const { formatNumber, formatCurrency } = await import('../../lib/charts')
    expect(formatNumber(500)).toBe('500')
    expect(formatNumber(1500)).toBe('1.5K')
    expect(formatNumber(1500000)).toBe('1.5M')
    expect(formatCurrency(2500)).toBe('$2.5K')
    expect(formatCurrency(500)).toBe('$500')
  })
})

// ============================================================================
// METRICS SERVICE
// ============================================================================
describe('Metrics Service', () => {
  it('fetchUserGrowth returns demo data when RPC fails', async () => {
    const { fetchUserGrowth, getIsDemoMode, resetDemoMode } = await import('../../lib/metrics-service')
    resetDemoMode()
    const result = await fetchUserGrowth(
      { start: '2026-02-15', end: '2026-03-16' },
      'daily'
    )
    expect(result.timeSeries.length).toBeGreaterThan(0)
    expect(result.total).toBeGreaterThan(0)
    expect(result.byGeo.length).toBeGreaterThan(0)
    expect(getIsDemoMode()).toBe(true)
  })

  it('fetchSalesSummary returns demo data', async () => {
    const { fetchSalesSummary } = await import('../../lib/metrics-service')
    const result = await fetchSalesSummary(
      { start: '2026-02-15', end: '2026-03-16' },
      'daily'
    )
    expect(result.totalGMV).toBeGreaterThan(0)
    expect(result.totalOrders).toBeGreaterThan(0)
    expect(result.topProducts.length).toBe(5)
    expect(result.topSellers.length).toBe(5)
    expect(result.fulfillmentSplit.length).toBe(2)
  })

  it('fetchPayoutTrends returns method data', async () => {
    const { fetchPayoutTrends } = await import('../../lib/metrics-service')
    const result = await fetchPayoutTrends(
      { start: '2026-02-15', end: '2026-03-16' }
    )
    expect(result.methodTotals.length).toBe(3)
    expect(result.successRates.length).toBe(3)
    expect(result.methodTrends.length).toBeGreaterThan(0)
    // Should use correct $ terminology, not "points"
    expect(result.methodTotals.some(m => m.method.includes('Cash Out'))).toBe(true)
    expect(result.methodTotals.some(m => m.method.includes('Gift Cards'))).toBe(true)
    // Instrument breakdown
    expect(result.instrumentTotals.length).toBeGreaterThanOrEqual(4)
    expect(result.instrumentTotals.some(i => i.instrument === 'Reloadly')).toBe(true)
    expect(result.instrumentTotals.some(i => i.instrument === 'Tremendous')).toBe(true)
  })

  it('fetchPageAnalytics returns route data', async () => {
    const { fetchPageAnalytics } = await import('../../lib/metrics-service')
    const result = await fetchPageAnalytics(
      { start: '2026-02-15', end: '2026-03-16' }
    )
    expect(result.routes.length).toBeGreaterThan(0)
    expect(result.routes[0]).toHaveProperty('route')
    expect(result.routes[0]).toHaveProperty('pageLoads')
    expect(result.routes[0]).toHaveProperty('bounceRate')
    expect(result.dropOffDistribution.length).toBeGreaterThan(0)
    expect(result.errorHotspots.length).toBeGreaterThan(0)
  })

  it('fetchMarketplaceHealth returns health data', async () => {
    const { fetchMarketplaceHealth } = await import('../../lib/metrics-service')
    const result = await fetchMarketplaceHealth(
      { start: '2026-02-15', end: '2026-03-16' }
    )
    expect(result.activeSellers.length).toBeGreaterThan(0)
    expect(result.activeBuyers.length).toBeGreaterThan(0)
    expect(result.productListings.active).toBeGreaterThan(0)
    expect(result.avgSellerRating).toBeGreaterThan(0)
  })

  it('fetchSettlementSummary returns clearing data', async () => {
    const { fetchSettlementSummary } = await import('../../lib/metrics-service')
    const result = await fetchSettlementSummary(
      { start: '2026-02-15', end: '2026-03-16' }
    )
    expect(result.dailySummary.length).toBeGreaterThan(0)
    expect(result.payoutTotals).toBeGreaterThan(0)
    expect(result.recentSettlements.length).toBeGreaterThan(0)
  })

  it('searchLogs returns paginated entries', async () => {
    const { searchLogs } = await import('../../lib/metrics-service')
    const result = await searchLogs(
      '', '', { start: '2026-02-15', end: '2026-03-16' }, 1, 10
    )
    expect(result.entries.length).toBe(10)
    expect(result.totalCount).toBe(500)
    expect(result.entries[0]).toHaveProperty('eventType')
    expect(result.entries[0]).toHaveProperty('sessionId')
    // PII protection: userIdShort shown, userName null by default
    expect(result.entries[0]).toHaveProperty('userIdShort')
    expect(result.entries[0]!.userIdShort).toMatch(/^usr_/)
    expect(result.entries[0]!.userName).toBeNull()
    expect(result.entries[0]).toHaveProperty('elementLabel')
    expect(result.entries[0]).toHaveProperty('stackTrace')
    // Error events should have stack traces
    const errorEntry = result.entries.find(e => e.eventType === 'error')
    if (errorEntry) {
      expect(errorEntry.stackTrace).toBeTruthy()
      expect(errorEntry.stackTrace).toContain('Error:')
    }
    // Button clicks should have element info
    const clickEntry = result.entries.find(e => e.eventType === 'button_click')
    if (clickEntry) {
      expect(clickEntry.elementId).toBeTruthy()
      expect(clickEntry.elementLabel).toBeTruthy()
    }
  })

  it('fetchSessionTimeline returns session events', async () => {
    const { fetchSessionTimeline } = await import('../../lib/metrics-service')
    const result = await fetchSessionTimeline('sess-1')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('eventName')
    expect(result[0]!.userIdShort).toMatch(/^usr_/)
    expect(result[0]!.userName).toBeNull()
    expect(result[result.length - 1]!.eventType).toBe('form_submit')
  })
})

// ============================================================================
// LOGIN PAGE
// ============================================================================
describe('Login Page', () => {
  it('renders login form with email input', async () => {
    const mod = await import('../login/page')
    const c = renderComponent(mod)
    expect(c).toBeTruthy()
    expect(c.textContent).toContain('CasaGrown Metrics')
    expect(c.textContent).toContain('Staff login')
    expect(c.textContent).toContain('Send Verification Code')
    const emailInput = c.querySelector('input[type="email"]')
    expect(emailInput).toBeTruthy()
  })

  it('shows staff access notice', async () => {
    const mod = await import('../login/page')
    const c = renderComponent(mod)
    expect(c.textContent).toContain('Staff access only')
  })
})

// ============================================================================
// AUTH GUARD
// ============================================================================
describe('Auth Guard', () => {
  it('renders children when on login page', async () => {
    mockPathname.mockReturnValue('/login')
    const { AuthGuard } = await import('../auth-guard')
    const { container } = render(
      React.createElement(AuthGuard, null,
        React.createElement('div', { 'data-testid': 'child' }, 'Protected Content')
      )
    )
    expect(container.textContent).toContain('Protected Content')
  })

  it('shows loading state when checking auth', async () => {
    mockPathname.mockReturnValue('/')
    const { AuthGuard } = await import('../auth-guard')
    const { container } = render(
      React.createElement(AuthGuard, null,
        React.createElement('div', null, 'Protected')
      )
    )
    // Should show "Verifying access..." since no session
    expect(container.textContent).toContain('Verifying access')
  })
})
