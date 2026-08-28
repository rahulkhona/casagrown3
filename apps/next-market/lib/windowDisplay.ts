import { isPublicLandmark } from './landmarks'

/**
 * Window display utilities for showing fulfillment windows as compact pills,
 * matching the creation-form style (e.g. "4–6p", "6–8p").
 *
 * Product windows are stored as per-date objects:
 * { "2026-04-01": [{ id: "16-18", start: "16:00", end: "18:00" }] }
 */

/** Map from slot ID to the compact label used in the creation form */
const SLOT_LABELS: Record<string, string> = {
  '8-10':  '8–10a',
  '10-12': '10–12p',
  '12-14': '12–2p',
  '14-16': '2–4p',
  '16-18': '4–6p',
  '18-20': '6–8p',
}

interface TimeWindow {
  id?: string
  start?: string   // "16:00" (24h)
  end?: string     // "18:00" (24h)
  label?: string
}

/** Convert 24h "16:00" to compact "4p" or "4:30p" */
function toCompact12h(time: string): string {
  if (!time) return ''
  const [hStr, mStr] = time.split(':')
  let h = parseInt(hStr, 10)
  const m = parseInt(mStr || '0', 10)
  const period = h >= 12 ? 'p' : 'a'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return m > 0 ? `${h}:${String(m).padStart(2, '0')}${period}` : `${h}${period}`
}

export interface WindowDay {
  date: string        // "2026-04-01"
  label: string       // "Today (Apr 1)" or "Tomorrow (Apr 2)" or "Wed, Apr 3"
  pills: string[]     // ["4–6p", "6–8p"]
}

/**
 * Parse per-date windows into an array of days with compact pill labels.
 * Only includes current and future dates.
 */
export function getWindowDays(
  windowDates: string[] | null | undefined,
  windows: Record<string, TimeWindow[]> | TimeWindow[] | null | undefined,
): WindowDay[] {
  if (!windowDates || !Array.isArray(windowDates) || windowDates.length === 0) return []

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const isPerDate = windows && !Array.isArray(windows) && typeof windows === 'object'
  const flatWindows = Array.isArray(windows) ? windows : []

  const results: WindowDay[] = []

  for (const dateStr of windowDates) {
    const ds = String(dateStr)
    if (ds < todayStr) continue

    // Build label: "Today (Apr 1)" or "Tomorrow (Apr 2)" or "Wed, Apr 3"
    const [y, m, d] = ds.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const diffDays = Math.round((dateObj.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)

    let label: string
    if (diffDays === 0) label = `Today (${shortDate})`
    else if (diffDays === 1) label = `Tomorrow (${shortDate})`
    else label = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

    // Get windows for this date
    const dateWindows: TimeWindow[] = isPerDate
      ? ((windows as Record<string, TimeWindow[]>)[ds] || [])
      : flatWindows

    // Convert to pill labels
    const pills = dateWindows.map(w => {
      // Use known slot label if ID matches
      if (w.id && SLOT_LABELS[w.id]) return SLOT_LABELS[w.id]
      // Custom slot — build compact label
      if (w.start && w.end) return `${toCompact12h(w.start)}–${toCompact12h(w.end)}`
      if (w.label) return w.label
      return 'Any time'
    })

    if (pills.length > 0) {
      results.push({ date: ds, label, pills })
    }
  }

  return results
}

/**
 * Anonymize an address by removing the street number.
 * "1234 Oak Ave, San Jose, CA 95120" → "Near Oak Ave, San Jose, CA 95120"
 * Public landmarks (e.g. "Willow Glen Community Center, 2175 Lincoln Ave") are preserved in full.
 */
export function anonymizeAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const trimmed = address.trim()
  if (!trimmed) return null

  // Public landmarks are public facilities and should not have house numbers stripped
  if (isPublicLandmark(trimmed)) {
    return trimmed
  }

  const stripped = trimmed.replace(/^\d+[-\s]*/, '').trim()
  if (!stripped || stripped === trimmed) return null
  return `Near ${stripped}`
}
