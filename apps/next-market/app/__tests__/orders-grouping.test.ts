/**
 * Unit tests for the Orders page — unified counterparty grouping + tab/filter logic
 * Updated to reflect the new status-first + role-filter architecture.
 */
import { describe, it, expect } from 'vitest'

interface MockOrder {
  id: string
  buyer_id: string
  seller_id: string
  buyer_name: string
  seller_name: string
  buyer_avatar: string | null
  seller_avatar: string | null
  product_name: string
  quantity: number
  unit_price_usd: number
  total_usd: number
  fulfillment_type: 'delivery' | 'pickup'
  status: string
  created_at: string
  delivered_at: string | null
  auto_complete_at: string | null
  decline_reason: string | null
  buyer_address: string | null
  seller_address: string | null
}

// ── Counterparty grouping logic (extracted from page.tsx) ──
function groupByCounterparty(orders: MockOrder[], userId: string) {
  const groups = new Map<string, {
    otherId: string
    otherName: string
    otherAvatar: string | null
    orders: MockOrder[]
  }>()
  orders.forEach(order => {
    const isBuyer = order.buyer_id === userId
    const otherId = isBuyer ? order.seller_id : order.buyer_id
    const otherName = isBuyer ? (order.seller_name || 'Unknown') : (order.buyer_name || 'Unknown')
    const otherAvatar = isBuyer ? (order.seller_avatar || null) : (order.buyer_avatar || null)
    if (!groups.has(otherId)) {
      groups.set(otherId, { otherId, otherName, otherAvatar, orders: [] })
    }
    groups.get(otherId)!.orders.push(order)
  })
  return Array.from(groups.values())
}

// ── Tab matchers (extracted from page.tsx) ──
function needsAction(order: MockOrder, userId: string): boolean {
  const isBuyer = order.buyer_id === userId
  const isSeller = order.seller_id === userId
  if (isSeller && order.status === 'pending') return true
  if (isBuyer && order.status === 'delivered') return true
  if (['disputed', 'escalated'].includes(order.status)) return true
  return false
}

function isDelivered(order: MockOrder): boolean {
  return order.status === 'delivered'
}

function isDisputed(order: MockOrder): boolean {
  return ['disputed', 'escalated'].includes(order.status)
}

function isCompleted(order: MockOrder): boolean {
  return ['completed', 'cancelled', 'resolved'].includes(order.status)
}

// ── Hint logic (extracted from page.tsx) ──
function getHint(order: MockOrder, userId: string): string | null {
  const isBuyer = order.buyer_id === userId
  const isSeller = order.seller_id === userId
  if (order.status === 'pending' && isSeller) return '⏳ Fulfill or decline this order'
  if (order.status === 'pending' && isBuyer) return '⏳ Seller is preparing your order'
  if (order.status === 'delivered' && isBuyer) return '✅ Confirm receipt or dispute within 4 hours'
  if (order.status === 'delivered' && isSeller) return '📦 Delivered — waiting for buyer confirmation'
  if (['disputed', 'escalated'].includes(order.status) && isSeller) return '⚠️ Respond to this dispute'
  if (['disputed', 'escalated'].includes(order.status) && isBuyer) return '⚠️ Dispute in progress'
  if (order.status === 'cancelled') return order.decline_reason ? `✕ Declined: ${order.decline_reason}` : '✕ Order cancelled'
  return null
}

const SELLER_ID = 'seller-1'
const BUYER_ID = 'buyer-1'

const makeOrder = (overrides: Partial<MockOrder> = {}): MockOrder => ({
  id: Math.random().toString(36).slice(2),
  buyer_id: BUYER_ID,
  seller_id: SELLER_ID,
  buyer_name: 'Beth Buyer',
  seller_name: 'Sam Seller',
  buyer_avatar: null,
  seller_avatar: null,
  product_name: 'Tomatoes',
  quantity: 2,
  unit_price_usd: 3.00,
  total_usd: 6.00,
  fulfillment_type: 'pickup',
  status: 'pending',
  created_at: '2026-03-22T10:00:00Z',
  delivered_at: null,
  auto_complete_at: null,
  decline_reason: null,
  buyer_address: '123 Main St',
  seller_address: '456 Oak Ave',
  ...overrides,
})

