/**
 * Tests for windowUtils.ts — hasValidWindows
 *
 * Critical bug fixed: hasValidWindows now handles per-date window objects
 * (not just flat arrays). Previously, { "2026-04-01": [...] } would cause
 * Array.isArray to return false, making all mode-specific checks fail with
 * "no pickup/delivery windows available" even when windows existed.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { hasValidWindows } from '../windowUtils'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-01T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('hasValidWindows', () => {
  test('returns true when no dates configured (no restrictions)', () => {
    expect(hasValidWindows(null, null, null)).toBe(true)
    expect(hasValidWindows([], null, null)).toBe(true)
  })

  // ── PER-DATE OBJECTS (the format used by the fulfillment system) ──

  test('returns true for pickup mode with per-date pickup windows', () => {
    const dates = ['2026-04-01', '2026-04-02']
    const pickupWindows = {
      '2026-04-01': [{ start: '16:00', end: '18:00' }],
      '2026-04-02': [{ start: '18:00', end: '20:00' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows, 'pickup')).toBe(true)
  })

  test('returns true for delivery mode with per-date delivery windows', () => {
    const dates = ['2026-04-02']
    const deliveryWindows = {
      '2026-04-02': [{ start: '16:00', end: '18:00' }],
    }
    expect(hasValidWindows(dates, deliveryWindows, null, 'delivery')).toBe(true)
  })

  test('returns false for pickup when only delivery windows exist (per-date)', () => {
    const dates = ['2026-04-01']
    const deliveryWindows = {
      '2026-04-01': [{ start: '16:00', end: '18:00' }],
    }
    expect(hasValidWindows(dates, deliveryWindows, null, 'pickup')).toBe(false)
  })

  test('returns false for delivery when only pickup windows exist (per-date)', () => {
    const dates = ['2026-04-01']
    const pickupWindows = {
      '2026-04-01': [{ start: '16:00', end: '18:00' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows, 'delivery')).toBe(false)
  })

  test('returns true with no mode when either has windows (per-date)', () => {
    const dates = ['2026-04-02']
    const pickupWindows = {
      '2026-04-02': [{ start: '10:00', end: '12:00' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows)).toBe(true)
  })

  // ── PAST/FUTURE DATE FILTERING ──

  test('filters out past dates', () => {
    const dates = ['2026-03-30']  // yesterday
    const pickupWindows = {
      '2026-03-30': [{ start: '10:00', end: '12:00' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows, 'pickup')).toBe(false)
  })

  test('future date with any window is valid', () => {
    const dates = ['2026-04-05']
    const pickupWindows = {
      '2026-04-05': [{ start: '10:00', end: '12:00' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows, 'pickup')).toBe(true)
  })

  // ── TODAY TIME CHECKS ──

  test('today window with end time in future is valid', () => {
    // Current time is 10:00, window ends at 18:00
    const dates = ['2026-04-01']
    const pickupWindows = {
      '2026-04-01': [{ start: '4:00 PM', end: '6:00 PM' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows, 'pickup')).toBe(true)
  })

  test('today window with end time in past is invalid', () => {
    // Current time is 10:00, window ends at 9:00
    const dates = ['2026-04-01']
    const pickupWindows = {
      '2026-04-01': [{ start: '8:00 AM', end: '9:00 AM' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows, 'pickup')).toBe(false)
  })

  // ── LEGACY FLAT ARRAY FORMAT ──

  test('handles legacy flat array windows', () => {
    const dates = ['2026-04-01']
    const pickupWindows = [{ start: '4:00 PM', end: '6:00 PM' }]
    expect(hasValidWindows(dates, null, pickupWindows, 'pickup')).toBe(true)
  })

  // ── EMPTY WINDOWS FOR SPECIFIC DATES ──

  test('returns false when date exists but has no windows for selected mode', () => {
    const dates = ['2026-04-02']
    // Pickup windows exist but not for Apr 2
    const pickupWindows = {
      '2026-04-01': [{ start: '10:00', end: '12:00' }],
    }
    expect(hasValidWindows(dates, null, pickupWindows, 'pickup')).toBe(false)
  })
})
