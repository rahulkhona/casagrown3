import { describe, it, expect, vi } from 'vitest'

// Unmock store so we test the real implementation (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/store')

import { isMarketOpen, getNextMarketDate, getNextMarketOpen, formatUsd, generatePasscode, type MarketSchedule } from '../store'

// ============================================================================
// formatUsd
// ============================================================================
describe('formatUsd', () => {
  it('formats whole dollar amounts', () => {
    expect(formatUsd(5)).toBe('$5.00')
  })
  it('formats cents correctly', () => {
    expect(formatUsd(4.5)).toBe('$4.50')
  })
  it('formats zero as $0.00', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })
  it('formats large amounts with commas', () => {
    expect(formatUsd(1234.56)).toBe('$1,234.56')
  })
})

// ============================================================================
// generatePasscode
// ============================================================================
describe('generatePasscode', () => {
  it('returns a 6-digit string', () => {
    const code = generatePasscode()
    expect(code).toMatch(/^\d{6}$/)
  })
  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 10 }, () => generatePasscode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})

// ============================================================================
// isMarketOpen
// ============================================================================
describe('isMarketOpen', () => {
  const now = new Date()
  const currentDay = now.getDay()
  const currentHour = now.getHours()
  const currentMin = now.getMinutes()

  const makeSchedule = (dayOfWeek: number, open: string, close: string): MarketSchedule[] => [
    { dayOfWeek, dayName: 'TestDay', openTime: open, closeTime: close },
  ]

  it('returns true when market_never_closes is true', () => {
    expect(isMarketOpen([], true)).toBe(true)
  })

  it('returns false with empty schedule', () => {
    expect(isMarketOpen([])).toBe(false)
  })

  it('returns true when current time is within schedule', () => {
    // Create a schedule that covers the current time
    const openH = String(Math.max(0, currentHour - 1)).padStart(2, '0')
    const closeH = String(Math.min(23, currentHour + 1)).padStart(2, '0')
    const schedule = makeSchedule(currentDay, `${openH}:00`, `${closeH}:59`)
    expect(isMarketOpen(schedule)).toBe(true)
  })

  it('returns false when current day is not in schedule', () => {
    const otherDay = (currentDay + 3) % 7
    const schedule = makeSchedule(otherDay, '00:00', '23:59')
    expect(isMarketOpen(schedule)).toBe(false)
  })

  it('returns false when current time is outside schedule hours', () => {
    // Schedule for current day but hours that don't include now
    const futureHour = (currentHour + 5) % 24
    const futureHourEnd = (currentHour + 6) % 24
    // Only fails if futureHour > currentHour (not wrapping)
    if (futureHour > currentHour) {
      const schedule = makeSchedule(
        currentDay,
        `${String(futureHour).padStart(2, '0')}:00`,
        `${String(futureHourEnd).padStart(2, '0')}:00`
      )
      expect(isMarketOpen(schedule)).toBe(false)
    }
  })
})

// ============================================================================
// getNextMarketDate
// ============================================================================
describe('getNextMarketDate', () => {
  it('returns null for empty schedule', () => {
    expect(getNextMarketDate([])).toBeNull()
  })

  it('returns a date object with schedule info', () => {
    const schedule: MarketSchedule[] = [
      { dayOfWeek: 6, dayName: 'Saturday', openTime: '08:00', closeTime: '11:00' },
    ]
    const result = getNextMarketDate(schedule)
    expect(result).not.toBeNull()
    expect(result!.dayName).toBe('Saturday')
    expect(result!.openTime).toBe('08:00')
    expect(result!.closeTime).toBe('11:00')
    expect(result!.date).toBeInstanceOf(Date)
  })

  it('returns today if market is on today and not closed yet', () => {
    const now = new Date()
    const schedule: MarketSchedule[] = [
      { dayOfWeek: now.getDay(), dayName: 'Today', openTime: '00:00', closeTime: '23:59' },
    ]
    const result = getNextMarketDate(schedule)
    expect(result).not.toBeNull()
    expect(result!.date.getDate()).toBe(now.getDate())
  })
})

// ============================================================================
// getNextMarketOpen
// ============================================================================
describe('getNextMarketOpen', () => {
  it('returns null for empty schedule', () => {
    expect(getNextMarketOpen([])).toBeNull()
  })

  it('returns day and time info', () => {
    const schedule: MarketSchedule[] = [
      { dayOfWeek: 6, dayName: 'Saturday', openTime: '08:00', closeTime: '11:00' },
    ]
    const result = getNextMarketOpen(schedule)
    expect(result).not.toBeNull()
    expect(result!.dayName).toBe('Saturday')
    expect(result!.openTime).toBe('08:00')
  })
})
