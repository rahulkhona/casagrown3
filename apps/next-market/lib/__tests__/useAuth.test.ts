// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unmock useAuth so we test the real implementation (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/useAuth')

// Mock supabase before importing useAuth
const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockUpdate = vi.fn()
const mockFrom = vi.fn()

vi.mock('../../lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// Mock React hooks for testing
import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../../lib/useAuth'

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Chain: from().select().eq().single()
    mockSingle.mockResolvedValue({ data: { is_banned: false, ban_reason: null } })
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({
      select: mockSelect,
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ then: vi.fn((cb: any) => cb()) }) }),
    })
  })

  it('should return loading=true initially', () => {
    mockGetUser.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('should return user when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toEqual({ id: 'user-1', email: 'test@test.com' })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isBanned).toBe(false)
  })

  it('should return null user when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('should detect banned user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'banned-user', email: 'banned@test.com' } } })
    mockSingle.mockResolvedValue({ data: { is_banned: true, ban_reason: 'Violation of terms' } })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toEqual({ id: 'banned-user', email: 'banned@test.com' })
    expect(result.current.isBanned).toBe(true)
    expect(result.current.banReason).toBe('Violation of terms')
    expect(result.current.isAuthenticated).toBe(false) // banned users are NOT authenticated
  })

  it('should handle banned user with no ban_reason', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'banned-user', email: 'banned@test.com' } } })
    mockSingle.mockResolvedValue({ data: { is_banned: true, ban_reason: null } })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isBanned).toBe(true)
    expect(result.current.banReason).toBeNull()
  })

  it('should handle user with no email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-no-email', email: undefined } } })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toEqual({ id: 'user-no-email', email: undefined })
    expect(result.current.isAuthenticated).toBe(true)
  })
})
