import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

// ── Deep chain mock helper ──
function createMockChain(resolvedValue: any = { data: null, error: null }) {
  const chain: any = {}
  const methods = [
    'select', 'eq', 'single', 'limit', 'is', 'gt', 'in',
    'insert', 'update', 'delete', 'match', 'order', 'maybeSingle',
  ]
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single.mockResolvedValue(resolvedValue)
  chain.maybeSingle.mockResolvedValue(resolvedValue)
  chain.then = (resolve: any) => Promise.resolve(resolvedValue).then(resolve)
  chain.catch = (reject: any) => Promise.resolve(resolvedValue).catch(reject)
  return chain
}

// ── Supabase mock ──
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } })
const mockSignInWithOtp = vi.fn().mockResolvedValue({ error: null })
const mockVerifyOtp = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-123', email: 'test@test.com' } },
  error: null,
})
const mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null })
const mockFunctionsInvoke = vi.fn().mockResolvedValue({ data: null, error: null })

const profileSelectChain = createMockChain({ data: null, error: null })
const profileUpdateChain = createMockChain({ data: null, error: null })

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
    signInWithOtp: mockSignInWithOtp,
    verifyOtp: mockVerifyOtp,
    signInWithOAuth: mockSignInWithOAuth,
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: profileSelectChain.select,
        update: profileUpdateChain.update,
        eq: profileSelectChain.eq,
        single: profileSelectChain.single,
        maybeSingle: profileSelectChain.maybeSingle,
        insert: profileUpdateChain.insert,
        ...profileSelectChain,
      }
    }
    return createMockChain()
  }),
  functions: { invoke: mockFunctionsInvoke },
  channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() }),
  removeChannel: vi.fn(),
}

vi.mock('../../../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('../../../lib/useBootstrap', () => ({
  useBootstrap: () => ({ refresh: vi.fn(), user: null }),
}))

vi.mock('../../../lib/geocode', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({ lat: 37.3, lng: -121.8 }),
  toPostgisPoint: vi.fn().mockReturnValue('POINT(-121.8 37.3)'),
}))

vi.mock('../../../lib/featureFlags', () => ({
  ENABLE_SOCIAL_LOGIN: true,
}))

vi.mock('h3-js', () => ({
  latLngToCell: vi.fn().mockReturnValue('mock-h3'),
}))

vi.mock('../../(main)/terms/page', () => ({
  TERMS_SECTIONS: [],
  PRIVACY_SECTIONS: [],
}))

const mockTrackEvent = vi.fn()
const mockTrackFieldInteract = vi.fn()
const mockTrackStepTiming = vi.fn()
const mockResetSessionId = vi.fn()

vi.mock('../../../lib/crm-analytics', () => ({
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
  trackFieldInteract: (...args: any[]) => mockTrackFieldInteract(...args),
  trackStepTiming: (...args: any[]) => mockTrackStepTiming(...args),
  resetSessionId: (...args: any[]) => mockResetSessionId(...args),
}))

vi.mock('../QuickSetupModal.module.css', () => ({
  default: new Proxy({}, {
    get: (_target: any, prop: string) => prop,
  }),
}))

import QuickSetupModal from '../QuickSetupModal'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onComplete: vi.fn(),
}

