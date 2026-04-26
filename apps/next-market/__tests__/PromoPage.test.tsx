import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PromoPage from '../app/(marketing)/p/[slug]/page'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'test-promo' }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('')
}))

// Mock Supabase client
vi.mock('../lib/supabase', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') })
    })),
    rpc: vi.fn(),
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn()
    }
  }))
}))

describe('PromoPage component', () => {
  it('renders the loading state initially', () => {
    render(<PromoPage />)
    expect(screen.getByText(/Loading Promotion/i)).toBeDefined()
  })

  // Additional component logic is mocked heavily since it relies entirely on Supabase DB
  // This verifies the Suspense wrapper and the static nav bar render.
  it('renders the navigation bar', () => {
    render(<PromoPage />)
    expect(screen.getByAltText(/CasaGrown/i)).toBeDefined()
    expect(screen.getByText(/Go to Market/i)).toBeDefined()
  })
})
