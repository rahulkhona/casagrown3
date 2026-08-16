import { describe, it, expect } from 'vitest'
import {
  isProduceInSeason,
  isMonthInHarvestWindow,
  inferStateFromZip,
  normalizeProduceForSeason,
  DEFAULT_HARVEST_WINDOWS,
} from '../lib/produceSeasonality'

describe('Produce Seasonality Engine', () => {
  it('correctly maps 3-digit ZIP prefixes to standard US state codes', () => {
    expect(inferStateFromZip('95125')).toBe('CA')
    expect(inferStateFromZip('94024')).toBe('CA')
    expect(inferStateFromZip('10001')).toBe('NY')
    expect(inferStateFromZip('33101')).toBe('FL')
    expect(inferStateFromZip('75001')).toBe('TX')
    expect(inferStateFromZip('98101')).toBe('WA')
    expect(inferStateFromZip('30301')).toBe('GA')
    expect(inferStateFromZip('invalid')).toBe('US_DEFAULT')
    expect(inferStateFromZip('')).toBe('US_DEFAULT')
  })

  it('normalizes various produce descriptions to canonical keys', () => {
    expect(normalizeProduceForSeason('Meyer Lemons')).toBe('lemons')
    expect(normalizeProduceForSeason('Heirloom Tomatoes')).toBe('heirloom tomatoes')
    expect(normalizeProduceForSeason('Fresh Sweet Basil')).toBe('basil')
    expect(normalizeProduceForSeason('Haas Avocados')).toBe('avocados')
    expect(normalizeProduceForSeason('Sweet Corn on the Cob')).toBe('sweet corn')
  })

  it('evaluates single-year harvest windows correctly', () => {
    // Tomatoes: July (7) to October (10)
    expect(isMonthInHarvestWindow(8, 7, 10)).toBe(true) // August in season
    expect(isMonthInHarvestWindow(7, 7, 10)).toBe(true) // July in season
    expect(isMonthInHarvestWindow(10, 7, 10)).toBe(true) // October in season
    expect(isMonthInHarvestWindow(1, 7, 10)).toBe(false) // January out of season
    expect(isMonthInHarvestWindow(5, 7, 10)).toBe(false) // May out of season
  })

  it('evaluates cross-year winter harvest windows correctly', () => {
    // Citrus: November (11) to April (4)
    expect(isMonthInHarvestWindow(11, 11, 4)).toBe(true) // November in season
    expect(isMonthInHarvestWindow(12, 11, 4)).toBe(true) // December in season
    expect(isMonthInHarvestWindow(1, 11, 4)).toBe(true) // January in season
    expect(isMonthInHarvestWindow(4, 11, 4)).toBe(true) // April in season
    expect(isMonthInHarvestWindow(7, 11, 4)).toBe(false) // July out of season
    expect(isMonthInHarvestWindow(8, 11, 4)).toBe(false) // August out of season
  })

  it('evaluates produce in season for given months and locations', () => {
    // August (8): Heirloom Tomatoes should be in season in CA (95125) and NY (10001)
    expect(isProduceInSeason('Heirloom Tomatoes', '95125', 8)).toBe(true)
    expect(isProduceInSeason('Heirloom Tomatoes', '10001', 8)).toBe(true)
    expect(isProduceInSeason('Fresh Sweet Basil', '95125', 8)).toBe(true)

    // August (8): Meyer Lemons in CA are winter citrus (Nov-Apr), so they are out of season in August
    expect(isProduceInSeason('Meyer Lemons', '95125', 8)).toBe(false)

    // January (1): Meyer Lemons are in season, Tomatoes are out of season
    expect(isProduceInSeason('Meyer Lemons', '95125', 1)).toBe(true)
    expect(isProduceInSeason('Heirloom Tomatoes', '95125', 1)).toBe(false)
  })

  it('handles multi-ZIP location arrays correctly', () => {
    const caZips = [
      { zip: '95125', state: 'CA' },
      { zip: '94024', state: 'CA' },
    ]

    // August in CA: Tomatoes in season, Lemons out of season
    expect(isProduceInSeason('Heirloom Tomatoes', caZips, 8)).toBe(true)
    expect(isProduceInSeason('Meyer Lemons', caZips, 8)).toBe(false)

    // If an item has ZIPs in multiple states and is in season in at least one, returns true
    const multiState = [
      { zip: '95125', state: 'CA' }, // Lemons out in August
      { zip: '33101', state: 'FL' }, // Lemons in FL start in Oct
    ]
    expect(isProduceInSeason('Heirloom Tomatoes', multiState, 8)).toBe(true)
  })

  it('defaults gracefully for uncataloged specialty crops', () => {
    expect(isProduceInSeason('Dragonfruit Specialty Herb', '95125', 8)).toBe(true)
  })
})
