import { EXHAUSTIVE_INTERESTS_CATALOG, InterestCatalogItem } from './interestCatalog'
import { extractBaseProduce, getProduceImage } from './produceCatalog'

export interface ProduceRowItem {
  id: string
  isSelected: boolean
  name: string
  category: string
  description: string
  quantity: string
  unit: string
  priceUsd: string
  isFree: boolean
  stockImage: string
  customPhotoDataUrl: string | null
  catalogItemId: string | null
}

export const ALLOWED_UNITS = [
  'each',
  'bunch',
  'dozen',
  'lb',
  'oz',
  'bag',
  'basket',
  'box',
  'pint',
  'quart',
  'jar',
  'loaf',
]

export const PRODUCE_CATEGORIES = [
  { id: 'produce', label: 'Vegetables & Produce' },
  { id: 'fruit', label: 'Fruit & Citrus' },
  { id: 'herbs', label: 'Herbs & Seasonings' },
  { id: 'flowers', label: 'Cut Flowers & Bouquets' },
  { id: 'honey', label: 'Honey & Hive Products' },
  { id: 'eggs', label: 'Pastured Fresh Eggs' },
  { id: 'seedlings', label: 'Seedlings & Starts' },
  { id: 'plants', label: 'Potted Garden Plants' },
]

export type FulfillmentPresetType = 'weekend_mornings' | 'weekday_evenings' | 'both' | 'custom'

export interface FulfillmentPresetOption {
  id: FulfillmentPresetType
  label: string
  desc: string
}

export const FULFILLMENT_PRESET_OPTIONS: FulfillmentPresetOption[] = [
  { id: 'both', label: '☀️ Both (Recommended)', desc: 'Mon–Fri 5pm–8pm & Sat–Sun 8am–12pm' },
  { id: 'weekday_evenings', label: '🌆 Weekday evenings', desc: 'Mon–Fri 5pm–8pm' },
  { id: 'weekend_mornings', label: '🌅 Weekend mornings', desc: 'Sat–Sun 8am–12pm' },
  { id: 'custom', label: '📅 Custom schedule', desc: 'Choose custom hours via weekly grid' },
]

export interface SchedulePreset {
  id: string
  label: string
  description: string
  days: string[]
  slots: string[]
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: 'weekday_evenings',
    label: 'Weekday Evenings',
    description: 'Mon–Fri, 4–6 PM & 6–8 PM',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    slots: ['16-18', '18-20'],
  },
  {
    id: 'weekday_mornings',
    label: 'Weekday Mornings',
    description: 'Mon–Fri, 8–10 AM & 10–12 PM',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    slots: ['8-10', '10-12'],
  },
  {
    id: 'weekend_mornings',
    label: 'Weekend Mornings',
    description: 'Sat–Sun, 8–10 AM & 10–12 PM',
    days: ['Saturday', 'Sunday'],
    slots: ['8-10', '10-12'],
  },
  {
    id: 'weekend_afternoons',
    label: 'Weekend Afternoons',
    description: 'Sat–Sun, 12–2 PM & 2–4 PM',
    days: ['Saturday', 'Sunday'],
    slots: ['12-14', '14-16'],
  },
]

/**
 * Converts selected schedule presets into a weekly windows dictionary { Day: ['slot1', 'slot2'] }
 */
export function buildWeeklyWindowsFromPresets(selectedPresetIds: string[]): Record<string, string[]> {
  const windows: Record<string, Set<string>> = {}

  for (const presetId of selectedPresetIds) {
    const preset = SCHEDULE_PRESETS.find(p => p.id === presetId)
    if (!preset) continue

    for (const day of preset.days) {
      if (!windows[day]) windows[day] = new Set()
      for (const slot of preset.slots) {
        windows[day]!.add(slot)
      }
    }
  }

  const result: Record<string, string[]> = {}
  for (const [day, slotSet] of Object.entries(windows)) {
    if (slotSet.size > 0) {
      result[day] = Array.from(slotSet)
    }
  }

  return result
}

/**
 * Generate 7-day calendar windows mapping for a specific preset
 */
