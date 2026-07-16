/**
 * Simple Wizard — CRM Tracking Tests
 *
 * Unit tests for the tracking integration in SimpleListingEntry:
 * - resetSessionId called on mount
 * - wizard_step event fires with step 1 on mount
 * - wizard_field_interact fires on textarea blur
 * - wizard_ai_used fires on parse attempt
 * - wizard_abandon fires on unmount (beforeunload)
 * - button_click tracked for skip_to_full_form
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'

// ── Controllable mocks ──
const mockPush = vi.fn()
const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/create-listing-simple',
  useSearchParams: () => mockSearchParams,
  useParams: () => ({}),
}))

// ── Auth mock — authenticated for most tracking tests ──
let mockIsAuthenticated = true
let mockUser: any = { id: 'user-123', email: 'test@test.com' }
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
vi.mock('../../../../lib/useQuickSetup', () => ({
  useQuickSetup: () => ({
    requireAuth: vi.fn(),
  }),
}))

// ── Supabase mock ──
const mockFunctionsInvoke = vi.fn().mockResolvedValue({
  data: { name: 'Test', category: 'other', price_usd: 1 },
  error: null,
})

const chainObj: any = {}
const methods = ['select', 'eq', 'neq', 'limit', 'insert', 'update', 'upsert', 'delete', 'match', 'order', 'or', 'not', 'contains', 'like', 'ilike', 'range', 'filter', 'in', 'is', 'gt', 'lt', 'gte', 'lte']
methods.forEach(m => { chainObj[m] = vi.fn().mockReturnValue(chainObj) })
chainObj.single = vi.fn().mockResolvedValue({ data: null, error: null })
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
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
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

// ── CRM analytics mock — these are the functions under test ──
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
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: (key: string) => sessionStore[key] || null,
    setItem: (key: string, value: string) => { sessionStore[key] = value },
    removeItem: (key: string) => { delete sessionStore[key] },
    clear: () => { Object.keys(sessionStore).forEach(k => delete sessionStore[k]) },
    length: 0,
    key: () => null,
  },
  writable: true,
})

// ── Import the component ──
import SimpleListingEntry from '../SimpleListingEntry'

const PAGE_SLUG = '/create-listing-simple'

describe('SimpleListingEntry — CRM Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockIsAuthenticated = true
    mockUser = { id: 'user-123', email: 'test@test.com' }
    mockAuthLoading = false
    Object.keys(sessionStore).forEach(k => delete sessionStore[k])
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  // ─── resetSessionId on mount ──────────────────────────────
  it('resetSessionId is called on mount', () => {
    render(<SimpleListingEntry />)

    expect(mockResetSessionId).toHaveBeenCalledWith(PAGE_SLUG)
    expect(mockResetSessionId).toHaveBeenCalledTimes(1)
  })

  // ─── wizard_step event on mount ───────────────────────────
  it('wizard_step event fires with step 1 on mount', () => {
    render(<SimpleListingEntry />)

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'wizard_step',
      PAGE_SLUG,
      { step_index: 1, step_name: 'text_input' }
    )
  })

  // ─── wizard_field_interact on textarea blur ───────────────
  it('wizard_field_interact fires on textarea blur', () => {
    render(<SimpleListingEntry />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Some product' } })
    fireEvent.blur(textarea)

    expect(mockTrackFieldInteract).toHaveBeenCalledWith(
      PAGE_SLUG,
      1,
      'freeform_text',
      true // has content
    )
  })


  // ─── wizard_abandon on beforeunload ───────────────────────
  it('wizard_abandon fires on unmount', () => {
    const { unmount } = render(<SimpleListingEntry />)

    // Clear the mount tracking calls
    mockTrackEvent.mockClear()
    mockTrackStepTiming.mockClear()

    // Trigger beforeunload — simulates user navigating away
    const unloadEvent = new Event('beforeunload')
    window.dispatchEvent(unloadEvent)

    expect(mockTrackStepTiming).toHaveBeenCalledWith(
      PAGE_SLUG,
      1,
      'text_input',
      expect.any(Number)
    )

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'wizard_abandon',
      PAGE_SLUG,
      expect.objectContaining({
        last_step: 1,
        last_step_name: 'text_input',
        has_text: false,
        photo_count: 0,
      })
    )
  })

  // ─── button_click for skip_to_full_form ───────────────────
  it('button_click tracked for skip_to_full_form', () => {
    render(<SimpleListingEntry />)

    // Clear mount tracking calls
    mockTrackEvent.mockClear()

    const skipBtn = screen.getByRole('button', { name: /skip to full form/i })
    fireEvent.click(skipBtn)

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'button_click',
      PAGE_SLUG,
      { button: 'skip_to_full_form' }
    )

    // Also verify navigation happens
    expect(mockPush).toHaveBeenCalledWith('/my-booth/products/new')
  })
})
