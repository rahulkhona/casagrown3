import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { WizardProvider, useWizard } from './wizard-context'

// Mock auth hook - provide full_name to prevent infinite useEffect loop
jest.mock('../auth/auth-hook', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', user_metadata: { full_name: 'Test User' } },
  }),
  supabase: {
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            }),
          }),
          contains: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    }),
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

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WizardProvider>{children}</WizardProvider>
)

describe('WizardContext', () => {
  it('provides default data with user pre-population', () => {
    const { result } = renderHook(() => useWizard(), { wrapper })

    // Name is pre-populated from user_metadata.full_name
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
    expect(result.current.data.country).toBe('USA') // unchanged
  })

  it('nextStep increments step (max 2)', () => {
    const { result } = renderHook(() => useWizard(), { wrapper })

    expect(result.current.step).toBe(0)

    act(() => result.current.nextStep())
    expect(result.current.step).toBe(1)

    act(() => result.current.nextStep())
    expect(result.current.step).toBe(2)

    // Should not exceed 2
    act(() => result.current.nextStep())
    expect(result.current.step).toBe(2)
  })

  it('prevStep decrements step (min 0)', () => {
    const { result } = renderHook(() => useWizard(), { wrapper })

    // Go to step 2
    act(() => result.current.setStep(2))
    expect(result.current.step).toBe(2)

    act(() => result.current.prevStep())
    expect(result.current.step).toBe(1)

    act(() => result.current.prevStep())
    expect(result.current.step).toBe(0)

    // Should not go below 0
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(0)
  })
})
