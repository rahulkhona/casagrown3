/**
 * Geocode an address string to lat/lng using Nominatim (OpenStreetMap).
 * Results are cached in localStorage to avoid redundant API calls.
 */

const CACHE_KEY = 'geocode_cache'
const CACHE_MAX = 20 // max cached addresses

interface GeoResult {
  lat: number
  lng: number
  display: string
  stateCode?: string
  zipCode?: string
}

const STATE_CODES: Record<string, string> = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
  'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
  'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
  'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
  'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
  'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
}

function getCache(): Record<string, GeoResult & { ts: number }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch { return {} }
}

function setCache(key: string, result: GeoResult) {
  try {
    const cache = getCache()
    cache[key] = { ...result, ts: Date.now() }
    // Evict oldest if over limit
    const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts)
    const trimmed = Object.fromEntries(entries.slice(0, CACHE_MAX))
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed))
  } catch { /* quota */ }
}

// Custom error type so callers can distinguish rate-limit from not-found
export class GeocodeRateLimitError extends Error {
  constructor() { super('Geocoding service is busy. Please wait a moment and try again.') }
}

async function fetchGeocode(address: string): Promise<any> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(address)}&limit=1&countrycodes=us`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CasaGrown-Market/1.0' },
  })
  if (res.status === 429) throw new GeocodeRateLimitError()
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`)
  return res.json()
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const cacheKey = address.trim().toLowerCase()

  // Check cache first
  if (typeof window !== 'undefined') {
    const cached = getCache()[cacheKey]
    if (cached) return { lat: cached.lat, lng: cached.lng, display: cached.display, stateCode: cached.stateCode, zipCode: cached.zipCode }
  }

  try {
    let data: any
    try {
      data = await fetchGeocode(address)
    } catch (err) {
      if (err instanceof GeocodeRateLimitError) throw err // re-throw so caller can show proper message
      // On network/5xx, wait 1s and retry once
      await new Promise(r => setTimeout(r, 1000))
      data = await fetchGeocode(address)
    }

    if (!data?.[0]?.lat || !data?.[0]?.lon) return null

    const stateName = data[0]?.address?.state || ''
    const stateCode = STATE_CODES[stateName] || stateName // fallback to raw
    const zipCode = data[0]?.address?.postcode || ''

    const result: GeoResult = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display: data[0].display_name || address,
      stateCode: stateCode || undefined,
      zipCode: zipCode || undefined,
    }

    if (typeof window !== 'undefined') {
      setCache(cacheKey, result)
    }

    return result
  } catch (err) {
    if (err instanceof GeocodeRateLimitError) throw err // let caller handle rate-limit explicitly
    console.warn('Geocoding failed:', err)
    return null
  }
}

/**
 * Build a PostGIS POINT string for Supabase updates.
 * Format: SRID=4326;POINT(lng lat)
 */
export function toPostgisPoint(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`
}
