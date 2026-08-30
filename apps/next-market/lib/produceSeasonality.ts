/**
 * Produce Seasonality Calculation Engine
 * Evaluates whether a produce crop is in harvest/growing season for given US states or ZIP codes.
 * Reuses the canonical harvest windows from `produce_seasonal_harvest_windows`.
 */

export interface HarvestWindow {
  produce_name: string
  state_code: string // 2-letter US state or 'US_DEFAULT'
  harvest_start_month: number // 1 - 12
  harvest_end_month: number // 1 - 12
  pre_season_month?: number // 1 - 12
}

/**
 * Standard baseline US default harvest windows when database records are loading or offline
 */
export const DEFAULT_HARVEST_WINDOWS: HarvestWindow[] = [
  // Citrus (Winter / Spring)
  { produce_name: 'lemons', state_code: 'US_DEFAULT', harvest_start_month: 11, harvest_end_month: 4, pre_season_month: 10 },
  { produce_name: 'lemons', state_code: 'CA', harvest_start_month: 11, harvest_end_month: 4, pre_season_month: 10 },
  { produce_name: 'lemons', state_code: 'FL', harvest_start_month: 10, harvest_end_month: 3, pre_season_month: 9 },
  { produce_name: 'meyer lemons', state_code: 'US_DEFAULT', harvest_start_month: 11, harvest_end_month: 4, pre_season_month: 10 },
  { produce_name: 'meyer lemons', state_code: 'CA', harvest_start_month: 11, harvest_end_month: 4, pre_season_month: 10 },
  { produce_name: 'oranges', state_code: 'US_DEFAULT', harvest_start_month: 12, harvest_end_month: 5, pre_season_month: 11 },
  { produce_name: 'oranges', state_code: 'CA', harvest_start_month: 12, harvest_end_month: 5, pre_season_month: 11 },
  { produce_name: 'oranges', state_code: 'FL', harvest_start_month: 11, harvest_end_month: 4, pre_season_month: 10 },
  { produce_name: 'valencia oranges', state_code: 'US_DEFAULT', harvest_start_month: 3, harvest_end_month: 7, pre_season_month: 2 },
  { produce_name: 'valencia oranges', state_code: 'CA', harvest_start_month: 3, harvest_end_month: 7, pre_season_month: 2 },
  { produce_name: 'limes', state_code: 'US_DEFAULT', harvest_start_month: 5, harvest_end_month: 10, pre_season_month: 4 },
  { produce_name: 'limes', state_code: 'CA', harvest_start_month: 5, harvest_end_month: 10, pre_season_month: 4 },
  { produce_name: 'grapefruit', state_code: 'US_DEFAULT', harvest_start_month: 11, harvest_end_month: 5, pre_season_month: 10 },
  { produce_name: 'mandarins', state_code: 'US_DEFAULT', harvest_start_month: 11, harvest_end_month: 3, pre_season_month: 10 },

  // Warm Season Vegetables & Herbs (Summer / Early Fall)
  { produce_name: 'tomatoes', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 10, pre_season_month: 6 },
  { produce_name: 'tomatoes', state_code: 'CA', harvest_start_month: 6, harvest_end_month: 10, pre_season_month: 5 },
  { produce_name: 'tomatoes', state_code: 'NY', harvest_start_month: 7, harvest_end_month: 10, pre_season_month: 6 },
  { produce_name: 'heirloom tomatoes', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 10, pre_season_month: 6 },
  { produce_name: 'heirloom tomatoes', state_code: 'CA', harvest_start_month: 6, harvest_end_month: 10, pre_season_month: 5 },
  { produce_name: 'cherry tomatoes', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 10, pre_season_month: 6 },
  { produce_name: 'peppers', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 10, pre_season_month: 6 },
  { produce_name: 'peppers', state_code: 'CA', harvest_start_month: 6, harvest_end_month: 10, pre_season_month: 5 },
  { produce_name: 'bell peppers', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 10, pre_season_month: 6 },
  { produce_name: 'cucumbers', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
  { produce_name: 'cucumbers', state_code: 'CA', harvest_start_month: 5, harvest_end_month: 9, pre_season_month: 4 },
  { produce_name: 'zucchini', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
  { produce_name: 'zucchini', state_code: 'CA', harvest_start_month: 5, harvest_end_month: 9, pre_season_month: 4 },
  { produce_name: 'squash', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 10, pre_season_month: 5 },
  { produce_name: 'eggplant', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 10, pre_season_month: 6 },
  { produce_name: 'corn', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 9, pre_season_month: 6 },
  { produce_name: 'sweet corn', state_code: 'US_DEFAULT', harvest_start_month: 7, harvest_end_month: 9, pre_season_month: 6 },
  { produce_name: 'basil', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
  { produce_name: 'fresh sweet basil', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },

  // Stone Fruit & Orchard (Summer / Autumn)
  { produce_name: 'peaches', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
  { produce_name: 'peaches', state_code: 'CA', harvest_start_month: 5, harvest_end_month: 9, pre_season_month: 4 },
  { produce_name: 'peaches', state_code: 'GA', harvest_start_month: 5, harvest_end_month: 8, pre_season_month: 4 },
  { produce_name: 'nectarines', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
  { produce_name: 'plums', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
  { produce_name: 'cherries', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 8, pre_season_month: 5 },
  { produce_name: 'cherries', state_code: 'CA', harvest_start_month: 4, harvest_end_month: 6, pre_season_month: 3 },
  { produce_name: 'cherries', state_code: 'WA', harvest_start_month: 6, harvest_end_month: 8, pre_season_month: 5 },
  { produce_name: 'figs', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 10, pre_season_month: 5 },
  { produce_name: 'fresh figs', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 10, pre_season_month: 5 },
  { produce_name: 'apples', state_code: 'US_DEFAULT', harvest_start_month: 8, harvest_end_month: 11, pre_season_month: 7 },
  { produce_name: 'pears', state_code: 'US_DEFAULT', harvest_start_month: 8, harvest_end_month: 11, pre_season_month: 7 },
  { produce_name: 'persimmons', state_code: 'US_DEFAULT', harvest_start_month: 9, harvest_end_month: 12, pre_season_month: 8 },
  { produce_name: 'pomegranates', state_code: 'US_DEFAULT', harvest_start_month: 9, harvest_end_month: 12, pre_season_month: 8 },
  { produce_name: 'avocados', state_code: 'US_DEFAULT', harvest_start_month: 3, harvest_end_month: 8, pre_season_month: 2 },
  { produce_name: 'avocados', state_code: 'CA', harvest_start_month: 1, harvest_end_month: 9, pre_season_month: 12 },
  { produce_name: 'hass avocados', state_code: 'US_DEFAULT', harvest_start_month: 3, harvest_end_month: 8, pre_season_month: 2 },
  { produce_name: 'hass avocados', state_code: 'CA', harvest_start_month: 1, harvest_end_month: 9, pre_season_month: 12 },

  // Berries (Spring / Summer)
  { produce_name: 'strawberries', state_code: 'US_DEFAULT', harvest_start_month: 4, harvest_end_month: 7, pre_season_month: 3 },
  { produce_name: 'strawberries', state_code: 'CA', harvest_start_month: 2, harvest_end_month: 10, pre_season_month: 1 },
  { produce_name: 'strawberries', state_code: 'FL', harvest_start_month: 12, harvest_end_month: 4, pre_season_month: 11 },
  { produce_name: 'blueberries', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 8, pre_season_month: 5 },
  { produce_name: 'blackberries', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 8, pre_season_month: 5 },
  { produce_name: 'raspberries', state_code: 'US_DEFAULT', harvest_start_month: 6, harvest_end_month: 9, pre_season_month: 5 },
]

/**
 * Maps 3-digit US ZIP prefixes to standard 2-letter state codes.
 */
export function inferStateFromZip(zip?: string): string {
  if (!zip || typeof zip !== 'string') return 'US_DEFAULT'
  const clean = zip.trim()
  if (clean.length < 3) return 'US_DEFAULT'
  const prefix = parseInt(clean.slice(0, 3), 10)
  if (isNaN(prefix)) return 'US_DEFAULT'

  // US ZIP prefix to State mappings
  if (prefix >= 10 && prefix <= 27) return 'MA'
  if (prefix >= 28 && prefix <= 29) return 'RI'
  if (prefix >= 30 && prefix <= 38) return 'NH'
  if (prefix >= 39 && prefix <= 49) return 'ME'
  if (prefix >= 50 && prefix <= 59) return 'VT'
  if (prefix >= 60 && prefix <= 69) return 'CT'
  if (prefix >= 70 && prefix <= 89) return 'NJ'
  if (prefix >= 100 && prefix <= 149) return 'NY'
  if (prefix >= 150 && prefix <= 196) return 'PA'
  if (prefix >= 197 && prefix <= 199) return 'DE'
  if (prefix >= 200 && prefix <= 205) return 'DC'
  if (prefix >= 206 && prefix <= 219) return 'MD'
  if (prefix >= 220 && prefix <= 246) return 'VA'
  if (prefix >= 247 && prefix <= 268) return 'WV'
  if (prefix >= 270 && prefix <= 289) return 'NC'
  if (prefix >= 290 && prefix <= 299) return 'SC'
  if (prefix >= 300 && prefix <= 319) return 'GA'
  if (prefix >= 320 && prefix <= 349) return 'FL'
  if (prefix >= 350 && prefix <= 369) return 'AL'
  if (prefix >= 370 && prefix <= 385) return 'TN'
  if (prefix >= 386 && prefix <= 397) return 'MS'
  if (prefix >= 400 && prefix <= 427) return 'KY'
  if (prefix >= 430 && prefix <= 458) return 'OH'
  if (prefix >= 460 && prefix <= 479) return 'IN'
  if (prefix >= 480 && prefix <= 499) return 'MI'
  if (prefix >= 500 && prefix <= 528) return 'IA'
  if (prefix >= 530 && prefix <= 549) return 'WI'
  if (prefix >= 550 && prefix <= 567) return 'MN'
  if (prefix >= 570 && prefix <= 577) return 'SD'
  if (prefix >= 580 && prefix <= 588) return 'ND'
  if (prefix >= 590 && prefix <= 599) return 'MT'
  if (prefix >= 600 && prefix <= 629) return 'IL'
  if (prefix >= 630 && prefix <= 658) return 'MO'
  if (prefix >= 660 && prefix <= 679) return 'KS'
  if (prefix >= 680 && prefix <= 693) return 'NE'
  if (prefix >= 700 && prefix <= 714) return 'LA'
  if (prefix >= 716 && prefix <= 729) return 'AR'
  if (prefix >= 730 && prefix <= 749) return 'OK'
  if (prefix >= 750 && prefix <= 799) return 'TX'
  if (prefix >= 800 && prefix <= 816) return 'CO'
  if (prefix >= 820 && prefix <= 831) return 'WY'
  if (prefix >= 832 && prefix <= 838) return 'ID'
  if (prefix >= 840 && prefix <= 847) return 'UT'
  if (prefix >= 850 && prefix <= 865) return 'AZ'
  if (prefix >= 870 && prefix <= 884) return 'NM'
  if (prefix >= 889 && prefix <= 898) return 'NV'
  if (prefix >= 900 && prefix <= 961) return 'CA'
  if (prefix >= 967 && prefix <= 968) return 'HI'
  if (prefix >= 970 && prefix <= 979) return 'OR'
  if (prefix >= 980 && prefix <= 994) return 'WA'
  if (prefix >= 995 && prefix <= 999) return 'AK'

  return 'US_DEFAULT'
}

/**
 * Normalizes produce name for calendar lookup (e.g. "Fresh Sweet Basil" -> "basil").
 */
export function normalizeProduceForSeason(name: string): string {
  const norm = (name || '').toLowerCase().trim()
  if (norm.includes('lemon')) return 'lemons'
  if (norm.includes('orange')) return norm.includes('valencia') ? 'valencia oranges' : 'oranges'
  if (norm.includes('lime')) return 'limes'
  if (norm.includes('grapefruit')) return 'grapefruit'
  if (norm.includes('mandarin') || norm.includes('tangerine') || norm.includes('clementine')) return 'mandarins'
  if (norm.includes('tomato')) return norm.includes('heirloom') ? 'heirloom tomatoes' : (norm.includes('cherry') ? 'cherry tomatoes' : 'tomatoes')
  if (norm.includes('pepper')) return 'peppers'
  if (norm.includes('cucumber')) return 'cucumbers'
  if (norm.includes('zucchini')) return 'zucchini'
  if (norm.includes('squash')) return 'squash'
  if (norm.includes('eggplant')) return 'eggplant'
  if (norm.includes('corn')) return 'sweet corn'
  if (norm.includes('basil')) return 'basil'
  if (norm.includes('peach')) return 'peaches'
  if (norm.includes('nectarine')) return 'nectarines'
  if (norm.includes('plum')) return 'plums'
  if (norm.includes('cherry') || norm.includes('cherries')) return 'cherries'
  if (norm.includes('fig')) return 'figs'
  if (norm.includes('apple')) return 'apples'
  if (norm.includes('pear')) return 'pears'
  if (norm.includes('persimmon')) return 'persimmons'
  if (norm.includes('pomegranate')) return 'pomegranates'
  if (norm.includes('avocado')) return 'avocados'
  if (norm.includes('strawberry') || norm.includes('strawberries')) return 'strawberries'
  if (norm.includes('blueberry') || norm.includes('blueberries')) return 'blueberries'
  if (norm.includes('blackberry') || norm.includes('blackberries')) return 'blackberries'
  if (norm.includes('raspberry') || norm.includes('raspberries')) return 'raspberries'
  return norm
}

/**
 * Checks if a specific month falls within a harvest start and end range.
 * Supports cross-year windows (e.g. November to April: 11 to 4).
 */
export function isMonthInHarvestWindow(month: number, startMonth: number, endMonth: number): boolean {
  if (startMonth <= endMonth) {
    // Normal single-year window (e.g. 6 to 9)
    return month >= startMonth && month <= endMonth
  } else {
    // Cross-year window (e.g. 11 to 4 -> 11, 12, 1, 2, 3, 4)
    return month >= startMonth || month <= endMonth
  }
}

export type GeoLocationInput =
  | string // State code or single ZIP
  | Array<{ zip: string; state?: string }> // Array of ZIP details

/**
 * Evaluates whether a produce crop is in season for the given locations during a specific month.
 *
 * @param produceName Canonical or user produce name
 * @param locationInput State string or array of { zip, state }
 * @param month 1-12 integer (defaults to current calendar month)
 * @param customWindows Optional harvest windows array (from DB or default)
 */
export function isProduceInSeason(
  produceName: string,
  locationInput: GeoLocationInput = 'US_DEFAULT',
  month = new Date().getMonth() + 1,
  customWindows: HarvestWindow[] = DEFAULT_HARVEST_WINDOWS
): boolean {
  const normCrop = normalizeProduceForSeason(produceName)
  const allWindows = customWindows && customWindows.length > 0 ? customWindows : DEFAULT_HARVEST_WINDOWS

  // 1. Determine list of states to check against
  const statesToCheck = new Set<string>()

  if (typeof locationInput === 'string') {
    const clean = locationInput.trim().toUpperCase()
    if (clean.length === 2 && !clean.match(/^\d+$/)) {
      statesToCheck.add(clean)
    } else if (clean.length >= 3) {
      statesToCheck.add(inferStateFromZip(clean))
    } else {
      statesToCheck.add('US_DEFAULT')
    }
  } else if (Array.isArray(locationInput)) {
    if (locationInput.length === 0) {
      statesToCheck.add('US_DEFAULT')
    } else {
      for (const item of locationInput) {
        if (item.state && item.state.trim().length === 2) {
          statesToCheck.add(item.state.trim().toUpperCase())
        } else if (item.zip) {
          statesToCheck.add(inferStateFromZip(item.zip))
        }
      }
    }
  }

  if (statesToCheck.size === 0) {
    statesToCheck.add('US_DEFAULT')
  }

  // 2. For each relevant state, find the best matching harvest window
  for (const state of Array.from(statesToCheck)) {
    // Look for state-specific rule first
    let window = allWindows.find(
      w =>
        w.produce_name.toLowerCase() === normCrop &&
        w.state_code.toUpperCase() === state
    )

    // Fall back to US_DEFAULT for this crop
    if (!window) {
      window = allWindows.find(
        w =>
          w.produce_name.toLowerCase() === normCrop &&
          (w.state_code.toUpperCase() === 'US_DEFAULT' || w.state_code.toUpperCase() === 'US')
      )
    }

    // If still not found, try partial match
    if (!window) {
      window = allWindows.find(
        w =>
          (normCrop.includes(w.produce_name.toLowerCase()) || w.produce_name.toLowerCase().includes(normCrop)) &&
          w.state_code.toUpperCase() === state
      )
    }
    if (!window) {
      window = allWindows.find(
        w =>
          (normCrop.includes(w.produce_name.toLowerCase()) || w.produce_name.toLowerCase().includes(normCrop)) &&
          (w.state_code.toUpperCase() === 'US_DEFAULT' || w.state_code.toUpperCase() === 'US')
      )
    }

    // If an uncataloged crop has no window recorded anywhere, default to permissive (true)
    if (!window) {
      return true
    }

    // Check if the month is in season for this state
    if (isMonthInHarvestWindow(month, window.harvest_start_month, window.harvest_end_month)) {
      return true
    }
  }

  // If checked all relevant states and none are in season during this month
  return false
}
