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
  return !!(a.street && a.city && a.state && a.zip)
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
