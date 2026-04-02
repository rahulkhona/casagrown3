/**
 * Tests for windowDisplay.ts — pill labels, date labels, anonymization
 *
 * These cover the bugs fixed during the fulfillment UX session:
 * - Per-date window objects must be parsed correctly
 * - Slot IDs should map to creation-form labels (4–6p, not 16:00–18:00)
 * - 24h→12h conversion must handle edge cases (noon, midnight, minutes)
 * - Date labels include actual date for clarity on older posts
 * - anonymizeAddress strips house number for privacy
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { getWindowDays, anonymizeAddress } from '../windowDisplay'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-01T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── getWindowDays ───────────────────────────────────────────────────

describe('getWindowDays', () => {
  test('returns empty for null/undefined inputs', () => {
    expect(getWindowDays(null, null)).toEqual([])
    expect(getWindowDays(undefined, undefined)).toEqual([])
    expect(getWindowDays([], {})).toEqual([])
  })

  test('parses per-date window objects with known slot IDs', () => {
    const dates = ['2026-04-01', '2026-04-02']
    const windows = {
      '2026-04-01': [
        { id: '16-18', start: '16:00', end: '18:00' },
        { id: '18-20', start: '18:00', end: '20:00' },
      ],
      '2026-04-02': [
        { id: '8-10', start: '08:00', end: '10:00' },
      ],
    }
    const result = getWindowDays(dates, windows)

    expect(result).toHaveLength(2)
    // Today
    expect(result[0].date).toBe('2026-04-01')
    expect(result[0].label).toMatch(/Today.*Apr 1/)
    expect(result[0].pills).toEqual(['4–6p', '6–8p'])
    // Tomorrow
    expect(result[1].date).toBe('2026-04-02')
    expect(result[1].label).toMatch(/Tomorrow.*Apr 2/)
    expect(result[1].pills).toEqual(['8–10a'])
  })

  test('filters out past dates', () => {
    const dates = ['2026-03-30', '2026-04-01']
    const windows = {
      '2026-03-30': [{ id: '16-18', start: '16:00', end: '18:00' }],
      '2026-04-01': [{ id: '16-18', start: '16:00', end: '18:00' }],
    }
    const result = getWindowDays(dates, windows)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-04-01')
  })

  test('handles custom slots without known IDs (24h→12h)', () => {
    const dates = ['2026-04-01']
    const windows = {
      '2026-04-01': [
        { start: '09:30', end: '11:00' },
        { start: '13:00', end: '15:30' },
      ],
    }
    const result = getWindowDays(dates, windows)
    expect(result[0].pills).toEqual(['9:30a–11a', '1p–3:30p'])
  })

  test('handles noon and midnight correctly', () => {
    const dates = ['2026-04-01']
    const windows = {
      '2026-04-01': [
        { start: '00:00', end: '01:00' },   // midnight
        { start: '12:00', end: '13:00' },   // noon
      ],
    }
    const result = getWindowDays(dates, windows)
    expect(result[0].pills).toEqual(['12a–1a', '12p–1p'])
  })

  test('formats future dates with weekday', () => {
    const dates = ['2026-04-05']  // Sunday
    const windows = {
      '2026-04-05': [{ id: '14-16', start: '14:00', end: '16:00' }],
    }
    const result = getWindowDays(dates, windows)
    expect(result[0].label).toMatch(/Sun.*Apr 5/)
    expect(result[0].pills).toEqual(['2–4p'])
  })

  test('handles flat array windows (legacy format)', () => {
    const dates = ['2026-04-01']
    const windows = [{ id: '16-18', start: '16:00', end: '18:00' }]
    const result = getWindowDays(dates, windows)
    expect(result[0].pills).toEqual(['4–6p'])
  })

  test('skips dates with no windows', () => {
    const dates = ['2026-04-01', '2026-04-02']
    const windows = {
      '2026-04-01': [{ id: '16-18', start: '16:00', end: '18:00' }],
      // 2026-04-02 has no windows entry
    }
    const result = getWindowDays(dates, windows)
    expect(result).toHaveLength(1)
  })

  test('uses label field as fallback', () => {
    const dates = ['2026-04-01']
    const windows = {
      '2026-04-01': [{ label: 'Flexible' }],
    }
    const result = getWindowDays(dates, windows)
    expect(result[0].pills).toEqual(['Flexible'])
  })

  test('uses "Any time" when no info available', () => {
    const dates = ['2026-04-01']
    const windows = {
      '2026-04-01': [{}],
    }
    const result = getWindowDays(dates, windows)
    expect(result[0].pills).toEqual(['Any time'])
  })

  test('all known slot IDs map correctly', () => {
    const dates = ['2026-04-01']
    const windows = {
      '2026-04-01': [
        { id: '8-10' }, { id: '10-12' }, { id: '12-14' },
        { id: '14-16' }, { id: '16-18' }, { id: '18-20' },
      ],
    }
    const result = getWindowDays(dates, windows)
    expect(result[0].pills).toEqual([
      '8–10a', '10–12p', '12–2p', '2–4p', '4–6p', '6–8p',
    ])
  })
})

// ─── anonymizeAddress ────────────────────────────────────────────────

describe('anonymizeAddress', () => {
  test('strips house number and prefixes with "Near"', () => {
    expect(anonymizeAddress('123 Oak Ave, San Jose, CA 95120'))
      .toBe('Near Oak Ave, San Jose, CA 95120')
  })

  test('handles multi-digit house numbers', () => {
    expect(anonymizeAddress('6449 Meridian Ave, San Jose, CA'))
      .toBe('Near Meridian Ave, San Jose, CA')
  })

  test('handles hyphenated house numbers', () => {
    // regex strips leading digits + separator: "12-" → "34 Main St..."
    expect(anonymizeAddress('12-34 Main St, City, ST'))
      .toBe('Near 34 Main St, City, ST')
  })

  test('returns null for null/undefined/empty', () => {
    expect(anonymizeAddress(null)).toBeNull()
    expect(anonymizeAddress(undefined)).toBeNull()
    expect(anonymizeAddress('')).toBeNull()
  })

  test('returns null if no house number found', () => {
    expect(anonymizeAddress('PO Box 123')).toBeNull()
  })
})
