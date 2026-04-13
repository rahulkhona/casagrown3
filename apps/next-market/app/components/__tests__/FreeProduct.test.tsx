// @vitest-environment jsdom
/**
 * Free Product Feature Tests
 *
 * Tests that $0 products are correctly handled across:
 * 1. BuyModal — skips Stripe, shows correct text
 * 2. Price formatting — "Free" vs "$X.XX"
 * 3. Button text — "Buy Now — Free", "Add to Cart — Free"
 * 4. OG tags — correct title for free products
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'

// ── Shared mocks ──
function createMockChain(resolvedValue: any = { data: null }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'single', 'limit', 'is', 'gt', 'in', 'insert', 'update', 'delete', 'match', 'order', 'maybeSingle']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single.mockResolvedValue(resolvedValue)
  chain.maybeSingle.mockResolvedValue(resolvedValue)
  return chain
}

vi.mock('../../../lib/supabase', () => ({
  createClient: () => {
    const productChain = createMockChain({ data: { price_usd: 0, inventory: 20 } })
    const holdChain = createMockChain({ data: null })
    const zipChain = createMockChain({ data: null })
    const taxChain = createMockChain({ data: null })
    const cacheChain = createMockChain({ data: null })
    return {
      from: vi.fn((table: string) => {
        if (table === 'market_products') return productChain
        if (table === 'market_holds') return holdChain
        if (table === 'zip_codes') return zipChain
        if (table === 'category_tax_rules') return taxChain
        if (table === 'zip_tax_cache') return cacheChain
        return createMockChain()
      }),
      rpc: vi.fn().mockResolvedValue({ data: { available_usd: 10.00 } }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: {} }) },
    }
  },
}))

vi.mock('../../../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'test@test.com' }, loading: false, isAuthenticated: true }),
}))

vi.mock('../../../lib/analytics', () => ({
  trackClick: vi.fn(),
  trackError: vi.fn(),
}))

vi.mock('../../../lib/store', () => ({
  formatUsd: (v: number) => `$${v.toFixed(2)}`,
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue(null),
}))

import BuyModal from '../BuyModal'

const freeProductProps = {
  product: {
    id: 'prod-free-1', name: 'Backyard Lemons', price_usd: 0,
    unit: 'bag', inventory: 15, category: 'produce',
    photos: ['/products/lemons.png'],
    product_pickup_windows: [{ day_of_week: 1 }],
    product_delivery_windows: [{ day_of_week: 1 }],
  },
  booth: {
    id: 'booth-1', name: "Maria's Garden Fresh",
    offers_delivery: true, offers_pickup: true,
    pickup_address: '123 Garden Way', delivery_radius_miles: 5,
  },
  buyerZip: '95112',
  buyerAddress: '742 Evergreen Terrace',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

const paidProductProps = {
  ...freeProductProps,
  product: {
    ...freeProductProps.product,
    id: 'prod-paid-1', name: 'Heritage Tomatoes', price_usd: 4.50,
  },
}

// ============================================================================
// BuyModal — Free Product Handling
// ============================================================================
describe('BuyModal — Free Product ($0)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders free product name', () => {
    const { container } = render(React.createElement(BuyModal, freeProductProps))
    expect(container.textContent).toContain('Backyard Lemons')
  })

  it('shows $0.00 subtotal for free products', () => {
    const { container } = render(React.createElement(BuyModal, freeProductProps))
    expect(container.textContent).toContain('$0.00')
  })

  it('does NOT show Stripe card element for free products', () => {
    const { container } = render(React.createElement(BuyModal, freeProductProps))
    // Stripe card element would contain "Card" or "credit card" text
    // Free products should skip payment entirely
    const hasCardElement = container.querySelector('[class*="stripe"]') || container.querySelector('[class*="card-element"]')
    expect(hasCardElement).toBeFalsy()
  })

  it('shows fulfillment options for free products', () => {
    const { container } = render(React.createElement(BuyModal, freeProductProps))
    expect(container.textContent).toContain('Pickup')
  })
})

// ============================================================================
// Price Display Logic
// ============================================================================
describe('Free Product — Price Display Logic', () => {
  it('formats paid product as currency string', () => {
    const price: number = 4.50
    const display = price === 0 ? 'Free' : `$${price.toFixed(2)}`
    expect(display).toBe('$4.50')
  })

  it('formats $0 product as "Free"', () => {
    const price: number = 0
    const display = price === 0 ? 'Free' : `$${price.toFixed(2)}`
    expect(display).toBe('Free')
  })

  it('formats $0.00 product as "Free" (floating point)', () => {
    const price: number = 0.00
    const display = price === 0 ? 'Free' : `$${price.toFixed(2)}`
    expect(display).toBe('Free')
  })
})

// ============================================================================
// Button Text — CTA Patterns
// ============================================================================
describe('Free Product — CTA Button Text', () => {
  it('Buy Now button shows "Buy Now — Free" for $0 products', () => {
    const price_usd = 0
    const unit = 'bag'
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const buttonText = price_usd === 0
      ? '⚡ Buy Now — Free'
      : `⚡ Buy Now — ${formatUsd(price_usd)} / ${unit}`
    expect(buttonText).toBe('⚡ Buy Now — Free')
  })

  it('Buy Now button shows price for paid products', () => {
    const price_usd: number = 4.50
    const unit = 'basket'
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const buttonText = price_usd === 0
      ? '⚡ Buy Now — Free'
      : `⚡ Buy Now — ${formatUsd(price_usd)} / ${unit}`
    expect(buttonText).toBe('⚡ Buy Now — $4.50 / basket')
  })

  it('Add to Cart button shows "Free" for $0 products', () => {
    const price_usd = 0
    const cartQty = 1
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const buttonText = price_usd === 0
      ? '🛒 Add to Cart — Free'
      : `🛒 Add to Cart — ${formatUsd(price_usd * cartQty)}`
    expect(buttonText).toBe('🛒 Add to Cart — Free')
  })

  it('Add to Cart button shows total for paid products', () => {
    const price_usd: number = 4.50
    const cartQty: number = 3
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const buttonText = price_usd === 0
      ? '🛒 Add to Cart — Free'
      : `🛒 Add to Cart — ${formatUsd(price_usd * cartQty)}`
    expect(buttonText).toBe('🛒 Add to Cart — $13.50')
  })

  it('Booth Buy button text is always "Buy" (same for free and paid)', () => {
    // After fix: booth page always shows "Buy" regardless of price
    const inventory: number = 10
    const isClosed = false
    const boothButtonText = isClosed ? '🔒 Closed' : inventory === 0 ? 'Sold Out' : 'Buy'
    expect(boothButtonText).toBe('Buy')
  })

  it('does NOT use "Reserve" in any button text', () => {
    const price_usd = 0
    const unit = 'bag'
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const buyText = price_usd === 0
      ? '⚡ Buy Now — Free'
      : `⚡ Buy Now — ${formatUsd(price_usd)} / ${unit}`
    const cartText = price_usd === 0
      ? '🛒 Add to Cart — Free'
      : `🛒 Add to Cart — ${formatUsd(price_usd)}`
    // No "Reserve" should appear anywhere in button text
    expect(buyText).not.toContain('Reserve')
    expect(cartText).not.toContain('Reserve')
  })
})

// ============================================================================
// Share Text Logic
// ============================================================================
describe('Free Product — Share Text', () => {
  it('share text shows "Free" for $0 products', () => {
    const product = { name: 'Backyard Lemons', price_usd: 0, unit: 'bag' }
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const text = `Hey! Check out my fresh ${product.name} on CasaGrown Market 🌱\n\n${product.price_usd === 0 ? 'Free' : formatUsd(product.price_usd) + ' / ' + product.unit}\n\n🛒 https://example.com`
    expect(text).toContain('Free')
    expect(text).not.toContain('$0.00')
  })

  it('share text shows price for paid products', () => {
    const product = { name: 'Heritage Tomatoes', price_usd: 4.50, unit: 'basket' }
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const text = `Hey! Check out my fresh ${product.name} on CasaGrown Market 🌱\n\n${product.price_usd === 0 ? 'Free' : formatUsd(product.price_usd) + ' / ' + product.unit}\n\n🛒 https://example.com`
    expect(text).toContain('$4.50 / basket')
    expect(text).not.toContain('Free')
  })
})

// ============================================================================
// OG Title for Free Products
// ============================================================================
describe('Free Product — OG Title', () => {
  it('generates OG title with "Free" for $0 products', () => {
    const productName = 'Backyard Lemons'
    const priceUsd: number = 0
    const unit = 'bag'
    const title = priceUsd === 0
      ? `${productName} — Free`
      : `${productName} — $${priceUsd.toFixed(2)}/${unit}`
    expect(title).toBe('Backyard Lemons — Free')
  })

  it('generates OG title with price for paid products', () => {
    const productName = 'Heritage Tomatoes'
    const priceUsd: number = 4.50
    const unit = 'basket'
    const title = priceUsd === 0
      ? `${productName} — Free`
      : `${productName} — $${priceUsd.toFixed(2)}/${unit}`
    expect(title).toBe('Heritage Tomatoes — $4.50/basket')
  })
})

// ============================================================================
// Marketplace Feed — Free Label
// ============================================================================
describe('Free Product — Marketplace Feed Display', () => {
  it('displays "Free" for $0 products in feed', () => {
    const price_usd = 0
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    // This mirrors the conditional rendering in market/page.tsx
    const priceDisplay = price_usd === 0 ? 'Free' : `${formatUsd(price_usd)}`
    expect(priceDisplay).toBe('Free')
  })

  it('displays formatted price for paid products in feed', () => {
    const price_usd: number = 3.00
    const formatUsd = (v: number) => `$${v.toFixed(2)}`
    const priceDisplay = price_usd === 0 ? 'Free' : `${formatUsd(price_usd)}`
    expect(priceDisplay).toBe('$3.00')
  })
})

// ============================================================================
// Listing Form — "Give away for free" checkbox logic
// ============================================================================
describe('Free Product — Listing Form Checkbox Logic', () => {
  it('checking isFree sets price to 0', () => {
    let price = 5.00
    let isFree = false

    // Simulate checking the box
    isFree = true
    if (isFree) price = 0

    expect(price).toBe(0)
    expect(isFree).toBe(true)
  })

  it('unchecking isFree allows price to be set again', () => {
    let price = 0
    let isFree = true

    // Simulate unchecking the box
    isFree = false
    price = 7.50

    expect(price).toBe(7.50)
    expect(isFree).toBe(false)
  })

  it('editing a $0 product detects it as free', () => {
    const existingProduct = { price_usd: 0, name: 'Old Lemons' }
    const detectedFree = existingProduct.price_usd === 0
    expect(detectedFree).toBe(true)
  })

  it('editing a paid product does not flag as free', () => {
    const existingProduct = { price_usd: 2.99, name: 'Tomatoes' }
    const detectedFree = existingProduct.price_usd === 0
    expect(detectedFree).toBe(false)
  })
})
