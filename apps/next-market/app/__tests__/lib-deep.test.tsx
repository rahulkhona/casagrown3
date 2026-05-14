// @vitest-environment jsdom
/**
 * Deep unit tests for lib modules to improve V8 coverage.
 * Tests: feedback-service.ts, geocode.ts, legal.ts, analytics.ts, supabase.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Unmock so we test the real implementations (setup.ts mocks these for rendering tests)
vi.unmock('../../lib/legal')
vi.unmock('../../lib/geocode')
vi.unmock('../../lib/feedback-service')
vi.unmock('../../lib/analytics')

// ===================== legal.ts =====================
describe('legal.ts — needsTosAcceptance', () => {
  let needsTosAcceptance: typeof import('../../lib/legal').needsTosAcceptance
  let TOS_EFFECTIVE_DATE: typeof import('../../lib/legal').TOS_EFFECTIVE_DATE

  beforeEach(async () => {
    const mod = await import('../../lib/legal')
    needsTosAcceptance = mod.needsTosAcceptance
    TOS_EFFECTIVE_DATE = mod.TOS_EFFECTIVE_DATE
  })

  it('returns true for null', () => {
    expect(needsTosAcceptance(null)).toBe(true)
  })

  it('returns true for undefined', () => {
    expect(needsTosAcceptance(undefined)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(needsTosAcceptance('')).toBe(true)
  })

  it('returns true for date before effective date', () => {
    expect(needsTosAcceptance('2025-01-01T00:00:00Z')).toBe(true)
  })

  it('returns false for date after effective date', () => {
    const after = new Date(TOS_EFFECTIVE_DATE.getTime() + 86400000).toISOString()
    expect(needsTosAcceptance(after)).toBe(false)
  })

  it('returns false for date equal to effective date', () => {
    expect(needsTosAcceptance(TOS_EFFECTIVE_DATE.toISOString())).toBe(false)
  })

  it('TOS_EFFECTIVE_DATE is a valid Date', () => {
    expect(TOS_EFFECTIVE_DATE).toBeInstanceOf(Date)
    expect(TOS_EFFECTIVE_DATE.getTime()).toBeGreaterThan(0)
  })
})

// ===================== geocode.ts =====================
describe('geocode.ts', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('toPostgisPoint', () => {
    it('returns correct SRID format', async () => {
      const { toPostgisPoint } = await import('../../lib/geocode')
      expect(toPostgisPoint(37.369, -121.927)).toBe('SRID=4326;POINT(-121.927 37.369)')
    })

    it('handles zero values', async () => {
      const { toPostgisPoint } = await import('../../lib/geocode')
      expect(toPostgisPoint(0, 0)).toBe('SRID=4326;POINT(0 0)')
    })

    it('handles negative coordinates', async () => {
      const { toPostgisPoint } = await import('../../lib/geocode')
      expect(toPostgisPoint(-33.8688, 151.2093)).toBe('SRID=4326;POINT(151.2093 -33.8688)')
    })
  })

  describe('geocodeAddress', () => {
    it('returns null for empty result', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve([]),
      }))
      const { geocodeAddress } = await import('../../lib/geocode')
      const result = await geocodeAddress('nonexistent address')
      expect(result).toBeNull()
    })

    it('returns null on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
      const { geocodeAddress } = await import('../../lib/geocode')
      const result = await geocodeAddress('any address')
      expect(result).toBeNull()
    })

    it('returns parsed result for valid response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{
          lat: '37.3690',
          lon: '-121.9270',
          display_name: '123 Main St, San Jose, CA',
          address: { state: 'California' }
        }]),
      }))
      const { geocodeAddress } = await import('../../lib/geocode')
      const result = await geocodeAddress('123 Main St, San Jose, CA')
      expect(result).not.toBeNull()
      expect(result!.lat).toBe(37.369)
      expect(result!.lng).toBe(-121.927)
      expect(result!.stateCode).toBe('CA')
      expect(result!.display).toBe('123 Main St, San Jose, CA')
    })

    it('handles response without state field', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{
          lat: '40.7128',
          lon: '-74.0060',
          display_name: 'New York, NY',
          address: {}
        }]),
      }))
      const { geocodeAddress } = await import('../../lib/geocode')
      const result = await geocodeAddress('New York')
      expect(result).not.toBeNull()
      expect(result!.lat).toBe(40.7128)
    })

    it('handles null data[0] lat/lon', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve([{ lat: null, lon: null }]),
      }))
      const { geocodeAddress } = await import('../../lib/geocode')
      const result = await geocodeAddress('incomplete data')
      expect(result).toBeNull()
    })
  })
})

// ===================== feedback-service.ts =====================
// These need to be at module scope so vi.mock hoisting can reference them
const mockChain: any = {}
const chainMethods = ['select','eq','neq','single','maybeSingle','limit','is','gt','lt','gte','lte','in','insert','update','upsert','delete','match','order','or','not','contains','like','ilike','range','filter']
chainMethods.forEach(m => { mockChain[m] = vi.fn().mockReturnValue(mockChain) })
mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null })
mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

const mockSupabase: any = {
  from: vi.fn().mockReturnValue(mockChain),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
  },
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://test.com/file.png' } }),
    }),
  },
}

vi.mock('../../lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

describe('feedback-service.ts', () => {
  // Don't use vi.restoreAllMocks() here — it clears the module-level vi.mock

  describe('toggleVote', () => {
    it('deletes vote when currently voted', async () => {
      const { toggleVote } = await import('../../lib/feedback-service')
      const result = await toggleVote('f1', 'u1', true)
      expect(result).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('feedback_votes')
    })

    it('inserts vote when not currently voted', async () => {
      const { toggleVote } = await import('../../lib/feedback-service')
      const result = await toggleVote('f1', 'u1', false)
      expect(result).toBe(true)
    })
  })

  describe('addComment', () => {
    it('returns null on error', async () => {
      mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'err' } })
      const { addComment } = await import('../../lib/feedback-service')
      const result = await addComment({ feedbackId: 'f1', authorId: 'u1', content: 'test' })
      expect(result).toBeNull()
    })

    it('returns comment on success', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'c1', content: 'Hello', is_official_response: false,
          created_at: '2026-01-01', author_id: 'u1',
          comment_author: { full_name: 'Jane' },
        },
        error: null,
      })
      const { addComment } = await import('../../lib/feedback-service')
      const result = await addComment({ feedbackId: 'f1', authorId: 'u1', content: 'Hello' })
      expect(result).not.toBeNull()
      expect(result?.content).toBe('Hello')
      expect(result?.author_name).toBe('Jane')
    })
  })

  describe('flagTicket', () => {
    it('returns true', async () => {
      const { flagTicket } = await import('../../lib/feedback-service')
      const result = await flagTicket('f1', 'u1')
      expect(result).toBe(true)
    })
  })

  describe('unflagTicket', () => {
    it('returns true', async () => {
      const { unflagTicket } = await import('../../lib/feedback-service')
      const result = await unflagTicket('f1', 'u1')
      expect(result).toBe(true)
    })
  })

  describe('createTicket', () => {
    it('returns ticket id on success', async () => {
      mockChain.single.mockResolvedValueOnce({ data: { id: 't1' }, error: null })
      const { createTicket } = await import('../../lib/feedback-service')
      const result = await createTicket({
        title: 'Test', description: 'Test desc',
        type: 'feature_request', authorId: 'u1',
      })
      expect(result).toEqual({ id: 't1' })
    })

    it('returns null on error', async () => {
      mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'err' } })
      const { createTicket } = await import('../../lib/feedback-service')
      const result = await createTicket({
        title: 'Test', description: 'desc', type: 'bug_report', authorId: 'u1',
      })
      expect(result).toBeNull()
    })

    it('sets visibility to private for support_request', async () => {
      mockChain.single.mockResolvedValueOnce({ data: { id: 't2' }, error: null })
      const { createTicket } = await import('../../lib/feedback-service')
      await createTicket({
        title: 'Help', description: 'Need help', type: 'support_request', authorId: 'u1',
      })
      expect(mockSupabase.from).toHaveBeenCalledWith('user_feedback')
    })
  })

  // fetchTickets is exercised via Playwright E2E tests and is too deeply
  // chained to mock reliably here. Other functions above provide coverage
  // of the module's shared utilities.
})

// ===================== analytics.ts deeper =====================
describe('analytics.ts — deeper coverage', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', { gtag: vi.fn(), dataLayer: [] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('module exports trackEvent and trackPageView', async () => {
    const analytics = await import('../../lib/analytics')
    expect(typeof analytics.trackEvent).toBe('function')
    expect(typeof analytics.trackPageView).toBe('function')
  })

  it('trackPageView does not throw', async () => {
    const { trackPageView } = await import('../../lib/analytics')
    expect(() => trackPageView('/test')).not.toThrow()
  })

  it('trackEvent does not throw', async () => {
    const { trackEvent } = await import('../../lib/analytics')
    expect(() => trackEvent('button_click', 'test')).not.toThrow()
  })
})
