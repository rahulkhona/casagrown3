// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unmock store so we test the real reducer (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/store')
// We'll test via the MarketProvider + useMarket hook instead.
// For pure reducer logic, we can test the exported helpers + state transitions.

// Import the types and test state transitions through the provider
import React from 'react'
import { render, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

// Since the reducer isn't exported, we test via context
// First, let's mock supabase to prevent RPC calls
vi.mock('../../lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null }) }) }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null }),
  }),
}))

import { MarketProvider, useMarket, type MarketState, type Booth, type Product, type Order, type MarketSchedule } from '../../lib/store'

// Helper: render a hook within MarketProvider
function renderWithProvider() {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(MarketProvider, null, children)
  return renderHook(() => useMarket(), { wrapper })
}

describe('Store Reducer - Auth Actions', () => {
  it('LOGIN sets user and isAuthenticated', () => {
    const { result } = renderWithProvider()
    act(() => {
      result.current.dispatch({ type: 'LOGIN', payload: { email: 'test@test.com' } })
    })
    expect(result.current.state.isAuthenticated).toBe(true)
    expect(result.current.state.user?.email).toBe('test@test.com')
  })

  it('LOGOUT clears user and resets terms', () => {
    const { result } = renderWithProvider()
    act(() => {
      result.current.dispatch({ type: 'LOGIN', payload: { email: 'test@test.com' } })
      result.current.dispatch({ type: 'ACCEPT_TERMS' })
      result.current.dispatch({ type: 'LOGOUT' })
    })
    expect(result.current.state.isAuthenticated).toBe(false)
    expect(result.current.state.user).toBeNull()
    expect(result.current.state.hasAcceptedTerms).toBe(false)
  })

  it('ACCEPT_TERMS sets hasAcceptedTerms', () => {
    const { result } = renderWithProvider()
    act(() => {
      result.current.dispatch({ type: 'ACCEPT_TERMS' })
    })
    expect(result.current.state.hasAcceptedTerms).toBe(true)
  })

  it('UPDATE_PROFILE updates user fields', () => {
    const { result } = renderWithProvider()
    act(() => {
      result.current.dispatch({ type: 'LOGIN', payload: { email: 'test@test.com' } })
      result.current.dispatch({ type: 'UPDATE_PROFILE', payload: { name: 'New Name', phone: '555-999' } })
    })
    expect(result.current.state.user?.name).toBe('New Name')
    expect(result.current.state.user?.phone).toBe('555-999')
  })

  it('UPDATE_PROFILE does nothing when no user', () => {
    const { result } = renderWithProvider()
    act(() => {
      result.current.dispatch({ type: 'UPDATE_PROFILE', payload: { name: 'Ghost' } })
    })
    expect(result.current.state.user).toBeNull()
  })
})

describe('Store Reducer - Booth Actions', () => {
  it('CREATE_BOOTH adds booth and auto-authenticates', () => {
    const { result } = renderWithProvider()
    const initialCount = result.current.state.booths.length
    act(() => {
      result.current.dispatch({
        type: 'CREATE_BOOTH',
        payload: {
          ownerId: 'user-1', ownerName: 'Test Owner', name: 'Test Booth',
          description: 'Test desc', decorativeTheme: 'rustic', aboutHtml: '',
          inviteCode: 'TEST123',
        },
      })
    })
    expect(result.current.state.booths).toHaveLength(initialCount + 1)
    expect(result.current.state.isAuthenticated).toBe(true)
    const newBooth = result.current.state.booths[result.current.state.booths.length - 1]
    expect(newBooth.name).toBe('Test Booth')
    expect(newBooth.productCount).toBe(0)
    expect(newBooth.rating).toBe(5.0)
  })

  it('UPDATE_BOOTH modifies existing booth', () => {
    const { result } = renderWithProvider()
    const boothId = result.current.state.booths[0].id
    act(() => {
      result.current.dispatch({ type: 'UPDATE_BOOTH', payload: { id: boothId, name: 'Renamed Booth' } })
    })
    expect(result.current.state.booths.find(b => b.id === boothId)?.name).toBe('Renamed Booth')
  })
})

