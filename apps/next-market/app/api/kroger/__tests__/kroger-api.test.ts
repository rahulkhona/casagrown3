import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as authorizeHandler } from '../authorize/route'
import { GET as callbackHandler } from '../callback/route'

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}))

describe('Kroger OAuth API Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/kroger/authorize', () => {
    it('constructs correct Kroger OAuth URL and redirects', async () => {
      const items = [{ name: 'Heirloom Tomatoes', quantity: 2, unit: 'lb' }]
      const req = new NextRequest(
        `http://localhost:3001/api/kroger/authorize?items=${encodeURIComponent(JSON.stringify(items))}&zipcode=95125&returnUrl=/cart`
      )

      const resp = await authorizeHandler(req)
      expect(resp.status).toBe(307)
      
      const location = resp.headers.get('location')
      expect(location).toBeDefined()
      expect(location).toContain('https://api.kroger.com/v1/connect/oauth2/authorize')
      expect(location).toContain('client_id=')
      expect(location).toContain('response_type=code')
      expect(location).toContain('scope=cart.basic%3Awrite+profile.compact')
      expect(location).toContain('redirect_uri=')
      expect(location).toContain('state=')
    })
  })

  describe('GET /api/kroger/callback', () => {
    it('handles cancellation / error param by redirecting with error', async () => {
      const req = new NextRequest('http://localhost:3001/api/kroger/callback?error=access_denied')
      const resp = await callbackHandler(req)

      expect(resp.status).toBe(307)
      const location = resp.headers.get('location')
      expect(location).toContain('/cart?kroger_error=access_denied')
    })

    it('exchanges authorization code, adds items to Kroger cart, and redirects to kroger.com/cart', async () => {
      const statePayload = {
        items: JSON.stringify([{ name: 'Sweet Peaches', quantity: 3, unit: 'lb', price_usd: 2.99 }]),
        zipcode: '95125',
        returnUrl: '/cart',
      }
      const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

      // Mock fetch responses for token exchange, location lookup, product search, cart add
      global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes('/connect/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'mock-kroger-access-token-123' }),
          })
        }
        if (url.includes('/locations')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: [{ locationId: '01400452', name: 'Ralphs Supermarket', chain: 'Ralphs' }],
            }),
          })
        }
        if (url.includes('/products')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: [{
                upc: '0001111041600',
                description: 'Fresh Sweet Peaches',
                items: [{ price: { regular: 2.99 } }],
              }],
            }),
          })
        }
        if (url.includes('/cart/add')) {
          return Promise.resolve({
            ok: true,
            status: 204,
            json: () => Promise.resolve({}),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }) as any

      const req = new NextRequest(`http://localhost:3001/api/kroger/callback?code=mock-auth-code-789&state=${state}`)
      const resp = await callbackHandler(req)

      expect(resp.status).toBe(307)
      const location = resp.headers.get('location')
      expect(location).toBe('https://www.kroger.com/cart')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cart/add'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ items: [{ upc: '0001111041600', quantity: 3 }] }),
        })
      )
    })
  })
})
