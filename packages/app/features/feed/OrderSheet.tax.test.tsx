/**
 * Tax Helper Tests — OrderSheet extractZipCode, extractStateCode, US_STATE_MAP
 *
 * Tests the helper functions used to parse delivery addresses for
 * sales tax lookups. Uses California-based addresses to validate
 * the exempt flow without hitting the ZipTax API.
 */

// ── Mock native modules before any imports ──────────────────────────────────
jest.mock('@stripe/stripe-react-native', () => ({
  CardField: () => null,
  useStripe: () => ({ confirmPayment: jest.fn(), createPaymentMethod: jest.fn() }),
  StripeProvider: ({ children }: any) => children,
}))

jest.mock('../../utils/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }), getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    functions: { invoke: jest.fn() },
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: p } }) }) },
  },
}))

jest.mock('../../hooks/usePaymentService', () => ({
  usePaymentService: () => ({ processPayment: jest.fn(), loading: false, error: null }),
}))

jest.mock('../auth/auth-hook', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null }) }),
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: p } }) }) },
  },
}))

jest.mock('../../utils/normalize-storage-url', () => ({
  normalizeStorageUrl: (url: string | null | undefined) => url || undefined,
}))

jest.mock('@tamagui/lucide-icons', () => {
  const n = () => null
  return new Proxy({}, { get: () => n })
})

jest.mock('tamagui', () => {
  const { View, Text: RNText, TouchableOpacity, ScrollView: RNScrollView } = require('react-native')
  return {
    Button: ({ children, onPress, disabled }: any) => <TouchableOpacity onPress={onPress} disabled={disabled}>{typeof children === 'string' ? <RNText>{children}</RNText> : children}</TouchableOpacity>,
    Text: ({ children, ...p }: any) => <RNText {...p}>{children}</RNText>,
    YStack: ({ children, ...p }: any) => <View {...p}>{children}</View>,
    XStack: ({ children, ...p }: any) => <View {...p}>{children}</View>,
    ScrollView: ({ children, ...p }: any) => <RNScrollView {...p}>{children}</RNScrollView>,
    Spinner: () => null,
  }
})

jest.mock('react-native/Libraries/Alert/Alert', () => ({ alert: jest.fn() }))

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 37.33, longitude: -121.89 } }),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([{ streetNumber: '123', street: 'Main St', city: 'San Jose', region: 'CA', postalCode: '95120' }]),
  Accuracy: { Balanced: 3 },
}))

jest.mock('../create-post/CalendarPicker', () => ({ CalendarPicker: () => null }))

// ── Now import the helpers ────────────────────────────────────────────────────
import React from 'react'
import { extractZipCode, extractStateCode, US_STATE_MAP } from './OrderSheet'

// =============================================================================
// extractZipCode
// =============================================================================
describe('extractZipCode', () => {
  it('extracts 5-digit ZIP from typical US address', () => {
    expect(extractZipCode('123 Main St, San Jose, CA 95120')).toBe('95120')
  })

  it('extracts ZIP from geocoded address with county', () => {
    expect(
      extractZipCode('973, Wallace Drive, Almaden Valley, San Jose, Santa Clara County, California, 95120, United States')
    ).toBe('95120')
  })

  it('extracts ZIP+4 format (returns 5-digit portion)', () => {
    expect(extractZipCode('456 Oak Ave, Los Angeles, CA 90210-1234')).toBe('90210')
  })

  it('returns null for address without ZIP', () => {
    expect(extractZipCode('123 Main St, San Jose, California')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractZipCode('')).toBeNull()
  })

  it('handles ZIP at end of string', () => {
    expect(extractZipCode('San Jose, CA, 95120')).toBe('95120')
  })

  it('does not match partial numbers', () => {
    expect(extractZipCode('Apt 123, Suite 4')).toBeNull()
  })
})

// =============================================================================
// extractStateCode
// =============================================================================
describe('extractStateCode', () => {
  describe('2-letter abbreviation matching', () => {
    it('extracts state before ZIP: "CA 95120"', () => {
      expect(extractStateCode('123 Main St, San Jose, CA 95120')).toBe('CA')
    })

    it('extracts state code after comma: ", NY,"', () => {
      expect(extractStateCode('789 Broadway, New York, NY, 10001')).toBe('NY')
    })

    it('extracts state code at end: ", TX"', () => {
      expect(extractStateCode('456 Elm St, Austin, TX')).toBe('TX')
    })
  })

  describe('full state name matching (geocoded addresses)', () => {
    it('extracts from "California" in geocoded address', () => {
      expect(
        extractStateCode('973, Wallace Drive, Almaden Valley, San Jose, Santa Clara County, California, 95120, United States')
      ).toBe('CA')
    })

    it('extracts from "New York" (multi-word state)', () => {
      expect(
        extractStateCode('123 Broadway, Manhattan, New York, 10001, United States')
      ).toBe('NY')
    })

    it('extracts from "North Carolina"', () => {
      expect(
        extractStateCode('456 Oak Ridge, Charlotte, North Carolina, 28202, United States')
      ).toBe('NC')
    })

    it('extracts from "District of Columbia"', () => {
      expect(
        extractStateCode('1600 Pennsylvania Ave, Washington, District of Columbia, 20500')
      ).toBe('DC')
    })

    it('is case-insensitive for full names', () => {
      expect(
        extractStateCode('123 Main St, San Jose, CALIFORNIA, 95120')
      ).toBe('CA')
    })

    it('handles "West Virginia" without matching "Virginia"', () => {
      const result = extractStateCode('123 Main St, Charleston, West Virginia, 25301')
      expect(result).toBe('WV')
    })
  })

  it('returns null for unrecognized address', () => {
    expect(extractStateCode('Unknown Place, Nowhere')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractStateCode('')).toBeNull()
  })

  it('prefers 2-letter abbreviation over full name when both present', () => {
    expect(extractStateCode('San Jose, CA 95120, California')).toBe('CA')
  })
})

// =============================================================================
// US_STATE_MAP completeness
// =============================================================================
describe('US_STATE_MAP', () => {
  it('has 51 entries (50 states + DC)', () => {
    expect(Object.keys(US_STATE_MAP)).toHaveLength(51)
  })

  it('maps common states correctly', () => {
    expect(US_STATE_MAP['california']).toBe('CA')
    expect(US_STATE_MAP['new york']).toBe('NY')
    expect(US_STATE_MAP['texas']).toBe('TX')
    expect(US_STATE_MAP['florida']).toBe('FL')
  })

  it('includes District of Columbia', () => {
    expect(US_STATE_MAP['district of columbia']).toBe('DC')
  })

  it('all values are 2-letter uppercase codes', () => {
    for (const code of Object.values(US_STATE_MAP)) {
      expect(code).toMatch(/^[A-Z]{2}$/)
    }
  })
})

// =============================================================================
// California tax scenarios (address parsing integration)
// =============================================================================
describe('California address tax scenarios', () => {
  const CA_ADDRESSES = {
    geocoded: '973, Wallace Drive, Almaden Valley, San Jose, Santa Clara County, California, 95120, United States',
    abbreviated: '973 Wallace Dr, San Jose, CA 95120',
    short: 'San Jose, CA, 95120',
  }

  it('all CA address formats yield zip=95120 and state=CA', () => {
    for (const [label, addr] of Object.entries(CA_ADDRESSES)) {
      const zip = extractZipCode(addr)
      const state = extractStateCode(addr)
      expect({ label, zip, state }).toEqual({ label, zip: '95120', state: 'CA' })
    }
  })
})