describe('Store Reducer - Product Actions', () => {
  it('ADD_PRODUCT adds product and increments booth count', () => {
    const { result } = renderWithProvider()
    const boothId = result.current.state.booths[0].id
    const initialCount = result.current.state.booths[0].productCount
    act(() => {
      result.current.dispatch({
        type: 'ADD_PRODUCT',
        payload: {
          boothId, boothName: 'Test', name: 'New Product', description: 'Desc',
          photos: [], priceUsd: 5.00, unit: 'each', category: 'vegetables',
          inventory: 10, offersPickup: true,
        },
      })
    })
    expect(result.current.state.products.find(p => p.name === 'New Product')).toBeTruthy()
    expect(result.current.state.booths.find(b => b.id === boothId)?.productCount).toBe(initialCount + 1)
  })

  it('UPDATE_PRODUCT modifies existing product', () => {
    const { result } = renderWithProvider()
    const prodId = result.current.state.products[0].id
    act(() => {
      result.current.dispatch({ type: 'UPDATE_PRODUCT', payload: { id: prodId, priceUsd: 99.99 } })
    })
    expect(result.current.state.products.find(p => p.id === prodId)?.priceUsd).toBe(99.99)
  })

  it('DELETE_PRODUCT removes product and decrements booth count', () => {
    const { result } = renderWithProvider()
    const prod = result.current.state.products[0]
    const boothId = prod.boothId
    const initialCount = result.current.state.booths.find(b => b.id === boothId)!.productCount
    const initialProducts = result.current.state.products.length
    act(() => {
      result.current.dispatch({ type: 'DELETE_PRODUCT', payload: prod.id })
    })
    expect(result.current.state.products).toHaveLength(initialProducts - 1)
    expect(result.current.state.booths.find(b => b.id === boothId)?.productCount).toBe(initialCount - 1)
  })
})

describe('Store Reducer - Order Actions', () => {
  it('PLACE_ORDER creates order and reduces inventory', () => {
    const { result } = renderWithProvider()
    const prod = result.current.state.products[0]
    const initialInventory = prod.inventory
    const initialOrders = result.current.state.orders.length
    act(() => {
      result.current.dispatch({
        type: 'PLACE_ORDER',
        payload: {
          buyerId: 'user-1', buyerName: 'Test Buyer',
          sellerId: 'user-2', sellerName: 'Test Seller',
          boothId: prod.boothId, boothName: 'Test Booth',
          items: [{ productId: prod.id, productName: prod.name, qty: 2, unitPrice: prod.priceUsd, couponDiscount: 0 }],
          subtotal: prod.priceUsd * 2, tax: 0.50, platformFee: 0.30,
          total: prod.priceUsd * 2 + 0.80, deliveryType: 'pickup', passcode: '123456',
        },
      })
    })
    expect(result.current.state.orders).toHaveLength(initialOrders + 1)
    const newOrder = result.current.state.orders[result.current.state.orders.length - 1]
    expect(newOrder.status).toBe('pending')
    expect(result.current.state.products.find(p => p.id === prod.id)?.inventory).toBe(initialInventory - 2)
  })

  it('UPDATE_ORDER_STATUS changes order status', () => {
    const { result } = renderWithProvider()
    const orderId = result.current.state.orders[0].id
    act(() => {
      result.current.dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId, status: 'delivered' } })
    })
    expect(result.current.state.orders.find(o => o.id === orderId)?.status).toBe('delivered')
  })

  it('UPDATE_ORDER_STATUS handles dispute', () => {
    const { result } = renderWithProvider()
    const orderId = result.current.state.orders[0].id
    act(() => {
      result.current.dispatch({
        type: 'UPDATE_ORDER_STATUS',
        payload: { orderId, status: 'disputed', disputeReason: 'Wrong items', disputePhotos: ['photo.jpg'] },
      })
    })
    const order = result.current.state.orders.find(o => o.id === orderId)
    expect(order?.status).toBe('disputed')
    expect(order?.disputeReason).toBe('Wrong items')
    expect(order?.disputePhotos).toContain('photo.jpg')
  })
})