describe('QuickSetupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    profileSelectChain.single.mockResolvedValue({ data: null, error: null })
    mockTrackEvent.mockClear()
    mockTrackFieldInteract.mockClear()
    mockTrackStepTiming.mockClear()
    mockResetSessionId.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Initial Step 1 Rendering
  // ═══════════════════════════════════════════════════════════════════════

  describe('Step 1 rendering', () => {
    it('renders Step 1 with email input and social login options', async () => {
      render(<QuickSetupModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('👋 Welcome')).toBeInTheDocument()
      })

      // Email field
      const emailInput = screen.getByPlaceholderText('you@example.com')
      expect(emailInput).toBeInTheDocument()

      // Social login buttons
      expect(screen.getByText(/Continue with Google/)).toBeInTheDocument()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Progressive Flow & Validation
  // ═══════════════════════════════════════════════════════════════════════

  describe('Progressive flow and validation', () => {
    it('blocks continue when email is empty', async () => {
      render(<QuickSetupModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
      })

      const sendBtn = screen.getByText('Continue →')
      expect(sendBtn).toBeDisabled()
      expect(mockSignInWithOtp).not.toHaveBeenCalled()
    })

    it('advances from email input to OTP step when valid email is entered', async () => {
      render(<QuickSetupModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
      })

      const emailInput = screen.getByPlaceholderText('you@example.com')
      fireEvent.change(emailInput, { target: { value: 'user@example.com' } })

      const continueBtn = screen.getByText('Continue →')
      expect(continueBtn).not.toBeDisabled()
      fireEvent.click(continueBtn)

      await waitFor(() => {
        expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: 'user@example.com' })
      })

      await waitFor(() => {
        expect(screen.getByText('✉️ Verify Email')).toBeInTheDocument()
      })
    })

    it('shows name and TOS step after OTP verification for incomplete profile', async () => {
      render(<QuickSetupModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'newuser@test.com' } })
      fireEvent.click(screen.getByText('Continue →'))

      await waitFor(() => {
        expect(screen.getByText('✉️ Verify Email')).toBeInTheDocument()
      })

      // Mock profile response: empty profile
      profileSelectChain.single.mockResolvedValue({
        data: { full_name: null, tos_accepted_at: null, profile_completed_at: null },
        error: null,
      })

      // Fill OTP digits (auto-triggers verification on 6th digit)
      for (let i = 0; i < 6; i++) {
        const otpInput = screen.getByTestId(`otp-input-${i}`)
        fireEvent.change(otpInput, { target: { value: String(i + 1) } })
      }

      await waitFor(() => {
        expect(screen.getByText('🌱 Almost Done!')).toBeInTheDocument()
      })

      expect(screen.getByPlaceholderText('Jane Smith')).toBeInTheDocument()
      expect(screen.getByText(/Get text alerts/)).toBeInTheDocument()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Prefill prop
  // ═══════════════════════════════════════════════════════════════════════

  describe('Prefill prop', () => {
    it('pre-fills email field from prefill prop', async () => {
      const prefill = {
        name: 'Jane',
        email: 'j@x.com',
      }

      render(<QuickSetupModal {...defaultProps} prefill={prefill} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
      })

      expect((screen.getByPlaceholderText('you@example.com') as HTMLInputElement).value).toBe('j@x.com')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Social login
  // ═══════════════════════════════════════════════════════════════════════

  describe('Social login', () => {
    it('initiates OAuth flow when Google button is clicked', async () => {
      render(<QuickSetupModal {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText(/Continue with Google/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Continue with Google/))

      await waitFor(() => {
        expect(mockSignInWithOAuth).toHaveBeenCalledWith(
          expect.objectContaining({ provider: 'google' })
        )
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 5. Returning user fast path
  // ═══════════════════════════════════════════════════════════════════════

  describe('Returning user fast path', () => {
    it('calls onComplete immediately for fully completed profile', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: 'user-456', email: 'returning@test.com', user_metadata: { full_name: 'Returning User' } },
        },
      })

      profileSelectChain.single.mockResolvedValue({
        data: {
          full_name: 'Returning User',
          profile_completed_at: '2026-01-01T00:00:00Z',
          tos_accepted_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      })

      const onComplete = vi.fn()

      render(<QuickSetupModal {...defaultProps} onComplete={onComplete} />)

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 6. Metrics tracking
  // ═══════════════════════════════════════════════════════════════════════

  describe('Metrics tracking', () => {
    it('calls resetSessionId and trackEvent wizard_step on mount', async () => {
      render(<QuickSetupModal {...defaultProps} />)
      await waitFor(() => {
        expect(mockResetSessionId).toHaveBeenCalledWith('/quicksetup')
        expect(mockTrackEvent).toHaveBeenCalledWith('wizard_step', '/quicksetup', { step_index: 1, step_name: 'auth' })
      })
    })

    it('tracks field interactions on blur', async () => {
      render(<QuickSetupModal {...defaultProps} />)
      await waitFor(() => {
        expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
      })
      const emailInput = screen.getByPlaceholderText('you@example.com')
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      fireEvent.blur(emailInput)
      await waitFor(() => {
        expect(mockTrackFieldInteract).toHaveBeenCalledWith('/quicksetup', 1, 'email', true)
      })
    })

    it('tracks wizard_abandon on unmount if not completed', async () => {
      const { unmount } = render(<QuickSetupModal {...defaultProps} />)
      await waitFor(() => {
        expect(mockResetSessionId).toHaveBeenCalled()
      })
      unmount()
      expect(mockTrackEvent).toHaveBeenCalledWith('wizard_abandon', '/quicksetup')
    })
  })
})
