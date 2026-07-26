/**
 * Profile validation tests
 *
 * Verifies that validateProfileFields() enforces required fields
 * (full_name, street_address, city, state_code, zip_code) and returns
 * the correct user-facing error messages.
 */
import { describe, it, expect } from 'vitest'
import {
  validateProfileFields,
  isAddressComplete,
  normalizeStateCode,
} from '../../lib/address'

// ── validateProfileFields ─────────────────────────────────────────────

describe('validateProfileFields', () => {
  const validFields = {
    fullName: 'John Doe',
    street: '123 Main St',
    city: 'San Jose',
    state: 'CA',
    zip: '95125',
  }

  it('returns null when all fields are valid', () => {
    expect(validateProfileFields(validFields, { requireFullAddress: true })).toBeNull()
  })


  // ── Minimal mode (Progressive Profile) ───────────────────────────────

  it('minimal mode: only name required, missing name returns error', () => {
    expect(validateProfileFields({ fullName: '' })).toBe('Please enter your name')
    expect(validateProfileFields({ fullName: null })).toBe('Please enter your name')
  })

  it('minimal mode: name provided, no address -> returns null (valid)', () => {
    expect(validateProfileFields({ fullName: 'Jane' })).toBeNull()
    expect(validateProfileFields({ fullName: 'Jane', street: '' })).toBeNull()
  })

  // ── Name validation ──────────────────────────────────────────────────

  it('returns error when fullName is null', () => {
    expect(validateProfileFields({ ...validFields, fullName: null }, { requireFullAddress: true }))
      .toBe('Please enter your name')
  })

  it('returns error when fullName is empty string', () => {
    expect(validateProfileFields({ ...validFields, fullName: '' }, { requireFullAddress: true }))
      .toBe('Please enter your name')
  })

  it('returns error when fullName is whitespace-only', () => {
    expect(validateProfileFields({ ...validFields, fullName: '   ' }, { requireFullAddress: true }))
      .toBe('Please enter your name')
  })

  // ── Street validation ────────────────────────────────────────────────

  it('returns error when street is null', () => {
    expect(validateProfileFields({ ...validFields, street: null }, { requireFullAddress: true }))
      .toBe('Please enter your street address')
  })

  it('returns error when street is empty string', () => {
    expect(validateProfileFields({ ...validFields, street: '' }, { requireFullAddress: true }))
      .toBe('Please enter your street address')
  })

  it('returns error when street is whitespace-only', () => {
    expect(validateProfileFields({ ...validFields, street: '   ' }, { requireFullAddress: true }))
      .toBe('Please enter your street address')
  })

  // ── City validation ──────────────────────────────────────────────────

  it('returns error when city is null', () => {
    expect(validateProfileFields({ ...validFields, city: null }, { requireFullAddress: true }))
      .toBe('Please enter your city')
  })

  it('returns error when city is empty string', () => {
    expect(validateProfileFields({ ...validFields, city: '' }, { requireFullAddress: true }))
      .toBe('Please enter your city')
  })

  it('returns error when city is whitespace-only', () => {
    expect(validateProfileFields({ ...validFields, city: '   ' }, { requireFullAddress: true }))
      .toBe('Please enter your city')
  })

  // ── State validation ─────────────────────────────────────────────────

  it('returns error when state is null', () => {
    expect(validateProfileFields({ ...validFields, state: null }, { requireFullAddress: true }))
      .toBe('Please enter your state')
  })

  it('returns error when state is empty string', () => {
    expect(validateProfileFields({ ...validFields, state: '' }, { requireFullAddress: true }))
      .toBe('Please enter your state')
  })

  it('returns error when state is whitespace-only', () => {
    expect(validateProfileFields({ ...validFields, state: '  ' }, { requireFullAddress: true }))
      .toBe('Please enter your state')
  })

  // ── Zip validation ───────────────────────────────────────────────────

  it('returns error when zip is null', () => {
    expect(validateProfileFields({ ...validFields, zip: null }, { requireFullAddress: true }))
      .toBe('Please enter your zip code')
  })

  it('returns error when zip is empty string', () => {
    expect(validateProfileFields({ ...validFields, zip: '' }, { requireFullAddress: true }))
      .toBe('Please enter your zip code')
  })

  it('returns error when zip is whitespace-only', () => {
    expect(validateProfileFields({ ...validFields, zip: '  ' }, { requireFullAddress: true }))
      .toBe('Please enter your zip code')
  })

  // ── Priority order ───────────────────────────────────────────────────

  it('returns first error (name) when all fields are missing', () => {
    expect(validateProfileFields({
      fullName: '',
      street: '',
      city: '',
      state: '',
      zip: '',
    }, { requireFullAddress: true })).toBe('Please enter your name')
  })

  it('returns street error when name is valid but rest missing', () => {
    expect(validateProfileFields({
      fullName: 'Jane',
      street: '',
      city: '',
      state: '',
      zip: '',
    }, { requireFullAddress: true })).toBe('Please enter your street address')
  })

  it('returns city error when name and street valid but rest missing', () => {
    expect(validateProfileFields({
      fullName: 'Jane',
      street: '123 Main',
      city: '',
      state: '',
      zip: '',
    }, { requireFullAddress: true })).toBe('Please enter your city')
  })

  it('returns state error when only state and zip missing', () => {
    expect(validateProfileFields({
      fullName: 'Jane',
      street: '123 Main',
      city: 'San Jose',
      state: '',
      zip: '',
    }, { requireFullAddress: true })).toBe('Please enter your state')
  })

  it('returns zip error when only zip missing', () => {
    expect(validateProfileFields({
      fullName: 'Jane',
      street: '123 Main',
      city: 'San Jose',
      state: 'CA',
      zip: '',
    }, { requireFullAddress: true })).toBe('Please enter your zip code')
  })

  // ── Edge cases ───────────────────────────────────────────────────────

  it('accepts fields with leading/trailing spaces (trimmed internally)', () => {
    expect(validateProfileFields({
      fullName: '  John Doe  ',
      street: '  123 Main St  ',
      city: '  San Jose  ',
      state: ' CA ',
      zip: ' 95125 ',
    }, { requireFullAddress: true })).toBeNull()
  })

  it('returns error when fields are undefined (not provided)', () => {
    expect(validateProfileFields({}, { requireFullAddress: true })).toBe('Please enter your name')
  })
})

