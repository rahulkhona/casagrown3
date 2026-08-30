import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchActiveCitySchedules,
  resolveActiveCitySchedule,
  formatMarketDaySummary,
  convertMarketScheduleToWindows,
  CityMarketSchedule,
  _clearCitySchedulesCache,
} from '../marketCitySchedules'

describe('marketCitySchedules', () => {
  beforeEach(() => {
    _clearCitySchedulesCache()
  })
  const mockSchedules: CityMarketSchedule[] = [
    {
      id: 'sched-1',
      city: 'San Jose',
      state: 'CA',
      zipcodes: ['95125', '95120', '95124', '95112'],
      is_active: true,
      market_days: ['Saturday'],
      default_pickup_windows: [
        { day: 'Saturday', start_time: '09:00', end_time: '11:00' },
      ],
      default_delivery_windows: [
        { day: 'Saturday', start_time: '13:00', end_time: '16:00' },
      ],
      cutoff_hours_before_market: 12,
    },
    {
      id: 'sched-2',
      city: 'Los Gatos',
      state: 'CA',
      zipcodes: ['95030', '95032'],
      is_active: true,
      market_days: ['Sunday'],
      default_pickup_windows: [
        { day: 'Sunday', start_time: '10:00', end_time: '12:00' },
      ],
      default_delivery_windows: [
        { day: 'Sunday', start_time: '13:00', end_time: '15:00' },
      ],
      cutoff_hours_before_market: 12,
    },
    {
      id: 'sched-3',
      city: 'Palo Alto',
      state: 'CA',
      zipcodes: ['94301'],
      is_active: false, // Inactive
      market_days: ['Wednesday'],
      default_pickup_windows: [],
      default_delivery_windows: [],
      cutoff_hours_before_market: 12,
    },
  ]

  const createMockSupabase = (schedules = mockSchedules) => {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: schedules.filter(s => s.is_active),
            error: null,
          }),
        }),
      }),
    }
  }

  it('formats market day summary string accurately', () => {
    const summarySJ = formatMarketDaySummary(mockSchedules[0])
    expect(summarySJ).toBe('San Jose Market Day (Saturday · Pickup: 9:00 AM – 11:00 AM · Delivery: 1:00 PM – 4:00 PM)')

    const summaryLG = formatMarketDaySummary(mockSchedules[1])
    expect(summaryLG).toBe('Los Gatos Market Day (Sunday · Pickup: 10:00 AM – 12:00 PM · Delivery: 1:00 PM – 3:00 PM)')
  })

  it('converts market schedule to window maps and product windows', () => {
    const windows = convertMarketScheduleToWindows(mockSchedules[0])
    expect(windows.weeklyPickup['saturday']).toEqual(['9-11'])
    expect(windows.weeklyDelivery['saturday']).toEqual(['13-16'])
    expect(windows.productPickupWindows[0]).toEqual({
      day: 'saturday',
      start_time: '09:00',
      end_time: '11:00',
    })
    expect(windows.productDeliveryWindows[0]).toEqual({
      day: 'saturday',
      start_time: '13:00',
      end_time: '16:00',
    })
  })

  it('converts schedule with multiple market days and windows correctly', () => {
    const multiDay: CityMarketSchedule = {
      id: 'multi',
      city: 'Testville',
      state: 'CA',
      zipcodes: ['99001'],
      is_active: true,
      market_days: ['saturday', 'sunday'],
      default_pickup_windows: [
        { day: 'saturday', start_time: '09:00', end_time: '11:00' },
        { day: 'sunday', start_time: '10:00', end_time: '12:00' },
      ],
      default_delivery_windows: [
        { day: 'saturday', start_time: '13:00', end_time: '15:00' },
        { day: 'sunday', start_time: '14:00', end_time: '16:00' },
      ],
      cutoff_hours_before_market: 6,
    }
    const windows = convertMarketScheduleToWindows(multiDay)
    expect(windows.weeklyPickup['saturday']).toEqual(['9-11'])
    expect(windows.weeklyPickup['sunday']).toEqual(['10-12'])
    expect(windows.weeklyDelivery['saturday']).toEqual(['13-15'])
    expect(windows.weeklyDelivery['sunday']).toEqual(['14-16'])
    expect(windows.productPickupWindows).toHaveLength(2)
    expect(windows.productDeliveryWindows).toHaveLength(2)
  })

  it('converts schedule with empty windows gracefully (no market day set)', () => {
    const noWindows: CityMarketSchedule = {
      id: 'empty',
      city: 'Unscheduled City',
      state: 'CA',
      zipcodes: [],
      is_active: true,
      market_days: [],
      default_pickup_windows: [],
      default_delivery_windows: [],
      cutoff_hours_before_market: 12,
    }
    const windows = convertMarketScheduleToWindows(noWindows)
    expect(windows.weeklyPickup).toEqual({})
    expect(windows.weeklyDelivery).toEqual({})
    expect(windows.productPickupWindows).toHaveLength(0)
    expect(windows.productDeliveryWindows).toHaveLength(0)
  })

  it('resolves active city schedule by City and State (case-insensitive & trimmed)', async () => {
    const mockSupabase = createMockSupabase() as any

    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      city: '  san jose  ',
      state: 'ca',
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.city).toBe('San Jose')
    expect(resolved?.id).toBe('sched-1')
  })

  it('resolves active city schedule by ZIP code when city is omitted', async () => {
    const mockSupabase = createMockSupabase() as any

    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      zip: '95125',
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.city).toBe('San Jose')
  })

  it('resolves active city schedule by ZIP code from a different city', async () => {
    const mockSupabase = createMockSupabase() as any

    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      zip: '95030',
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.city).toBe('Los Gatos')
  })

  it('resolves by city name alone when state is absent', async () => {
    const mockSupabase = createMockSupabase() as any

    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      city: 'Los Gatos',
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.city).toBe('Los Gatos')
    expect(resolved?.market_days).toContain('Sunday')
  })

  // ── CITY WITHOUT A MARKET DAY SCHEDULE ──────────────────────────────────────

  it('returns null for a city with no schedule and no platform default (no-schedule city)', async () => {
    // This is the "city without market day" case: no entry exists and no default fallback.
    const mockSupabase = createMockSupabase() as any

    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      city: 'Denver',
      state: 'CO',
    })

    // No city override, no default row → must return null so the form shows generic windows
    expect(resolved).toBeNull()
  })

  it('returns null for an inactive city entry (market day disabled)', async () => {
    const mockSupabase = createMockSupabase() as any

    const resolvedInactive = await resolveActiveCitySchedule(mockSupabase, {
      city: 'Palo Alto',
      state: 'CA',
    })
    // Palo Alto exists in mockSchedules but is_active = false → filtered out → null
    expect(resolvedInactive).toBeNull()
  })

  it('falls back to active platform default schedule when city override does not exist', async () => {
    const schedulesWithDefault: CityMarketSchedule[] = [
      ...mockSchedules,
      {
        id: 'sched-default',
        city: 'All Cities (Default)',
        state: 'ALL',
        zipcodes: [],
        is_default: true,
        is_active: true,
        market_days: ['Saturday'],
        default_pickup_windows: [
          { day: 'Saturday', start_time: '09:00', end_time: '11:00' },
        ],
        default_delivery_windows: [
          { day: 'Saturday', start_time: '13:00', end_time: '16:00' },
        ],
        cutoff_hours_before_market: 12,
      },
    ]

    const mockSupabase = createMockSupabase(schedulesWithDefault) as any

    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      city: 'Sacramento',
      state: 'CA',
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.is_default).toBe(true)
    // City name is overlaid from the caller's location onto the default schedule
    expect(resolved?.city).toBe('Sacramento')
    expect(resolved?.market_days).toEqual(['Saturday'])
  })

  it('ignores inactive platform default when no active override exists (no-schedule result)', async () => {
    // An inactive default row must NOT be returned — city gets no schedule
    const inactiveDefault: CityMarketSchedule[] = [
      ...mockSchedules,
      {
        id: 'sched-default',
        city: 'All Cities (Default)',
        state: 'ALL',
        zipcodes: [],
        is_default: true,
        is_active: false, // inactive!
        market_days: ['Saturday'],
        default_pickup_windows: [],
        default_delivery_windows: [],
        cutoff_hours_before_market: 12,
      },
    ]

    const mockSupabase = createMockSupabase(inactiveDefault) as any

    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      city: 'Fresno',
      state: 'CA',
    })

    // The inactive default should be excluded from `is_active = true` query
    // so the city has no market day schedule at all
    expect(resolved).toBeNull()
  })

  it('prefers specific city override over default when both exist', async () => {
    const schedulesWithDefault: CityMarketSchedule[] = [
      ...mockSchedules,
      {
        id: 'sched-default',
        city: 'All Cities (Default)',
        state: 'ALL',
        zipcodes: [],
        is_default: true,
        is_active: true,
        market_days: ['Saturday'],
        default_pickup_windows: [{ day: 'Saturday', start_time: '09:00', end_time: '11:00' }],
        default_delivery_windows: [{ day: 'Saturday', start_time: '13:00', end_time: '16:00' }],
        cutoff_hours_before_market: 12,
      },
    ]

    const mockSupabase = createMockSupabase(schedulesWithDefault) as any

    // San Jose has its own override (Saturday) — must NOT fall through to the default
    const resolved = await resolveActiveCitySchedule(mockSupabase, {
      city: 'San Jose',
      state: 'CA',
    })

    expect(resolved?.id).toBe('sched-1')
    expect(resolved?.is_default).toBeFalsy()
  })

  it('caches results and avoids redundant Supabase calls within TTL', async () => {
    const mockSupabase = createMockSupabase() as any

    await fetchActiveCitySchedules(mockSupabase)
    await fetchActiveCitySchedules(mockSupabase)
    await fetchActiveCitySchedules(mockSupabase)

    // Should only have called Supabase once due to in-memory cache
    expect(mockSupabase.from).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after cache is cleared', async () => {
    const mockSupabase = createMockSupabase() as any

    await fetchActiveCitySchedules(mockSupabase)
    _clearCitySchedulesCache()
    await fetchActiveCitySchedules(mockSupabase)

    expect(mockSupabase.from).toHaveBeenCalledTimes(2)
  })
})

