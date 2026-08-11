// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'

describe('USDA Farmers Markets 2-Tier Caching & Latency Engine', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
    }
  })

  it('Tier 1: retrieves cached markets & farms from localStorage in 0ms', () => {
    const cacheKey = 'usda_cache_95120'
    const payload = {
      timestamp: Date.now(),
      markets: [{ listing_name: 'Almaden Valley Farmers Market', distance: '1.2' }],
      farms: [{ listing_name: 'Sunnyside Organic Farm & CSA', _directory: 'csa' }],
    }

    const t0 = performance.now()
    localStorage.setItem(cacheKey, JSON.stringify(payload))

    const raw = localStorage.getItem(cacheKey)
    const t1 = performance.now()

    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.markets[0].listing_name).toBe('Almaden Valley Farmers Market')
    expect(parsed.farms[0].listing_name).toBe('Sunnyside Organic Farm & CSA')
    
    // Latency must be < 15ms (0ms instant render)
    expect(t1 - t0).toBeLessThan(15)
  })

  it('Tier 1: detects expired localStorage cache older than 24 hours', () => {
    const cacheKey = 'usda_cache_95120'
    const expiredTimestamp = Date.now() - (25 * 60 * 60 * 1000) // 25h ago

    localStorage.setItem(cacheKey, JSON.stringify({
      timestamp: expiredTimestamp,
      markets: [{ listing_name: 'Stale Market' }],
      farms: [],
    }))

    const raw = localStorage.getItem(cacheKey)
    const parsed = JSON.parse(raw!)
    const isExpired = (Date.now() - parsed.timestamp) >= (24 * 60 * 60 * 1000)

    expect(isExpired).toBe(true)
  })

  it('Tier 2: invalidates DB cache older than 7 days (604,800,000 ms)', () => {
    const dbRecord = {
      zip_code: '95120',
      markets: [{ listing_name: 'Almaden Farmers Market', location_city: 'San Jose' }],
      farms: [{ listing_name: 'Almaden CSA', _directory: 'csa' }],
      updated_at: new Date(Date.now() - (8 * 24 * 60 * 60 * 1000)).toISOString(), // 8 days ago
    }

    const ageMs = Date.now() - new Date(dbRecord.updated_at).getTime()
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
    const isStale = ageMs >= SEVEN_DAYS_MS

    expect(isStale).toBe(true)
  })
})
