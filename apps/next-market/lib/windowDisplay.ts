/**
 * formatWindowSchedule — Renders product fulfillment windows as a human-readable
 * compact summary, e.g.: "Today 4:00 PM – 6:00 PM · Tomorrow 4:00 PM – 6:00 PM"
 *
 * Product windows are stored as per-date objects:
 * { "2026-04-01": [{ start: "16:00", end: "18:00" }], "2026-04-02": [...] }
 */

interface TimeWindow {
  id?: string
  start?: string   // "16:00" (24h) or "4:00 PM" (12h)
  end?: string     // "18:00" (24h) or "6:00 PM" (12h)
  label?: string
}

/**
 * Convert 24h time "16:00" to "4:00 PM"
 */
function to12h(time: string): string {
  if (!time) return ''
  // Already in 12h format?
  if (/AM|PM/i.test(time)) return time
  const [hStr, mStr] = time.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr || '00'
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${period}`
}

/**
 * Format window dates + time windows into a compact schedule.
 * Handles two data shapes:
 * 1. Per-date object: { "2026-04-01": [{ start, end }], "2026-04-02": [...] }
 * 2. Flat array: [{ start, end }] (legacy, used with window_dates array)
 */
export function formatWindowSchedule(
  windowDates: string[] | null | undefined,
  windows: Record<string, TimeWindow[]> | TimeWindow[] | null | undefined,
): { date: string; label: string; windows: string[] }[] {
  if (!windowDates || !Array.isArray(windowDates) || windowDates.length === 0) return []

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const isPerDate = windows && !Array.isArray(windows) && typeof windows === 'object'
  const flatWindows = Array.isArray(windows) ? windows : []

  const results: { date: string; label: string; windows: string[] }[] = []

  for (const dateStr of windowDates) {
    const ds = String(dateStr)
    if (ds < todayStr) continue // skip past dates

    // Friendly label
    const [y, m, d] = ds.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    let label: string

    const diffDays = Math.round((dateObj.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
    if (diffDays === 0) label = 'Today'
    else if (diffDays === 1) label = 'Tomorrow'
    else label = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

    // Get windows for this specific date
    const dateWindows: TimeWindow[] = isPerDate
      ? ((windows as Record<string, TimeWindow[]>)[ds] || [])
      : flatWindows

    // Format time windows
    const windowStrs = dateWindows.map(w => {
      if (w.label) return w.label
      if (w.start && w.end) return `${to12h(w.start)} – ${to12h(w.end)}`
      if (w.start) return `from ${to12h(w.start)}`
      if (w.end) return `until ${to12h(w.end)}`
      return 'Any time'
    })

    if (windowStrs.length > 0) {
      results.push({ date: ds, label, windows: windowStrs })
    }
  }

  return results
}

/**
 * Compact single-line summary for cards.
 * e.g. "Today 4 PM – 6 PM · Tomorrow 4 PM – 6 PM"
 */
export function formatWindowSummary(
  windowDates: string[] | null | undefined,
  windows: Record<string, TimeWindow[]> | TimeWindow[] | null | undefined,
): string {
  const schedule = formatWindowSchedule(windowDates, windows)
  if (schedule.length === 0) return ''

  return schedule
    .slice(0, 2) // show at most 2 days
    .map(s => `${s.label} ${s.windows[0] || ''}`.trim())
    .join(' · ')
}

/**
 * Anonymize an address by removing the street number.
 * "1234 Oak Ave, San Jose, CA 95120" → "Near Oak Ave, San Jose, CA 95120"
 */
export function anonymizeAddress(address: string | null | undefined): string | null {
  if (!address) return null
  // Remove leading digits and any dash/space (e.g. "1234 Oak Ave" → "Oak Ave")
  const stripped = address.replace(/^\d+[-\s]*/, '').trim()
  if (!stripped || stripped === address) return null
  return `Near ${stripped}`
}
