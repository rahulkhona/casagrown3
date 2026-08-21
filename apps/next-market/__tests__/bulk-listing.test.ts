import { describe, it, expect } from 'vitest'
import {
  parseProduceParams,
  createRowFromProduceName,
  buildWeeklyWindowsFromPresets,
  ALLOWED_UNITS,
  SCHEDULE_PRESETS,
} from '../lib/bulkListingUtils'
import { checkTextForViolations } from '../lib/moderation'
import { extractBaseProduce, getProduceImage } from '../lib/produceCatalog'

describe('Bulk Listing Utilities & Data Transforms', () => {
  describe('parseProduceParams', () => {
    it('parses comma-separated produce query parameters correctly', () => {
      const result = parseProduceParams('tomatoes,lemons,bell_peppers')
      expect(result).toEqual(['Tomatoes', 'Lemons', 'Bell Peppers'])
    })

    it('parses semicolon and pipe separated parameters', () => {
      const result = parseProduceParams('heirloom_tomatoes;meyer_lemons|fresh_basil')
      expect(result).toEqual(['Heirloom Tomatoes', 'Meyer Lemons', 'Fresh Basil'])
    })

    it('parses array of string parameters from repeated query keys', () => {
      const result = parseProduceParams(['tomatoes', 'avocados', 'sweet_corn'])
      expect(result).toEqual(['Tomatoes', 'Avocados', 'Sweet Corn'])
    })

    it('deduplicates identical produce names regardless of case', () => {
      const result = parseProduceParams('tomatoes,Tomatoes,TOMATOES,lemons')
      expect(result).toEqual(['Tomatoes', 'Lemons'])
    })

    it('handles empty, null, or undefined parameters gracefully', () => {
      expect(parseProduceParams('')).toEqual([])
      expect(parseProduceParams(null)).toEqual([])
      expect(parseProduceParams(undefined)).toEqual([])
      expect(parseProduceParams('   , , ')).toEqual([])
    })
  })

  describe('createRowFromProduceName', () => {
    it('creates an initialized ProduceRowItem from catalog produce name', () => {
      const row = createRowFromProduceName('Meyer Lemons', 'test_row')
      expect(row.name).toBe('Meyer Lemons')
      expect(row.category).toBe('produce')
      expect(row.unit).toBeDefined()
      expect(ALLOWED_UNITS).toContain(row.unit)
      expect(row.priceUsd).toBe('')
      expect(row.isFree).toBe(false)
      expect(row.stockImage).toContain('lemon')
      expect(row.id).toContain('test_row')
    })

    it('handles unknown or custom produce names with fallback base produce', () => {
      const row = createRowFromProduceName('Purple Dragon Carrots', 'custom')
      expect(row.name).toBe('Purple Dragon Carrots')
      expect(row.stockImage).toBeDefined()
      expect(row.isFree).toBe(false)
      expect(row.quantity).toBe('')
    })
  })

  describe('buildWeeklyWindowsFromPresets', () => {
    it('maps Weekday Evenings preset to Mon-Fri 16-18 and 18-20 slots', () => {
      const windows = buildWeeklyWindowsFromPresets(['weekday_evenings'])
      expect(windows.Monday).toEqual(expect.arrayContaining(['16-18', '18-20']))
      expect(windows.Friday).toEqual(expect.arrayContaining(['16-18', '18-20']))
      expect(windows.Saturday).toBeUndefined()
    })

    it('merges Weekday Mornings and Weekday Evenings into complete weekday slots', () => {
      const windows = buildWeeklyWindowsFromPresets(['weekday_mornings', 'weekday_evenings'])
      expect(windows.Monday).toEqual(expect.arrayContaining(['8-10', '10-12', '16-18', '18-20']))
      expect(windows.Wednesday).toEqual(expect.arrayContaining(['8-10', '10-12', '16-18', '18-20']))
    })

    it('maps Weekend Mornings to Sat-Sun', () => {
      const windows = buildWeeklyWindowsFromPresets(['weekend_mornings'])
      expect(windows.Saturday).toEqual(expect.arrayContaining(['8-10', '10-12']))
      expect(windows.Sunday).toEqual(expect.arrayContaining(['8-10', '10-12']))
      expect(windows.Monday).toBeUndefined()
    })

    it('handles empty preset selection', () => {
      const windows = buildWeeklyWindowsFromPresets([])
      expect(windows).toEqual({})
    })
  })

  describe('Content Moderation on Produce Listings', () => {
    it('accepts clean garden produce names and descriptions', () => {
      expect(checkTextForViolations('Organic Heirloom Tomatoes').isClean).toBe(true)
      expect(checkTextForViolations('Fresh sweet Meyer lemons from our backyard tree').isClean).toBe(true)
      expect(checkTextForViolations('Fresh Genovese Basil clippings').isClean).toBe(true)
    })

    it('rejects cannabis and controlled substances', () => {
      const weedCheck = checkTextForViolations('Fresh Backyard Weed')
      expect(weedCheck.isClean).toBe(false)
      expect(weedCheck.error).toContain('Cannabis')

      const marijuanaCheck = checkTextForViolations('Homegrown marijuana buds')
      expect(marijuanaCheck.isClean).toBe(false)

      const drugCheck = checkTextForViolations('Cocaine and herbs')
      expect(drugCheck.isClean).toBe(false)
    })

    it('rejects firearms, weapons, and violent language', () => {
      const gunCheck = checkTextForViolations('Selling hunting rifle with apples')
      expect(gunCheck.isClean).toBe(false)

      const knifeCheck = checkTextForViolations('Sharp hunting knife')
      expect(knifeCheck.isClean).toBe(false)
    })

    it('rejects profanity and harassment', () => {
      const profanityCheck = checkTextForViolations('Fucking good lemons')
      expect(profanityCheck.isClean).toBe(false)
      expect(profanityCheck.error).toContain('profanity')
    })
  })
})
