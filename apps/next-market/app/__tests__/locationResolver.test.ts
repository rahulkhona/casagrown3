// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { resolveProgressiveLocation, type IpLocationData } from '../../lib/locationResolver'

// Mock geocodeAddress to return deterministic coordinates for testing
vi.mock('../../lib/geocode', () => ({
  STATE_CODES: {
    'georgia': 'GA',
    'california': 'CA',
    'new york': 'NY',
    'texas': 'TX',
  },
  geocodeAddress: async (query: string) => {
    const q = query.toLowerCase().trim()
    if (q === 'ga' || q === 'georgia') {
      return { lat: 32.1656, lng: -82.9001, stateCode: 'GA', zipCode: '', display: 'Georgia, USA' }
    }
    if (q.includes('atlanta')) {
      return { lat: 33.7490, lng: -84.3880, stateCode: 'GA', zipCode: '30303', display: 'Atlanta, Fulton County, Georgia, USA' }
    }
    if (q.includes('95125') || q.includes('san jose')) {
      return { lat: 37.3079, lng: -121.8950, stateCode: 'CA', zipCode: '95125', display: '123 Main St, San Jose, CA 95125' }
    }
    return { lat: 37.7749, lng: -122.4194, stateCode: 'CA', zipCode: '94105', display: 'San Francisco, CA' }
  }
}))

describe('Progressive Location Resolver Test Suite', () => {

  it('Case 1: State-Only search when user IP is in same state -> Uses IP coordinates (25 mi radius)', async () => {
    const userIp: IpLocationData = {
      lat: 33.7550,
      lng: -84.3900,
      zip: '30308',
      city: 'Atlanta',
      state: 'GA',
      source: 'ip'
    }

    const result = await resolveProgressiveLocation('GA', userIp)
    expect(result).not.toBeNull()
    expect(result?.buyerStateCode).toBe('GA')
    expect(result?.lat).toBe(33.7550) // IP latitude used
    expect(result?.lng).toBe(-84.3900) // IP longitude used
    expect(result?.maxMiles).toBe(25) // 25-mile radius for same-state search
  })

  it('Case 2: State-Only search when user IP is in DIFFERENT state -> Uses state center (100 mi radius)', async () => {
    const userIp: IpLocationData = {
      lat: 37.3382,
      lng: -121.8863,
      zip: '95113',
      city: 'San Jose',
      state: 'CA', // Different state
      source: 'ip'
    }

    const result = await resolveProgressiveLocation('GA', userIp)
    expect(result).not.toBeNull()
    expect(result?.buyerStateCode).toBe('GA')
    expect(result?.lat).toBe(32.1656) // GA State center latitude
    expect(result?.lng).toBe(-82.9001) // GA State center longitude
    expect(result?.maxMiles).toBe(100) // 100-mile radius for remote state search
  })

  it('Case 3: City + State search -> Geocodes city center and zip (33.7490, -84.3880)', async () => {
    const userIp: IpLocationData = {
      lat: 33.7550,
      lng: -84.3900,
      zip: '30308',
      city: 'Atlanta',
      state: 'GA',
      source: 'ip'
    }

    const result = await resolveProgressiveLocation('Atlanta, GA', userIp)
    expect(result).not.toBeNull()
    expect(result?.lat).toBe(33.7490) // Geocoded city center latitude
    expect(result?.lng).toBe(-84.3880)
    expect(result?.zipCode).toBe('30303')
  })

  it('Case 4: Remote City + State search when user IP is in DIFFERENT city -> Uses City Center', async () => {
    const userIp: IpLocationData = {
      lat: 37.3382,
      lng: -121.8863,
      zip: '95113',
      city: 'San Jose',
      state: 'CA',
      source: 'ip'
    }

    const result = await resolveProgressiveLocation('Atlanta, GA', userIp)
    expect(result).not.toBeNull()
    expect(result?.lat).toBe(33.7490) // City center latitude
    expect(result?.lng).toBe(-84.3880) // City center longitude
    expect(result?.zipCode).toBe('30303')
  })

  it('Case 5: Full Street + Zip address search -> Uses exact geocoded location (5 mi radius)', async () => {
    const result = await resolveProgressiveLocation('123 Main St, San Jose, CA 95125', null)
    expect(result).not.toBeNull()
    expect(result?.lat).toBe(37.3079)
    expect(result?.lng).toBe(-121.8950)
    expect(result?.zipCode).toBe('95125')
    expect(result?.maxMiles).toBe(5)
  })
})
