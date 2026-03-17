import { describe, it, expect, vi, beforeEach } from 'vitest'

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
})
