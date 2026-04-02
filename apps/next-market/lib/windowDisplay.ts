/**
 * formatWindowSchedule — Renders product fulfillment windows as a human-readable
 * compact summary, e.g.: "Today 10 AM – 12 PM · Tomorrow 2 PM – 4 PM"
 */

interface TimeWindow {
  start?: string   // e.g. "9:00 AM"
  end?: string     // e.g. "12:00 PM"
  label?: string   // e.g. "Morning"
}

/**
 * Format window dates + time windows into a compact schedule string.
 * Returns an array of { date: string, label: string, windows: string[] }
 * for rendering in the UI.
 */
export function formatWindowSchedule(
  windowDates: string[] | null | undefined,
  windows: TimeWindow[] | null | undefined,
): { date: string; label: string; windows: string[] }[] {
  if (!windowDates || !Array.isArray(windowDates) || windowDates.length === 0) return []

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

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

    // Format time windows
    const safeWindows = Array.isArray(windows) ? windows : []
    const windowStrs = safeWindows.map(w => {
      if (w.label) return w.label
      if (w.start && w.end) return `${w.start} – ${w.end}`
      if (w.start) return `from ${w.start}`
      if (w.end) return `until ${w.end}`
      return 'All day'
    })

    results.push({ date: ds, label, windows: windowStrs.length > 0 ? windowStrs : ['Any time'] })
  }

  return results
}

/**
 * Compact single-line summary for cards.
 * e.g. "Today 10 AM – 12 PM · Tomorrow 2 PM – 4 PM"
 */
export function formatWindowSummary(
  windowDates: string[] | null | undefined,
  windows: TimeWindow[] | null | undefined,
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
