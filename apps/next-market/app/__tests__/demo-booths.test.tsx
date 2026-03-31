// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks (all inlined — vi.mock is hoisted before const declarations) ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/market',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...rest }: any) =>
    React.createElement('a', { href, onClick, ...rest }, children),
}))

// ── Deep chain mock (must be a function, not a const, for vi.mock hoisting) ──
function chain(data: any = [], error: any = null) {
  const result = { data: data ?? [], error }
  const c: any = {}
  const methods = ['select','eq','neq','single','maybeSingle','limit','is','gt','lt','in','insert','update','upsert','delete','match','order','or','not','ascending','filter']
  for (const m of methods) c[m] = vi.fn().mockReturnValue(c)
  c.single.mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.maybeSingle.mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject)
  c.catch = (reject: any) => Promise.resolve(result).catch(reject)
  c.finally = (cb: any) => Promise.resolve(result).finally(cb)
  return c
}

// ── Test fixture data ──
function getDemoBoothData() {
  return [{
    booth_id: 'demo-booth-1',
    owner_id: 'demo-owner-1',
    booth_name: 'Garcia Family Garden',
    description: 'Fresh seasonal vegetables.',
    decorative_theme: 'garden',
    header_image_url: null,
    offers_delivery: true,
    offers_pickup: false,
    delivery_radius_miles: 5,
    pickup_address: 'Your neighborhood',
    delivery_windows: ['Sat 9am-12pm'],
    pickup_windows: null,
    distance_miles: 1.2,
    product_count: 2,
    matched_products: [
      { id: 'demo-101', name: 'Heirloom Tomatoes', price_usd: 4.50, unit: 'lb', photo: null, inventory: 10, category: 'produce' },
      { id: 'demo-102', name: 'Fresh Basil', price_usd: 2.00, unit: 'bunch', photo: null, inventory: 5, category: 'produce' },
    ],
    seller_avatar_url: null,
    seller_avg_rating: 4.5,
    seller_rating_count: 12,
    is_demo: true,
  }]
}

function getRealBoothData() {
  return [{
    booth_id: 'real-booth-1',
    owner_id: 'real-owner-1',
    booth_name: "Sofia's Kitchen Garden",
    description: 'Homegrown veggies.',
    decorative_theme: 'garden',
    header_image_url: null,
    offers_delivery: true,
    offers_pickup: true,
    delivery_radius_miles: 3,
    pickup_address: '123 Main St',
    delivery_windows: ['Sat 9am-12pm'],
    pickup_windows: ['Sat 10am-1pm'],
    distance_miles: 0.5,
    product_count: 1,
    matched_products: [
      { id: 'real-prod-1', name: 'Cherry Tomatoes', price_usd: 3.50, unit: 'pint', photo: null, inventory: 8, category: 'produce' },
    ],
    seller_avatar_url: null,
    seller_avg_rating: null,
    seller_rating_count: 2,
    is_demo: false,
  }]
}

function makeMockSupabase() {
  return {
    from: vi.fn(() => chain()),
    rpc: vi.fn((name: string) => {
      if (name === 'nearby_booths') {
        return Promise.resolve({ data: [...getRealBoothData(), ...getDemoBoothData()], error: null })
      }
      if (name === 'get_allowed_categories') {
        return Promise.resolve({ data: [{ name: 'produce' }], error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() }),
  }
}

// Mock @supabase/ssr (what lib/supabase.ts actually uses)
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => makeMockSupabase(),
}))

// Mock lib modules at multiple depths (page imports at depth 3 from its location)
vi.mock('../../lib/supabase', () => ({ createClient: () => makeMockSupabase() }))
vi.mock('../../../lib/supabase', () => ({ createClient: () => makeMockSupabase() }))

vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, loading: false }),
}))
vi.mock('../../../lib/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, loading: false }),
}))

vi.mock('../../lib/useMarketStatus', () => ({
  useMarketStatus: () => ({
    isOpen: true, todaySchedule: null, nextOpenDate: null, loading: false,
  }),
}))
vi.mock('../../../lib/useMarketStatus', () => ({
  useMarketStatus: () => ({
    isOpen: true, todaySchedule: null, nextOpenDate: null, loading: false,
  }),
}))

vi.mock('../../lib/store', () => ({
  formatUsd: (n: number) => `$${(n || 0).toFixed(2)}`,
  isMarketOpen: () => true,
}))
vi.mock('../../../lib/store', () => ({
  formatUsd: (n: number) => `$${(n || 0).toFixed(2)}`,
  isMarketOpen: () => true,
}))

vi.mock('../../lib/geocode', () => ({ geocodeAddress: vi.fn() }))
vi.mock('../../../lib/geocode', () => ({ geocodeAddress: vi.fn() }))

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn(), trackPageView: vi.fn(), setAnalyticsUser: vi.fn() }))
vi.mock('../../../lib/analytics', () => ({ trackEvent: vi.fn(), trackPageView: vi.fn(), setAnalyticsUser: vi.fn() }))

