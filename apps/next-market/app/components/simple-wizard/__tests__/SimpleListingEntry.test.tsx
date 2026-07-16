/**
 * SimpleListingEntry Tests
 *
 * Tests the simple listing wizard entry component:
 * - Basic rendering (textarea, submit button, skip link)
 * - Authentication-aware UI (returning user button)
 * - Disabled/enabled submit states
 * - OTP flow for returning users
 * - QuickSetupModal trigger for unauthenticated users
 * - AI progress steps during processing
 * - Navigation + sessionStorage after AI parse
 * - CRM tracking events
 * - Lead provider URL param handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'

// ── Controllable mocks ──
const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/create-listing-simple',
  useSearchParams: () => mockSearchParams,
  useParams: () => ({}),
}))

// ── Auth mock — toggled per-test ──
let mockIsAuthenticated = false
let mockUser: any = null
let mockAuthLoading = false

vi.mock('../../../../lib/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockIsAuthenticated,
    loading: mockAuthLoading,
    isBanned: false,
    banReason: null,
  }),
}))

// ── QuickSetup mock ──
const mockRequireAuth = vi.fn()

vi.mock('../../../../lib/useQuickSetup', () => ({
  useQuickSetup: () => ({
    requireAuth: mockRequireAuth,
  }),
}))

// ── Supabase mock ──
const mockSignInWithOtp = vi.fn().mockResolvedValue({ error: null })
const mockVerifyOtp = vi.fn().mockResolvedValue({ data: { user: null }, error: null })
const mockFunctionsInvoke = vi.fn().mockResolvedValue({ data: null, error: null })

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
    signInWithOtp: mockSignInWithOtp,
    verifyOtp: mockVerifyOtp,
  },
  functions: { invoke: mockFunctionsInvoke },
  channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() }),
  removeChannel: vi.fn(),
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://img.test/x.jpg' } }),
    }),
  },
}

vi.mock('../../../../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

// ── CRM analytics mock ──
const mockResetSessionId = vi.fn()
const mockTrackEvent = vi.fn()
const mockTrackFieldInteract = vi.fn()
const mockTrackStepTiming = vi.fn()

vi.mock('../../../../lib/crm-analytics', () => ({
  resetSessionId: (...args: any[]) => mockResetSessionId(...args),
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
  trackFieldInteract: (...args: any[]) => mockTrackFieldInteract(...args),
  trackStepTiming: (...args: any[]) => mockTrackStepTiming(...args),
  trackAiUsage: vi.fn(),
  markConverted: vi.fn(),
  useMarketingAnalytics: vi.fn(),
}))

// ── Mock sessionStorage ──
const sessionStore: Record<string, string> = {}
const mockSetItem = vi.fn((key: string, value: string) => { sessionStore[key] = value })
const mockGetItem = vi.fn((key: string) => sessionStore[key] || null)
const mockRemoveItem = vi.fn((key: string) => { delete sessionStore[key] })

Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
    clear: () => { Object.keys(sessionStore).forEach(k => delete sessionStore[k]) },
    length: 0,
    key: () => null,
  },
  writable: true,
})

// ── Import the component ──
import SimpleListingEntry from '../SimpleListingEntry'

describe('SimpleListingEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockIsAuthenticated = false
    mockUser = null
    mockAuthLoading = false
    mockSearchParams.delete('email')
    mockSearchParams.delete('name')
    mockSearchParams.delete('phone')
    mockSearchParams.delete('zipcode')
    mockSearchParams.delete('address')
    Object.keys(sessionStore).forEach(k => delete sessionStore[k])
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  // ─── Basic rendering ───────────────────────────────────────
  it('renders textarea and submit button', () => {
    render(<SimpleListingEntry />)

    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /create account & listing/i })).toBeTruthy()
  })

  // ─── Returning user button visibility ─────────────────────
  it('shows returning user button when not authenticated', () => {
    mockIsAuthenticated = false
    render(<SimpleListingEntry />)

    expect(screen.getByRole('button', { name: /returning user/i })).toBeTruthy()
  })

  it('hides returning user button when authenticated', () => {
    mockIsAuthenticated = true
    mockUser = { id: 'user-123', email: 'test@test.com' }
    render(<SimpleListingEntry />)

    expect(screen.queryByRole('button', { name: /returning user/i })).toBeFalsy()
  })

  // ─── Submit disabled/enabled state ────────────────────────
  it('disables submit when text and photos are empty', () => {
    render(<SimpleListingEntry />)

    const submitBtn = screen.getByRole('button', { name: /create account & listing/i }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('enables submit when text is entered', () => {
    render(<SimpleListingEntry />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '5 dozen oranges at $5 each' } })

    const submitBtn = screen.getByRole('button', { name: /create account & listing/i }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
  })

  // ─── QuickSetup trigger when unauthenticated ─────────────
  it('calls requireAuth when submit clicked and not authenticated', () => {
    mockIsAuthenticated = false
    render(<SimpleListingEntry />)

    // Type some text first so submit is enabled
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Selling fresh tomatoes' } })

    const submitBtn = screen.getByRole('button', { name: /create account & listing/i })
    fireEvent.click(submitBtn)

    expect(mockRequireAuth).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'simple_listing_create' })
    )
  })

  // ─── Navigation after submit ───────────────────────────
  it('navigates to add product page immediately on submit', async () => {
    mockIsAuthenticated = true
    mockUser = { id: 'user-123', email: 'test@test.com' }

    render(<SimpleListingEntry />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Selling oranges' } })

    const submitBtn = screen.getByRole('button', { name: /create my listing/i })
    fireEvent.click(submitBtn)

    expect(mockPush).toHaveBeenCalledWith('/my-booth/products/new?from=simple-wizard')
  })

  // ─── sessionStorage prefill data ──────────────────────────
  it('stores prefill data in sessionStorage immediately', async () => {
    mockIsAuthenticated = true
    mockUser = { id: 'user-123', email: 'test@test.com' }

    render(<SimpleListingEntry />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Selling oranges for $5' } })

    const submitBtn = screen.getByRole('button', { name: /create my listing/i })
    fireEvent.click(submitBtn)

    expect(mockSetItem).toHaveBeenCalledWith(
      'simple_listing_prefill',
      expect.stringContaining('"fromSimpleWizard":true')
    )

    // Verify the stored data structure
    const storedCall = mockSetItem.mock.calls.find(
      (c: [string, string]) => c[0] === 'simple_listing_prefill'
    )
    expect(storedCall).toBeTruthy()
    const storedData = JSON.parse(storedCall![1])
    expect(storedData.originalText).toBe('Selling oranges for $5')
    expect(storedData.fromSimpleWizard).toBe(true)
  })

  // ─── Skip to full form link ───────────────────────────────
  it('shows skip to full form link', () => {
    mockIsAuthenticated = true
    render(<SimpleListingEntry />)

    const skipBtn = screen.getByRole('button', { name: /skip to full form/i })
    expect(skipBtn).toBeTruthy()
  })

  // ─── Tracking: wizard_step on mount ──────────────────────
  it('tracks wizard_step event on mount', () => {
    render(<SimpleListingEntry />)

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'wizard_step',
      '/create-listing-simple',
      expect.objectContaining({ step_index: 1, step_name: 'text_input' })
    )
  })

  // ─── Tracking: button_click for returning user ───────────
  it('tracks button_click for returning user', () => {
    mockIsAuthenticated = false
    render(<SimpleListingEntry />)

    const returningBtn = screen.getByRole('button', { name: /returning user/i })
    fireEvent.click(returningBtn)

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'button_click',
      '/create-listing-simple',
      expect.objectContaining({ button: 'returning_user' })
    )
  })
})
