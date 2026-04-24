// @vitest-environment jsdom
/**
 * Deep tests for RatingReminder (217 lines).
 * Exercises: auth callback, buyer/seller rating, skip with localStorage, dismissed state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

// ── Supabase mock ──
function chain(data: any = null) {
  const result = { data, error: null }
  const c: any = {}
  const methods = ['select', 'eq', 'neq', 'single', 'maybeSingle', 'limit', 'is', 'gt', 'lt', 'gte', 'lte', 'in', 'insert', 'update', 'upsert', 'delete', 'match', 'order', 'or', 'not', 'contains', 'like', 'ilike', 'range', 'filter', 'on', 'ascending']
  for (const m of methods) c[m] = vi.fn().mockReturnValue(c)
  c.single = vi.fn().mockResolvedValue({ data, error: null })
  c.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  c.then = (resolve: any) => Promise.resolve(result).then(resolve)
  c.catch = (reject: any) => Promise.resolve(result).catch(reject)
  c.finally = (cb: any) => Promise.resolve(result).finally(cb)
  return c
}

let authChangeCallback: ((event: string, session: any) => void) | null = null

const mockSupabase = {
  from: vi.fn(() => chain()),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }),
    onAuthStateChange: vi.fn().mockImplementation((cb: any) => {
      authChangeCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
  },
}

vi.mock('../../../lib/supabase', () => ({ createClient: () => mockSupabase }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => mockSupabase }))

beforeEach(() => {
  vi.clearAllMocks()
  authChangeCallback = null
  localStorage.clear()
})
afterEach(() => { cleanup() })

describe('RatingReminder', () => {
  it('renders nothing initially (no order found)', async () => {
    const { RatingReminder } = await import('../RatingReminder')
    const { container } = render(React.createElement(RatingReminder))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    // No order → nothing rendered
    expect(container.innerHTML).toBe('')
  })

  it('shows rating prompt for buyer order after auth change', async () => {
    const buyerOrder = { id: 'order-1', product_name: 'Tomatoes', seller_id: 'seller-1' }
    const sellerProfile = { full_name: 'Farm Bob' }

    ;(mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'market_orders') return chain(buyerOrder)
      if (table === 'profiles') return chain(sellerProfile)
      return chain()
    })

    const { RatingReminder } = await import('../RatingReminder')
    const { container } = render(React.createElement(RatingReminder))

    // Simulate auth state change
    await act(async () => {
      authChangeCallback?.('SIGNED_IN', { user: { id: 'u1' } })
      await new Promise(r => setTimeout(r, 100))
    })

    // Should show rating card
    expect(container.textContent).toContain('Rate your')
    expect(container.textContent).toContain('Tomatoes')
    expect(container.textContent).toContain('Skip for now')
  })

  it('shows stars that can be clicked to rate', async () => {
    const buyerOrder = { id: 'order-2', product_name: 'Apples', seller_id: 's1' }
    ;(mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'market_orders') return chain(buyerOrder)
      if (table === 'profiles') return chain({ full_name: 'Seller' })
      return chain()
    })

    const { RatingReminder } = await import('../RatingReminder')
    const { container } = render(React.createElement(RatingReminder))

    await act(async () => {
      authChangeCallback?.('SIGNED_IN', { user: { id: 'u1' } })
      await new Promise(r => setTimeout(r, 100))
    })

    // Should have 5 star buttons
    const starBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent?.includes('⭐'))
    expect(starBtns.length).toBe(5)

    // Click 4th star
    await act(async () => { fireEvent.click(starBtns[3]) })

    // Look for submit button
    const submitBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Submit Rating'))!
    await act(async () => { fireEvent.click(submitBtn) })
    expect(mockSupabase.rpc).toHaveBeenCalledWith('rate_market_order', { p_order_id: 'order-2', p_rating: 4, p_review: null })

    // Verify localStorage persistence (prevents re-prompt after app restart)
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    const rated = JSON.parse(localStorage.getItem('casagrown_rated_orders') || '[]')
    expect(rated).toContain('order-2')

    expect(container.textContent).toContain('Thanks for rating!')
  })

  it('skip button sets localStorage and dismisses', async () => {
    const buyerOrder = { id: 'order-3', product_name: 'Carrots', seller_id: 's1' }
    ;(mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'market_orders') return chain(buyerOrder)
      if (table === 'profiles') return chain({ full_name: 'Seller' })
      return chain()
    })

    const { RatingReminder } = await import('../RatingReminder')
    const { container } = render(React.createElement(RatingReminder))

    await act(async () => {
      authChangeCallback?.('SIGNED_IN', { user: { id: 'u1' } })
      await new Promise(r => setTimeout(r, 100))
    })

    // Click skip
    const skipBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Skip for now' || b.title === 'Skip for now')
    expect(skipBtn).toBeTruthy()
    await act(async () => { fireEvent.click(skipBtn!) })

    // Should set localStorage
    expect(localStorage.getItem('rating_skip_until')).toBeTruthy()
    // Component dismisses
    expect(container.innerHTML).toBe('')
  })

  it('respects skip cooldown from localStorage', async () => {
    // Set skip_until to 24h from now
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    localStorage.setItem('rating_skip_until', future)

    mockSupabase.from.mockImplementation(() => chain({ id: 'order-4', product_name: 'Corn', seller_id: 's1' }))

    const { RatingReminder } = await import('../RatingReminder')
    const { container } = render(React.createElement(RatingReminder))

    await act(async () => {
      authChangeCallback?.('SIGNED_IN', { user: { id: 'u1' } })
      await new Promise(r => setTimeout(r, 100))
    })

    // Should NOT show rating (cooldown active)
    expect(container.innerHTML).toBe('')
  })

  it('handles mouseEnter/mouseLeave on stars for hover effect', async () => {
    ;(mockSupabase.from as any).mockImplementation((table: string) => {
      if (table === 'market_orders') return chain({ id: 'o1', product_name: 'X', seller_id: 's1' })
      if (table === 'profiles') return chain({ full_name: 'S' })
      return chain()
    })

    const { RatingReminder } = await import('../RatingReminder')
    const { container } = render(React.createElement(RatingReminder))

    await act(async () => {
      authChangeCallback?.('SIGNED_IN', { user: { id: 'u1' } })
      await new Promise(r => setTimeout(r, 100))
    })

    const starBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent?.includes('⭐'))
    if (starBtns.length >= 3) {
      await act(async () => { fireEvent.mouseEnter(starBtns[2]) })
      await act(async () => { fireEvent.mouseLeave(starBtns[2]) })
    }
    // No crash = pass
    expect(starBtns.length).toBe(5)
  })
})
