/**
 * Unit tests for the Orders page — buyer grouping logic (b)
 */
import { describe, it, expect } from 'vitest'

interface MockOrder {
  id: string
  buyer_id: string
  seller_id: string
  buyer_name: string
  seller_name: string
  product_name: string
  quantity: number
  unit_price_usd: number
  total_usd: number
  fulfillment_type: 'delivery' | 'pickup'
  status: string
  created_at: string
}

// Extract the grouping logic from the orders page for testability
function groupOrdersByBuyer(orders: MockOrder[]) {
  const groups = new Map<string, { buyerId: string; buyerName: string; orders: MockOrder[] }>()
  orders.forEach(order => {
    const key = order.buyer_id
    if (!groups.has(key)) {
      groups.set(key, { buyerId: order.buyer_id, buyerName: order.buyer_name || 'Unknown', orders: [] })
    }
    groups.get(key)!.orders.push(order)
  })
  return Array.from(groups.values())
}

function shouldGroupOrders(role: string, tab: string) {
  return role === 'selling' && (tab === 'pending_delivery' || tab === 'pending_pickup')
}

const makeOrder = (overrides: Partial<MockOrder> = {}): MockOrder => ({
  id: Math.random().toString(36).slice(2),
  buyer_id: 'buyer-1',
  seller_id: 'seller-1',
  buyer_name: 'Alice',
  seller_name: 'Sam',
  product_name: 'Tomatoes',
  quantity: 2,
  unit_price_usd: 3.00,
  total_usd: 6.00,
  fulfillment_type: 'pickup',
  status: 'pending',
  created_at: '2026-03-22T10:00:00Z',
  ...overrides,
})

describe('Orders Page — Buyer Grouping', () => {
  describe('shouldGroupOrders', () => {
    it('should group when selling + pending_delivery', () => {
      expect(shouldGroupOrders('selling', 'pending_delivery')).toBe(true)
    })

    it('should group when selling + pending_pickup', () => {
      expect(shouldGroupOrders('selling', 'pending_pickup')).toBe(true)
    })

    it('should NOT group for buying role', () => {
      expect(shouldGroupOrders('buying', 'pending_delivery')).toBe(false)
      expect(shouldGroupOrders('buying', 'pending_pickup')).toBe(false)
    })

    it('should NOT group for completed/disputed tabs', () => {
      expect(shouldGroupOrders('selling', 'completed')).toBe(false)
      expect(shouldGroupOrders('selling', 'disputed')).toBe(false)
    })
  })

  describe('groupOrdersByBuyer', () => {
    it('groups orders by buyer_id', () => {
      const orders = [
        makeOrder({ buyer_id: 'b1', buyer_name: 'Alice', product_name: 'Tomatoes' }),
        makeOrder({ buyer_id: 'b1', buyer_name: 'Alice', product_name: 'Peppers' }),
        makeOrder({ buyer_id: 'b2', buyer_name: 'Bob', product_name: 'Lemons' }),
      ]
      const groups = groupOrdersByBuyer(orders)
      expect(groups).toHaveLength(2)
      expect(groups[0].buyerName).toBe('Alice')
      expect(groups[0].orders).toHaveLength(2)
      expect(groups[1].buyerName).toBe('Bob')
      expect(groups[1].orders).toHaveLength(1)
    })

    it('handles single buyer with multiple orders', () => {
      const orders = [
        makeOrder({ buyer_id: 'b1', product_name: 'Item 1' }),
        makeOrder({ buyer_id: 'b1', product_name: 'Item 2' }),
        makeOrder({ buyer_id: 'b1', product_name: 'Item 3' }),
      ]
      const groups = groupOrdersByBuyer(orders)
      expect(groups).toHaveLength(1)
      expect(groups[0].orders).toHaveLength(3)
    })

    it('handles empty orders', () => {
      expect(groupOrdersByBuyer([])).toHaveLength(0)
    })

    it('preserves order within groups', () => {
      const orders = [
        makeOrder({ buyer_id: 'b1', product_name: 'First' }),
        makeOrder({ buyer_id: 'b1', product_name: 'Second' }),
      ]
      const groups = groupOrdersByBuyer(orders)
      expect(groups[0].orders[0].product_name).toBe('First')
      expect(groups[0].orders[1].product_name).toBe('Second')
    })

    it('calculates group totals correctly', () => {
      const orders = [
        makeOrder({ buyer_id: 'b1', total_usd: 5.00 }),
        makeOrder({ buyer_id: 'b1', total_usd: 7.50 }),
        makeOrder({ buyer_id: 'b1', total_usd: 2.50 }),
      ]
      const groups = groupOrdersByBuyer(orders)
      const groupTotal = groups[0].orders.reduce((sum, o) => sum + o.total_usd, 0)
      expect(groupTotal).toBe(15.00)
    })

    it('handles each buyer separately even with same name', () => {
      const orders = [
        makeOrder({ buyer_id: 'b1', buyer_name: 'Alice' }),
        makeOrder({ buyer_id: 'b2', buyer_name: 'Alice' }),
      ]
      const groups = groupOrdersByBuyer(orders)
      expect(groups).toHaveLength(2)
    })

    it('handles mixed fulfillment types within same buyer', () => {
      const orders = [
        makeOrder({ buyer_id: 'b1', fulfillment_type: 'pickup', product_name: 'Tomatoes' }),
        makeOrder({ buyer_id: 'b1', fulfillment_type: 'delivery', product_name: 'Lemons' }),
      ]
      const groups = groupOrdersByBuyer(orders)
      expect(groups).toHaveLength(1)
      expect(groups[0].orders).toHaveLength(2)
    })
  })
})
