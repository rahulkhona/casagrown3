import { describe, it, expect } from 'vitest'
import {
  parseProduceParams,
  createRowFromProduceName,
  inferProduceUnitAndPrice,
  buildWeeklyWindowsFromPresets,
  getWindowsForPreset,
  isHourSelected,
  toggleHourCell,
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

  describe('inferProduceUnitAndPrice (Taxonomy Inference Engine)', () => {
    it('infers correct units and pricing for poultry & eggs', () => {
      expect(inferProduceUnitAndPrice('Pastured Chicken Eggs')).toEqual({ unit: 'dozen', price: '6.00' })
      expect(inferProduceUnitAndPrice('Duck Eggs')).toEqual({ unit: 'dozen', price: '8.00' })
      expect(inferProduceUnitAndPrice('Quail Eggs')).toEqual({ unit: 'dozen', price: '5.00' })
    })

    it('infers correct units and pricing for bakery & loaves', () => {
      expect(inferProduceUnitAndPrice('Fresh Sourdough Bread')).toEqual({ unit: 'loaf', price: '8.00' })
      expect(inferProduceUnitAndPrice('Artisan Baguette')).toEqual({ unit: 'loaf', price: '8.00' })
    })

    it('infers correct units and pricing for honey, jams, and preserves', () => {
      expect(inferProduceUnitAndPrice('Raw Wildflower Honey')).toEqual({ unit: 'jar', price: '12.00' })
      expect(inferProduceUnitAndPrice('Strawberry Jam')).toEqual({ unit: 'jar', price: '12.00' })
      expect(inferProduceUnitAndPrice('Fresh Honeycomb')).toEqual({ unit: 'box', price: '15.00' })
    })

    it('infers correct units and pricing for herbs and bunches', () => {
      expect(inferProduceUnitAndPrice('Sweet Basil')).toEqual({ unit: 'bunch', price: '2.00' })
      expect(inferProduceUnitAndPrice('Fresh Rosemary')).toEqual({ unit: 'bunch', price: '2.00' })
      expect(inferProduceUnitAndPrice('Organic Kale')).toEqual({ unit: 'bunch', price: '2.00' })
      expect(inferProduceUnitAndPrice('Scallions')).toEqual({ unit: 'bunch', price: '2.00' })
    })

    it('infers correct units and pricing for berries', () => {
      expect(inferProduceUnitAndPrice('Blueberries')).toEqual({ unit: 'lb', price: '5.00' })
      expect(inferProduceUnitAndPrice('Strawberries')).toEqual({ unit: 'lb', price: '5.00' })
      expect(inferProduceUnitAndPrice('Blackberries')).toEqual({ unit: 'lb', price: '5.00' })
    })

    it('infers correct units and pricing for individual piece items', () => {
      expect(inferProduceUnitAndPrice('English Cucumbers')).toEqual({ unit: 'each', price: '1.00' })
      expect(inferProduceUnitAndPrice('Hass Avocado')).toEqual({ unit: 'each', price: '1.50' })
      expect(inferProduceUnitAndPrice('Bell Peppers')).toEqual({ unit: 'each', price: '1.50' })
      expect(inferProduceUnitAndPrice('Meyer Lemons')).toEqual({ unit: 'each', price: '0.75' })
      expect(inferProduceUnitAndPrice('Watermelon')).toEqual({ unit: 'each', price: '5.00' })
    })

    it('infers correct units and pricing for bulk pound produce', () => {
      expect(inferProduceUnitAndPrice('Fuji Apples')).toEqual({ unit: 'lb', price: '2.50' })
      expect(inferProduceUnitAndPrice('Heirloom Tomatoes')).toEqual({ unit: 'lb', price: '3.50' })
      expect(inferProduceUnitAndPrice('Yellow Potatoes')).toEqual({ unit: 'lb', price: '1.50' })
    })
  })

  describe('createRowFromProduceName', () => {
    it('creates an initialized ProduceRowItem from catalog produce name with price and unit', () => {
      const row = createRowFromProduceName('Meyer Lemons', 'test_row')
      expect(row.name).toBe('Meyer Lemons')
      expect(row.category).toBe('produce')
      expect(row.unit).toBeDefined()
      expect(ALLOWED_UNITS).toContain(row.unit)
      expect(row.priceUsd).toBe('0.75')
      expect(row.quantity).toBe('5')
      expect(row.isFree).toBe(false)
      expect(row.stockImage).toContain('lemon')
      expect(row.id).toContain('test_row')
    })

    it('handles custom produce names with intelligent inference fallback', () => {
      const row = createRowFromProduceName('Fresh Sourdough Bread', 'custom')
      expect(row.name).toBe('Fresh Sourdough Bread')
      expect(row.unit).toBe('loaf')
      expect(row.priceUsd).toBe('8.00')
      expect(row.quantity).toBe('5')
      expect(row.isFree).toBe(false)
    })
  })

  describe('Schedule Presets & Custom Schedule Matrix Helpers', () => {
    it('returns valid schedule windows for both evenings and weekends', () => {
      const windows = getWindowsForPreset('both')
      const dates = Object.keys(windows)
      expect(dates.length).toBe(7)
      // Check that every day has time slots
      dates.forEach(d => {
        expect(windows[d].length).toBeGreaterThan(0)
      })
    })

    it('returns weekday evening windows', () => {
      const windows = getWindowsForPreset('weekday_evenings')
      const dates = Object.keys(windows)
      expect(dates.length).toBeGreaterThanOrEqual(4)
      dates.forEach(d => {
        expect(windows[d]).toEqual(['16-18', '18-20'])
      })
    })

    it('returns weekend morning windows', () => {
      const windows = getWindowsForPreset('weekend_mornings')
      const dates = Object.keys(windows)
      expect(dates.length).toBeGreaterThanOrEqual(1)
      dates.forEach(d => {
        expect(windows[d]).toEqual(['8-10', '10-12'])
      })
    })

    it('determines if an hour is selected in a given window range', () => {
      expect(isHourSelected(17, ['17-19'])).toBe(true)
      expect(isHourSelected(18, ['17-19'])).toBe(true)
      expect(isHourSelected(19, ['17-19'])).toBe(false)
    })

    it('toggles hour cell in custom schedule matrix', () => {
      let state: Record<string, string[]> = {}
      const setState = (updater: any) => {
        state = typeof updater === 'function' ? updater(state) : updater
      }

      toggleHourCell('2026-08-25', 10, state, setState)
      expect(state['2026-08-25']).toEqual(['10-11'])

      // Toggle off
      toggleHourCell('2026-08-25', 10, state, setState)
      expect(state['2026-08-25']).toEqual([])
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
