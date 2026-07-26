import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import SellLandingPage from '../page'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>
}))

// Mock Supabase
vi.mock('../../../lib/supabase', () => ({
  createClient: () => ({
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: {
          ai_estimate_result: {
            excess_produce: '20 lbs Tomatoes',
            estimated_annual_earnings: 450,
            analogies: ['Coffee for a year'],
            reasoning: 'High local demand'
          }
        }
      })
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: null })
        })
      })
    })
  })
}))

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true })
})

describe('Sell Lead Magnet Interest Auto-Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders landing page with Estimate My Potential prompt', () => {
    render(<SellLandingPage />)
    expect(screen.getByText(/Estimate My Potential/i)).toBeDefined()
    expect(screen.getByText(/Get My Estimate →/i)).toBeDefined()
  })

  it('auto-registers sell interests when lead form is submitted', async () => {
    render(<SellLandingPage />)

    // Step 1: Click Get My Estimate
    fireEvent.click(screen.getByText(/Get My Estimate →/i))

    // Step 2: Zipcode
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. 90210/i)).toBeDefined()
    })
    const zipInput = screen.getByPlaceholderText(/e.g. 90210/i)
    fireEvent.change(zipInput, { target: { value: '95125' } })
    fireEvent.click(screen.getByText(/Next →/i))

    // Step 3: Garden Size
    await waitFor(() => {
      expect(screen.getByText(/1-2 Raised Beds/i)).toBeDefined()
    })
    const option = screen.getByText(/1-2 Raised Beds/i)
    fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: /Next →/i }))

    // Step 4: Fruit Trees Selection (Select Avocados)
    await waitFor(() => {
      expect(screen.getByText(/Avocados/i)).toBeDefined()
    })
    fireEvent.click(screen.getByText(/Avocados/i))
    fireEvent.click(screen.getByRole('button', { name: /Next →/i }))

    // Step 5: Plants Selection (Select Tomatoes)
    await waitFor(() => {
      expect(screen.getByText(/Tomatoes/i)).toBeDefined()
    })
    fireEvent.click(screen.getByText(/Tomatoes/i))
    fireEvent.click(screen.getByText(/Estimate My Potential/i))

    // Step 6: Lead Capture Form (1.5s calculation delay)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Jane Doe/i)).toBeDefined()
    }, { timeout: 3000 })

    fireEvent.change(screen.getByPlaceholderText(/Jane Doe/i), { target: { value: 'Test Seller' } })
    fireEvent.change(screen.getByPlaceholderText(/hello@example.com/i), { target: { value: 'seller@test.local' } })
    
    // Check marketing consent box
    const consentCheckbox = screen.getByRole('checkbox')
    fireEvent.click(consentCheckbox)

    fireEvent.click(screen.getByText(/Send My Report →/i))

    // Verify /api/interest/submit fetch call
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/interest/submit',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"interest_type":"sell"')
        })
      )
    })

    // Verify CTA link points to /create-listing with prefilled produce
    await waitFor(() => {
      const cta = screen.getByText(/Create Your First Listing Now/i)
      expect(cta).toBeDefined()
      expect(cta.getAttribute('href')).toContain('/create-listing')
    })
  })
})
