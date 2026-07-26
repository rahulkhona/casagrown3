import { describe, it, expect } from 'vitest'

describe('Seller & Buyer Interest Sharing Referral Link Builder', () => {
  it('builds seller harvest announcement share URL with referral attribution', () => {
    const items = ['Organic Strawberries', 'Hass Avocados']
    const userId = 'user_seller_123'
    const shareUrl = `https://casagrown.com/interest?scope=buy&items=${encodeURIComponent(items.join(','))}&ref=${userId}`

    expect(shareUrl).toContain('scope=buy')
    expect(shareUrl).toContain('items=Organic%20Strawberries%2CHass%20Avocados')
    expect(shareUrl).toContain('ref=user_seller_123')
  })

  it('builds buyer wishlist demand share URL with referral attribution and location', () => {
    const items = ['Organic Strawberries', 'Meyer Lemons']
    const userId = 'user_buyer_456'
    const name = 'Beth'
    const location = '95125'

    const shareUrl = `https://casagrown.com/demand?items=${encodeURIComponent(items.join(','))}&name=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}&ref=${userId}`

    expect(shareUrl).toContain('/demand?')
    expect(shareUrl).toContain('items=Organic%20Strawberries%2CMeyer%20Lemons')
    expect(shareUrl).toContain('name=Beth')
    expect(shareUrl).toContain('location=95125')
    expect(shareUrl).toContain('ref=user_buyer_456')
  })
})
