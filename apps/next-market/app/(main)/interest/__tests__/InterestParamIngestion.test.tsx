import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import InterestPage from '../page'
import { EXHAUSTIVE_US_PRODUCE } from '../../../../lib/produceCatalog'

// Mock next/navigation
const mockSearchParams = new Map<string, string>()
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
  usePathname: () => '/interest',
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

// Mock Supabase
vi.mock('../../../../lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    }),
  }),
}))

// Mock Bootstrap
vi.mock('../../../../lib/useBootstrap', () => ({
  useBootstrap: () => ({
    refresh: vi.fn(),
  }),
  BootstrapProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('Produce Catalog & URL Parameter Ingestion', () => {
  beforeEach(() => {
    mockSearchParams.clear()
  })

  it('contains standalone 1-by-1 entries for Peaches and Nectarines', () => {
    const peaches = EXHAUSTIVE_US_PRODUCE.find(i => i.name === 'Peaches')
    const nectarines = EXHAUSTIVE_US_PRODUCE.find(i => i.name === 'Nectarines')

    expect(peaches).toBeDefined()
    expect(nectarines).toBeDefined()
    expect(peaches?.id).toBe('peaches')
    expect(nectarines?.id).toBe('nectarines')
  })

  it('contains standalone entries for Blackberries and Raspberries', () => {
    const blackberries = EXHAUSTIVE_US_PRODUCE.find(i => i.name === 'Blackberries')
    const raspberries = EXHAUSTIVE_US_PRODUCE.find(i => i.name === 'Raspberries')

    expect(blackberries).toBeDefined()
    expect(raspberries).toBeDefined()
    expect(blackberries?.id).toBe('blackberries')
    expect(raspberries?.id).toBe('raspberries')
  })

  it('handles quoted URL parameters like ?produce="oranges, lemons"', async () => {
    mockSearchParams.set('produce', '"oranges, lemons"')
    mockSearchParams.set('scope', 'buy')

    render(<InterestPage />)
    
    // Guest modal opens automatically on parameter hydration
    expect(await screen.findByText('Save Your Interests')).toBeInTheDocument()
  })

  it('handles alias parameter ?items=Peaches,Figs&scope=sell', async () => {
    mockSearchParams.set('items', 'Peaches,Figs')
    mockSearchParams.set('scope', 'sell')

    render(<InterestPage />)

    expect(await screen.findByText('Save Your Interests')).toBeInTheDocument()
  })

  it('handles unlisted custom produce items like ?produce=Chickoo', async () => {
    mockSearchParams.set('produce', 'Chickoo')
    mockSearchParams.set('scope', 'buy')

    render(<InterestPage />)

    expect(await screen.findByText('Save Your Interests')).toBeInTheDocument()
  })
})
