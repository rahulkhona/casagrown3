// @vitest-environment jsdom
/**
 * BuyModal — Negative / Error-handling tests
 *
 * Covers: order RPC failures, hold failures, Stripe card declines,
 * price change detection, sold-out products, free products,
 * and the order rollback mechanism on failures.
 *
 * NOTE: Since loadStripe is mocked null (no real Stripe in tests),
 * we test error paths using balance-covered scenarios (needsCard=false)
 * which bypass the Stripe readiness check entirely.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, act } from '@testing-library/react'

// ── Mock chain helper ──
function createMockChain(resolvedValue: any = { data: null }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'single', 'limit', 'is', 'gt', 'in', 'insert', 'update', 'delete', 'match', 'order', 'maybeSingle']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single.mockResolvedValue(resolvedValue)
  chain.maybeSingle.mockResolvedValue(resolvedValue)
  return chain
}

// Configurable RPC + functions mock
const mockRpc = vi.fn().mockResolvedValue({ data: { available_usd: 10 } })
const mockFunctionsInvoke = vi.fn().mockResolvedValue({ data: { holdAmountCents: 250, requiresCardEntry: false } })
const mockUpdateChain = createMockChain({ data: null })

vi.mock('../../../lib/supabase', () => ({
  createClient: () => {
    const productChain = createMockChain({ data: { price_usd: 2.50, inventory: 5 } })
    const zipChain = createMockChain({ data: null })
    const taxChain = createMockChain({ data: null })
    const cacheChain = createMockChain({ data: null })
    return {
      from: vi.fn((table: string) => {
        if (table === 'market_products') return productChain
        if (table === 'market_orders') return mockUpdateChain
        if (table === 'zip_codes') return zipChain
        if (table === 'category_tax_rules') return taxChain
        if (table === 'zip_tax_cache') return cacheChain
        return createMockChain()
      }),
      rpc: mockRpc,
      functions: { invoke: mockFunctionsInvoke },
    }
  },
}))

vi.mock('../../../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'buyer-1', email: 'beth@test.com' }, loading: false, isAuthenticated: true }),
}))

vi.mock('../../../lib/analytics', () => ({
  trackClick: vi.fn(),
  trackError: vi.fn(),
}))

vi.mock('../../../lib/store', () => ({
  formatUsd: (v: number) => `$${v.toFixed(2)}`,
}))

vi.mock('../../../lib/useMarketStatus', () => ({
  useMarketStatus: () => ({ isOpen: true, todaySchedule: null, productsNeverExpire: true, loading: false }),
  isProductExpired: () => false,
}))

vi.mock('../../../lib/useNotificationPrompt', () => ({
  useNotificationPrompt: () => ({ showPrompt: vi.fn(), modalProps: {} }),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue(null),
}))

import BuyModal from '../BuyModal'

const defaultProps = {
  product: {
    id: 'prod-1', name: 'Fresh Mint', price_usd: 2.50,
    unit: 'bunch', inventory: 5, category: 'herbs',
    photos: ['/products/mint.png'],
    product_pickup_windows: [{ day_of_week: 1 }],
    product_delivery_windows: [{ day_of_week: 1 }],
  },
  booth: {
    id: 'booth-1', name: "Alice's Garden",
    offers_delivery: false, offers_pickup: true,
    pickup_address: '123 Garden Way',
  },
  buyerZip: '95120',
  buyerAddress: '',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

describe('BuyModal — Negative Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: $10 balance covers the $2.50 order, so needsCard=false
    // This lets us test RPC/hold error paths without Stripe being ready
    mockRpc.mockResolvedValue({ data: { available_usd: 10.00 } })
    mockFunctionsInvoke.mockResolvedValue({
      data: { holdAmountCents: 0, balanceAppliedCents: 250, isTopUp: false, requiresCardEntry: false },
      error: null,
    })
  })

  // ── Removed hold UI ──
  it('does NOT show "Existing Hold" section (removed)', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).not.toContain('Existing Hold')
    expect(container.textContent).not.toContain('Spent so far')
  })

  it('does NOT show "Pre-authorize a higher amount" section (removed)', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).not.toContain('Pre-authorize')
    expect(container.textContent).not.toContain('Increase your hold')
  })

  // ── Sold out ──
  it('shows Sold Out when inventory is 0', () => {
    const soldOutProps = {
      ...defaultProps,
      product: { ...defaultProps.product, inventory: 0 },
    }
    const { container } = render(React.createElement(BuyModal, soldOutProps))
    expect(container.textContent).toContain('Sold Out')
  })

  // ── Free product flow ──
  it('shows free sharing message for $0 products', () => {
    const freeProps = {
      ...defaultProps,
      product: { ...defaultProps.product, price_usd: 0 },
    }
    const { container } = render(React.createElement(BuyModal, freeProps))
    expect(container.textContent).toContain('Free sharing')
    expect(container.textContent).toContain('No payment required')
    expect(container.textContent).not.toContain('Price Breakdown')
  })

  // ── Order RPC failure ──
  it('shows error when place_market_order RPC fails', async () => {
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'place_market_order') {
        return Promise.resolve({ data: null, error: { message: 'Product not found' } })
      }
      return Promise.resolve({ data: { available_usd: 10 } })
    })

    const { container } = render(React.createElement(BuyModal, defaultProps))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))
    expect(orderBtn).toBeTruthy()
    expect(orderBtn?.disabled).toBe(false)

    await act(async () => { fireEvent.click(orderBtn!) })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    expect(container.textContent).toContain('Product not found')
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  // ── Price change detection ──
  it('shows price change message when order returns price_changed code', async () => {
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'place_market_order') {
        return Promise.resolve({
          data: {
            error: 'Price has changed',
            code: 'price_changed',
            expected_price: 2.50,
            current_price: 3.99,
          },
          error: null,
        })
      }
      return Promise.resolve({ data: { available_usd: 10 } })
    })

    const { container } = render(React.createElement(BuyModal, defaultProps))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))

    await act(async () => { fireEvent.click(orderBtn!) })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    expect(container.textContent).toContain('Price changed')
    expect(container.textContent).toContain('$2.50')
    expect(container.textContent).toContain('$3.99')
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  // ── Hold (edge function) failure with order rollback ──
  it('shows hold error and rolls back order when market-hold fails', async () => {
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'place_market_order') {
        return Promise.resolve({
          data: { order_id: 'order-abc', total_cents: 250, total_usd: 2.50, success: true },
          error: null,
        })
      }
      return Promise.resolve({ data: { available_usd: 10 } })
    })
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: false, error: 'Failed to update hold record' },
      error: null,
    })

    const { container } = render(React.createElement(BuyModal, defaultProps))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))

    await act(async () => { fireEvent.click(orderBtn!) })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    expect(container.textContent).toContain('Failed to update hold record')
    expect(mockUpdateChain.update).toHaveBeenCalled() // rollback
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  // ── Hold edge function network error ──
  it('shows hold error when edge function returns holdErr', async () => {
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'place_market_order') {
        return Promise.resolve({
          data: { order_id: 'order-def', total_cents: 250, total_usd: 2.50, success: true },
          error: null,
        })
      }
      return Promise.resolve({ data: { available_usd: 10 } })
    })
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge function timeout' },
    })

    const { container } = render(React.createElement(BuyModal, defaultProps))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))

    await act(async () => { fireEvent.click(orderBtn!) })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    expect(container.textContent).toContain('Edge function timeout')
    expect(mockUpdateChain.update).toHaveBeenCalled() // rollback
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  // ── Successful order flow (balance-covered) ──
  it('calls onSuccess when order + hold succeed (balance covers)', async () => {
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'place_market_order') {
        return Promise.resolve({
          data: { order_id: 'order-ok', total_cents: 250, total_usd: 2.50, success: true },
          error: null,
        })
      }
      return Promise.resolve({ data: { available_usd: 10 } })
    })
    mockFunctionsInvoke.mockResolvedValue({
      data: { holdAmountCents: 0, balanceAppliedCents: 250, isTopUp: false, requiresCardEntry: false },
      error: null,
    })

    const { container } = render(React.createElement(BuyModal, defaultProps))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))

    await act(async () => { fireEvent.click(orderBtn!) })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    expect(defaultProps.onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-ok',
      quantity: 1,
    }))
  })

  // ── Balance fully covers purchase — no card needed ──
  it('shows no card needed when balance covers order', async () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    expect(container.textContent).toContain('from your balance')
    expect(container.textContent).toContain('No card authorization needed')
  })

  // ── Quantity validation ──
  it('clamps quantity to available inventory', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    const qtyInput = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(qtyInput).toBeTruthy()

    fireEvent.change(qtyInput, { target: { value: '10' } })
    expect(Number(qtyInput.value)).toBeLessThanOrEqual(5)
  })

  // ── Delivery address required ──
  it('blocks order when delivery selected but no address provided', async () => {
    const deliveryProps = {
      ...defaultProps,
      booth: { ...defaultProps.booth, offers_delivery: true, offers_pickup: false },
    }

    const { container } = render(React.createElement(BuyModal, deliveryProps))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const deliveryBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Delivery'))
    if (deliveryBtn) await act(async () => { fireEvent.click(deliveryBtn) })

    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))

    await act(async () => { fireEvent.click(orderBtn!) })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    // Error message is "Please enter a delivery address"
    expect(container.textContent).toContain('delivery address')
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  // ── Place Order button disabled when card needed but not ready ──
  it('disables Place Order when card is needed but Stripe not ready', async () => {
    // Set balance to 0 so needsCard=true
    mockRpc.mockResolvedValue({ data: { available_usd: 0 } })

    const { container } = render(React.createElement(BuyModal, defaultProps))
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    const orderBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Place Order'))
    expect(orderBtn).toBeTruthy()
    // Button disabled because needsCard && !stripeReady (Stripe mocked null)
    expect(orderBtn?.disabled).toBe(true)
  })

  // ── Security notice present ──
  it('shows Stripe security notice for paid products', () => {
    const { container } = render(React.createElement(BuyModal, defaultProps))
    expect(container.textContent).toContain('Secured by Stripe')
    expect(container.textContent).toContain('card details never touch our servers')
  })
})
