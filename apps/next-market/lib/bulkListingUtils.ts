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
  harvestedAt?: string | null
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
  { id: 'produce', label: '🥬 Produce' },
  { id: 'flowers', label: '🌸 Flowers' },
  { id: 'flower_arrangements', label: '💐 Flower Arrangements' },
  { id: 'garden_equipment', label: '🧰 Garden Equipment' },
  { id: 'pots', label: '🪴 Pots' },
  { id: 'soil', label: '🪨 Soil' },
  { id: 'seeds', label: '🌱 Seeds' },
  { id: 'eggs', label: '🥚 Eggs' },
  { id: 'honey', label: '🍯 Honey' },
  { id: 'plants', label: '📦 Plants' },
  { id: 'seedlings', label: '📦 Seedlings' },
]

export type FulfillmentPresetType = 'weekend_mornings' | 'weekday_evenings' | 'both' | 'custom' | 'city_market_day'

export interface FulfillmentPresetOption {
  id: FulfillmentPresetType
  label: string
  desc: string
}

export const FULFILLMENT_PRESET_OPTIONS: FulfillmentPresetOption[] = [
  { id: 'weekday_evenings', label: '🌆 Weekday evenings', desc: 'Mon–Fri 5pm–8pm' },
  { id: 'weekend_mornings', label: '🌅 Weekend mornings', desc: 'Sat–Sun 8am–12pm' },
  { id: 'both', label: '☀️ Both (Recommended)', desc: 'Mon–Fri 5pm–8pm & Sat–Sun 8am–12pm' },
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
 * Generate 7-day calendar windows mapping for a specific CityMarketSchedule
 */
export function getWindowsForCitySchedule(
  schedule: any,
  mode: 'pickup' | 'delivery' = 'pickup'
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  if (!schedule) return result
  const targetWindows = mode === 'pickup' ? schedule.default_pickup_windows : schedule.default_delivery_windows
  if (!targetWindows || !targetWindows.length) return result

  const localToday = new Date()
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

    if (Array.isArray(schedule.market_days) && schedule.market_days.map((m: string) => m.toLowerCase()).includes(weekday)) {
      targetWindows.forEach((w: any) => {
        if (w.day.toLowerCase() === weekday) {
          const startH = parseInt(w.start_time.split(':')[0], 10)
          const endH = parseInt(w.end_time.split(':')[0], 10)
          const slot = `${startH}-${endH}`
          if (!result[dateStr]) result[dateStr] = []
          if (!result[dateStr].includes(slot)) result[dateStr].push(slot)
        }
      })
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
/**
 * Automated inference engine for standard supermarket and farmers market
 * pricing and packaging units for any produce, herb, egg, or garden product.
 */
export function inferProduceUnitAndPrice(produceName: string): { unit: string; price: string } {
  const norm = produceName.toLowerCase().replace(/[_-]/g, ' ').trim()

  // 1. Eggs / Poultry
  if (/\b(egg|eggs|dozen)\b/.test(norm)) {
    if (/duck|goose/.test(norm)) return { unit: 'dozen', price: '8.00' }
    if (/quail/.test(norm)) return { unit: 'dozen', price: '5.00' }
    return { unit: 'dozen', price: '6.00' }
  }

  // 2. Bakery / Loaves
  if (/\b(bread|loaf|sourdough|baguette|focaccia|brioche|cake)\b/.test(norm)) {
    return { unit: 'loaf', price: '8.00' }
  }

  // 3. Honey / Preserves / Jams / Sauces
  if (/\b(honey|honeycomb|jam|jelly|marmalade|preserve|preserves|syrup|sauce|butter|pesto|salsa)\b/.test(norm)) {
    if (/comb/.test(norm)) return { unit: 'box', price: '15.00' }
    return { unit: 'jar', price: '12.00' }
  }

  // 4. Flowers / Bouquets
  if (/\b(flower|flowers|bouquet|sunflower|sunflowers|dahlia|dahlias|zinnia|zinnias|rose|roses|tulip|tulips)\b/.test(norm)) {
    return { unit: 'bunch', price: '10.00' }
  }

  // 5. Herbs & Leafy Bunches
  if (/\b(basil|mint|rosemary|thyme|parsley|cilantro|oregano|sage|chive|chives|dill|lavender|tarragon|lemongrass|kale|chard|collard|collards|scallion|scallions|green onion|green onions|carrot|carrots|beet|beets|radish|radishes|asparagus)\b/.test(norm)) {
    return { unit: 'bunch', price: '2.00' }
  }

  // 6. Berries (Strawberries, Blueberries, Blackberries, Raspberries)
  if (/\b(blueberry|blueberries|strawberry|strawberries|blackberry|blackberries|raspberry|raspberries|cranberry|cranberries|mulberry|mulberries|gooseberry|gooseberries|boysenberry|boysenberries|berry|berries|cherry|cherries)\b/.test(norm)) {
    return { unit: 'lb', price: '5.00' }
  }

  // 7. Small Portioned / Microgreens / Dried Herbs / Teas
  if (/\b(microgreen|microgreens|shoot|shoots|sprout|sprouts|tea|spice|seasoning|saffron)\b/.test(norm)) {
    return { unit: 'oz', price: '3.00' }
  }

  // 8. Individual Unit Produce (Sold Per Piece / Each)
  if (/\b(cucumber|cucumbers|avocado|avocados|bell pepper|bell peppers|pepper|peppers|watermelon|watermelons|cantaloupe|cantaloupes|melon|melons|honeydew|pumpkin|pumpkins|squash|eggplant|eggplants|cabbage|cabbages|cauliflower|cauliflowers|broccoli|lettuce|garlic|mango|mangoes|papaya|papayas|pomegranate|pomegranates|seedling|seedlings|sapling|saplings|plant|plants)\b/.test(norm)) {
    if (/seedling/.test(norm)) return { unit: 'each', price: '4.00' }
    if (/sapling|tree/.test(norm)) return { unit: 'each', price: '25.00' }
    if (/watermelon|pumpkin/.test(norm)) return { unit: 'each', price: '5.00' }
    if (/melon|cantaloupe|honeydew/.test(norm)) return { unit: 'each', price: '4.00' }
    if (/cucumber|garlic/.test(norm)) return { unit: 'each', price: '1.00' }
    if (/pepper|avocado|pomegranate|mango/.test(norm)) return { unit: 'each', price: '1.50' }
    return { unit: 'each', price: '2.00' }
  }

  // 8b. Small fruits / citrus sold by dozen or lb (not practical as 'each')
  if (/\b(lemon|lemons|lime|limes|corn|sweet corn)\b/.test(norm)) {
    if (/corn/.test(norm)) return { unit: 'dozen', price: '6.00' }
    return { unit: 'dozen', price: '4.00' }
  }
  if (/\b(persimmon|persimmons|passionfruit|guava|guavas)\b/.test(norm)) {
    if (/passionfruit/.test(norm)) return { unit: 'lb', price: '5.00' }
    if (/guava/.test(norm)) return { unit: 'lb', price: '3.50' }
    return { unit: 'lb', price: '3.50' }
  }


  // 9. Standard Bulk Pound Produce (Apples, Pears, Peaches, Citrus by lb, Potatoes, Tomatoes, etc.)
  if (/\b(apple|apples|pear|pears|peach|peaches|nectarine|nectarines|plum|plums|grape|grapes|fig|figs|orange|oranges|tangerine|tangerines|mandarin|mandarins|tomato|tomatoes|potato|potatoes|sweet potato|sweet potatoes|onion|onions|zucchini|green bean|green beans|bean|beans|pea|peas|spinach|okra|kumquat|kumquats)\b/.test(norm)) {
    if (/tomato|figs|spinach|beans|peas|okra|kumquat/.test(norm)) return { unit: 'lb', price: '3.50' }
    if (/potato|onion/.test(norm)) return { unit: 'lb', price: '1.50' }
    return { unit: 'lb', price: '2.50' }
  }

  // Default fallback for any unspecified produce
  return { unit: 'lb', price: '3.00' }
}

/**
 * Converts a price from one unit to another.
 * e.g. convertPrice(0.22, 'each', 'dozen') → 2.64
 * Used when Kroger/USDA returns a per-item price and we need it for the row's unit,
 * or when the user changes unit and we need to re-price.
 */
export function convertPrice(price: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit || price <= 0) return price

  // Normalize everything to per-each first, then convert to target
  const toEach: Record<string, number> = {
    'each': 1,
    'dozen': 12,
    'lb': 4,       // ~4 items per lb for typical produce
    'oz': 0.25,    // ~4 oz per item
    'bunch': 6,    // ~6 stems per bunch
    'bag': 8,      // ~8 items per bag
    'basket': 6,   // ~6 items per basket
    'box': 12,     // ~12 items per box
    'pint': 2,     // ~2 cups / items
    'quart': 4,    // ~4 cups / items
    'jar': 1,
    'loaf': 1,
  }

  const fromFactor = toEach[fromUnit] ?? 1
  const toFactor = toEach[toUnit] ?? 1

  // Convert: price / fromFactor gives per-each, then × toFactor gives target unit
  const perEach = price / fromFactor
  return Math.round(perEach * toFactor * 100) / 100
}

/**
 * Normalizes a produce name to all matching key variations (base name, singular, plural, without descriptors)
 * e.g. "Meyer Lemons" → ["meyer lemons", "lemons", "lemon", "meyer lemon"]
 * "Heirloom Tomatoes" → ["heirloom tomatoes", "tomatoes", "tomato", "heirloom tomato"]
 * "Fresh Sweet Basil" → ["fresh sweet basil", "basil", "basils"]
 */
export function normalizeProduceKey(name: string): string[] {
  if (!name) return []
  const clean = name.toLowerCase().trim()
  const keys = new Set<string>()

  const addWordForms = (phrase: string) => {
    if (!phrase) return
    keys.add(phrase)

    // Handle plurals/singulars for the phrase and individual words
    if (phrase.endsWith('ies')) {
      keys.add(phrase.slice(0, -3) + 'y')
    } else if (phrase.endsWith('oes')) {
      keys.add(phrase.slice(0, -2)) // tomatoes -> tomato
    } else if (phrase.endsWith('es') && (phrase.endsWith('ches') || phrase.endsWith('shes') || phrase.endsWith('xes'))) {
      keys.add(phrase.slice(0, -2)) // peaches -> peach
    } else if (phrase.endsWith('s') && !phrase.endsWith('ss')) {
      keys.add(phrase.slice(0, -1))
    } else {
      keys.add(phrase + 's')
      if (phrase.endsWith('o') || phrase.endsWith('ch') || phrase.endsWith('sh')) {
        keys.add(phrase + 'es')
      }
    }
  }

  addWordForms(clean)

  const base = clean
    .replace(/\b(fresh|organic|raw|homegrown|sweet|meyer|heirloom|farm|wildflower|bunch|local|ripe|hass|valencia)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (base && base !== clean) {
    addWordForms(base)
  }

  return Array.from(keys).filter(k => k.length > 1)
}




export function createRowFromProduceName(produceName: string, idPrefix: string = 'row'): ProduceRowItem {
  const cleanName = produceName ? produceName.trim() : ''
  const displayName = cleanName
    ? cleanName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : ''

  // 1. Direct or fuzzy catalog match
  const searchKey = displayName.toLowerCase()
  const matchedCatalogItem = displayName
    ? EXHAUSTIVE_INTERESTS_CATALOG.find(
        c => c.name.toLowerCase() === searchKey || 
             c.id.toLowerCase() === searchKey ||
             searchKey.includes(c.id.toLowerCase()) ||
             c.name.toLowerCase().includes(searchKey)
      )
    : null

  const base = displayName ? extractBaseProduce(displayName) : null
  const stockImg = displayName ? (matchedCatalogItem?.image || base?.image || '') : ''

  // 2. Intelligent inference fallback
  const inferred = inferProduceUnitAndPrice(displayName || cleanName)

  const rawUnit = matchedCatalogItem?.defaultUnit || matchedCatalogItem?.unit || base?.unit || inferred.unit
  const unit = ALLOWED_UNITS.includes(rawUnit) ? rawUnit : inferred.unit

  const defaultPrice = matchedCatalogItem?.defaultPrice 
    ? matchedCatalogItem.defaultPrice.toFixed(2)
    : inferred.price

  return {
    id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    isSelected: false,
    name: displayName,
    category: matchedCatalogItem?.category || base?.category || 'produce',
    description: displayName
      ? `Fresh homegrown ${displayName.replace(/^fresh\s+/i, '')}`
      : '',
    quantity: '5', // Pre-fill with sensible default
    unit,
    priceUsd: defaultPrice,
    isFree: false,
    stockImage: stockImg,
    customPhotoDataUrl: null,
    catalogItemId: matchedCatalogItem?.id || base?.id || null,
  }
}
