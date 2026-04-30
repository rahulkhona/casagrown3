import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PromoPage from '../app/(marketing)/p/[slug]/page'
import * as supabaseLib from '../lib/supabase'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'test-promo' }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('')
}))

// Create a stable mock function for rpc
const mockRpc = vi.fn()

// Mock Supabase client
vi.mock('../lib/supabase', () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn()
    }
  }))
}))

describe('PromoPage component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the loading state initially', () => {
    render(<PromoPage />)
    expect(screen.getByText(/Loading Promotion/i)).toBeDefined()
  })

  it('renders the navigation bar', () => {
    render(<PromoPage />)
    expect(screen.getByAltText(/CasaGrown/i)).toBeDefined()
    expect(screen.getByText(/Fresh. Local. Trusted./i)).toBeDefined()
  })

  it('shows graceful fallback UI when user is rejected for audience mismatch', async () => {
    // 1. Mock the initial page load RPC to return a valid active promotion
    mockRpc.mockImplementation((fnName, args) => {
      if (fnName === 'crm_get_landing_page_promotion') {
        return Promise.resolve({
          data: {
            id: 'promo-123',
            name: 'Founders Promo',
            description_html: '<p>Test</p>',
            enrollment_deadline: new Date(Date.now() + 86400000).toISOString(),
            allow_existing_users: true,
            is_capacity_reached: false
          },
          error: null
        })
      }
      
      // 2. Mock the eligibility check to return ineligible!
      if (fnName === 'crm_check_promo_eligibility') {
        return Promise.resolve({
          data: {
            eligible: false,
            error: 'You are not eligible for this targeted promotion.',
            is_registered: false
          },
          error: null
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    render(<PromoPage />)

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getAllByText(/Founders Promo/i).length).toBeGreaterThan(0)
    })

    // Fill out the form
    const emailInput = screen.getByPlaceholderText('hello@example.com')
    const checkbox = screen.getByRole('checkbox')
    const submitBtn = screen.getByText('Continue to Claim')

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(checkbox)
    fireEvent.click(submitBtn)

    // Wait for the fallback UI to appear
    await waitFor(() => {
      expect(screen.getByText('You are not eligible for this targeted promotion.')).toBeDefined()
      expect(screen.getByText('You can still join CasaGrown!')).toBeDefined()
      expect(screen.getByText('Continue Sign Up Without Promo')).toBeDefined()
    })
  })
})
