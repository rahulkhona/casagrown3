// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react'

// Deep mock for supabase
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

const mockRpc = vi.fn().mockImplementation((fnName: string) => {
  console.log('[MOCK RPC CALL]:', fnName)
  if (fnName === 'get_transaction_summary') {
    return Promise.resolve({ data: { available_usd: 100.00 } })
  }
  return Promise.resolve({ data: { success: true, order_id: 'ord-123', total_usd: 4.50 } })
})

const mockInvoke = vi.fn().mockImplementation((fnName: string) => {
  console.log('[MOCK INVOKE CALL]:', fnName)
  return Promise.resolve({ data: { holdId: 'hold-123', requiresCardEntry: false } })
})

vi.mock('../../../lib/supabase', () => ({
  createClient: () => {
    const productChain = createMockChain({ data: { price_usd: 4.50, inventory: 20 } })
    const holdChain = createMockChain({ data: null })
    const zipChain = createMockChain({ data: { city_id: 'city-1', cities: { state_id: 'state-1', states: { code: 'CA' } } } })
    const taxChain = createMockChain({ data: { id: 'rule-1', rule_type: 'fixed', rate_pct: 8.5 } })
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
      rpc: mockRpc,
      functions: { invoke: mockInvoke },
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

vi.mock('../../../lib/windowUtils', () => ({
  hasValidWindows: () => true,
}))

import BuyModal from '../BuyModal'

const defaultProps = {
  product: {
    id: 'prod-1', name: 'Heritage Tomatoes', price_usd: 4.50,
    unit: 'basket', inventory: 20, category: 'produce',
    photos: ['/products/tomatoes.png'],
    product_pickup_windows: [{ day_of_week: 1 }],
    product_delivery_windows: [{ day_of_week: 1 }],
  },
  booth: {
    id: 'booth-1', name: "Maria's Garden Fresh",
    offers_delivery: true, offers_pickup: true,
    pickup_address: '123 Garden Way, San Jose, CA 95125',
    pickup_zip: '95125', pickup_state: 'CA',
    booth_zip: '95125', booth_state: 'CA',
    delivery_radius_miles: 5,
  },
  buyerZip: '95112',
  buyerAddress: '742 Evergreen Terrace',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

describe('BuyModal Gaps and Fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders delivery instructions textarea when fulfillment is set to delivery', () => {
    const { getByPlaceholderText, getByText } = render(React.createElement(BuyModal, {
      ...defaultProps,
      product: { ...defaultProps.product, product_delivery_windows: [{ day_of_week: 1 }] }
    }))
    
    // Switch to delivery
    const deliveryBtn = getByText('🚗 Delivery')
    fireEvent.click(deliveryBtn)

    const textarea = getByPlaceholderText(/Delivery instructions/i)
    expect(textarea).toBeTruthy()
  })

  it('submits delivery instructions to the place_market_order RPC', async () => {
    const { getByPlaceholderText, getByText } = render(React.createElement(BuyModal, {
      ...defaultProps,
      product: {
        ...defaultProps.product,
        product_delivery_windows: [{ day_of_week: 1 }],
        product_pickup_windows: null // Force delivery
      }
    }))

    // Wait for async load of transaction summary balance
    await waitFor(() => {
      expect(getByText(/Balance Applied/i)).toBeTruthy()
    })

    // Fill delivery instructions
    const textarea = getByPlaceholderText(/Delivery instructions/i)
    fireEvent.change(textarea, { target: { value: 'Leave at back gate.' } })

    // Click Place Order
    const placeBtn = getByText(/Place Order/i)
    fireEvent.click(placeBtn)

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('place_market_order', expect.objectContaining({
        p_delivery_instructions: 'Leave at back gate.'
      }))
    })
  })
})
