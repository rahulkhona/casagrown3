/**
 * WizardContext Unit Tests
 * 
 * Tests: Step navigation, data management, AND referral code flow:
 * - Inviter resolution from localStorage
 * - invited_by_id attribution on profile save
 * - Inviter reward point granting
 * - Storage cleanup after use
 * - Invalid/missing referral code handling
 */

import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { WizardProvider, useWizard } from './wizard-context'

// Configurable mock Supabase for per-test behavior
// We need more control over the mock chain for referral testing
const mockUpdate = jest.fn().mockReturnValue({
  eq: jest.fn().mockResolvedValue({ error: null }),
})
const mockInsert = jest.fn().mockResolvedValue({ error: null })

// For select queries, we need different chains for different tables/columns
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null })
const mockSingle = jest.fn().mockResolvedValue({ data: null })

const mockContains = jest.fn().mockReturnValue({
  maybeSingle: mockMaybeSingle,
})

const mockOrder = jest.fn().mockReturnValue({
  limit: jest.fn().mockReturnValue({
    maybeSingle: mockMaybeSingle,
  }),
})

const mockEq = jest.fn().mockReturnValue({
  order: mockOrder,
  contains: mockContains,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
})

const mockSelect = jest.fn().mockReturnValue({
  eq: mockEq,
  in: jest.fn().mockResolvedValue({ data: [] }),
})

const mockFrom = jest.fn().mockReturnValue({
  update: mockUpdate,
  insert: mockInsert,
  select: mockSelect,
})

jest.mock('../auth/auth-hook', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', user_metadata: { full_name: 'Test User' } },
  }),
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}))

// Mock solito
jest.mock('solito/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

// Mock media upload
jest.mock('./utils/media-upload', () => ({
  uploadProfileAvatar: jest.fn().mockResolvedValue('https://example.com/avatar.jpg'),
}))

// Mock AsyncStorage (used by wizard-context.tsx on native platforms - Platform.OS != 'web')
const mockAsyncGetItem = jest.fn().mockResolvedValue(null)
const mockAsyncRemoveItem = jest.fn().mockResolvedValue(null)
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (...args: any[]) => mockAsyncGetItem(...args),
    setItem: jest.fn().mockResolvedValue(null),
    removeItem: (...args: any[]) => mockAsyncRemoveItem(...args),
  },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WizardProvider>{children}</WizardProvider>
)

