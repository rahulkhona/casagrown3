/**
 * Progressive Location Fallback Resolver for CasaGrown Marketplace.
 * Handles IP Geolocation, City+State, State-Only, and Reverse Zip lookups.
 */

import { geocodeAddress, STATE_CODES } from './geocode'

export interface IpLocationData {
  lat: number | null
  lng: number | null
  zip: string
  city: string
  state: string
  source: string
}

export interface ResolvedLocation {
  lat: number
  lng: number
  zipCode: string
  buyerStateCode: string | null
  maxMiles: number
  isIpFallback: boolean
  displayLabel: string
}

/**
 * Reverse-geocode (lat, lng) to extract postcode if missing from forward search.
 */
export async function reverseGeocodeZip(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CasaGrown-Market/1.0' },
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.address?.postcode) {
        return data.address.postcode.split('-')[0]
      }
    }
  } catch {
    /* ignore reverse lookup errors */
  }
  return ''
}

/**
 * Normalizes input state code or full state name to 2-letter uppercase abbreviation (e.g. "Georgia" -> "GA").
 */
function normalizeState(input: string): string {
  if (!input) return ''
  const trimmed = input.trim()
  if (trimmed.length === 2) return trimmed.toUpperCase()
  // Check STATE_CODES mapping from full name
  const match = Object.entries(STATE_CODES).find(
    ([fullName]) => fullName.toLowerCase() === trimmed.toLowerCase()
  )
  return match ? match[1] : trimmed.substring(0, 2).toUpperCase()
}

/**
 * Evaluates progressive location fallback rules based on user input and IP location.
 */
export async function resolveProgressiveLocation(
  addressInput: string,
  userIp: IpLocationData | null
): Promise<ResolvedLocation | null> {
  const query = addressInput.trim()

  if (!query) {
    // Level 4: Guest Default Initial Load -> IP Geolocation (5 miles)
    if (userIp && userIp.lat && userIp.lng) {
      return {
        lat: userIp.lat,
        lng: userIp.lng,
        zipCode: userIp.zip || '',
        buyerStateCode: normalizeState(userIp.state) || null,
        maxMiles: 5,
        isIpFallback: true,
        displayLabel: [userIp.city, userIp.state, userIp.zip].filter(Boolean).join(', ') || 'Your Location',
      }
    }
    return null
  }

  // Forward geocode the input string
  const geo = await geocodeAddress(query)
  if (!geo) return null

  const searchState = geo.stateCode ? normalizeState(geo.stateCode) : ''
  const userIpState = userIp?.state ? normalizeState(userIp.state) : ''
  const userIpCity = (userIp?.city || '').toLowerCase()
  const displayLower = geo.display.toLowerCase()

  // ── Check if query is State Only (e.g. "Georgia", "GA") ──
  const isStateOnly = Object.keys(STATE_CODES).some(
    name => name.toLowerCase() === query.toLowerCase() || STATE_CODES[name].toLowerCase() === query.toLowerCase()
  )

  if (isStateOnly && searchState) {
    if (userIp && userIp.lat && userIp.lng && userIpState === searchState) {
      // User is physically in that state -> Use their IP/GPS location with 25-mile radius
      return {
        lat: userIp.lat,
        lng: userIp.lng,
        zipCode: userIp.zip || '',
        buyerStateCode: searchState,
        maxMiles: 25,
        isIpFallback: false,
        displayLabel: `${searchState} (Your Area)`,
      }
    } else {
      // User is remote -> Use state center with 100-mile radius
      return {
        lat: geo.lat,
        lng: geo.lng,
        zipCode: '',
        buyerStateCode: searchState,
        maxMiles: 100,
        isIpFallback: false,
        displayLabel: searchState,
      }
    }
  }

  // ── Check if query is City + State without street address ──
  const isCityStateQuery = !/\b\d+\b/.test(query) && !geo.zipCode

  if (isCityStateQuery) {
    if (userIp && userIp.lat && userIp.lng && userIpCity && userIpState === searchState && displayLower.includes(userIpCity)) {
      // User is physically in that city -> Use IP lat/lng & zip with 5-mile radius
      return {
        lat: userIp.lat,
        lng: userIp.lng,
        zipCode: userIp.zip || '',
        buyerStateCode: searchState || null,
        maxMiles: 5,
        isIpFallback: false,
        displayLabel: `${userIp.city}, ${searchState}`,
      }
    } else {
      // Remote city search -> Geocode city center, reverse-geocode ZIP if missing, 15-mile radius
      const resolvedZip = geo.zipCode || (await reverseGeocodeZip(geo.lat, geo.lng))
      return {
        lat: geo.lat,
        lng: geo.lng,
        zipCode: resolvedZip,
        buyerStateCode: searchState || null,
        maxMiles: 15,
        isIpFallback: false,
        displayLabel: geo.display.split(',').slice(0, 2).join(', '),
      }
    }
  }

  // ── Full Street Address or Specific ZIP Code Search ──
  const finalZip = geo.zipCode || (await reverseGeocodeZip(geo.lat, geo.lng))
  return {
    lat: geo.lat,
    lng: geo.lng,
    zipCode: finalZip,
    buyerStateCode: searchState || null,
    maxMiles: 5,
    isIpFallback: false,
    displayLabel: geo.display.split(',').slice(0, 2).join(', '),
  }
}
