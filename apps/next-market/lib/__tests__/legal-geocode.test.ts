// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unmock so we test the real implementations (setup.ts mocks these for rendering tests)
vi.unmock('../../lib/legal')
vi.unmock('../../lib/geocode')

import { needsTosAcceptance, TOS_EFFECTIVE_DATE } from '../../lib/legal'
import { toPostgisPoint } from '../../lib/geocode'

describe('legal.ts', () => {
  it('needs acceptance when null', () => {
    expect(needsTosAcceptance(null)).toBe(true)
  })

  it('needs acceptance when undefined', () => {
    expect(needsTosAcceptance(undefined)).toBe(true)
  })

  it('needs acceptance when date is before effective date', () => {
    expect(needsTosAcceptance('2020-01-01T00:00:00Z')).toBe(true)
  })

  it('does not need acceptance when date is after effective date', () => {
    const futureDate = new Date(TOS_EFFECTIVE_DATE.getTime() + 86400000).toISOString()
    expect(needsTosAcceptance(futureDate)).toBe(false)
  })

  it('needs acceptance when same exact date (edge case)', () => {
    // Strictly less than, so same date does NOT need re-acceptance
    expect(needsTosAcceptance(TOS_EFFECTIVE_DATE.toISOString())).toBe(false)
  })
})

describe('geocode.ts - toPostgisPoint', () => {
  it('formats point correctly', () => {
    expect(toPostgisPoint(37.3690, -121.8900)).toBe('SRID=4326;POINT(-121.89 37.369)')
  })

  it('handles zero coordinates', () => {
    expect(toPostgisPoint(0, 0)).toBe('SRID=4326;POINT(0 0)')
  })

  it('handles negative coordinates', () => {
    const result = toPostgisPoint(-33.8688, 151.2093)
    expect(result).toBe('SRID=4326;POINT(151.2093 -33.8688)')
  })
})

describe('geocode.ts - geocodeAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock localStorage
    const store: Record<string, string> = {}
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => store[key] ?? null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => { store[key] = val })
  })

  it('returns null for failed fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
    const { geocodeAddress } = await import('../../lib/geocode')
    const result = await geocodeAddress('invalid address')
    expect(result).toBeNull()
  })

  it('returns null for empty response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () => Promise.resolve([]),
    } as Response)
    const { geocodeAddress } = await import('../../lib/geocode')
    const result = await geocodeAddress('nowhere')
    expect(result).toBeNull()
  })

  it('returns coords from successful geocode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () => Promise.resolve([{
        lat: '37.3690',
        lon: '-121.8900',
        display_name: '123 Main St, San Jose, CA',
        address: { state: 'California' },
      }]),
    } as Response)
    const { geocodeAddress } = await import('../../lib/geocode')
    const result = await geocodeAddress('123 Main St San Jose')
    expect(result).toBeTruthy()
    expect(result!.lat).toBeCloseTo(37.369)
    expect(result!.lng).toBeCloseTo(-121.89)
    expect(result!.stateCode).toBe('CA')
  })
})