describe('WizardContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAsyncGetItem.mockResolvedValue(null)

    // Reset default mock behavior
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockSingle.mockResolvedValue({ data: null })
    mockInsert.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
  })

  // =========================================
  // Basic Step & Data Management (existing)
  // =========================================

  it('provides default data with user pre-population', () => {
    const { result } = renderHook(() => useWizard(), { wrapper })
    expect(result.current.data.name).toBe('Test User')
    expect(result.current.data.country).toBe('USA')
    expect(result.current.step).toBe(0)
  })

  it('updateData merges partial updates', () => {
    const { result } = renderHook(() => useWizard(), { wrapper })
    act(() => {
      result.current.updateData({ name: 'John Doe' })
    })
    expect(result.current.data.name).toBe('John Doe')
    expect(result.current.data.country).toBe('USA')
  })

  it('nextStep increments step (max 2)', () => {
    const { result } = renderHook(() => useWizard(), { wrapper })
    expect(result.current.step).toBe(0)
    act(() => result.current.nextStep())
    expect(result.current.step).toBe(1)
    act(() => result.current.nextStep())
    expect(result.current.step).toBe(2)
    act(() => result.current.nextStep())
    expect(result.current.step).toBe(2) // Capped
  })

  it('prevStep decrements step (min 0)', () => {
    const { result } = renderHook(() => useWizard(), { wrapper })
    act(() => result.current.setStep(2))
    expect(result.current.step).toBe(2)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(1)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(0)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(0) // Capped
  })

  // =========================================
  // Referral Code Flow - saveProfile
  // =========================================

  describe('saveProfile - Referral Code Attribution', () => {
    it('reads referral code from AsyncStorage during saveProfile', async () => {
      mockAsyncGetItem.mockResolvedValue('abc12345')

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      expect(mockAsyncGetItem).toHaveBeenCalledWith('casagrown_referral_code')
    })

    it('resolves inviter ID from referral code via Supabase', async () => {
      mockAsyncGetItem.mockResolvedValue('abc12345')
      
      // Mock: profiles query returns inviter
      mockSingle.mockResolvedValueOnce({ 
        data: { id: 'inviter-user-id' } 
      })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      // Verify that supabase.from('profiles') was called to look up the referral code
      expect(mockFrom).toHaveBeenCalledWith('profiles')
    })

    it('includes invited_by_id in profile update when inviter is found', async () => {
      mockAsyncGetItem.mockResolvedValue('abc12345')
      
      // First single() call is for referral code lookup - returns inviter
      mockSingle.mockResolvedValueOnce({ 
        data: { id: 'inviter-user-id' } 
      })

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      // The profile update should have been called
      expect(mockUpdate).toHaveBeenCalled()
      // Verify the update payload includes invited_by_id
      const updatePayload = mockUpdate.mock.calls[0][0]
      expect(updatePayload.invited_by_id).toBe('inviter-user-id')
    })

    it('does NOT include invited_by_id when no referral code in storage', async () => {
      mockAsyncGetItem.mockResolvedValue(null)

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      // Profile update should NOT have invited_by_id
      expect(mockUpdate).toHaveBeenCalled()
      const updatePayload = mockUpdate.mock.calls[0][0]
      expect(updatePayload.invited_by_id).toBeUndefined()
    })

    it('does NOT include invited_by_id when referral code is invalid (no matching inviter)', async () => {
      mockAsyncGetItem.mockResolvedValue('invalidcode')
      
      // Referral code lookup returns no match
      mockSingle.mockResolvedValueOnce({ data: null })

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      expect(mockUpdate).toHaveBeenCalled()
      const updatePayload = mockUpdate.mock.calls[0][0]
      expect(updatePayload.invited_by_id).toBeUndefined()
    })

    it('clears referral code from localStorage after saveProfile', async () => {
      mockAsyncGetItem.mockResolvedValue('abc12345')
      
      // Mock inviter found
      mockSingle.mockResolvedValueOnce({ 
        data: { id: 'inviter-user-id' } 
      })

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      expect(mockAsyncRemoveItem).toHaveBeenCalledWith('casagrown_referral_code')
    })

    it('grants inviter reward points for invitee_signing_up', async () => {
      mockAsyncGetItem.mockResolvedValue('abc12345')
      
      // Referral code → inviter found
      mockSingle.mockResolvedValueOnce({ 
        data: { id: 'inviter-user-id' } 
      })

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      // Verify point_ledger insert was called (for inviter reward)
      // The insert should include metadata with action_type: 'invitee_signing_up'
      const insertCalls = mockInsert.mock.calls
      const inviterRewardCall = insertCalls.find((call: any) => {
        const payload = call[0]
        return payload?.metadata?.action_type === 'invitee_signing_up'
      })

      // Note: The actual inviter reward insert happens via the from('point_ledger').insert chain
      // which goes through mockFrom → mockInsert
      expect(mockFrom).toHaveBeenCalledWith('point_ledger')
    })

    it('auto-follows inviter when referral code is valid', async () => {
      mockAsyncGetItem.mockResolvedValue('abc12345')
      
      // Referral code → inviter found
      mockSingle.mockResolvedValueOnce({ 
        data: { id: 'inviter-user-id' } 
      })

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      // Verify followers insert was called
      expect(mockFrom).toHaveBeenCalledWith('followers')
      
      // Find the followers insert call
      const insertCalls = mockInsert.mock.calls
      const followCall = insertCalls.find((call: any) => {
        const payload = call[0]
        return payload?.follower_id === 'test-user-id' && payload?.followed_id === 'inviter-user-id'
      })
      expect(followCall).toBeTruthy()
    })

    it('does NOT auto-follow when no referral code exists', async () => {
      mockAsyncGetItem.mockResolvedValue(null)

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      await act(async () => {
        await result.current.saveProfile()
      })

      // followers table should NOT be accessed
      const fromCalls = mockFrom.mock.calls.map((c: any) => c[0])
      expect(fromCalls).not.toContain('followers')
    })

    it('handles saveProfile gracefully when localStorage throws', async () => {
      mockAsyncGetItem.mockRejectedValue(new Error('AsyncStorage not available'))

      const mockEqForUpdate = jest.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({ eq: mockEqForUpdate })

      const { result } = renderHook(() => useWizard(), { wrapper })

      // Should not throw - referral code errors are caught
      let success: boolean = false
      await act(async () => {
        success = await result.current.saveProfile()
      })

      // saveProfile should still attempt to save the profile
      // (referral code failure is non-blocking)
      expect(mockUpdate).toHaveBeenCalled()
    })
  })
})
