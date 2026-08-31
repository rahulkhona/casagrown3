import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Unmock analytics so we test the real implementation (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/analytics')

import { getSessionId, getTransactionId, resetTransactionId, setAnalyticsUser, trackEvent } from '../analytics'

describe('analytics', () => {
  beforeEach(() => {
    // Reset internal state by re-importing would be complex, so we test observable behavior
    vi.clearAllMocks()
  })

  describe('getSessionId', () => {
    it('returns a string', () => {
      expect(typeof getSessionId()).toBe('string')
    })
    it('returns the same ID on subsequent calls', () => {
      const id1 = getSessionId()
      const id2 = getSessionId()
      expect(id1).toBe(id2)
    })
  })

  describe('getTransactionId', () => {
    it('returns a string', () => {
      expect(typeof getTransactionId()).toBe('string')
    })
    it('returns the same ID on subsequent calls within same transaction', () => {
      const id1 = getTransactionId()
      const id2 = getTransactionId()
      expect(id1).toBe(id2)
    })
  })

  describe('resetTransactionId', () => {
    it('generates a new transaction ID after reset', () => {
      const id1 = getTransactionId()
      resetTransactionId()
      const id2 = getTransactionId()
      expect(id1).not.toBe(id2)
    })
  })

  describe('setAnalyticsUser', () => {
    it('accepts a user ID without error', () => {
      expect(() => setAnalyticsUser('user-123')).not.toThrow()
    })
    it('accepts null without error', () => {
      expect(() => setAnalyticsUser(null)).not.toThrow()
    })
  })

  describe('trackEvent', () => {
    it('does not throw when user is not set', async () => {
      setAnalyticsUser(null)
      await expect(trackEvent('page_view', '/test')).resolves.toBeUndefined()
    })
    it('does not throw when user is set', async () => {
      setAnalyticsUser('user-123')
      await expect(trackEvent('button_click', 'test_button', { foo: 'bar' })).resolves.toBeUndefined()
    })
  })

  describe('isPWA', () => {
    it('returns false in default browser (no standalone)', async () => {
      const original = window.matchMedia
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any
      Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true })
      const { isPWA } = await import('../analytics')
      expect(isPWA()).toBe(false)
      window.matchMedia = original
    })

    it('returns true when display-mode: standalone matches', async () => {
      const original = window.matchMedia
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as any
      const { isPWA } = await import('../analytics')
      expect(isPWA()).toBe(true)
      window.matchMedia = original
    })

    it('returns true when navigator.standalone is true (iOS)', async () => {
      const original = window.matchMedia
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any
      Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
      const { isPWA } = await import('../analytics')
      expect(isPWA()).toBe(true)
      Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true })
      window.matchMedia = original
    })
  })

  describe('detectOS', () => {
    function mockUA(ua: string) {
      Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
    }
    const originalUA = navigator.userAgent

    afterEach(() => {
      Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true })
    })

    it('detects iOS from iPhone user agent', async () => {
      mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')
      const { detectOS } = await import('../analytics')
      expect(detectOS()).toBe('iOS')
    })

    it('detects Android', async () => {
      mockUA('Mozilla/5.0 (Linux; Android 13; Pixel 7)')
      const { detectOS } = await import('../analytics')
      expect(detectOS()).toBe('Android')
    })

    it('detects macOS', async () => {
      mockUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      const { detectOS } = await import('../analytics')
      expect(detectOS()).toBe('macOS')
    })

    it('detects Windows', async () => {
      mockUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
      const { detectOS } = await import('../analytics')
      expect(detectOS()).toBe('Windows')
    })

    it('detects Linux', async () => {
      mockUA('Mozilla/5.0 (X11; Linux x86_64)')
      const { detectOS } = await import('../analytics')
      expect(detectOS()).toBe('Linux')
    })

    it('detects ChromeOS', async () => {
      mockUA('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')
      const { detectOS } = await import('../analytics')
      expect(detectOS()).toBe('ChromeOS')
    })

    it('returns Other for unknown user agent', async () => {
      mockUA('SomeBrowser/1.0')
      const { detectOS } = await import('../analytics')
      expect(detectOS()).toBe('Other')
    })
  })
})
