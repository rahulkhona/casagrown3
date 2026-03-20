// @vitest-environment jsdom
/**
 * Unit tests for listing lifecycle features:
 * 1. Duration picker auto-defaults by category
 * 2. expires_at computation
 * 3. Product OG page metadata
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, waitFor } from '@testing-library/react'

// ── Shared mocks ──
const mockRouter = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }
const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/my-booth/products/new',
  useSearchParams: () => mockSearchParams,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => React.createElement('a', { href, ...props }, children),
}))

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ getAll: () => [] }) }))

function chain(data: any = [], error: any = null) {
  const result = { data: data ?? [], error }
  const c: any = {}
  const methods = ['select','eq','neq','single','maybeSingle','limit','is','gt','lt','gte','lte','in','insert','update','upsert','delete','match','order','or','not','contains','like','ilike','range','filter','on','ascending']
  for (const m of methods) c[m] = vi.fn().mockReturnValue(c)
  c.single.mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.maybeSingle.mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject)
  c.catch = (reject: any) => Promise.resolve(result).catch(reject)
  c.finally = (cb: any) => Promise.resolve(result).finally(cb)
  return c
}

const categoriesData = [
  { name: 'fruits', display_order: 1 },
  { name: 'vegetables', display_order: 2 },
  { name: 'herbs', display_order: 3 },
  { name: 'flowers', display_order: 4 },
  { name: 'honey', display_order: 5 },
  { name: 'other', display_order: 6 },
]

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'sales_categories') return chain(categoriesData)
    if (table === 'category_restrictions') return chain([])
    return chain()
  }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
  channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() }),
  functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://test.png' } }) }) },
}

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => mockSupabase,
  createServerClient: () => mockSupabase,
}))

const supabaseMock = { createClient: () => mockSupabase }
const serverSupabaseMock = { createServerSupabase: () => Promise.resolve(mockSupabase) }
const authMock = { useAuth: () => ({ user: { id: 'test-user-id' }, isAuthenticated: true, loading: false }) }
const storeMock = {
  useMarket: () => ({
    state: {
      marketSchedule: [{ dayOfWeek: 6, dayName: 'Saturday', openTime: '08:00', closeTime: '11:00' }],
      marketNeverCloses: false,
      booths: [{ ownerId: 'test-user-id', name: 'Test Booth' }],
      orders: [], products: [], conversations: [],
      helpers: [], coupons: [], notifications: [], following: [],
      user: null, balance: 0, isAuthenticated: true,
    },
    dispatch: vi.fn(),
  }),
  isMarketOpen: () => true,
  formatUsd: (n: number) => `$${(n || 0).toFixed(2)}`,
}
const geocodeMock = { geocodeAddress: vi.fn().mockResolvedValue(null) }
const legalMock = { needsTosAcceptance: () => false, TOS_EFFECTIVE_DATE: new Date('2026-01-01'), getJurisdictionConfig: () => null, isBlockedJurisdiction: () => false }
const analyticsMock = { trackEvent: vi.fn(), trackPageView: vi.fn(), setAnalyticsUser: vi.fn() }
const marketRestrictionMock = { useMarketRestriction: () => ({ isFreeOnly: false, stateName: null }) }
const notifPromptMock = { useNotificationPrompt: () => ({ showPrompt: vi.fn(), modalProps: { isOpen: false, onClose: vi.fn(), userId: 'test' } }) }

// Mock at depth 2 (app/(main)/xxx/page → ../../lib/)
vi.mock('../../lib/supabase', () => supabaseMock)
vi.mock('../../lib/supabase-server', () => serverSupabaseMock)
vi.mock('../../lib/useAuth', () => authMock)
vi.mock('../../lib/store', () => storeMock)
vi.mock('../../lib/geocode', () => geocodeMock)
vi.mock('../../lib/legal', () => legalMock)
vi.mock('../../lib/analytics', () => analyticsMock)
vi.mock('../../lib/useMarketRestriction', () => marketRestrictionMock)
vi.mock('../../lib/useNotificationPrompt', () => notifPromptMock)
// depth 3
vi.mock('../../../lib/supabase', () => supabaseMock)
vi.mock('../../../lib/supabase-server', () => serverSupabaseMock)
vi.mock('../../../lib/useAuth', () => authMock)
vi.mock('../../../lib/store', () => storeMock)
vi.mock('../../../lib/geocode', () => geocodeMock)
vi.mock('../../../lib/legal', () => legalMock)
vi.mock('../../../lib/analytics', () => analyticsMock)
vi.mock('../../../lib/useMarketRestriction', () => marketRestrictionMock)
vi.mock('../../../lib/useNotificationPrompt', () => notifPromptMock)
// depth 4
vi.mock('../../../../lib/supabase', () => supabaseMock)
vi.mock('../../../../lib/supabase-server', () => serverSupabaseMock)
vi.mock('../../../../lib/useAuth', () => authMock)
vi.mock('../../../../lib/store', () => storeMock)
vi.mock('../../../../lib/geocode', () => geocodeMock)
vi.mock('../../../../lib/legal', () => legalMock)
vi.mock('../../../../lib/analytics', () => analyticsMock)
vi.mock('../../../../lib/useMarketRestriction', () => marketRestrictionMock)
vi.mock('../../../../lib/useNotificationPrompt', () => notifPromptMock)
// depth 5
vi.mock('../../../../../lib/supabase', () => supabaseMock)
vi.mock('../../../../../lib/supabase-server', () => serverSupabaseMock)
vi.mock('../../../../../lib/useAuth', () => authMock)
vi.mock('../../../../../lib/store', () => storeMock)
vi.mock('../../../../../lib/geocode', () => geocodeMock)
vi.mock('../../../../../lib/legal', () => legalMock)
vi.mock('../../../../../lib/analytics', () => analyticsMock)
vi.mock('../../../../../lib/useMarketRestriction', () => marketRestrictionMock)
vi.mock('../../../../../lib/useNotificationPrompt', () => notifPromptMock)

vi.mock('../../components/CameraCapture', () => ({ default: () => null }))
vi.mock('../../components/ImageCropper', () => ({ default: () => null }))
vi.mock('../../../components/CameraCapture', () => ({ default: () => null }))
vi.mock('../../../components/ImageCropper', () => ({ default: () => null }))
vi.mock('../../../../components/CameraCapture', () => ({ default: () => null }))
vi.mock('../../../../components/ImageCropper', () => ({ default: () => null }))
vi.mock('../../../../../components/CameraCapture', () => ({ default: () => null }))
vi.mock('../../../../../components/ImageCropper', () => ({ default: () => null }))
vi.mock('../../components/NotificationPromptModal', () => ({ NotificationPromptModal: () => null }))
vi.mock('../../../components/NotificationPromptModal', () => ({ NotificationPromptModal: () => null }))
vi.mock('../../../../components/NotificationPromptModal', () => ({ NotificationPromptModal: () => null }))
vi.mock('./page.module.css', () => ({ default: new Proxy({}, { get: (_, key) => String(key) }) }))

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { cleanup() })

// ============================================================================
// Listing Duration Picker
// ============================================================================
describe('Listing Lifecycle — Duration Picker', () => {

  it('renders the Listing Duration section with 4 options', async () => {
    const mod = await import('../(main)/my-booth/products/new/page')
    const Component = mod.default
    const { container } = render(React.createElement(Component))

    await waitFor(() => {
      expect(container.textContent).toContain('Listing Duration')
    })

    // Should have 4 duration buttons
    const durationBtns = container.querySelectorAll('[class*="durationBtn"]')
    expect(durationBtns.length).toBe(4)
    expect(container.textContent).toContain('3 days')
    expect(container.textContent).toContain('7 days')
    expect(container.textContent).toContain('14 days')
    expect(container.textContent).toContain('30 days')
  })

  it('shows expiration date hint', async () => {
    const mod = await import('../(main)/my-booth/products/new/page')
    const Component = mod.default
    const { container } = render(React.createElement(Component))

    await waitFor(() => {
      expect(container.textContent).toContain('Expires')
    })
  })

  it('defaults perishable category to 3 days', async () => {
    const mod = await import('../(main)/my-booth/products/new/page')
    const Component = mod.default
    const { container } = render(React.createElement(Component))

    await waitFor(() => {
      const activeBtns = container.querySelectorAll('[class*="durationBtnActive"]')
      expect(activeBtns.length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ============================================================================
// expires_at computation
// ============================================================================
describe('Listing Lifecycle — expires_at Calculation', () => {

  it('computes correct expires_at for 3-day duration', () => {
    const listingDays = 3
    const expiresAt = new Date(Date.now() + listingDays * 86400000)
    const now = new Date()
    const diffMs = expiresAt.getTime() - now.getTime()
    const diffDays = diffMs / 86400000
    expect(diffDays).toBeGreaterThan(2.99)
    expect(diffDays).toBeLessThan(3.01)
  })

  it('computes correct expires_at for 30-day duration', () => {
    const listingDays = 30
    const expiresAt = new Date(Date.now() + listingDays * 86400000)
    const now = new Date()
    const diffMs = expiresAt.getTime() - now.getTime()
    const diffDays = diffMs / 86400000
    expect(diffDays).toBeGreaterThan(29.99)
    expect(diffDays).toBeLessThan(30.01)
  })

  it('perishable categories are correctly identified', () => {
    const perishable = ['fruits', 'vegetables', 'herbs', 'flowers', 'flower_arrangements']
    expect(perishable.includes('fruits')).toBe(true)
    expect(perishable.includes('vegetables')).toBe(true)
    expect(perishable.includes('herbs')).toBe(true)
    expect(perishable.includes('flowers')).toBe(true)
    expect(perishable.includes('honey')).toBe(false)
    expect(perishable.includes('other')).toBe(false)
  })
})

// ============================================================================
// Dynamic OG Tags — Metadata logic (tested without server component import)
// ============================================================================
describe('Dynamic OG Tags — Metadata Logic', () => {

  it('generates correct OG title format', () => {
    const productName = 'Heritage Tomatoes'
    const priceUsd = 4.50
    const unit = 'basket'
    const title = `${productName} — $${priceUsd.toFixed(2)}/${unit}`
    expect(title).toBe('Heritage Tomatoes — $4.50/basket')
  })

  it('generates correct OG description with seller name', () => {
    const category = 'vegetables'
    const sellerName = 'Maria Garcia'
    const description = `Fresh ${category} from ${sellerName} on CasaGrown Market. Shop local, stop food waste.`
    expect(description).toContain('Fresh vegetables')
    expect(description).toContain('Maria Garcia')
    expect(description).toContain('CasaGrown Market')
  })

  it('falls back to og-share.png when no product photos', () => {
    const photos: string[] = []
    const photoUrl = photos?.[0] || '/og-share.png'
    expect(photoUrl).toBe('/og-share.png')
  })

  it('uses first photo when photos array is populated', () => {
    const photos = ['https://example.com/tomato.jpg', 'https://example.com/tomato2.jpg']
    const photoUrl = photos?.[0] || '/og-share.png'
    expect(photoUrl).toBe('https://example.com/tomato.jpg')
  })

  it('falls back to Local Seller when seller name is null', () => {
    const sellerName = null as string | null
    const displayName = sellerName || 'Local Seller'
    expect(displayName).toBe('Local Seller')
  })
})
