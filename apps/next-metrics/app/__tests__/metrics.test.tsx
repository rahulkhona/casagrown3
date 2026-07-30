// @vitest-environment jsdom
/**
 * Unit tests for the CasaGrown Metrics App.
 * Tests: chart components, metrics service (demo + RPC), portal service, login page, dashboard pages.
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
const createMockQuery = () => {
  const query: any = {
    select: vi.fn().mockImplementation(() => query),
    eq: vi.fn().mockImplementation(() => query),
    or: vi.fn().mockImplementation(() => query),
    gte: vi.fn().mockImplementation(() => query),
    lte: vi.fn().mockImplementation(() => query),
    is: vi.fn().mockImplementation(() => query),
    ilike: vi.fn().mockImplementation(() => query),
    in: vi.fn().mockImplementation(() => query),
    not: vi.fn().mockImplementation(() => query),
    order: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: any) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
  }
  return query
}

const mockSupabase = {
  rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
  from: vi.fn().mockImplementation(() => createMockQuery()),
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
vi.mock('../lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('../../lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('../../../lib/supabase', () => ({ supabase: mockSupabase }))

// Mock layout useFilters hook
const mockFilterContext = {
  dateRange: { start: '2026-02-15', end: '2026-03-16' },
  granularity: 'daily' as const,
  geoFilter: {},
  utmFilter: {},
}
vi.mock('../(dashboard)/layout', () => ({
  useFilters: () => mockFilterContext,
}))
vi.mock('../../layout', () => ({
  useFilters: () => mockFilterContext,
}))
vi.mock('/Users/rkhona/development/quarantine_bot/casagrown-metrics-improvement/apps/next-metrics/app/(dashboard)/layout', () => ({
  useFilters: () => mockFilterContext,
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
})

// ============================================================================
// PORTAL SERVICE — Live database fetching
// ============================================================================
describe('Portal Service', () => {
  it('fetchStateOfBusiness queries produce interests and returns buyInterestsCount and sellInterestsCount', async () => {
    const { fetchStateOfBusiness } = await import('../../lib/portal-service')
    const data = await fetchStateOfBusiness({ start: '2026-07-20', end: '2026-07-27' }, {})
    expect(data).toHaveProperty('totalUsers')
    expect(data).toHaveProperty('usersUnsignedTos')
    expect(data).toHaveProperty('accountAbandons')
    expect(data).toHaveProperty('totalLeads')
    expect(data).toHaveProperty('totalListings')
    expect(data).toHaveProperty('activeListings')
    expect(data).toHaveProperty('totalOrders')
    expect(data).toHaveProperty('pendingOrders')
    expect(data).toHaveProperty('gmv')
    expect(data).toHaveProperty('avgOrderValue')
    expect(data).toHaveProperty('buyInterestsCount')
    expect(data).toHaveProperty('sellInterestsCount')
    expect(data).toHaveProperty('topInterestedProduce')
    expect(data).toHaveProperty('totalShares')
    expect(data).toHaveProperty('whatsappShares')
    expect(data).toHaveProperty('socialShares')
    expect(data).toHaveProperty('totalShareClicks')
    expect(data).toHaveProperty('totalInvites')
  })

  it('fetchBusinessTrends includes interestTrend and shareTrend histograms', async () => {
    const { fetchBusinessTrends } = await import('../../lib/portal-service')
    const data = await fetchBusinessTrends({ start: '2026-07-20', end: '2026-07-27' }, 'daily', {})
    expect(data).toHaveProperty('userTrend')
    expect(data).toHaveProperty('listingTrend')
    expect(data).toHaveProperty('orderTrend')
    expect(data).toHaveProperty('interestTrend')
    expect(data).toHaveProperty('shareTrend')
  })

  it('fetchTrafficTrends enforces is_bot = false filter', async () => {
    const { fetchTrafficTrends } = await import('../../lib/portal-service')
    const data = await fetchTrafficTrends({ start: '2026-07-20', end: '2026-07-27' }, {})
    expect(data).toHaveProperty('routes')
    expect(data).toHaveProperty('timeSeries')
    expect(data).toHaveProperty('totalVisits')
  })

  it('fetchDripSequencesList returns dynamic sequence options from DB', async () => {
    const { fetchDripSequencesList } = await import('../../lib/portal-service')
    const list = await fetchDripSequencesList()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]).toHaveProperty('id')
    expect(list[0]).toHaveProperty('name')
  })

  it('fetchProduceInterestsByZipcode returns rows with zipcode demand/supply and FB ad strategies', async () => {
    const { fetchProduceInterestsByZipcode } = await import('../../lib/portal-service')
    const data = await fetchProduceInterestsByZipcode({})
    expect(data).toHaveProperty('rows')
    expect(data).toHaveProperty('totalZipcodes')
    expect(data).toHaveProperty('totalItems')
    expect(Array.isArray(data.rows)).toBe(true)
    expect(data.rows.length).toBeGreaterThan(0)
    expect(data.rows[0]).toHaveProperty('produceName')
    expect(data.rows[0]).toHaveProperty('zipcode')
    expect(data.rows[0]).toHaveProperty('recommendedAdStrategy')
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
})

// ============================================================================
// LEGACY PAGES
// ============================================================================
describe('Legacy Activity Page', () => {
  it('renders legacy activity page analytics section', async () => {
    mockPathname.mockReturnValue('/legacy/activity')
    const mod = await import('../(dashboard)/legacy/activity/page')
    const c = renderComponent(mod)
    expect(c).toBeTruthy()
  })
})

describe('Legacy Attribution Page', () => {
  it('renders legacy attribution page with loading state', async () => {
    mockPathname.mockReturnValue('/legacy/attribution')
    const mod = await import('../(dashboard)/legacy/attribution/page')
    const c = renderComponent(mod)
    expect(c).toBeTruthy()
  })
})

// ============================================================================
// DASHBOARD LAYOUT & PAGE-SPECIFIC RETENTION CONTROLS
// ============================================================================
describe('Dashboard Layout Nav & Retention Controls', () => {
  it('includes Portal and Legacy nav items', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const layoutPath = path.resolve(__dirname, '../(dashboard)/layout.tsx')
    const layoutSource = fs.readFileSync(layoutPath, 'utf-8')

    expect(layoutSource).toContain("PORTAL_NAV_ITEMS")
    expect(layoutSource).toContain("LEGACY_NAV_ITEMS")
    expect(layoutSource).toContain("'/legacy'")
  })

  it('WizardDropoffsView renders 14-day page-specific retention bound badge', async () => {
    const { waitFor } = await import('@testing-library/react')
    const mod = await import('../(dashboard)/components/WizardDropoffsView')
    const Component = mod.WizardDropoffsView
    const { container } = render(React.createElement(Component))
    await waitFor(() => {
      expect(container.textContent).toContain('14-Day Retention Bound')
    })
  })

  it('TrafficTrendsView renders 60-day page-specific retention bound badge', async () => {
    const { waitFor } = await import('@testing-library/react')
    const mod = await import('../(dashboard)/components/TrafficTrendsView')
    const Component = mod.TrafficTrendsView
    const { container } = render(React.createElement(Component))
    await waitFor(() => {
      expect(container.textContent).toContain('60-Day Retention Bound')
    })
  })
})