// ── isAddressComplete (updated to trim) ────────────────────────────────

describe('isAddressComplete', () => {
  it('returns true for valid address', () => {
    expect(isAddressComplete({ street: '123 Main', city: 'San Jose', state: 'CA', zip: '95125' }))
      .toBe(true)
  })

  it('returns false when street is whitespace', () => {
    expect(isAddressComplete({ street: '  ', city: 'San Jose', state: 'CA', zip: '95125' }))
      .toBe(false)
  })

  it('returns false when city is empty', () => {
    expect(isAddressComplete({ street: '123 Main', city: '', state: 'CA', zip: '95125' }))
      .toBe(false)
  })

  it('returns false when state is empty', () => {
    expect(isAddressComplete({ street: '123 Main', city: 'San Jose', state: '', zip: '95125' }))
      .toBe(false)
  })

  it('returns false when zip is empty', () => {
    expect(isAddressComplete({ street: '123 Main', city: 'San Jose', state: 'CA', zip: '' }))
      .toBe(false)
  })
})

// ── normalizeStateCode ─────────────────────────────────────────────────

describe('normalizeStateCode', () => {
  it('returns uppercase 2-letter code for valid 2-letter input', () => {
    expect(normalizeStateCode('ca')).toBe('CA')
  })

  it('maps full state name to code', () => {
    expect(normalizeStateCode('california')).toBe('CA')
    expect(normalizeStateCode('Texas')).toBe('TX')
    expect(normalizeStateCode('NEW YORK')).toBe('NY')
  })

  it('returns empty string for null/undefined', () => {
    expect(normalizeStateCode(null)).toBe('')
    expect(normalizeStateCode(undefined)).toBe('')
  })

  it('trims whitespace', () => {
    expect(normalizeStateCode('  CA  ')).toBe('CA')
  })
})
