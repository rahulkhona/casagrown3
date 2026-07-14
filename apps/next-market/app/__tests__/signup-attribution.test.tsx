// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Setup global mock for next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/join',
  useSearchParams: () => new URLSearchParams(),
}))

let oldVitest: string | undefined

// Helper function to build a chainable database mock
function createDbMock(selectData: any, selectError: any = null) {
  const mockSingle = vi.fn().mockResolvedValue({ data: selectData, error: selectError })
  const mockUpdate = vi.fn().mockReturnThis()
  const mockSelect = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  
  const c: any = {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    update: mockUpdate,
  }
  
  // Allow the chain to act as a promise for update().eq() which is awaited directly in hook
  c.then = (resolve: any) => Promise.resolve({ error: null }).then(resolve)
  c.catch = (reject: any) => Promise.resolve({ error: null }).catch(reject)
  c.finally = (cb: any) => Promise.resolve({ error: null }).finally(cb)
  
  return {
    chain: c,
    mockSingle,
    mockUpdate,
    mockSelect,
    mockEq,
  }
}

describe('Signup Attribution Unit/Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    
    // Temporarily bypass VITEST check to test the actual browser wrapper logic in supabase.ts
    oldVitest = process.env.VITEST
    delete process.env.VITEST

    // Mock search params in JSDOM URL so useReferralCapture does not exit early
    window.history.replaceState({}, '', '/join?utm_source=test')
  })

  afterEach(() => {
    process.env.VITEST = oldVitest
  })

  describe('Supabase Client Wrapper (OTP flow)', () => {
    it('automatically adds signup_source from localStorage to signInWithOtp options', async () => {
      localStorage.setItem('casagrown_first_page', '/create-listing')

      // Spy on the raw client BEFORE creating the wrapped client so the wrapper closure binds to our spy!
      const { createBrowserClient } = await import('@supabase/ssr')
      const rawClient = createBrowserClient(null as any, null as any)
      const rawSignInSpy = vi.spyOn(rawClient.auth, 'signInWithOtp').mockResolvedValue({ data: {} as any, error: null })

      // Import the actual real supabase.ts module, bypassing the global setup mock
      const { createClient } = await vi.importActual<any>('../../lib/supabase')
      const client = createClient()

      await client.auth.signInWithOtp({ email: 'test@example.com' })

      expect(rawSignInSpy).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: {
          data: {
            signup_source: '/create-listing',
            first_touch_source: 'organic',
            utm_source: null,
            utm_medium: null,
            utm_campaign: null,
          }
        }
      })
    })
  })

  describe('Global Auth State Change Sync (Social Login flow)', () => {
    it('syncs signup_source on SIGNED_IN event if profile has none', async () => {
      localStorage.setItem('casagrown_first_page', '/growbot')

      const { createBrowserClient } = await import('@supabase/ssr')
      const rawClient = createBrowserClient(null as any, null as any)

      // Capture the listener from onAuthStateChange
      let authListener: any = null
      vi.spyOn(rawClient.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
        authListener = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      // Setup chainable database mock
      const dbMock = createDbMock({ signup_source: null })
      vi.spyOn(rawClient, 'from').mockReturnValue(dbMock.chain as any)

      // Import actual useReferralCapture which will internally trigger createClient() and register onAuthStateChange
      const { useReferralCapture } = await vi.importActual<any>('../../lib/useReferralCapture')
      renderHook(() => useReferralCapture())

      expect(authListener).toBeTruthy()

      // Trigger SIGNED_IN event
      const mockSession = { user: { id: 'test-user-id' } }
      await authListener('SIGNED_IN', mockSession)

      // Wait for async task execution
      await new Promise((r) => setTimeout(r, 50))

      // Assert profiles was queried
      expect(dbMock.mockSelect).toHaveBeenCalledWith('signup_source')
      expect(dbMock.mockEq).toHaveBeenCalledWith('id', 'test-user-id')
      expect(dbMock.mockSingle).toHaveBeenCalled()

      // Assert signup_source was updated with normalized first-touch from localStorage
      expect(dbMock.mockUpdate).toHaveBeenCalledWith({ signup_source: '/growbot' })
    })

    it('does not overwrite signup_source if it is already populated in user profile', async () => {
      localStorage.setItem('casagrown_first_page', '/growbot')
      
      const { createBrowserClient } = await import('@supabase/ssr')
      const rawClient = createBrowserClient(null as any, null as any)

      let authListener: any = null
      vi.spyOn(rawClient.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
        authListener = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      // Setup chainable database mock with pre-existing signup_source value
      const dbMock = createDbMock({ signup_source: '/sell' })
      vi.spyOn(rawClient, 'from').mockReturnValue(dbMock.chain as any)

      const { useReferralCapture } = await vi.importActual<any>('../../lib/useReferralCapture')
      renderHook(() => useReferralCapture())

      const mockSession = { user: { id: 'test-user-id' } }
      await authListener('SIGNED_IN', mockSession)
      await new Promise((r) => setTimeout(r, 50))

      // Assert profiles was queried
      expect(dbMock.mockSelect).toHaveBeenCalledWith('signup_source')

      // Assert that update was NOT called
      expect(dbMock.mockUpdate).not.toHaveBeenCalled()
    })
  })
})
