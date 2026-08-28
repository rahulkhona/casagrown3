/**
 * Landmark discovery utility for finding safe, nearby public meeting spots
 * (parks, libraries, community centers, coffee shops, post offices, schools, etc.)
 */

export interface LandmarkItem {
  id: string
  name: string
  address: string
  category: 'park' | 'library' | 'community_center' | 'school' | 'post_office' | 'cafe' | 'civic'
  categoryLabel: string
  icon: string
  lat: number
  lng: number
  distanceMiles: number
  addressFields: {
    street: string
    city: string
    state: string
    zip: string
  }
}

const CACHE_KEY_PREFIX = 'casagrown_landmarks_'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export const KNOWN_LANDMARK_KEYWORDS = [
  'park', 'library', 'community center', 'community centre', 'post office',
  'elementary', 'high school', 'middle school', 'school', 'college', 'university',
  'city hall', 'town hall', 'plaza', 'recreation', 'rec center', 'station', 'transit center',
  'coffee', 'cafe', 'starbucks', "peet's", 'bakery'
]

/**
 * Checks if an address or location name represents a known public landmark or coffee shop
 */
export function isPublicLandmark(address: string | null | undefined): boolean {
  if (!address) return false
  const lower = address.toLowerCase()
  return KNOWN_LANDMARK_KEYWORDS.some(kw => lower.includes(kw))
}

/**
 * Returns dynamic, context-aware pickup instruction placeholders & examples
 * based on the location category or landmark name.
 */
