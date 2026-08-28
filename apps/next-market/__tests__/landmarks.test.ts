// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isPublicLandmark, fetchNearbyLandmarks, getMockLandmarks, getSuggestedInstructionsForCategory } from '../lib/landmarks'
import { anonymizeAddress } from '../lib/windowDisplay'

describe('Landmarks & Address Privacy', () => {
  describe('isPublicLandmark', () => {
    it('recognizes parks as public landmarks', () => {
      expect(isPublicLandmark('Bramhall Park, 1320 Willow St, San Jose, CA')).toBe(true)
      expect(isPublicLandmark('Lincoln Glen Park')).toBe(true)
    })

    it('recognizes libraries as public landmarks', () => {
      expect(isPublicLandmark('Willow Glen Branch Library, 1157 Minnesota Ave, San Jose, CA')).toBe(true)
    })

    it('recognizes community centers as public landmarks', () => {
      expect(isPublicLandmark('Willow Glen Community Center, 2175 Lincoln Ave, San Jose, CA')).toBe(true)
      expect(isPublicLandmark('Camden Community Centre')).toBe(true)
    })

    it('recognizes schools and colleges as public landmarks', () => {
      expect(isPublicLandmark('River Glen Elementary School, 1088 Broadway Ave')).toBe(true)
      expect(isPublicLandmark('San Jose State University')).toBe(true)
    })

    it('recognizes post offices as public landmarks', () => {
      expect(isPublicLandmark('Willow Glen Post Office, 1205 Lincoln Ave')).toBe(true)
    })

    it('returns false for private residential addresses', () => {
      expect(isPublicLandmark('1234 Oak Ave, San Jose, CA 95125')).toBe(false)
      expect(isPublicLandmark('555 Blossom Hill Rd, Los Gatos, CA')).toBe(false)
      expect(isPublicLandmark('')).toBe(false)
      expect(isPublicLandmark(null)).toBe(false)
      expect(isPublicLandmark(undefined)).toBe(false)
    })
  })

  describe('anonymizeAddress with Landmarks', () => {
    it('preserves full landmark name and address without stripping numbers', () => {
      const landmark = 'Willow Glen Community Center, 2175 Lincoln Ave, San Jose, CA 95125'
      expect(anonymizeAddress(landmark)).toBe(landmark)

      const park = 'Bramhall Park, 1320 Willow St, San Jose, CA 95125'
      expect(anonymizeAddress(park)).toBe(park)

      const library = 'Willow Glen Branch Library, 1157 Minnesota Ave, San Jose, CA 95125'
      expect(anonymizeAddress(library)).toBe(library)
    })

    it('strips house numbers for private residential addresses', () => {
      expect(anonymizeAddress('1234 Oak Ave, San Jose, CA 95125')).toBe('Near Oak Ave, San Jose, CA 95125')
      expect(anonymizeAddress('42 Main Street, San Jose, CA')).toBe('Near Main Street, San Jose, CA')
    })

    it('handles empty or null addresses cleanly', () => {
      expect(anonymizeAddress('')).toBeNull()
      expect(anonymizeAddress(null)).toBeNull()
      expect(anonymizeAddress(undefined)).toBeNull()
    })
  })

  describe('fetchNearbyLandmarks & getMockLandmarks', () => {
    it('returns structured mock landmarks for San Jose coordinates', async () => {
      const landmarks = await fetchNearbyLandmarks(37.3039, -121.8988)
      expect(landmarks.length).toBeGreaterThan(0)

      const first = landmarks[0]
      expect(first).toHaveProperty('id')
      expect(first).toHaveProperty('name')
      expect(first).toHaveProperty('address')
      expect(first).toHaveProperty('category')
      expect(first).toHaveProperty('lat')
      expect(first).toHaveProperty('lng')
      expect(first).toHaveProperty('distanceMiles')
      expect(first).toHaveProperty('addressFields')
      expect(first.addressFields.street).toBeTruthy()
    })

    it('returns empty array when coordinates are invalid', async () => {
      const landmarks = await fetchNearbyLandmarks(NaN as any, NaN as any)
      expect(landmarks).toEqual([])
    })

    it('recognizes coffee shops and cafes as public landmarks', () => {
      expect(isPublicLandmark('Philz Coffee, 1180 Lincoln Ave, San Jose, CA')).toBe(true)
      expect(isPublicLandmark('Starbucks Coffee, 1375 Lincoln Ave')).toBe(true)
      expect(isPublicLandmark("Peet's Coffee")).toBe(true)
      expect(isPublicLandmark('Main Street Cafe & Bakery')).toBe(true)
    })

    it('returns generic mock landmarks when outside San Jose', () => {
      const landmarks = getMockLandmarks(34.0522, -118.2437) // Los Angeles
      expect(landmarks.length).toBeGreaterThan(0)
      expect(landmarks.some(l => l.category === 'cafe')).toBe(true)
    })
  })

  describe('getSuggestedInstructionsForCategory', () => {
    it('returns cafe instructions for coffee shops', () => {
      const { placeholder } = getSuggestedInstructionsForCategory('cafe', 'Starbucks')
      expect(placeholder).toContain('patio')
    })

    it('returns park instructions for parks', () => {
      const { placeholder } = getSuggestedInstructionsForCategory('park', 'Bramhall Park')
      expect(placeholder).toContain('picnic tables')
    })

    it('returns library instructions for libraries', () => {
      const { placeholder } = getSuggestedInstructionsForCategory('library', 'Willow Glen Library')
      expect(placeholder).toContain('lobby')
    })
  })
})