export function getWindowsForPreset(preset: FulfillmentPresetType): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  if (preset === 'custom') return result

  const localToday = new Date()
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const day = d.getDay()
    const isWeekend = day === 0 || day === 6

    if (preset === 'weekend_mornings') {
      if (isWeekend) {
        result[dateStr] = ['8-10', '10-12']
      }
    } else if (preset === 'weekday_evenings') {
      if (!isWeekend) {
        result[dateStr] = ['16-18', '18-20']
      }
    } else if (preset === 'both') {
      if (isWeekend) {
        result[dateStr] = ['8-10', '10-12']
      } else {
        result[dateStr] = ['16-18', '18-20']
      }
    }
  }
  return result
}

/**
 * Checks if a specific hour is covered by any active slots (e.g. 16 is covered by '16-18')
 */
export function isHourSelected(hour: number, activeSlots: string[]): boolean {
  return (activeSlots || []).some(slotId => {
    const parts = slotId.split('-').map(Number)
    if (parts.length < 2) return false
    const start = parts[0]
    const end = parts[1]
    return hour >= start && hour < end
  })
}

/**
 * Toggles an hour cell inside the calendar grid
 */
export function toggleHourCell(
  dateStr: string,
  hour: number,
  windowsState: Record<string, string[]>,
  setWindowsState: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
) {
  setWindowsState(prev => {
    const activeSlots = prev[dateStr] || []
    const isSelected = isHourSelected(hour, activeSlots)

    let nextSlots: string[] = []

    if (isSelected) {
      // Remove hour from any slot that covers it
      for (const slotId of activeSlots) {
        const parts = slotId.split('-').map(Number)
        if (parts.length < 2) continue
        const start = parts[0]
        const end = parts[1]

        if (hour >= start && hour < end) {
          if (start < hour) {
            nextSlots.push(`${start}-${hour}`)
          }
          if (hour + 1 < end) {
            nextSlots.push(`${hour + 1}-${end}`)
          }
        } else {
          nextSlots.push(slotId)
        }
      }
    } else {
      // Add hour to slots and merge if contiguous
      nextSlots = [...activeSlots, `${hour}-${hour + 1}`]
    }

    return {
      ...prev,
      [dateStr]: nextSlots,
    }
  })
}

/**
 * Parses raw produce query parameter strings (comma, semicolon, pipe delimited or array)
 * into a clean list of individual produce names.
 */
export function parseProduceParams(paramValue: string | string[] | null | undefined): string[] {
  if (!paramValue) return []

  const rawList: string[] = []
  if (Array.isArray(paramValue)) {
    paramValue.forEach(item => {
      if (item && typeof item === 'string') {
        rawList.push(...item.split(/[,;|]/))
      }
    })
  } else if (typeof paramValue === 'string') {
    rawList.push(...paramValue.split(/[,;|]/))
  }

  const results: string[] = []
  const seen = new Set<string>()

  for (const item of rawList) {
    const cleaned = item.trim().replace(/_/g, ' ')
    if (cleaned.length > 0 && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase())
      // Format to title case
      const titleCased = cleaned.replace(/\b\w/g, l => l.toUpperCase())
      results.push(titleCased)
    }
  }

  return results
}

/**
 * Creates an interactive ProduceRowItem initialized from a produce name or catalog item.
 */
export function createRowFromProduceName(produceName: string, idPrefix: string = 'row'): ProduceRowItem {
  const cleanName = produceName ? produceName.trim() : ''
  const displayName = cleanName
    ? cleanName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : ''

  const matchedCatalogItem = displayName
    ? EXHAUSTIVE_INTERESTS_CATALOG.find(
        c => c.name.toLowerCase() === displayName.toLowerCase() || c.id.toLowerCase() === displayName.toLowerCase()
      )
    : null

  const base = displayName ? extractBaseProduce(displayName) : null

  const stockImg = displayName
    ? (matchedCatalogItem?.image || base?.image || '')
    : ''

  const unit = matchedCatalogItem?.unit && ALLOWED_UNITS.includes(matchedCatalogItem.unit)
    ? matchedCatalogItem.unit
    : (base?.unit && ALLOWED_UNITS.includes(base.unit) ? base.unit : 'lb')

  return {
    id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    isSelected: false,
    name: displayName,
    category: matchedCatalogItem?.category || base?.category || 'produce',
    description: displayName
      ? `Fresh homegrown ${displayName.replace(/^fresh\s+/i, '')}`
      : '',
    quantity: '',
    unit,
    priceUsd: '',
    isFree: false,
    stockImage: stockImg,
    customPhotoDataUrl: null,
    catalogItemId: matchedCatalogItem?.id || base?.id || null,
  }
}
