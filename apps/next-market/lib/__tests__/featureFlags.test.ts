import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('featureFlags', () => {
  const originalEnv = process.env
  const originalWindow = typeof window !== 'undefined' ? window : undefined

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    if (originalWindow) {
      global.window = originalWindow
    }
  })

  it('should enable social login if environment variable is true', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN = 'true'
    const { ENABLE_SOCIAL_LOGIN } = await import('../featureFlags')
    expect(ENABLE_SOCIAL_LOGIN).toBe(true)
  })

  it('should disable social login if environment variable is not true and localStorage is empty', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN = 'false'
    // Mock window and localStorage
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    }
    global.window = {
      localStorage: mockLocalStorage,
    } as any

    const { ENABLE_SOCIAL_LOGIN } = await import('../featureFlags')
    expect(ENABLE_SOCIAL_LOGIN).toBe(false)
  })

  it('should enable social login if localStorage has enable_social_login set to true', async () => {
    process.env.NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN = 'false'
    const mockLocalStorage = {
      getItem: vi.fn().mockReturnValue('true'),
      setItem: vi.fn(),
    }
    global.window = {
      localStorage: mockLocalStorage,
    } as any

    const { ENABLE_SOCIAL_LOGIN } = await import('../featureFlags')
    expect(ENABLE_SOCIAL_LOGIN).toBe(true)
  })
})
