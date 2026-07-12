import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unmock crm-analytics so we test its real implementation
vi.unmock('../crm-analytics')

import { resetSessionId } from '../crm-analytics'

describe('crm-analytics', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear()
    }
  })

  describe('resetSessionId', () => {
    it('generates a fresh session ID in sessionStorage', () => {
      const id1 = resetSessionId('/create-listing')
      expect(typeof id1).toBe('string')
      expect(id1.length).toBeGreaterThan(0)

      const id2 = resetSessionId('/create-listing')
      expect(id1).not.toBe(id2)
    })
  })
})
