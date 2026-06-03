import '@testing-library/jest-dom'
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'
expect.extend(matchers)
import { vi } from 'vitest'
import React from 'react'

// Prevent createBrowserClient from throwing during Vitest runs
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_dummy'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_dummy'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'test-id', productId: 'test-prod', code: 'test-code', template: 'farm' }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => {
    return children
  },
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: any) => React.createElement('img', props),
}))

// ── Deep chain mock ──
function chain(data: any = [], error: any = null) {
  const result = { data: data ?? [], error, count: Array.isArray(data) ? data.length : 0 }
  const c: any = {}
  const methods = ['select','eq','neq','single','maybeSingle','limit','is','gt','lt','gte','lte','in','insert','update','upsert','delete','match','order','or','not','contains','like','ilike','range','filter','ascending','on','head','textSearch']
  methods.forEach(m => { c[m] = vi.fn().mockReturnValue(c) })
  c.single = vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.maybeSingle = vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.then = (resolve: any) => Promise.resolve(result).then(resolve)
  c.catch = (reject: any) => Promise.resolve(result).catch(reject)
  c.finally = (cb: any) => Promise.resolve(result).finally(cb)
  return c
}

const globalSupabase = {
  from: vi.fn().mockImplementation(() => chain()),
  rpc: vi.fn().mockResolvedValue({ data: { available_usd: 0 }, error: null }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
  functions: {
    invoke: () => Promise.resolve({ data: null, error: null }),
  },
  channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() }),
  removeChannel: vi.fn(),
  storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://img.test/x.jpg' } }) }) },
}

// Mock supabase at ALL relative depths and alias paths
const supabaseMock = { createClient: () => globalSupabase }
vi.mock('../../lib/supabase', () => supabaseMock)
vi.mock('../lib/supabase', () => supabaseMock)
vi.mock('@/lib/supabase', () => supabaseMock)
vi.mock('apps/next-market/lib/supabase', () => supabaseMock)
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => globalSupabase }))

// Mock lib/store — makes useMarket() work everywhere without MarketProvider
const storeMock = {
  MarketProvider: ({ children }: any) => React.createElement('div', null, children),
  useMarket: () => ({
    state: {
      marketSchedule: null, marketNeverCloses: true,
      booths: [], orders: [], products: [],
      conversations: [], helpers: [], coupons: [], notifications: [],
      following: [],
      user: null,
      balance: 0, isAuthenticated: false,
    },
    dispatch: vi.fn(),
  }),
  isMarketOpen: () => true,
  formatUsd: (n: number) => `$${(n || 0).toFixed(2)}`,
  getNextMarketOpen: () => null,
  getNextMarketDate: () => null,
}
vi.mock('../../lib/store', () => storeMock)

// Mock useAuth
vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, loading: false, isBanned: false, banReason: null }),
}))

// Mock useBootstrap (useAuth depends on this)
vi.mock('../../lib/useBootstrap', () => ({
  useBootstrap: () => ({
    data: {
      profile: null,
      market_config: { schedule: [], productsNeverExpire: false, marketNeverCloses: true },
      badges: null,
    },
    loading: false,
    user: null,
    isAuthenticated: false,
    refresh: vi.fn(),
  }),
  BootstrapProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
}))

// Mock analytics
vi.mock('../../lib/analytics', () => ({
  trackClick: vi.fn(), trackError: vi.fn(), trackEvent: vi.fn(), trackPageView: vi.fn(), setAnalyticsUser: vi.fn(), trackFormSubmit: vi.fn(),
}))

// Mock legal
vi.mock('../../lib/legal', () => ({
  needsTosAcceptance: vi.fn().mockReturnValue(false),
  TOS_EFFECTIVE_DATE: new Date('2026-03-15'),
  getJurisdictionConfig: () => null,
  isBlockedJurisdiction: () => false,
}))

// Mock geocode
vi.mock('../../lib/geocode', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({ lat: 37, lng: -121, display: 'Test', stateCode: 'CA' }),
  toPostgisPoint: vi.fn().mockReturnValue('SRID=4326;POINT(0 0)'),
}))

// Mock feedback-service
vi.mock('../../lib/feedback-service', () => ({
  fetchTickets: vi.fn().mockResolvedValue({ tickets: [], totalCount: 0 }),
  fetchTicketById: vi.fn().mockResolvedValue(null),
  createTicket: vi.fn().mockResolvedValue({ id: 't1' }),
  toggleVote: vi.fn().mockResolvedValue(true),
  addComment: vi.fn().mockResolvedValue(null),
  flagTicket: vi.fn().mockResolvedValue(true),
  unflagTicket: vi.fn().mockResolvedValue(true),
}))

// Mock useNotificationPrompt
vi.mock('../../lib/useNotificationPrompt', () => ({
  useNotificationPrompt: () => ({ showPrompt: vi.fn(), modalProps: { visible: false, variant: 'first-time', onEnable: vi.fn(), onDismiss: vi.fn(), onPermanentDismiss: vi.fn() } }),
  isNotificationsEnabled: () => false,
  isIOSBrowser: () => false,
  detectPlatform: () => 'desktop-web',
  getPermissionStatus: () => 'default',
}))

// Mock sub-components that depend on browser APIs
vi.mock('../../components/CameraCapture', () => ({ default: () => null }))
vi.mock('../../components/ImageCropper', () => ({ default: () => null }))
vi.mock('../../components/OrderChat', () => ({ default: () => null }))

// Mock @stripe/stripe-js
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue(null) }))

// Mock sessionStorage
const store: Record<string, string> = {}
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    length: 0,
    key: () => null,
  },
})

// jsdom doesn't implement scrollIntoView or setPointerCapture
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn()
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || vi.fn()
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || vi.fn()
}

// Global DOM cleanup after each test
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