export function getSuggestedInstructionsForCategory(category?: string, name?: string): { placeholder: string; example: string } {
  const n = name?.toLowerCase() || ''
  if (category === 'cafe' || n.includes('coffee') || n.includes('starbucks') || n.includes('cafe')) {
    return {
      placeholder: "e.g. Meet by the outdoor patio tables. I'll have a tote bag with fresh lemons.",
      example: 'Meet by the outdoor patio seating. Text me when you arrive.'
    }
  }
  if (category === 'park' || n.includes('park')) {
    return {
      placeholder: 'e.g. Meet by the picnic tables near the playground / west parking lot.',
      example: 'Meet near the main playground benches. I will be in a green jacket.'
    }
  }
  if (category === 'library' || n.includes('library')) {
    return {
      placeholder: 'e.g. Meet near the main entrance lobby benches.',
      example: 'Meet by the outdoor front steps of the library.'
    }
  }
  if (category === 'community_center' || n.includes('community')) {
    return {
      placeholder: 'e.g. Meet in the front lobby or near the community board.',
      example: 'Meet near the main front entrance parking area.'
    }
  }
  if (category === 'school' || n.includes('school')) {
    return {
      placeholder: 'e.g. Meet by the visitor parking loop near the front office.',
      example: 'Meet by the front drop-off curb near the flag pole.'
    }
  }
  if (category === 'post_office' || n.includes('post')) {
    return {
      placeholder: 'e.g. Meet by the front entrance steps / customer parking.',
      example: 'Meet right outside the front doors.'
    }
  }
  return {
    placeholder: 'e.g. Meet by the main entrance. Look for me with a green produce tote.',
    example: 'Meet at the main entrance benches.'
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function getCategoryInfo(tags: Record<string, string>): { category: LandmarkItem['category']; label: string; icon: string } {
  if (tags.amenity === 'cafe' || tags.shop === 'coffee' || tags.cuisine?.includes('coffee')) {
    return { category: 'cafe', label: 'Coffee Shop', icon: '☕' }
  }
  if (tags.leisure === 'park' || tags.leisure === 'recreation_ground') {
    return { category: 'park', label: 'Park', icon: '🌳' }
  }
  if (tags.amenity === 'library') {
    return { category: 'library', label: 'Library', icon: '📚' }
  }
  if (tags.amenity === 'community_centre') {
    return { category: 'community_center', label: 'Community Center', icon: '🏛️' }
  }
  if (tags.amenity === 'post_office') {
    return { category: 'post_office', label: 'Post Office', icon: '📮' }
  }
  if (tags.amenity === 'school' || tags.amenity === 'college' || tags.amenity === 'university') {
    return { category: 'school', label: 'School', icon: '🏫' }
  }
  return { category: 'civic', label: 'Public Place', icon: '📍' }
}

/**
 * Deterministic mock landmarks for localhost & test environments
 */
export function getMockLandmarks(lat: number, lng: number): LandmarkItem[] {
  const isSanJose = Math.abs(lat - 37.3) < 0.2
  if (isSanJose) {
    return [
      {
        id: 'mock_cafe_1',
        name: 'Philz Coffee',
        address: '1180 Lincoln Ave, San Jose, CA 95125',
        category: 'cafe',
        categoryLabel: 'Coffee Shop',
        icon: '☕',
        lat: 37.3072,
        lng: -121.8970,
        distanceMiles: 0.2,
        addressFields: { street: 'Philz Coffee, 1180 Lincoln Ave', city: 'San Jose', state: 'CA', zip: '95125' }
      },
      {
        id: 'mock_park_1',
        name: 'Bramhall Park',
        address: '1320 Willow St, San Jose, CA 95125',
        category: 'park',
        categoryLabel: 'Park',
        icon: '🌳',
        lat: 37.3061,
        lng: -121.9022,
        distanceMiles: 0.3,
        addressFields: { street: 'Bramhall Park, 1320 Willow St', city: 'San Jose', state: 'CA', zip: '95125' }
      },
      {
        id: 'mock_comm_1',
        name: 'Willow Glen Community Center',
        address: '2175 Lincoln Ave, San Jose, CA 95125',
        category: 'community_center',
        categoryLabel: 'Community Center',
        icon: '🏛️',
        lat: 37.3039,
        lng: -121.8988,
        distanceMiles: 0.4,
        addressFields: { street: 'Willow Glen Community Center, 2175 Lincoln Ave', city: 'San Jose', state: 'CA', zip: '95125' }
      },
      {
        id: 'mock_cafe_2',
        name: 'Starbucks Coffee',
        address: '1375 Lincoln Ave, San Jose, CA 95125',
        category: 'cafe',
        categoryLabel: 'Coffee Shop',
        icon: '☕',
        lat: 37.3050,
        lng: -121.8975,
        distanceMiles: 0.4,
        addressFields: { street: 'Starbucks, 1375 Lincoln Ave', city: 'San Jose', state: 'CA', zip: '95125' }
      },
      {
        id: 'mock_lib_1',
        name: 'Willow Glen Branch Library',
        address: '1157 Minnesota Ave, San Jose, CA 95125',
        category: 'library',
        categoryLabel: 'Library',
        icon: '📚',
        lat: 37.3115,
        lng: -121.8973,
        distanceMiles: 0.5,
        addressFields: { street: 'Willow Glen Branch Library, 1157 Minnesota Ave', city: 'San Jose', state: 'CA', zip: '95125' }
      },
      {
        id: 'mock_post_1',
        name: 'Willow Glen Post Office',
        address: '1205 Lincoln Ave, San Jose, CA 95125',
        category: 'post_office',
        categoryLabel: 'Post Office',
        icon: '📮',
        lat: 37.3087,
        lng: -121.8965,
        distanceMiles: 0.6,
        addressFields: { street: 'Willow Glen Post Office, 1205 Lincoln Ave', city: 'San Jose', state: 'CA', zip: '95125' }
      },
      {
        id: 'mock_school_1',
        name: 'River Glen School Park',
        address: '1088 Broadway Ave, San Jose, CA 95125',
        category: 'school',
        categoryLabel: 'School',
        icon: '🏫',
        lat: 37.3150,
        lng: -121.8920,
        distanceMiles: 0.8,
        addressFields: { street: 'River Glen School, 1088 Broadway Ave', city: 'San Jose', state: 'CA', zip: '95125' }
      }
    ]
  }

  // Generic fallback landmarks around requested coordinates
  return [
    {
      id: 'mock_cafe_gen',
      name: 'Main Street Cafe',
      address: '50 Main St, San Jose, CA 95113',
      category: 'cafe',
      categoryLabel: 'Coffee Shop',
      icon: '☕',
      lat: lat + 0.002,
      lng: lng + 0.002,
      distanceMiles: 0.2,
      addressFields: { street: 'Main Street Cafe, 50 Main St', city: 'San Jose', state: 'CA', zip: '95113' }
    },
    {
      id: 'mock_park_gen',
      name: 'Community Memorial Park',
      address: '100 Park Ave, San Jose, CA 95113',
      category: 'park',
      categoryLabel: 'Park',
      icon: '🌳',
      lat: lat + 0.003,
      lng: lng + 0.003,
      distanceMiles: 0.3,
      addressFields: { street: 'Community Memorial Park, 100 Park Ave', city: 'San Jose', state: 'CA', zip: '95113' }
    },
    {
      id: 'mock_lib_gen',
      name: 'Public Library & Civic Center',
      address: '200 Main St, San Jose, CA 95113',
      category: 'library',
      categoryLabel: 'Library',
      icon: '📚',
      lat: lat + 0.005,
      lng: lng - 0.004,
      distanceMiles: 0.5,
      addressFields: { street: 'Public Library, 200 Main St', city: 'San Jose', state: 'CA', zip: '95113' }
    }
  ]
}

/**
 * Fetch nearby public landmarks via OpenStreetMap Overpass API directly from browser
 */
export async function fetchNearbyLandmarks(lat: number, lng: number, radiusMeters = 3000): Promise<LandmarkItem[]> {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return []

  const roundedLat = Math.round(lat * 100) / 100
  const roundedLng = Math.round(lng * 100) / 100
  const cacheKey = `${CACHE_KEY_PREFIX}${roundedLat}_${roundedLng}_${radiusMeters}`

  // Check localStorage cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { timestamp, data } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL_MS && Array.isArray(data) && data.length > 0) {
          return data
        }
      }
    } catch {}
  }

  // Localhost / Test mock fallback to guarantee speed and prevent external rate-limiting
  const isUnitTesting = typeof process !== 'undefined' && (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test')
  const isLocalOrTest = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' || 
       (window as any).isTestEnv ||
       (window as any).IS_NATIVE_APP)

  if (isLocalOrTest || isUnitTesting) {
    return getMockLandmarks(lat, lng)
  }

  const overpassQuery = `
    [out:json][timeout:8];
    (
      node["leisure"="park"](around:${radiusMeters}, ${lat}, ${lng});
      way["leisure"="park"](around:${radiusMeters}, ${lat}, ${lng});
      node["amenity"~"library|community_centre|school|post_office|townhall|cafe"](around:${radiusMeters}, ${lat}, ${lng});
      way["amenity"~"library|community_centre|school|post_office|townhall|cafe"](around:${radiusMeters}, ${lat}, ${lng});
      node["shop"="coffee"](around:${radiusMeters}, ${lat}, ${lng});
    );
    out center 25;
  `

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CasaGrown-Market/1.0',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) {
      console.warn('Overpass API returned non-200:', res.status)
      return getMockLandmarks(lat, lng)
    }

    const data = await res.json()
    const elements: any[] = data.elements || []

    const items: LandmarkItem[] = []
    const seenNames = new Set<string>()

    for (const el of elements) {
      const tags = el.tags || {}
      const name = tags.name || tags['name:en']
      if (!name || seenNames.has(name.toLowerCase())) continue
      seenNames.add(name.toLowerCase())

      const elLat = el.lat || el.center?.lat
      const elLng = el.lon || el.center?.lon
      if (!elLat || !elLng) continue

      const distM = haversineMeters(lat, lng, elLat, elLng)
      const distMiles = Math.round((distM / 1609.34) * 10) / 10

      const houseNum = tags['addr:housenumber'] || ''
      const streetName = tags['addr:street'] || ''
      const city = tags['addr:city'] || ''
      const state = tags['addr:state'] || 'CA'
      const zip = tags['addr:postcode'] || ''

      const streetLine = [houseNum, streetName].filter(Boolean).join(' ')
      const fullAddr = [name, streetLine, city, state, zip].filter(Boolean).join(', ')

      const catInfo = getCategoryInfo(tags)

      items.push({
        id: `osm_${el.type}_${el.id}`,
        name,
        address: fullAddr,
        category: catInfo.category,
        categoryLabel: catInfo.label,
        icon: catInfo.icon,
        lat: elLat,
        lng: elLng,
        distanceMiles: distMiles,
        addressFields: {
          street: `${name}${streetLine ? `, ${streetLine}` : ''}`,
          city,
          state,
          zip,
        }
      })
    }

    items.sort((a, b) => a.distanceMiles - b.distanceMiles)
    const finalItems = items.slice(0, 20)

    if (finalItems.length > 0 && typeof window !== 'undefined') {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: finalItems }))
      } catch {}
    }

    return finalItems.length > 0 ? finalItems : getMockLandmarks(lat, lng)
  } catch (err) {
    console.warn('Failed to fetch landmarks from Overpass:', err)
    return getMockLandmarks(lat, lng)
  }
}
