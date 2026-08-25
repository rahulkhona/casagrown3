import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../app/api/interest/demand/route'
import { normalizeProduceKey } from '../lib/bulkListingUtils'

// Mock Supabase client
const mockCrmData: any[] = [
  { produce_name: 'Meyer Lemons', zipcodes: ['95120', '95125'], lead_id: 'lead-1', user_id: null },
  { produce_name: 'Heirloom Tomatoes', zipcodes: ['95120'], lead_id: 'lead-2', user_id: null },
  { produce_name: 'Fresh Sweet Basil', zipcodes: ['95120', '95126'], lead_id: 'lead-3', user_id: null },
  { produce_name: 'Organic Strawberries', zipcodes: ['95125'], lead_id: 'lead-4', user_id: null },
]

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            contains: (col: string, val: string[]) => ({
              limit: () => Promise.resolve({
                data: mockCrmData.filter(d => d.zipcodes.includes(val[0])),
                error: null,
              }),
            }),
            limit: () => Promise.resolve({
              data: mockCrmData,
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}))

describe('normalizeProduceKey utility', () => {
  it('normalizes compound produce names and removes adjectives', () => {
    const lemonKeys = normalizeProduceKey('Meyer Lemons')
    expect(lemonKeys).toContain('meyer lemons')
    expect(lemonKeys).toContain('lemons')
    expect(lemonKeys).toContain('lemon')

    const tomatoKeys = normalizeProduceKey('Heirloom Tomatoes')
    expect(tomatoKeys).toContain('heirloom tomatoes')
    expect(tomatoKeys).toContain('tomatoes')
    expect(tomatoKeys).toContain('tomato')

    const basilKeys = normalizeProduceKey('Fresh Sweet Basil')
    expect(basilKeys).toContain('fresh sweet basil')
    expect(basilKeys).toContain('basil')
  })
})

describe('GET /api/interest/demand', () => {
  it('returns filtered buyer demand and produce counts for a given zipcode', async () => {
    const req = new Request('http://localhost:3001/api/interest/demand?zipcode=95120')
    const res = await GET(req)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.zipcode).toBe('95120')
    expect(data.locationLabel).toBe('In 95120')
    expect(data.totalBuyers).toBe(3) // lead-1, lead-2, lead-3
    expect(data.produceCounts.lemons).toBeGreaterThanOrEqual(1)
    expect(data.produceCounts.tomatoes).toBeGreaterThanOrEqual(1)
    expect(data.produceCounts.basil).toBeGreaterThanOrEqual(1)
  })

  it('returns 0 buyers when zipcode has no matching buy interests', async () => {
    const req = new Request('http://localhost:3001/api/interest/demand?zipcode=99999')
    const res = await GET(req)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.zipcode).toBe('99999')
    expect(data.totalBuyers).toBe(0)
    expect(data.locationLabel).toBe('In 99999')
  })
})
