// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent } from '@testing-library/react'

// Deep mock for supabase — BuyModal uses many chained methods
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
    const productChain = createMockChain({ data: { price_usd: 4.50, inventory: 20 } })
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

const defaultProps = {
  product: {
    id: 'prod-1', name: 'Heritage Tomatoes', price_usd: 4.50,
    unit: 'basket', inventory: 20, category: 'produce',
    photos: ['/products/tomatoes.png'],
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

describe('BuyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders product name', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('Heritage Tomatoes')
  })

  it('renders fulfillment options', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('Pickup')
    expect(container.textContent).toContain('Delivery')
  })

  it('shows quantity controls', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('−')
    expect(container.textContent).toContain('+')
  })

  it('shows pickup address', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('123 Garden Way')
  })

  it('shows price breakdown section', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('Price Breakdown')
    expect(container.textContent).toContain('Subtotal')
    expect(container.textContent).toContain('Sales Tax')
  })

  it('renders Place Order button', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('Place Order')
  })

  it('calls onClose when close button clicked', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === '✕')
    fireEvent.click(closeBtn!)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when overlay clicked', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    const overlay = container.firstElementChild!
    fireEvent.click(overlay)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('renders product image when photo exists', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
  })

  it('renders emoji fallback when no photo', () => {
    const noPhotoProps = {
      ...defaultProps,
      product: { ...defaultProps.product, photos: undefined },
    }
    const { container } = render(React.createElement(BuyModal, noPhotoProps))
    expect(container.textContent).toContain('🥬')
  })

  it('hides pickup when booth only offers delivery', () => {
    const deliveryOnly = {
      ...defaultProps,
      booth: { ...defaultProps.booth, offers_pickup: false },
    }
    const { container } = render(React.createElement(BuyModal, deliveryOnly))
    expect(container.textContent).not.toContain('📍 Pickup')
    expect(container.textContent).toContain('🚗 Delivery')
  })

  it('hides delivery when booth only offers pickup', () => {
    const pickupOnly = {
      ...defaultProps,
      booth: { ...defaultProps.booth, offers_delivery: false },
    }
    const { container } = render(React.createElement(BuyModal, pickupOnly))
    expect(container.textContent).toContain('📍 Pickup')
    expect(container.textContent).not.toContain('🚗 Delivery')
  })

  it('renders security notice', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('Secured by Stripe')
  })

  it('does not enforce a minimum order (sub-$5 products work)', () => {
    const cheapProps = {
      ...defaultProps,
      product: { ...defaultProps.product, price_usd: 1.50, inventory: 10 },
    }
    const { container } = render(React.createElement(BuyModal, cheapProps))
    // No minimum order warning should appear
    expect(container.textContent).not.toContain('Minimum order')
    // Place Order button should be present and NOT mention minimum
    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))
    expect(orderBtn).toBeTruthy()
  })

  it('shows available quantity text', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('baskets available')
  })
})
