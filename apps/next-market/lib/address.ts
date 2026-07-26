export interface AddressFields {
  street: string   // "1168 Lincoln Ave"
  city: string     // "San Jose"
  state: string    // "CA"
  zip: string      // "95125"
}

/** Empty address object */
export const EMPTY_ADDRESS: AddressFields = { street: '', city: '', state: '', zip: '' }

/**
 * Full address — for seller, helpers, buyer with confirmed order
 * → "1168 Lincoln Ave, San Jose, CA 95125"
 */
export function formatFullAddress(a: AddressFields): string {
  const parts = [a.street, a.city, `${a.state} ${a.zip}`.trim()].filter(Boolean)
  return parts.join(', ')
}

/**
 * Public/market address — strip house number, no zip
 * → "Lincoln Ave, San Jose, CA"
 */
export function formatPublicAddress(a: AddressFields): string {
  const street = stripHouseNumber(a.street)
  const parts = [street, a.city, a.state].filter(Boolean)
  return parts.join(', ')
}

/**
 * Short address — city + state for cards/badges
 * → "San Jose, CA"
 */
export function formatShortAddress(a: AddressFields): string {
  return [a.city, a.state].filter(Boolean).join(', ')
}

/**
 * Check if address has at minimum a street
 */
export function isAddressComplete(a: AddressFields): boolean {
  return !!(a.street?.trim() && a.city?.trim() && a.state?.trim() && a.zip?.trim())
}

/**
 * Validate that all required profile fields are present and non-whitespace.
 * Returns the first error message found, or null if all fields are valid.
 */
export function validateProfileFields(fields: {
  fullName?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}, options?: { requireFullAddress?: boolean }): string | null {
  if (!fields.fullName?.trim()) return 'Please enter your name'
  
  if (options?.requireFullAddress) {
    if (!fields.street?.trim()) return 'Please enter your street address'
    if (!fields.city?.trim()) return 'Please enter your city'
    if (!fields.state?.trim()) return 'Please enter your state'
    if (!fields.zip?.trim()) return 'Please enter your zip code'
  }
  
  return null
}

/**
 * Check if address has any content
 */
export function hasAddress(a: AddressFields): boolean {
  return !!(a.street || a.city || a.state || a.zip)
}

/**
 * Strip house number from street for privacy
 * "1168 Lincoln Ave" → "Lincoln Ave"
 * "San Jose Farmers Market" → "San Jose Farmers Market" (no leading number)
 */
export function stripHouseNumber(street: string): string {
  if (!street) return ''
  // Match leading numbers (with optional letter suffix like "123A")
  return street.replace(/^\d+[A-Za-z]?\s+/, '')
}

/**
 * Build AddressFields from individual DB columns (handles nulls)
 */
export function buildAddress(
  street: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): AddressFields {
  return {
    street: street || '',
    city: city || '',
    state: state || '',
    zip: zip || '',
  }
}

/**
 * For geocoding — concatenate fields into a single string
 */
export function toGeocodingString(a: AddressFields): string {
  return formatFullAddress(a)
}

const STATE_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD', 'massachusetts': 'MA',
  'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT',
  'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
}

export function normalizeStateCode(state: string | null | undefined): string {
  if (!state) return ''
  const trimmed = state.trim().toLowerCase()
  if (trimmed.length === 2) return trimmed.toUpperCase()
  return STATE_MAP[trimmed] || state.trim().toUpperCase().slice(0, 2)
}

