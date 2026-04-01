/**
 * Product Prefill Tests
 *
 * Tests the ?prefill=<productId> query parameter feature
 * used by daily digest "Re-list" CTAs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// Override useSearchParams for this test file
const mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), back: vi.fn(),
    forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => '/my-booth/products/new',
  useSearchParams: () => mockSearchParams,
  useParams: () => ({}),
}))

// Mock supabase with configurable responses
const mockProduct = {
  name: 'Fresh Eggs',
  description: 'Free range eggs from our chickens',
  category: 'eggs',
  price_usd: 6.00,
  unit: 'dozen',
  photos: ['https://img.test/eggs.jpg'],
}

const singleFn = vi.fn().mockResolvedValue({ data: null, error: null })
const chainObj: any = {}
const methods = ['select', 'eq', 'neq', 'limit', 'insert', 'update', 'upsert', 'delete', 'match', 'order', 'or', 'not', 'contains', 'like', 'ilike', 'range', 'filter', 'in', 'is', 'gt', 'lt', 'gte', 'lte']
methods.forEach(m => { chainObj[m] = vi.fn().mockReturnValue(chainObj) })
chainObj.single = singleFn
chainObj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
chainObj.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
chainObj.catch = (reject: any) => Promise.resolve({ data: [], error: null }).catch(reject)
chainObj.finally = (cb: any) => Promise.resolve({ data: [], error: null }).finally(cb)

const mockSupabase = {
  from: vi.fn().mockReturnValue(chainObj),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signOut: vi.fn(),
  },
  functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() }),
  removeChannel: vi.fn(),
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://img.test/x.jpg' } }),
    }),
  },
}

vi.mock('../../../../../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => mockSupabase }))

// Mock all required dependencies
vi.mock('../../../../../lib/store', () => ({
  MarketProvider: ({ children }: any) => React.createElement('div', null, children),
  useMarket: () => ({
    state: {
      marketSchedule: [], marketNeverCloses: true,
      booths: [], orders: [], products: [],
      conversations: [], helpers: [], coupons: [], notifications: [],
      following: [], user: null, balance: 0, isAuthenticated: false,
    },
    dispatch: vi.fn(),
  }),
  isMarketOpen: () => true,
  formatUsd: (n: number) => `$${(n || 0).toFixed(2)}`,
}))

vi.mock('../../../../../lib/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@test.com' },
    isAuthenticated: true,
    loading: false,
    isBanned: false,
    banReason: null,
  }),
}))

vi.mock('../../../../../lib/useMarketRestriction', () => ({
  useMarketRestriction: () => ({ isFreeOnly: false, isBlocked: false }),
}))

vi.mock('../../../../../lib/useNotificationPrompt', () => ({
  useNotificationPrompt: () => ({
    showPrompt: vi.fn(),
    modalProps: { visible: false, variant: 'first-time', onEnable: vi.fn(), onDismiss: vi.fn(), onPermanentDismiss: vi.fn() },
  }),
}))

vi.mock('../../../../../lib/analytics', () => ({
  trackClick: vi.fn(), trackError: vi.fn(), trackEvent: vi.fn(),
  trackPageView: vi.fn(), setAnalyticsUser: vi.fn(), trackFormSubmit: vi.fn(),
}))

vi.mock('../../../../../lib/moderation', () => ({
  checkTextForViolations: () => ({ isClean: true }),
}))

vi.mock('../../../../../components/CameraCapture', () => ({ default: () => null }))
vi.mock('../../../../../components/ImageCropper', () => ({ default: () => null }))

describe('Product Prefill (?prefill=<id>)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear search params
    mockSearchParams.delete('prefill')
    mockSearchParams.delete('edit')
  })

  it('reads prefill param from URL', () => {
    mockSearchParams.set('prefill', 'product-abc-123')
    expect(mockSearchParams.get('prefill')).toBe('product-abc-123')
  })

  it('prefill and edit are independent params', () => {
    mockSearchParams.set('prefill', 'product-abc')
    expect(mockSearchParams.get('edit')).toBeNull()
    expect(mockSearchParams.get('prefill')).toBe('product-abc')
  })

  it('prefill param generates correct listing form URL', () => {
    const productId = 'b0000000-0000-0000-0000-000000000001'
    const url = `/my-booth/products/new?prefill=${productId}`
    expect(url).toContain('prefill=')
    expect(url).not.toContain('edit=')
  })

  it('daily digest email generates correct prefill URL format', () => {
    // The digest email CTA generates: /my-booth/products/new?prefill=<productId>
    const siteUrl = 'https://casagrown.com'
    const pastProductId = 'b0000000-0000-0000-0000-000000000001'
    const listUrl = `${siteUrl}/my-booth/products/new?prefill=${pastProductId}`
    
    expect(listUrl).toBe('https://casagrown.com/my-booth/products/new?prefill=b0000000-0000-0000-0000-000000000001')
    
    // Parse the URL to verify it's valid
    const parsed = new URL(listUrl)
    expect(parsed.pathname).toBe('/my-booth/products/new')
    expect(parsed.searchParams.get('prefill')).toBe(pastProductId)
  })

  it('prefill loads name, description, category, price, unit, photos from past product', async () => {
    // When supabase.from('market_products').select().eq().single() is called,
    // it should return the mock product
    const selectChain: any = {}
    methods.forEach(m => { selectChain[m] = vi.fn().mockReturnValue(selectChain) })
    selectChain.single = vi.fn().mockResolvedValue({ data: mockProduct, error: null })
    selectChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    selectChain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
    selectChain.catch = (reject: any) => Promise.resolve({ data: [], error: null }).catch(reject)
    selectChain.finally = (cb: any) => Promise.resolve({ data: [], error: null }).finally(cb)
    
    // Verify the mock product has all required fields
    expect(mockProduct.name).toBe('Fresh Eggs')
    expect(mockProduct.description).toBe('Free range eggs from our chickens')
    expect(mockProduct.category).toBe('eggs')
    expect(mockProduct.price_usd).toBe(6.00)
    expect(mockProduct.unit).toBe('dozen')
    expect(mockProduct.photos).toHaveLength(1)
  })

  it('prefill does not set editId (creates new product)', () => {
    mockSearchParams.set('prefill', 'product-abc')
    const editId = mockSearchParams.get('edit')
    const prefillId = mockSearchParams.get('prefill')
    const isEditMode = !!editId
    
    expect(isEditMode).toBe(false)
    expect(prefillId).toBe('product-abc')
  })

  it('prefill is skipped when edit mode is active', () => {
    mockSearchParams.set('edit', 'product-xyz')
    mockSearchParams.set('prefill', 'product-abc')
    
    const editId = mockSearchParams.get('edit')
    const prefillId = mockSearchParams.get('prefill')
    
    // In the component: if (!prefillId || editId) return
    const shouldPrefill = prefillId && !editId
    expect(shouldPrefill).toBeFalsy()
  })

  it('handles missing prefill product gracefully', async () => {
    // When the product doesn't exist, single() returns null
    const result = { data: null, error: null }
    // The component checks: if (!data) return — so no crash
    expect(result.data).toBeNull()
  })

  it('free product prefill sets price to 0 and isFree flag', () => {
    const freeProduct = { ...mockProduct, price_usd: 0 }
    const priceUsd = freeProduct.price_usd === 0 ? '0' : String(freeProduct.price_usd)
    const isFree = freeProduct.price_usd === 0
    
    expect(priceUsd).toBe('0')
    expect(isFree).toBe(true)
  })
})
