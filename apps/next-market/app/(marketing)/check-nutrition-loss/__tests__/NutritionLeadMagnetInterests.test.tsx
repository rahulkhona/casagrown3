import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import NutritionLossLandingPage from '../page'

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
          ai_nutrition_result: {
            overall_summary: 'Significant loss in 3 days',
            items: [
              { item: 'Spinach', loss_percent: 50, key_nutrient: 'Vitamin C', evidence_link: 'http://example.com' }
            ]
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

describe('Nutrition Lead Magnet Interest Auto-Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders landing page headline', () => {
    render(<NutritionLossLandingPage />)
    expect(screen.getByText(/The Post-Harvest Nutrient Gap/i)).toBeDefined()
    expect(screen.getByText(/Check My Nutrition Loss →/i)).toBeDefined()
  })

  it('auto-registers buy interests when lead form is submitted and displays market CTA', async () => {
    render(<NutritionLossLandingPage />)

    // Step 1: Click Check My Nutrition Loss →
    fireEvent.click(screen.getByText(/Check My Nutrition Loss →/i))

    // Step 2: Select produce (Spinach)
    await waitFor(() => {
      expect(screen.getByText(/Spinach/i)).toBeDefined()
    })
    fireEvent.click(screen.getByText(/Spinach/i))
    fireEvent.click(screen.getByText(/Calculate Loss/i))

    // Step 3: Lead Capture Form (1.5s calculation delay)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Jane Doe/i)).toBeDefined()
    }, { timeout: 3000 })

    fireEvent.change(screen.getByPlaceholderText(/Jane Doe/i), { target: { value: 'Test Buyer' } })
    fireEvent.change(screen.getByPlaceholderText(/hello@example.com/i), { target: { value: 'buyer@test.local' } })

    // Check marketing consent box
    const consentCheckbox = screen.getByRole('checkbox')
    fireEvent.click(consentCheckbox)

    fireEvent.click(screen.getByText(/Send My Report →/i))

    // Verify /api/interest/submit fetch call with interest_type = 'buy'
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/interest/submit',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"interest_type":"buy"')
        })
      )
    })

    // Verify notification badge and browse market CTA button
    await waitFor(() => {
      expect(screen.getByText(/We'll notify you at/i)).toBeDefined()
      const marketCta = screen.getByText(/Browse Fresh Local Produce Nearby/i)
      expect(marketCta).toBeDefined()
      expect(marketCta.getAttribute('href')).toBe('/market')
    })
  })
})