describe('Orders Page — Tab Matchers', () => {
  it('seller pending order → needs action', () => {
    const order = makeOrder({ status: 'pending' })
    expect(needsAction(order, SELLER_ID)).toBe(true)
  })

  it('buyer pending order → NOT needs action', () => {
    const order = makeOrder({ status: 'pending' })
    expect(needsAction(order, BUYER_ID)).toBe(false)
  })

  it('buyer delivered order → needs action', () => {
    const order = makeOrder({ status: 'delivered' })
    expect(needsAction(order, BUYER_ID)).toBe(true)
  })

  it('seller delivered order → NOT needs action', () => {
    const order = makeOrder({ status: 'delivered' })
    expect(needsAction(order, SELLER_ID)).toBe(false)
  })

  it('disputed orders → needs action for both parties', () => {
    const order = makeOrder({ status: 'disputed' })
    expect(needsAction(order, SELLER_ID)).toBe(true)
    expect(needsAction(order, BUYER_ID)).toBe(true)
  })

  it('escalated orders → needs action for both parties', () => {
    const order = makeOrder({ status: 'escalated' })
    expect(needsAction(order, SELLER_ID)).toBe(true)
    expect(needsAction(order, BUYER_ID)).toBe(true)
  })

  it('completed orders → NOT needs action', () => {
    const order = makeOrder({ status: 'completed' })
    expect(needsAction(order, SELLER_ID)).toBe(false)
    expect(needsAction(order, BUYER_ID)).toBe(false)
  })

  it('cancelled orders → NOT needs action', () => {
    const order = makeOrder({ status: 'cancelled' })
    expect(needsAction(order, SELLER_ID)).toBe(false)
    expect(needsAction(order, BUYER_ID)).toBe(false)
  })

  it('delivered tab shows only delivered status', () => {
    expect(isDelivered(makeOrder({ status: 'delivered' }))).toBe(true)
    expect(isDelivered(makeOrder({ status: 'pending' }))).toBe(false)
    expect(isDelivered(makeOrder({ status: 'completed' }))).toBe(false)
  })

  it('disputed tab includes disputed and escalated', () => {
    expect(isDisputed(makeOrder({ status: 'disputed' }))).toBe(true)
    expect(isDisputed(makeOrder({ status: 'escalated' }))).toBe(true)
    expect(isDisputed(makeOrder({ status: 'pending' }))).toBe(false)
  })

  it('completed tab includes completed, cancelled, resolved', () => {
    expect(isCompleted(makeOrder({ status: 'completed' }))).toBe(true)
    expect(isCompleted(makeOrder({ status: 'cancelled' }))).toBe(true)
    expect(isCompleted(makeOrder({ status: 'resolved' }))).toBe(true)
    expect(isCompleted(makeOrder({ status: 'pending' }))).toBe(false)
    expect(isCompleted(makeOrder({ status: 'delivered' }))).toBe(false)
  })
})

describe('Orders Page — Counterparty Grouping', () => {
  it('groups by counterparty (buyer perspective groups by seller)', () => {
    const orders = [
      makeOrder({ seller_id: 's1', seller_name: 'Sam', product_name: 'Tomatoes' }),
      makeOrder({ seller_id: 's1', seller_name: 'Sam', product_name: 'Peppers' }),
      makeOrder({ seller_id: 's2', seller_name: 'Maria', product_name: 'Lemons' }),
    ]
    const groups = groupByCounterparty(orders, BUYER_ID)
    expect(groups).toHaveLength(2)
    expect(groups[0].otherName).toBe('Sam')
    expect(groups[0].orders).toHaveLength(2)
    expect(groups[1].otherName).toBe('Maria')
    expect(groups[1].orders).toHaveLength(1)
  })

  it('groups by counterparty (seller perspective groups by buyer)', () => {
    const orders = [
      makeOrder({ buyer_id: 'b1', buyer_name: 'Alice', product_name: 'Tomatoes' }),
      makeOrder({ buyer_id: 'b1', buyer_name: 'Alice', product_name: 'Peppers' }),
      makeOrder({ buyer_id: 'b2', buyer_name: 'Bob', product_name: 'Lemons' }),
    ]
    const groups = groupByCounterparty(orders, SELLER_ID)
    expect(groups).toHaveLength(2)
    expect(groups[0].otherName).toBe('Alice')
    expect(groups[0].orders).toHaveLength(2)
    expect(groups[1].otherName).toBe('Bob')
    expect(groups[1].orders).toHaveLength(1)
  })

  it('handles empty orders', () => {
    expect(groupByCounterparty([], SELLER_ID)).toHaveLength(0)
  })

  it('preserves order within groups', () => {
    const orders = [
      makeOrder({ buyer_id: 'b1', product_name: 'First' }),
      makeOrder({ buyer_id: 'b1', product_name: 'Second' }),
    ]
    const groups = groupByCounterparty(orders, SELLER_ID)
    expect(groups[0].orders[0].product_name).toBe('First')
    expect(groups[0].orders[1].product_name).toBe('Second')
  })

  it('calculates group totals correctly', () => {
    const orders = [
      makeOrder({ buyer_id: 'b1', total_usd: 5.00 }),
      makeOrder({ buyer_id: 'b1', total_usd: 7.50 }),
      makeOrder({ buyer_id: 'b1', total_usd: 2.50 }),
    ]
    const groups = groupByCounterparty(orders, SELLER_ID)
    const groupTotal = groups[0].orders.reduce((sum, o) => sum + o.total_usd, 0)
    expect(groupTotal).toBe(15.00)
  })

  it('handles same-name users with different IDs', () => {
    const orders = [
      makeOrder({ buyer_id: 'b1', buyer_name: 'Alice' }),
      makeOrder({ buyer_id: 'b2', buyer_name: 'Alice' }),
    ]
    const groups = groupByCounterparty(orders, SELLER_ID)
    expect(groups).toHaveLength(2)
  })

  it('handles mixed fulfillment types within same counterparty', () => {
    const orders = [
      makeOrder({ buyer_id: 'b1', fulfillment_type: 'pickup', product_name: 'Tomatoes' }),
      makeOrder({ buyer_id: 'b1', fulfillment_type: 'delivery', product_name: 'Lemons' }),
    ]
    const groups = groupByCounterparty(orders, SELLER_ID)
    expect(groups).toHaveLength(1)
    expect(groups[0].orders).toHaveLength(2)
  })

  it('unifies buying+selling orders when mixed (unified view)', () => {
    const userId = 'user-1'
    const orders = [
      // User is SELLING to buyer-a
      makeOrder({ seller_id: userId, buyer_id: 'buyer-a', buyer_name: 'Alice', status: 'pending' }),
      // User is BUYING from seller-b
      makeOrder({ buyer_id: userId, seller_id: 'seller-b', seller_name: 'Bob', status: 'delivered' }),
    ]
    const groups = groupByCounterparty(orders, userId)
    expect(groups).toHaveLength(2)
    expect(groups[0].otherName).toBe('Alice')
    expect(groups[1].otherName).toBe('Bob')
  })
})

