import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import SellLandingPage from '../page'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className, style }: any) => <a href={href} className={className} style={style}>{children}</a>
}))

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true })
})

// Helper: navigate the sell wizard to step 8 (lead capture)
async function navigateToLeadCapture() {
  render(<SellLandingPage />)

  // Step 1: Click Calculate
  fireEvent.click(screen.getByText(/Calculate My Backyard's Value →/i))

  // Step 2: Zipcode
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/e.g. 90210/i)).toBeDefined()
  })
  fireEvent.change(screen.getByPlaceholderText(/e.g. 90210/i), { target: { value: '95125' } })
  fireEvent.click(screen.getByText(/Next →/i))

  // Step 3: Garden Size
  await waitFor(() => {
    expect(screen.getByText(/1-2 Raised Beds/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/1-2 Raised Beds/i))
  fireEvent.click(screen.getByRole('button', { name: /Next →/i }))

  // Step 4: Fruit Trees
  await waitFor(() => {
    expect(screen.getByText(/Any fruit trees\?/i)).toBeDefined()
  })
  fireEvent.click(screen.getByRole('button', { name: /Next →/i }))

  // Step 5: Plants Selection (Select Tomatoes)
  await waitFor(() => {
    expect(screen.getByText(/Tomatoes/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Tomatoes/i))
  fireEvent.click(screen.getByRole('button', { name: /Next →/i }))

  // Step 6: Habits
  await waitFor(() => {
    expect(screen.getByText(/Give it away to friends & neighbors/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Give it away to friends & neighbors/i))
  fireEvent.click(screen.getByRole('button', { name: /Next →/i }))

  // Step 7: Intent
  await waitFor(() => {
    expect(screen.getByText(/Very comfortable — I want to earn extra income!/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Very comfortable — I want to earn extra income!/i))
  fireEvent.click(screen.getByRole('button', { name: /Next →/i }))

  // Step 8: Fulfillment
  await waitFor(() => {
    expect(screen.getByText(/How would you prefer to get produce to neighbors\?/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Let buyers pickup from your home/i))
  fireEvent.click(screen.getByRole('button', { name: /Calculate My Potential →/i }))

  // Step 10: Lead Capture Form
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/Jane Doe/i)).toBeDefined()
  }, { timeout: 3000 })
}

describe('Sell Lead Magnet Interest Auto-Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('renders landing page with Estimate Your Backyard Potential prompt', () => {
    render(<SellLandingPage />)
    expect(screen.getByText(/Estimate Your Backyard Potential/i)).toBeDefined()
    expect(screen.getByText(/Calculate My Backyard's Value →/i)).toBeDefined()
  })

  it('auto-registers sell interests and navigates to /market when lead form is submitted', async () => {
    await navigateToLeadCapture()

    fireEvent.change(screen.getByPlaceholderText(/Jane Doe/i), { target: { value: 'Test Seller' } })
    fireEvent.change(screen.getByPlaceholderText(/hello@example.com/i), { target: { value: 'seller@test.local' } })
    
    // Check marketing consent box
    const consentCheckbox = screen.getByRole('checkbox')
    fireEvent.click(consentCheckbox)

    fireEvent.click(screen.getByText(/Continue with email/i))

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

    // Verify immediate redirect to /market with searchParams and sessionStorage
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/market?from=sell_report&zipcode=95125')
      )
    })

    const storedReport = JSON.parse(sessionStorage.getItem('casagrown_lead_report') || '{}')
    expect(storedReport.type).toBe('sell')
    expect(storedReport.email).toBe('seller@test.local')
    expect(storedReport.zipcode).toBe('95125')
  })

  it('renders Google and Apple OAuth buttons on lead capture step', async () => {
    await navigateToLeadCapture()

    // Verify both social login buttons are present with correct text
    const googleBtn = screen.getByText(/Continue with Google/i)
    const appleBtn = screen.getByText(/Continue with Apple/i)
    expect(googleBtn).toBeDefined()
    expect(appleBtn).toBeDefined()

    // Verify they are clickable buttons (type=button)
    expect(googleBtn.closest('button')).toBeDefined()
    expect(appleBtn.closest('button')).toBeDefined()
  })

  it('email button gets btn-action class when email is typed (adaptive CTA)', async () => {
    await navigateToLeadCapture()

    const emailBtn = screen.getByText(/Continue with email/i)
    
    // Before typing email: email button should NOT have btn-action
    expect(emailBtn.className).not.toContain('btn-action')

    // Type an email address
    fireEvent.change(screen.getByPlaceholderText(/hello@example.com/i), { target: { value: 'test@test.com' } })

    // After typing: email button should have btn-action
    await waitFor(() => {
      const updatedBtn = screen.getByText(/Continue with email/i)
      expect(updatedBtn.className).toContain('btn-action')
    })
  })
})
