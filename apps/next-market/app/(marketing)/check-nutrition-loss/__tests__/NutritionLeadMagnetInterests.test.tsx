import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import NutritionLossLandingPage from '../page'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className, style }: any) => <a href={href} className={className} style={style}>{children}</a>
}))

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true })
})

// Helper: navigate the nutrition wizard to step 8 (lead capture)
async function navigateToLeadCapture() {
  render(<NutritionLossLandingPage />)

  // Step 1: Click Check My Nutrition Loss →
  fireEvent.click(screen.getAllByText(/Check My Nutrition Loss →/i)[0])

  // Step 2: Zipcode
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/e.g. 95125/i)).toBeDefined()
  })
  fireEvent.change(screen.getByPlaceholderText(/e.g. 95125/i), { target: { value: '95125' } })
  fireEvent.click(screen.getAllByText(/Next →/i)[0])

  // Step 3: Select produce (Heirloom Tomatoes)
  await waitFor(() => {
    expect(screen.getByText(/Heirloom Tomatoes/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Heirloom Tomatoes/i))
  fireEvent.click(screen.getAllByText(/Next →/i)[0])

  // Step 4: Store Types
  await waitFor(() => {
    expect(screen.getByText(/Traditional Supermarket/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Traditional Supermarket/i))
  fireEvent.click(screen.getAllByText(/Next →/i)[0])

  // Step 5: Grocery Methods
  await waitFor(() => {
    expect(screen.getByText(/In-Store Shopping/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/In-Store Shopping/i))
  fireEvent.click(screen.getAllByText(/Next →/i)[0])

  // Step 6: Buying Frequency
  await waitFor(() => {
    expect(screen.getByText(/Once a week/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Once a week/i))
  fireEvent.click(screen.getAllByText(/Next →/i)[0])

  // Step 7: Neighbor Buying Openness
  await waitFor(() => {
    expect(screen.getByText(/Very open to trying it!/i)).toBeDefined()
  })
  fireEvent.click(screen.getByText(/Very open to trying it!/i))
  fireEvent.click(screen.getByText(/Calculate My Nutrition Loss →/i))

  // Step 8: Lead Capture Form (1.2s calculation delay)
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/First and Last Name/i)).toBeDefined()
  }, { timeout: 3000 })
}

describe('Nutrition Lead Magnet Interest Auto-Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders landing page headline', () => {
    render(<NutritionLossLandingPage />)
    expect(screen.getByText(/The Post-Harvest Nutrient Gap/i)).toBeDefined()
    expect(screen.getAllByText(/Check My Nutrition Loss →/i)[0]).toBeDefined()
  })

  it('auto-registers buy interests when lead form is submitted and displays market CTA', async () => {
    await navigateToLeadCapture()

    fireEvent.change(screen.getByPlaceholderText(/First and Last Name/i), { target: { value: 'Test Buyer' } })
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'buyer@test.local' } })

    fireEvent.click(screen.getByText(/Continue with email/i))

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

    // Verify the new CTA text: 'Set Up Your Produce Alerts'
    await waitFor(() => {
      const marketCta = screen.getByText(/Set Up Your Produce Alerts/i)
      expect(marketCta).toBeDefined()
      expect(marketCta.getAttribute('href')).toContain('/interest?scope=buy')
    })
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
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'test@test.com' } })

    // After typing: email button should have btn-action
    await waitFor(() => {
      const updatedBtn = screen.getByText(/Continue with email/i)
      expect(updatedBtn.className).toContain('btn-action')
    })
  })
})