describe('Store Reducer - Chat Actions', () => {
  it('SEND_MESSAGE appends message and updates last message', () => {
    const { result } = renderWithProvider()
    const convId = result.current.state.conversations[0].id
    const initialMsgs = result.current.state.conversations[0].messages.length
    act(() => {
      result.current.dispatch({
        type: 'SEND_MESSAGE',
        payload: {
          conversationId: convId,
          message: { senderId: 'user-1', senderName: 'Alex', text: 'Hello!', type: 'text' },
        },
      })
    })
    const conv = result.current.state.conversations.find(c => c.id === convId)!
    expect(conv.messages).toHaveLength(initialMsgs + 1)
    expect(conv.lastMessage).toBe('Hello!')
  })

  it('CREATE_CONVERSATION adds new conversation', () => {
    const { result } = renderWithProvider()
    const initial = result.current.state.conversations.length
    act(() => {
      result.current.dispatch({
        type: 'CREATE_CONVERSATION',
        payload: {
          orderId: 'order-999', buyerId: 'user-1', buyerName: 'Alex',
          sellerId: 'user-2', sellerName: 'Maria', boothName: 'Test Booth',
        },
      })
    })
    expect(result.current.state.conversations).toHaveLength(initial + 1)
  })
})

describe('Store Reducer - Coupon Actions', () => {
  it('CREATE_COUPON adds coupon', () => {
    const { result } = renderWithProvider()
    const initial = result.current.state.coupons.length
    act(() => {
      result.current.dispatch({
        type: 'CREATE_COUPON',
        payload: {
          boothId: 'booth-1', code: 'TEST50', discountType: 'percent',
          discountValue: 50, expiresAt: '2026-12-31', usesRemaining: 100, totalUses: 100,
        },
      })
    })
    expect(result.current.state.coupons).toHaveLength(initial + 1)
    expect(result.current.state.coupons.find(c => c.code === 'TEST50')).toBeTruthy()
  })

  it('DELETE_COUPON removes coupon', () => {
    const { result } = renderWithProvider()
    const couponId = result.current.state.coupons[0].id
    const initial = result.current.state.coupons.length
    act(() => {
      result.current.dispatch({ type: 'DELETE_COUPON', payload: couponId })
    })
    expect(result.current.state.coupons).toHaveLength(initial - 1)
    expect(result.current.state.coupons.find(c => c.id === couponId)).toBeUndefined()
  })
})

describe('Store Reducer - Toast + Notification Actions', () => {
  it('ADD_TOAST and REMOVE_TOAST manage toasts', () => {
    const { result } = renderWithProvider()
    act(() => {
      result.current.dispatch({ type: 'ADD_TOAST', payload: { message: 'Success!', type: 'success' } })
    })
    expect(result.current.state.toasts).toHaveLength(1)
    expect(result.current.state.toasts[0].message).toBe('Success!')

    const toastId = result.current.state.toasts[0].id
    act(() => {
      result.current.dispatch({ type: 'REMOVE_TOAST', payload: toastId })
    })
    expect(result.current.state.toasts).toHaveLength(0)
  })

  it('MARK_NOTIFICATION_READ marks notification as read', () => {
    const { result } = renderWithProvider()
    const notifId = result.current.state.notifications.find(n => !n.read)?.id
    if (notifId) {
      act(() => {
        result.current.dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notifId })
      })
      expect(result.current.state.notifications.find(n => n.id === notifId)?.read).toBe(true)
    }
  })
})

describe('Store Reducer - Market Config', () => {
  it('LOAD_MARKET_CONFIG updates schedule and overrides', () => {
    const { result } = renderWithProvider()
    const newSchedule: MarketSchedule[] = [
      { dayOfWeek: 0, dayName: 'Sunday', openTime: '09:00', closeTime: '12:00' },
      { dayOfWeek: 3, dayName: 'Wednesday', openTime: '16:00', closeTime: '19:00' },
    ]
    act(() => {
      result.current.dispatch({
        type: 'LOAD_MARKET_CONFIG',
        payload: { schedule: newSchedule, productsNeverExpire: true, marketNeverCloses: true },
      })
    })
    expect(result.current.state.marketSchedule).toHaveLength(2)
    expect(result.current.state.productsNeverExpire).toBe(true)
    expect(result.current.state.marketNeverCloses).toBe(true)
  })

  it('LOAD_MARKET_CONFIG keeps existing schedule if empty', () => {
    const { result } = renderWithProvider()
    const originalSchedule = result.current.state.marketSchedule
    act(() => {
      result.current.dispatch({
        type: 'LOAD_MARKET_CONFIG',
        payload: { schedule: [], productsNeverExpire: false, marketNeverCloses: false },
      })
    })
    expect(result.current.state.marketSchedule).toEqual(originalSchedule)
  })
})
