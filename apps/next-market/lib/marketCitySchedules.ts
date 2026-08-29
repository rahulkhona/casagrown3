/**
 * City Market Schedules & Densification Engine
 *
 * Provides utilities for querying city-by-city market day configurations,
 * formatting market day banners, and converting default fulfillment windows
 * for product listings.
 */

export interface MarketWindowSlot {
  day: string // e.g. 'saturday', 'sunday', 'monday'
  start_time: string // '09:00'
  end_time: string // '11:00'
}

export interface CityMarketSchedule {
  id: string
  city: string
  state: string
  zipcodes: string[]
  is_active: boolean
  is_default?: boolean
  market_days: string[]
  default_pickup_windows: MarketWindowSlot[]
  default_delivery_windows: MarketWindowSlot[]
  cutoff_hours_before_market: number
}

// In-memory cache for fast client lookups
let cachedCitySchedules: CityMarketSchedule[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60 * 1000 // 1 minute

export function _clearCitySchedulesCache(): void {
  cachedCitySchedules = null
  cacheTimestamp = 0
}

/**
 * Fetch all active city schedules (with client-side caching)
 */
export async function fetchActiveCitySchedules(supabase: any): Promise<CityMarketSchedule[]> {
  const now = Date.now()
  if (Array.isArray(cachedCitySchedules) && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCitySchedules
  }

  try {
    const { data, error } = await supabase
      .from('market_city_schedules')
      .select('*')
      .eq('is_active', true)

    if (error || !Array.isArray(data)) {
      if (error) console.warn('Could not fetch market_city_schedules:', error)
      return Array.isArray(cachedCitySchedules) ? cachedCitySchedules : []
    }

    cachedCitySchedules = data as CityMarketSchedule[]
    cacheTimestamp = now
    return cachedCitySchedules
  } catch (err) {
    console.warn('Error querying market_city_schedules:', err)
    return Array.isArray(cachedCitySchedules) ? cachedCitySchedules : []
  }
}

/**
 * Match a seller/buyer location to an active CityMarketSchedule.
 * Checks both City+State and 5-digit ZIP code.
 * Falls back to the platform-wide Default Market Schedule if no city override exists.
 */
export async function resolveActiveCitySchedule(
  supabase: any,
  location: { city?: string | null; state?: string | null; zip?: string | null }
): Promise<CityMarketSchedule | null> {
  const schedules = await fetchActiveCitySchedules(supabase)
  if (!Array.isArray(schedules) || schedules.length === 0) return null

  const cleanCity = (location.city || '').trim().toLowerCase()
  const cleanState = (location.state || '').trim().toUpperCase()
  const cleanZip = (location.zip || '').trim().slice(0, 5)

  // 1. Specific City Override: Direct match on City + State
  if (cleanCity && cleanState) {
    const cityMatch = schedules.find(
      (s) => !s?.is_default && s?.city && s.city.trim().toLowerCase() === cleanCity && s?.state && s.state.trim().toUpperCase() === cleanState
    )
    if (cityMatch) return cityMatch
  }

  // 2. Specific City Override: Direct match on City name alone
  if (cleanCity) {
    const cityMatch = schedules.find((s) => !s?.is_default && s?.city && s.city.trim().toLowerCase() === cleanCity)
    if (cityMatch) return cityMatch
  }

  // 3. Specific City Override: Match by ZIP code in zipcodes array
  if (cleanZip) {
    const zipMatch = schedules.find(
      (s) => !s?.is_default && Array.isArray(s?.zipcodes) && s.zipcodes.includes(cleanZip)
    )
    if (zipMatch) return zipMatch
  }

  // 4. Platform Default Market Schedule Fallback
  const defaultSchedule = schedules.find((s) => s?.is_default && s?.is_active)
  if (defaultSchedule) {
    if (location.city && location.city.trim()) {
      return {
        ...defaultSchedule,
        city: location.city.trim(),
        state: location.state || defaultSchedule.state,
      }
    }
    return defaultSchedule
  }

  return null
}

/**
 * Helper to capitalize day name
 */
export function capitalizeDay(day: string): string {
  if (!day) return ''
  return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()
}

/**
 * Format 24-hour time to 12-hour AM/PM string (e.g. "09:00" -> "9:00 AM", "13:00" -> "1:00 PM")
 */
export function formatTimeSlot(timeStr: string): string {
  if (!timeStr) return ''
  const [hStr, mStr] = timeStr.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr || '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${ampm}`
}

/**
 * Friendly summary for UI badges and banners
 * e.g. "✨ San Jose Market Day (Saturdays 9:00 AM – 11:00 AM)"
 */
export function formatMarketDaySummary(schedule: CityMarketSchedule): string {
  const days = schedule.market_days.map(capitalizeDay).join(' & ')
  const pickup = schedule.default_pickup_windows?.[0]
  const delivery = schedule.default_delivery_windows?.[0]

  let timeDesc = ''
  if (pickup) {
    timeDesc += `Pickup: ${formatTimeSlot(pickup.start_time)} – ${formatTimeSlot(pickup.end_time)}`
  }
  if (delivery) {
    if (timeDesc) timeDesc += ' · '
    timeDesc += `Delivery: ${formatTimeSlot(delivery.start_time)} – ${formatTimeSlot(delivery.end_time)}`
  }

  return `${schedule.city} Market Day (${days} · ${timeDesc})`
}

/**
 * Converts a CityMarketSchedule into weekly window maps and product window arrays
 */
export function convertMarketScheduleToWindows(schedule: CityMarketSchedule) {
  const weeklyPickup: Record<string, string[]> = {}
  const weeklyDelivery: Record<string, string[]> = {}

  const productPickupWindows: Array<{ day: string; start_time: string; end_time: string }> = []
  const productDeliveryWindows: Array<{ day: string; start_time: string; end_time: string }> = []

  // Pickup Windows
  if (Array.isArray(schedule.default_pickup_windows)) {
    schedule.default_pickup_windows.forEach((w) => {
      const day = w.day.toLowerCase()
      const slotId = timeToSlotId(w.start_time, w.end_time)
      if (!weeklyPickup[day]) weeklyPickup[day] = []
      if (!weeklyPickup[day].includes(slotId)) weeklyPickup[day].push(slotId)

      productPickupWindows.push({
        day,
        start_time: w.start_time,
        end_time: w.end_time,
      })
    })
  }

  // Delivery Windows
  if (Array.isArray(schedule.default_delivery_windows)) {
    schedule.default_delivery_windows.forEach((w) => {
      const day = w.day.toLowerCase()
      const slotId = timeToSlotId(w.start_time, w.end_time)
      if (!weeklyDelivery[day]) weeklyDelivery[day] = []
      if (!weeklyDelivery[day].includes(slotId)) weeklyDelivery[day].push(slotId)

      productDeliveryWindows.push({
        day,
        start_time: w.start_time,
        end_time: w.end_time,
      })
    })
  }

  return {
    weeklyPickup,
    weeklyDelivery,
    productPickupWindows,
    productDeliveryWindows,
  }
}

function timeToSlotId(start: string, end: string): string {
  const startH = parseInt(start.split(':')[0], 10)
  const endH = parseInt(end.split(':')[0], 10)
  return `${startH}-${endH}`
}