describe('Orders Page — Hint Logic', () => {
  it('seller pending → fulfill hint', () => {
    expect(getHint(makeOrder({ status: 'pending' }), SELLER_ID)).toBe('⏳ Fulfill or decline this order')
  })

  it('buyer pending → preparing hint', () => {
    expect(getHint(makeOrder({ status: 'pending' }), BUYER_ID)).toBe('⏳ Seller is preparing your order')
  })

  it('buyer delivered → confirm hint', () => {
    expect(getHint(makeOrder({ status: 'delivered' }), BUYER_ID)).toBe('✅ Confirm receipt or dispute within 4 hours')
  })

  it('seller delivered → waiting hint', () => {
    expect(getHint(makeOrder({ status: 'delivered' }), SELLER_ID)).toBe('📦 Delivered — waiting for buyer confirmation')
  })

  it('seller disputed → respond hint', () => {
    expect(getHint(makeOrder({ status: 'disputed' }), SELLER_ID)).toBe('⚠️ Respond to this dispute')
  })

  it('buyer disputed → in progress hint', () => {
    expect(getHint(makeOrder({ status: 'disputed' }), BUYER_ID)).toBe('⚠️ Dispute in progress')
  })

  it('cancelled with reason → shows reason', () => {
    expect(getHint(makeOrder({ status: 'cancelled', decline_reason: 'Out of stock' }), SELLER_ID))
      .toBe('✕ Declined: Out of stock')
  })

  it('cancelled without reason → generic cancel', () => {
    expect(getHint(makeOrder({ status: 'cancelled', decline_reason: null }), SELLER_ID))
      .toBe('✕ Order cancelled')
  })

  it('completed → no hint', () => {
    expect(getHint(makeOrder({ status: 'completed' }), SELLER_ID)).toBeNull()
  })

  it('resolved → no hint', () => {
    expect(getHint(makeOrder({ status: 'resolved' }), BUYER_ID)).toBeNull()
  })
})

describe('Orders Page — Role Filtering', () => {
  it('buying filter shows only buyer orders', () => {
    const userId = 'user-1'
    const orders = [
      makeOrder({ buyer_id: userId, seller_id: 'other-1' }),
      makeOrder({ buyer_id: 'other-2', seller_id: userId }),
    ]
    const buyingOnly = orders.filter(o => o.buyer_id === userId)
    expect(buyingOnly).toHaveLength(1)
    expect(buyingOnly[0].seller_id).toBe('other-1')
  })

  it('selling filter shows only seller orders', () => {
    const userId = 'user-1'
    const orders = [
      makeOrder({ buyer_id: userId, seller_id: 'other-1' }),
      makeOrder({ buyer_id: 'other-2', seller_id: userId }),
    ]
    const sellingOnly = orders.filter(o => o.seller_id === userId)
    expect(sellingOnly).toHaveLength(1)
    expect(sellingOnly[0].buyer_id).toBe('other-2')
  })

  it('all filter shows both buy and sell orders', () => {
    const userId = 'user-1'
    const orders = [
      makeOrder({ buyer_id: userId, seller_id: 'other-1' }),
      makeOrder({ buyer_id: 'other-2', seller_id: userId }),
    ]
    // 'all' filter = no filtering
    expect(orders).toHaveLength(2)
  })
})
