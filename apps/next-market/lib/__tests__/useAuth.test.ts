// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// Unmock useAuth so we test the real implementation (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/useAuth')

// Mock useBootstrap which useAuth now depends on
const mockRefresh = vi.fn()
let mockBootstrapData: any = null
let mockBootstrapLoading = true
let mockBootstrapUser: any = null

vi.mock('../../lib/useBootstrap', () => ({
  useBootstrap: () => ({
    data: mockBootstrapData,
    loading: mockBootstrapLoading,
    user: mockBootstrapUser,
    refresh: mockRefresh,
  }),
  BootstrapProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

// Mock React hooks for testing
import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../../lib/useAuth'

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBootstrapData = null
    mockBootstrapLoading = true
    mockBootstrapUser = null
  })

  it('should return loading=true initially', () => {
    mockBootstrapLoading = true
    mockBootstrapUser = null
    mockBootstrapData = null

    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('should return user when authenticated', async () => {
    mockBootstrapLoading = false
    mockBootstrapUser = { id: 'user-1', email: 'test@test.com' }
    mockBootstrapData = {
      profile: {
        full_name: 'Test User',
        avatar_url: null,
        is_banned: false,
        ban_reason: null,
        tos_accepted_at: '2026-01-01',
        profile_completed_at: '2026-01-01',
      },
      market_config: { schedule: [], productsNeverExpire: false, marketNeverCloses: true },
      badges: null,
    }

    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toEqual({ id: 'user-1', email: 'test@test.com' })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isBanned).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('should return null user when not authenticated', async () => {
    mockBootstrapLoading = false
    mockBootstrapUser = null
    mockBootstrapData = {
      profile: null,
      market_config: { schedule: [], productsNeverExpire: false, marketNeverCloses: true },
      badges: null,
    }

    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('should detect banned user', async () => {
    mockBootstrapLoading = false
    mockBootstrapUser = { id: 'banned-user', email: 'banned@test.com' }
    mockBootstrapData = {
      profile: {
        full_name: 'Banned User',
        avatar_url: null,
        is_banned: true,
        ban_reason: 'Violation of terms',
        tos_accepted_at: '2026-01-01',
        profile_completed_at: '2026-01-01',
      },
      market_config: { schedule: [], productsNeverExpire: false, marketNeverCloses: true },
      badges: null,
    }

    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toEqual({ id: 'banned-user', email: 'banned@test.com' })
    expect(result.current.isBanned).toBe(true)
    expect(result.current.banReason).toBe('Violation of terms')
    expect(result.current.isAuthenticated).toBe(false) // banned users are NOT authenticated
  })

  it('should handle banned user with no ban_reason', async () => {
    mockBootstrapLoading = false
    mockBootstrapUser = { id: 'banned-user', email: 'banned@test.com' }
    mockBootstrapData = {
      profile: {
        full_name: 'Banned User',
        avatar_url: null,
        is_banned: true,
        ban_reason: null,
        tos_accepted_at: '2026-01-01',
        profile_completed_at: '2026-01-01',
      },
      market_config: { schedule: [], productsNeverExpire: false, marketNeverCloses: true },
      badges: null,
    }

    const { result } = renderHook(() => useAuth())

    expect(result.current.isBanned).toBe(true)
    expect(result.current.banReason).toBeNull()
  })

  it('should handle user with no email', async () => {
    mockBootstrapLoading = false
    mockBootstrapUser = { id: 'user-no-email', email: undefined }
    mockBootstrapData = {
      profile: {
        full_name: 'No Email User',
        avatar_url: null,
        is_banned: false,
        ban_reason: null,
        tos_accepted_at: '2026-01-01',
        profile_completed_at: '2026-01-01',
      },
      market_config: { schedule: [], productsNeverExpire: false, marketNeverCloses: true },
      badges: null,
    }

    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toEqual({ id: 'user-no-email', email: undefined })
    expect(result.current.isAuthenticated).toBe(true)
  })
})
