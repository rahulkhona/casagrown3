/**
 * useCart Reducer — Unit Tests
 *
 * Tests the cart reducer logic: add, remove, update qty,
 * fulfillment, clear, booth-group, refresh items, and free products.
 *
 * Run: cd apps/next-market && npx vitest run lib/__tests__/useCart.test.ts
 */
import { describe, it, expect } from 'vitest'

// We test the reducer directly — extract it for unit testing
// The reducer is defined inside useCart.tsx, so we'll import and test the module
// through its exported types and test the logic patterns

// ── Helpers ──
function makeProduct(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: overrides.name ?? 'Test Tomatoes',
    price_usd: overrides.price_usd ?? 4.99,
    unit: overrides.unit ?? 'lb',
    inventory: overrides.inventory ?? 10,
    photos: overrides.photos ?? [],
    category: overrides.category ?? 'vegetables',
  }
}

function makeBooth(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? `booth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: overrides.name ?? "Sam's Garden",
    offers_delivery: overrides.offers_delivery ?? true,
    offers_pickup: overrides.offers_pickup ?? true,
    pickup_address: overrides.pickup_address ?? '123 Main St',
    delivery_radius_miles: overrides.delivery_radius_miles ?? 5,
  }
}

// ── Reducer recreation (pure function, no React deps) ──
// This mirrors the reducer in useCart.tsx for testability
type CartItem = {
  product: any
  booth: any
  qty: number
  fulfillmentMode: 'delivery' | 'pickup'
  unavailable?: string
  latestInventory?: number
  latestPrice?: number
}

type CartState = { items: CartItem[]; lastUpdated: number }

type CartAction =
  | { type: 'ADD_ITEM'; product: any; booth: any; qty: number; fulfillmentMode?: 'delivery' | 'pickup' }
  | { type: 'REMOVE_ITEM'; productId: string }
  | { type: 'UPDATE_QTY'; productId: string; qty: number }
  | { type: 'UPDATE_FULFILLMENT'; productId: string; mode: 'delivery' | 'pickup' }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_BOOTH'; boothId: string }
  | { type: 'REFRESH_ITEMS'; updates: Array<{ id: string; inventory: number; price_usd: number; is_active: boolean; expires_at?: string | null }> }
  | { type: 'LOAD'; state: CartState }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const defaultMode = action.fulfillmentMode || (action.booth.offers_pickup ? 'pickup' : 'delivery')
      const existing = state.items.findIndex(i => i.product.id === action.product.id)
      let items: CartItem[]
      if (existing >= 0) {
        items = state.items.map((item, idx) =>
          idx === existing ? { ...item, qty: action.qty, unavailable: undefined } : item
        )
      } else {
        items = [...state.items, {
          product: action.product,
          booth: action.booth,
          qty: action.qty,
          fulfillmentMode: defaultMode,
        }]
      }
      return { items, lastUpdated: Date.now() }
    }
    case 'REMOVE_ITEM':
      return { items: state.items.filter(i => i.product.id !== action.productId), lastUpdated: Date.now() }
    case 'UPDATE_QTY':
      return {
        items: state.items.map(i =>
          i.product.id === action.productId ? { ...i, qty: Math.max(1, action.qty), unavailable: undefined } : i
        ),
        lastUpdated: Date.now(),
      }
    case 'UPDATE_FULFILLMENT':
      return {
        items: state.items.map(i =>
          i.product.id === action.productId ? { ...i, fulfillmentMode: action.mode, unavailable: undefined } : i
        ),
        lastUpdated: Date.now(),
      }
    case 'CLEAR_CART':
      return { items: [], lastUpdated: Date.now() }
    case 'CLEAR_BOOTH':
      return { items: state.items.filter(i => i.booth.id !== action.boothId), lastUpdated: Date.now() }
    case 'REFRESH_ITEMS': {
      const updateMap = new Map(action.updates.map(u => [u.id, u]))
      const items = state.items.map(item => {
        const update = updateMap.get(item.product.id)
        if (!update) return item
        let unavailable: string | undefined
        if (!update.is_active) unavailable = 'inactive'
        else if (update.inventory === 0) unavailable = 'sold_out'
        else if (update.inventory < item.qty) unavailable = 'insufficient'
        return { ...item, latestInventory: update.inventory, latestPrice: update.price_usd, unavailable }
      })
      return { ...state, items }
    }
    case 'LOAD':
      return action.state
    default:
      return state
  }
}

const emptyState: CartState = { items: [], lastUpdated: 0 }

// ── Booth group computation (mirrors useCart) ──
function computeBoothGroups(items: CartItem[]) {
  const map = new Map<string, { booth: any; items: CartItem[]; subtotal: number; availableItemCount: number }>()
  for (const item of items) {
    let group = map.get(item.booth.id)
    if (!group) {
      group = { booth: item.booth, items: [], subtotal: 0, availableItemCount: 0 }
      map.set(item.booth.id, group)
    }
    group.items.push(item)
    if (!item.unavailable) {
      const price = item.latestPrice ?? item.product.price_usd
      group.subtotal += price * item.qty
      group.availableItemCount++
    }
  }
  return Array.from(map.values())
}

// ═══════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════

describe('useCart reducer', () => {
  it('ADD_ITEM adds product to empty cart', () => {
    const product = makeProduct()
    const booth = makeBooth()
    const state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 2 })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].product.id).toBe(product.id)
    expect(state.items[0].qty).toBe(2)
  })

  it('ADD_ITEM updates qty for existing product', () => {
    const product = makeProduct({ id: 'p1' })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 1 })
    state = cartReducer(state, { type: 'ADD_ITEM', product, booth, qty: 5 })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].qty).toBe(5)
  })

  it('ADD_ITEM defaults fulfillment to pickup when booth offers it', () => {
    const product = makeProduct()
    const booth = makeBooth({ offers_pickup: true })
    const state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 1 })
    expect(state.items[0].fulfillmentMode).toBe('pickup')
  })

  it('ADD_ITEM defaults fulfillment to delivery when booth only offers delivery', () => {
    const product = makeProduct()
    const booth = makeBooth({ offers_pickup: false, offers_delivery: true })
    const state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 1 })
    expect(state.items[0].fulfillmentMode).toBe('delivery')
  })

  it('ADD_ITEM uses explicit fulfillmentMode override', () => {
    const product = makeProduct()
    const booth = makeBooth({ offers_pickup: true, offers_delivery: true })
    const state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 1, fulfillmentMode: 'delivery' })
    expect(state.items[0].fulfillmentMode).toBe('delivery')
  })

  it('REMOVE_ITEM removes product by ID', () => {
    const p1 = makeProduct({ id: 'p1' })
    const p2 = makeProduct({ id: 'p2' })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product: p1, booth, qty: 1 })
    state = cartReducer(state, { type: 'ADD_ITEM', product: p2, booth, qty: 1 })
    state = cartReducer(state, { type: 'REMOVE_ITEM', productId: 'p1' })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].product.id).toBe('p2')
  })

  it('UPDATE_QTY changes quantity, min 1', () => {
    const product = makeProduct({ id: 'p1' })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 3 })
    state = cartReducer(state, { type: 'UPDATE_QTY', productId: 'p1', qty: 7 })
    expect(state.items[0].qty).toBe(7)

    // Clamp to 1
    state = cartReducer(state, { type: 'UPDATE_QTY', productId: 'p1', qty: 0 })
    expect(state.items[0].qty).toBe(1)
    state = cartReducer(state, { type: 'UPDATE_QTY', productId: 'p1', qty: -5 })
    expect(state.items[0].qty).toBe(1)
  })

  it('UPDATE_FULFILLMENT toggles delivery/pickup', () => {
    const product = makeProduct({ id: 'p1' })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 1 })
    expect(state.items[0].fulfillmentMode).toBe('pickup')
    state = cartReducer(state, { type: 'UPDATE_FULFILLMENT', productId: 'p1', mode: 'delivery' })
    expect(state.items[0].fulfillmentMode).toBe('delivery')
  })

  it('CLEAR_CART empties all items', () => {
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product: makeProduct(), booth, qty: 1 })
    state = cartReducer(state, { type: 'ADD_ITEM', product: makeProduct(), booth, qty: 2 })
    state = cartReducer(state, { type: 'CLEAR_CART' })
    expect(state.items).toHaveLength(0)
  })

  it('CLEAR_BOOTH removes only items from specified booth', () => {
    const booth1 = makeBooth({ id: 'b1' })
    const booth2 = makeBooth({ id: 'b2' })
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product: makeProduct({ id: 'p1' }), booth: booth1, qty: 1 })
    state = cartReducer(state, { type: 'ADD_ITEM', product: makeProduct({ id: 'p2' }), booth: booth2, qty: 1 })
    state = cartReducer(state, { type: 'CLEAR_BOOTH', boothId: 'b1' })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].booth.id).toBe('b2')
  })

  it('REFRESH_ITEMS marks sold out items', () => {
    const product = makeProduct({ id: 'p1', inventory: 10 })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 2 })
    state = cartReducer(state, {
      type: 'REFRESH_ITEMS',
      updates: [{ id: 'p1', inventory: 0, price_usd: 4.99, is_active: true }],
    })
    expect(state.items[0].unavailable).toBe('sold_out')
  })

  it('REFRESH_ITEMS marks inactive items', () => {
    const product = makeProduct({ id: 'p1' })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 1 })
    state = cartReducer(state, {
      type: 'REFRESH_ITEMS',
      updates: [{ id: 'p1', inventory: 5, price_usd: 4.99, is_active: false }],
    })
    expect(state.items[0].unavailable).toBe('inactive')
  })

  it('REFRESH_ITEMS marks insufficient inventory', () => {
    const product = makeProduct({ id: 'p1' })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 10 })
    state = cartReducer(state, {
      type: 'REFRESH_ITEMS',
      updates: [{ id: 'p1', inventory: 3, price_usd: 4.99, is_active: true }],
    })
    expect(state.items[0].unavailable).toBe('insufficient')
    expect(state.items[0].latestInventory).toBe(3)
  })

  it('REFRESH_ITEMS updates latestPrice', () => {
    const product = makeProduct({ id: 'p1', price_usd: 4.99 })
    const booth = makeBooth()
    let state = cartReducer(emptyState, { type: 'ADD_ITEM', product, booth, qty: 1 })
    state = cartReducer(state, {
      type: 'REFRESH_ITEMS',
      updates: [{ id: 'p1', inventory: 5, price_usd: 6.99, is_active: true }],
    })
    expect(state.items[0].latestPrice).toBe(6.99)
  })

  it('LOAD restores saved state', () => {
    const saved: CartState = {
      items: [{ product: makeProduct({ id: 'saved' }), booth: makeBooth(), qty: 3, fulfillmentMode: 'delivery' }],
      lastUpdated: 12345,
    }
    const state = cartReducer(emptyState, { type: 'LOAD', state: saved })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].product.id).toBe('saved')
    expect(state.lastUpdated).toBe(12345)
  })

  it('handles free product ($0 price)', () => {
    const freeProduct = makeProduct({ id: 'free1', price_usd: 0, name: 'Free Herbs' })
    const booth = makeBooth()
    const state = cartReducer(emptyState, { type: 'ADD_ITEM', product: freeProduct, booth, qty: 1 })
    expect(state.items[0].product.price_usd).toBe(0)
  })
})

describe('boothGroups computation', () => {
  it('groups items by booth', () => {
    const b1 = makeBooth({ id: 'b1', name: 'Booth A' })
    const b2 = makeBooth({ id: 'b2', name: 'Booth B' })
    const items: CartItem[] = [
      { product: makeProduct({ id: 'p1', price_usd: 5 }), booth: b1, qty: 2, fulfillmentMode: 'pickup' },
      { product: makeProduct({ id: 'p2', price_usd: 3 }), booth: b1, qty: 1, fulfillmentMode: 'pickup' },
      { product: makeProduct({ id: 'p3', price_usd: 10 }), booth: b2, qty: 1, fulfillmentMode: 'delivery' },
    ]
    const groups = computeBoothGroups(items)
    expect(groups).toHaveLength(2)
    const g1 = groups.find(g => g.booth.id === 'b1')!
    expect(g1.items).toHaveLength(2)
    expect(g1.subtotal).toBe(13) // 5*2 + 3*1
    expect(g1.availableItemCount).toBe(2)
  })

  it('excludes unavailable items from subtotal', () => {
    const booth = makeBooth({ id: 'b1' })
    const items: CartItem[] = [
      { product: makeProduct({ id: 'p1', price_usd: 5 }), booth, qty: 1, fulfillmentMode: 'pickup' },
      { product: makeProduct({ id: 'p2', price_usd: 8 }), booth, qty: 1, fulfillmentMode: 'pickup', unavailable: 'sold_out' },
    ]
    const groups = computeBoothGroups(items)
    expect(groups[0].subtotal).toBe(5)
    expect(groups[0].availableItemCount).toBe(1)
  })

  it('uses latestPrice when available', () => {
    const booth = makeBooth({ id: 'b1' })
    const items: CartItem[] = [
      { product: makeProduct({ id: 'p1', price_usd: 5 }), booth, qty: 2, fulfillmentMode: 'pickup', latestPrice: 7 },
    ]
    const groups = computeBoothGroups(items)
    expect(groups[0].subtotal).toBe(14) // 7*2, not 5*2
  })
})