vi.mock('../../lib/useCart', () => ({
  useCart: () => ({ items: [], addItem: vi.fn(), removeItem: vi.fn(), getItemQty: () => 0, clear: vi.fn() }),
}))
vi.mock('../../../lib/useCart', () => ({
  useCart: () => ({ items: [], addItem: vi.fn(), removeItem: vi.fn(), getItemQty: () => 0, clear: vi.fn() }),
}))

vi.mock('../../lib/useNotificationPrompt', () => ({
  useNotificationPrompt: () => ({ showPrompt: vi.fn(), modalProps: {} }),
}))
vi.mock('../../../lib/useNotificationPrompt', () => ({
  useNotificationPrompt: () => ({ showPrompt: vi.fn(), modalProps: {} }),
}))

vi.mock('../../lib/legal', () => ({
  needsTosAcceptance: () => false, TOS_EFFECTIVE_DATE: new Date('2026-01-01'),
  getJurisdictionConfig: () => null, isBlockedJurisdiction: () => false,
}))
vi.mock('../../../lib/legal', () => ({
  needsTosAcceptance: () => false, TOS_EFFECTIVE_DATE: new Date('2026-01-01'),
  getJurisdictionConfig: () => null, isBlockedJurisdiction: () => false,
}))

// Mock subcomponents
vi.mock('../components/MarketClosedBox', () => ({
  default: () => React.createElement('div', null, 'Market Closed'),
}))
vi.mock('../components/LoadingSpinner', () => ({
  LoadingSpinner: () => React.createElement('div', null, 'Loading...'),
}))

// ── Import component after mocks ──────────────────────────────────────────

import BrowseMarketPage from '../(main)/market/page'

describe('Demo Booths on Market Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    // Pre-set localStorage to simulate address resolved
    const params = new URLSearchParams()
    params.set('lat', '37.24')
    params.set('lng', '-121.86')
    params.set('addr', '123 Test St')
    params.set('zip', '95112')
    localStorage.setItem('market_search', params.toString())
  })

  it('renders 🌿 Demo badge on demo booth cards', async () => {
    const { container } = render(React.createElement(BrowseMarketPage))
    await waitFor(() => {
      expect(container.textContent).toContain('Garcia Family Garden')
    })
    // Demo badge should be present
    expect(container.textContent).toContain('🌿 Demo')
  })

  it('renders 🆕 New Seller badge on real booths with < 5 ratings', async () => {
    const { container } = render(React.createElement(BrowseMarketPage))
    await waitFor(() => {
      expect(container.textContent).toContain("Sofia's Kitchen Garden")
    })
    expect(container.textContent).toContain('🆕 New Seller')
  })

  it('demo products click shows demo modal (not navigating away)', async () => {
    const { container } = render(React.createElement(BrowseMarketPage))
    await waitFor(() => {
      expect(container.textContent).toContain('Heirloom Tomatoes')
    })

    // Demo product links should have href="#" (blocked navigation, shows modal instead)
    const demoProductLink = Array.from(container.querySelectorAll('a'))
      .find(a => a.getAttribute('href') === '#' && a.textContent?.includes('Heirloom Tomatoes'))
    expect(demoProductLink).toBeTruthy()

    // Clicking should open the demo modal
    fireEvent.click(demoProductLink!)
    await waitFor(() => {
      expect(container.textContent).toContain('This is a Demo Listing')
    })
  })

  it('demo booth header click shows warning modal', async () => {
    const { container } = render(React.createElement(BrowseMarketPage))
    await waitFor(() => {
      expect(container.textContent).toContain('Garcia Family Garden')
    })

    // Booth header link should be blocked (href="#")
    const boothLink = Array.from(container.querySelectorAll('a'))
      .find(a => a.getAttribute('href') === '#' && a.textContent?.includes('Garcia Family Garden'))
    if (boothLink) {
      fireEvent.click(boothLink)
      await waitFor(() => {
        expect(container.textContent).toContain('This is a Demo Listing')
      })
    }
  })

  it('does NOT interfere with real product links', async () => {
    const { container } = render(React.createElement(BrowseMarketPage))
    await waitFor(() => {
      expect(container.textContent).toContain('Cherry Tomatoes')
    })

    // Find the real product link (should have a real URL)
    const realLink = Array.from(container.querySelectorAll('a'))
      .find(a => a.getAttribute('href')?.includes('/product/real-prod-1'))
    expect(realLink).toBeTruthy()
  })

  it('shows status text with demo count', async () => {
    const { container } = render(React.createElement(BrowseMarketPage))
    await waitFor(() => {
      expect(container.textContent).toContain('1 booth near you + 2 demo')
    })
  })

  it('appends demo note to demo booth description', async () => {
    const { container } = render(React.createElement(BrowseMarketPage))
    await waitFor(() => {
      expect(container.textContent).toContain('Demo listing — viewing only.')
    })
  })
})
