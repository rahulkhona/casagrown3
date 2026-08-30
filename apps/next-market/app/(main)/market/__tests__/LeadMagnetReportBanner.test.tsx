import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import LeadMagnetReportBanner, { LeadReportData } from '../components/LeadMagnetReportBanner'

// Helper to mock useSearchParams
let mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

describe('LeadMagnetReportBanner Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockSearchParams = new URLSearchParams()
  })

  it('renders nothing if no lead data or searchParams are present', () => {
    const { container } = render(<LeadMagnetReportBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders seller report banner when lead data is in sessionStorage', () => {
    const sellerData: LeadReportData = {
      type: 'sell',
      email: 'seller@example.com',
      name: 'Jane Doe',
      zipcode: '95125',
      status: 'ready',
      ai_estimate_result: {
        estimated_annual_earnings: '1,850',
        reasoning: 'High local demand for heirloom tomatoes and Meyer lemons in 95125.',
        excess_produce: '400 lbs of tomatoes and 120 lemons',
        analogies: ['A family weekend getaway', 'A brand new drip irrigation system']
      }
    }
    sessionStorage.setItem('casagrown_lead_report', JSON.stringify(sellerData))

    render(<LeadMagnetReportBanner />)

    // Collapsed header
    expect(screen.getByText(/Your Backyard Potential: ~\$1,850\/yr!/i)).toBeDefined()
    expect(screen.getByText(/Full report emailed to seller@example.com/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /View Breakdown/i })).toBeDefined()
  })

  it('expands and collapses the seller report details on button click', () => {
    const sellerData: LeadReportData = {
      type: 'sell',
      email: 'seller@example.com',
      name: 'Jane Doe',
      zipcode: '95125',
      status: 'ready',
      ai_estimate_result: {
        estimated_annual_earnings: '1,850',
        reasoning: 'High local demand for heirloom tomatoes in 95125.',
        excess_produce: '400 lbs of tomatoes and 120 lemons',
        analogies: ['A family weekend getaway', 'A brand new drip irrigation system']
      }
    }
    sessionStorage.setItem('casagrown_lead_report', JSON.stringify(sellerData))

    render(<LeadMagnetReportBanner />)

    // Click View Breakdown
    fireEvent.click(screen.getByRole('button', { name: /View Breakdown/i }))

    // Expanded contents visible
    expect(screen.getByText(/Estimated Annual Backyard Value/i)).toBeDefined()
    expect(screen.getByText(/400 lbs of tomatoes and 120 lemons/i)).toBeDefined()
    expect(screen.getByText(/A family weekend getaway/i)).toBeDefined()
    expect(screen.getByText(/High local demand for heirloom tomatoes in 95125/i)).toBeDefined()

    // Collapse
    fireEvent.click(screen.getByText(/Collapse & Browse Market/i))
    expect(screen.queryByText(/Estimated Annual Backyard Value/i)).toBeNull()
  })

  it('renders buyer nutrition report banner and expands to show table', () => {
    const buyerData: LeadReportData = {
      type: 'nutrition',
      email: 'buyer@example.com',
      name: 'John Smith',
      zipcode: '95125',
      status: 'ready',
      ai_nutrition_result: {
        summary: 'Store-bought produce loses significant Vitamin C during cold storage transit.',
        items: [
          { name: 'spinach', time_to_shelf: '7-10 days', nutrient_loss_pct: '80% Vitamin C', impacted_nutrients: 'Vitamin C, Folate' },
          { name: 'strawberries', time_to_shelf: '5-8 days', nutrient_loss_pct: '50% Polyphenols', impacted_nutrients: 'Antioxidants' }
        ]
      }
    }
    sessionStorage.setItem('casagrown_lead_report', JSON.stringify(buyerData))

    render(<LeadMagnetReportBanner />)

    expect(screen.getByText(/Nutrient Loss Alert:/i)).toBeDefined()
    expect(screen.getByText(/Full report emailed to buyer@example.com/i)).toBeDefined()

    // Expand
    fireEvent.click(screen.getByRole('button', { name: /View Breakdown/i }))
    expect(screen.getByText(/Store-bought produce loses significant Vitamin C/i)).toBeDefined()
    expect(screen.getByText(/spinach/i)).toBeDefined()
    expect(screen.getByText(/80% Vitamin C/i)).toBeDefined()
  })

  it('renders queued report banner when status is queued', () => {
    const queuedData: LeadReportData = {
      type: 'sell',
      email: 'queued@example.com',
      zipcode: '95125',
      status: 'queued'
    }
    sessionStorage.setItem('casagrown_lead_report', JSON.stringify(queuedData))

    render(<LeadMagnetReportBanner />)

    expect(screen.getByText(/Your Report is On Its Way!/i)).toBeDefined()
    expect(screen.getByText(/queued@example.com/i)).toBeDefined()
    // No view breakdown button when queued
    expect(screen.queryByRole('button', { name: /View Breakdown/i })).toBeNull()
  })

  it('dismisses banner and stores flag in sessionStorage when close button is clicked', () => {
    const sellerData: LeadReportData = {
      type: 'sell',
      email: 'seller@example.com',
      status: 'ready',
      ai_estimate_result: {
        estimated_annual_earnings: '1,850',
        reasoning: 'Good climate',
        excess_produce: 'Tomatoes',
      }
    }
    sessionStorage.setItem('casagrown_lead_report', JSON.stringify(sellerData))

    const { container } = render(<LeadMagnetReportBanner />)
    expect(screen.getByText(/Your Backyard Potential:/i)).toBeDefined()

    // Click Dismiss button
    fireEvent.click(screen.getByLabelText(/Dismiss report banner/i))

    // Banner is removed
    expect(container.firstChild).toBeNull()
    expect(sessionStorage.getItem('casagrown_report_banner_dismissed')).toBe('true')
  })
})
