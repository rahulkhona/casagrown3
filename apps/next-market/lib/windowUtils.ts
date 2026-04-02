/**
 * hasValidWindows — Checks whether a product has at least one delivery or pickup
 * window that is still in the future (date + time slot end hasn't passed).
 *
 * Used to gate Buy/Cart actions: if no windows are reachable, the product
 * is effectively unavailable regardless of inventory or expires_at.
 */

interface TimeWindow {
  start?: string  // e.g. "9:00 AM"
  end?: string    // e.g. "12:00 PM"
}

/**
 * Parse a time string like "9:00 AM" or "2:30 PM" to { hours, minutes } in 24h format.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  if (!timeStr) return null
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3]?.toUpperCase()
  if (period === 'PM' && hours < 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return { hours, minutes }
}

/**
 * Check if at least one fulfillment window is still available for this product.
 *
 * @param windowDates - Array of ISO date strings: ["2026-03-30", "2026-03-31"]
 * @param deliveryWindows - Array of time windows for delivery
 * @param pickupWindows - Array of time windows for pickup
 * @param mode - Optional: 'delivery' or 'pickup'. If specified, only checks that mode's windows.
 *              If omitted, returns true if either mode has valid windows.
 * @returns true if at least one window is still reachable
 */
export function hasValidWindows(
  windowDates?: any[] | null,
  deliveryWindows?: TimeWindow[] | Record<string, TimeWindow[]> | null,
  pickupWindows?: TimeWindow[] | Record<string, TimeWindow[]> | null,
  mode?: 'delivery' | 'pickup',
): boolean {
  // No dates configured = no restrictions, product is always available
  if (!windowDates || !Array.isArray(windowDates) || windowDates.length === 0) return true

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Helper: flatten per-date object OR flat array into TimeWindow[] for a given date
  function getWindowsForDate(
    windows: TimeWindow[] | Record<string, TimeWindow[]> | null | undefined,
    dateStr: string,
  ): TimeWindow[] {
    if (!windows) return []
    if (Array.isArray(windows)) return windows  // legacy flat array — applies to all dates
    if (typeof windows === 'object') {
      // Per-date object: { "2026-04-01": [...], "2026-04-02": [...] }
      return (windows as Record<string, TimeWindow[]>)[dateStr] || []
    }
    return []
  }

  // Helper: check if any windows exist at all (across all dates)
  function hasAnyWindows(windows: TimeWindow[] | Record<string, TimeWindow[]> | null | undefined): boolean {
    if (!windows) return false
    if (Array.isArray(windows)) return windows.length > 0
    if (typeof windows === 'object') {
      return Object.values(windows as Record<string, TimeWindow[]>).some(arr => Array.isArray(arr) && arr.length > 0)
    }
    return false
  }

  // Check if the selected mode has any windows at all
  const hasDelivery = hasAnyWindows(deliveryWindows)
  const hasPickup = hasAnyWindows(pickupWindows)

  if (mode === 'delivery' && !hasDelivery) return false
  if (mode === 'pickup' && !hasPickup) return false
  if (!mode && !hasDelivery && !hasPickup) {
    // No windows at all — fall back to date-only check
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return windowDates.some(dateStr => {
      const [y, m, d] = String(dateStr).split('-').map(Number)
      const windowDate = new Date(y, m - 1, d)
      return windowDate >= today
    })
  }

  for (const dateStr of windowDates) {
    const ds = String(dateStr)

    // Past date — skip
    if (ds < todayStr) continue

    // Get windows for this specific date and mode
    let dateWindows: TimeWindow[]
    if (mode === 'delivery') {
      dateWindows = getWindowsForDate(deliveryWindows, ds)
    } else if (mode === 'pickup') {
      dateWindows = getWindowsForDate(pickupWindows, ds)
    } else {
      dateWindows = [
        ...getWindowsForDate(deliveryWindows, ds),
        ...getWindowsForDate(pickupWindows, ds),
      ]
    }

    if (dateWindows.length === 0) continue

    // Future date (not today) — any windows on that day are valid
    if (ds > todayStr) return true

    // Today — check if any window's end time is still in the future
    for (const w of dateWindows) {
      const endTime = parseTime(w.end || '')
      if (!endTime) {
        // No end time specified = open-ended, still valid
        return true
      }
      const endDate = new Date(now)
      endDate.setHours(endTime.hours, endTime.minutes, 0, 0)
      if (endDate > now) return true
    }
  }

  return false
}
