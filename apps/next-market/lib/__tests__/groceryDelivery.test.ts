import { describe, it, expect, vi } from 'vitest'
import {
  getInstacartItemUrl,
  getInstacartMultiItemUrl,
  getKrogerItemUrl,
  getKrogerAuthorizeUrl,
  getRegionalKrogerBanner,
  getPartnerStoreDisplay,
  sanitizeGroceryName,
  checkKrogerProximity,
} from '../groceryDelivery'

describe('groceryDelivery canonical utility suite', () => {
  it('sanitizes marketing descriptors from product names', () => {
    expect(sanitizeGroceryName('Fresh Homegrown Meyer Lemons (Instacart Supermarket)')).toBe('Meyer Lemons')
    expect(sanitizeGroceryName('Organic Backyard Heirloom Tomatoes')).toBe('Heirloom Tomatoes')
    expect(sanitizeGroceryName('Sweet Ripe Peaches')).toBe('Peaches')
  })

  it('generates clean Instacart produce search URL with partner tag and zip code', () => {
    const url = getInstacartItemUrl('Fresh Meyer Lemons', '95125')
    expect(url).toContain('https://www.instacart.com/store/s?k=Meyer%20Lemons')
    expect(url).toContain('zipcode=95125')
    expect(url).toContain('utm_source=casagrown')
  })

  it('generates multi-item Instacart shoppable bundle URL', () => {
    const items = [
      { name: 'Lemons', quantity: 2, unit: 'lbs' },
      { name: 'Roma Tomatoes', quantity: 3, unit: 'lbs' },
    ]
    const url = getInstacartMultiItemUrl(items, '95120')
    expect(url).toContain('https://www.instacart.com/store/s?k=Lemons%20Roma%20Tomatoes')
    expect(url).toContain('zipcode=95120')
  })

  it('generates Kroger OAuth authorize URL with encoded items and zip code', () => {
    const items = [
      { name: 'Fresh Heirloom Tomatoes', quantity: 2, unit: 'lb', price_usd: 3.49 },
      { name: 'Organic Basil', quantity: 1, unit: 'bunch', price_usd: 2.49 },
    ]
    const url = getKrogerAuthorizeUrl(items, '95125', '/cart')
    expect(url).toContain('/api/kroger/authorize')
    expect(url).toContain('zipcode=95125')
    expect(url).toContain('returnUrl=%2Fcart')
    expect(url).toContain('Heirloom%20Tomatoes')
  })

  it('generates Kroger search URL with query', () => {
    const url = getKrogerItemUrl('Organic Heirloom Tomatoes', '90210')
    expect(url).toContain('https://www.kroger.com/search?query=Heirloom%20Tomatoes')
  })

  it('resolves correct regional Kroger banners by ZIP / state prefix', () => {
    expect(getRegionalKrogerBanner('90210')).toBe('Ralphs')
    expect(getRegionalKrogerBanner('92101')).toBe('Ralphs')
    expect(getRegionalKrogerBanner('98101')).toBe('Fred Meyer / QFC')
    expect(getRegionalKrogerBanner('85001')).toBe("Fry's Food Stores")
    expect(getRegionalKrogerBanner('80202')).toBe('King Soopers')
    expect(getRegionalKrogerBanner('30301')).toBe('Kroger')
  })

  it('categorizes produce vs garden supplies for store badge display', () => {
    const produceDisplay = getPartnerStoreDisplay('Sweet Cherry Tomatoes')
    expect(produceDisplay.categoryType).toBe('produce')
    expect(produceDisplay.instacartStoresPill).toContain('Sprouts')

    const soilDisplay = getPartnerStoreDisplay('Organic Potting Soil 2 cu ft')
    expect(soilDisplay.categoryType).toBe('garden_supplies')
    expect(soilDisplay.instacartStoresPill).toContain('Home Depot')
    expect(soilDisplay.instacartStoresPill).toContain("Lowe's")
  })

  it('checks Kroger proximity fallback for valid ZIP codes', async () => {
    const result = await checkKrogerProximity('95125', 15)
    expect(result.available).toBe(true)
    expect(result.banner).toBe('Ralphs')
  })

  it('correctly calculates URL lengths for large carts and identifies batching need', () => {
    const produceNames = ['Heirloom Tomatoes', 'Meyer Lemons', 'Sweet Peaches', 'Wild Honeycomb', 'Homegrown Zucchini', 'Backyard Strawberries']
    const largeCart = Array.from({ length: 30 }, (_, i) => ({
      name: `Organic ${produceNames[i % produceNames.length]} #${i + 1}`,
      quantity: 2,
      unit: 'lb',
      price_usd: 3.99,
    }))

    const krogerUrl = getKrogerAuthorizeUrl(largeCart, '95125', '/cart')
    const instacartUrl = getInstacartMultiItemUrl(largeCart, '95125')

    // Kroger URL with 30 items exceeds standard 2048 safety limit
    expect(krogerUrl.length).toBeGreaterThan(2000)
    expect(instacartUrl.length).toBeGreaterThan(300)

    // Verify that slicing to 15 items produces safe URL lengths
    const batched15 = largeCart.slice(0, 15)
    const batchedKrogerUrl = getKrogerAuthorizeUrl(batched15, '95125', '/cart')
    expect(batchedKrogerUrl.length).toBeLessThan(2048)
  })
})
