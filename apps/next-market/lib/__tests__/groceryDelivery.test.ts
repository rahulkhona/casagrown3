import { describe, it, expect } from 'vitest'
import {
  getInstacartItemUrl,
  getInstacartMultiItemUrl,
  getKrogerItemUrl,
  getRegionalKrogerBanner,
  getPartnerStoreDisplay,
} from '../groceryDelivery'

describe('groceryDelivery canonical utility suite', () => {
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
    expect(url).toContain('https://www.instacart.com/store/partner_recipe')
    expect(url).toContain('2%20lbs%20Lemons%2C3%20lbs%20Roma%20Tomatoes')
    expect(url).toContain('zipcode=95120')
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
})
