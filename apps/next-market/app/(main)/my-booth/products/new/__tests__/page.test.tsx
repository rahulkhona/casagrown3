import { render, screen, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

const mockTrackEvent = vi.fn()
const mockTrackFieldInteract = vi.fn()
const mockTrackStepTiming = vi.fn()
const mockResetSessionId = vi.fn()

vi.mock('../../../../../../lib/crm-analytics', () => ({
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
  trackFieldInteract: (...args: any[]) => mockTrackFieldInteract(...args),
  trackStepTiming: (...args: any[]) => mockTrackStepTiming(...args),
  resetSessionId: (...args: any[]) => mockResetSessionId(...args),
  useMarketingAnalytics: vi.fn(),
  trackAiUsage: vi.fn(),
  markConverted: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('../../../../../../lib/store', () => ({
  MarketProvider: ({ children }: any) => <div data-testid="market-provider">{children}</div>,
  useMarket: () => ({
    state: { marketSchedule: [], user: { id: 'user1' }, booths: [], products: [] },
    dispatch: vi.fn(),
  }),
  isMarketOpen: () => true,
  formatUsd: (n: number) => `$${(n || 0).toFixed(2)}`,
}))

vi.mock('../../../../../../lib/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false, user: { id: 'user1' } }),
}))

vi.mock('../../../../../../lib/useMarketRestriction', () => ({
  useMarketRestriction: () => ({ isFreeOnly: false, isBlocked: false }),
}))

vi.mock('../../../../../../lib/useNotificationPrompt', () => ({
  useNotificationPrompt: () => ({ showPrompt: vi.fn(), modalProps: { visible: false } }),
}))

const chainObj: any = {}
const methods = ['select', 'eq', 'neq', 'limit', 'insert', 'update', 'upsert', 'delete', 'match', 'order', 'or', 'not', 'contains', 'like', 'ilike', 'range', 'filter', 'in', 'is', 'gt', 'lt', 'gte', 'lte']
methods.forEach(m => { chainObj[m] = vi.fn().mockReturnValue(chainObj) })
chainObj.single = vi.fn().mockResolvedValue({ data: null, error: null })
chainObj.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)

vi.mock('../../../../../../lib/supabase', () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue(chainObj),
  }),
}))

import AddProductListing from '../page'

describe('AddProductListing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls resetSessionId and tracks wizard_step on mount, and wizard_abandon on unmount', async () => {
    const { unmount } = render(<AddProductListing />)
    
    await waitFor(() => {
      expect(mockResetSessionId).toHaveBeenCalledWith('/add-product')
      expect(mockTrackEvent).toHaveBeenCalledWith('wizard_step', '/add-product', { step_index: 1, step_name: 'add_product' })
    })

    unmount()
    
    expect(mockTrackEvent).toHaveBeenCalledWith('wizard_abandon', '/add-product')
  })

  it('renders presets and handles custom schedule cell clicks correctly', async () => {
    render(<AddProductListing />)
    
    // Check that 'Both' preset is pre-selected and grid is not visible
    expect(screen.queryByText('Tap to select your available hours')).not.toBeInTheDocument()

    // Click 'Custom schedule' in Delivery card to expand the grid
    const customOptions = screen.getAllByText('📅 Custom schedule')
    expect(customOptions.length).toBeGreaterThan(0)
    
    // Trigger custom preset click for Delivery card (the first one)
    customOptions[0].click()

    // Confirm that the grid expands
    await waitFor(() => {
      expect(screen.getByText('Tap to select your available hours')).toBeInTheDocument()
    })
  })

  it('renders Find Landmark button and Pickup Instructions input in pickup section', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(<AddProductListing />)

    // Verify Delivery Contactless Badge
    expect(screen.getByText(/Safest \(100% Contactless\)/i)).toBeInTheDocument()

    // Verify Safe Public Place button is present
    const findLandmarkBtn = screen.getByTestId('find-landmark-btn')
    expect(findLandmarkBtn).toBeInTheDocument()
    expect(findLandmarkBtn).toHaveTextContent(/Safe Public Place/i)

    // Click Safe Public Place button to open modal
    fireEvent.click(findLandmarkBtn)
    await waitFor(() => {
      expect(screen.getByTestId('landmark-modal')).toBeInTheDocument()
    })

    // Verify Pickup Instructions field is present and writable
    const instructionsInput = screen.getByTestId('pickup-instructions-input')
    expect(instructionsInput).toBeInTheDocument()
    fireEvent.change(instructionsInput, { target: { value: 'Meet at the gazebo near the playground' } })
    expect((instructionsInput as HTMLInputElement).value).toBe('Meet at the gazebo near the playground')
  })

  it('validates required pickup instructions when public spot is chosen and supports suggestion chip clicks', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(<AddProductListing />)

    // Open Landmark modal and select a public landmark
    const findLandmarkBtn = screen.getByTestId('find-landmark-btn')
    fireEvent.click(findLandmarkBtn)
    await waitFor(() => {
      expect(screen.getByTestId('landmark-modal')).toBeInTheDocument()
    })

    // Wait for landmark options to load and select Willow Glen Community Center
    const commOption = await screen.findByTestId('landmark-option-mock_comm_1')
    fireEvent.click(commOption)

    // Verify pickup instructions label indicates required
    await waitFor(() => {
      expect(screen.getByText(/\(Required for public spots\)/i)).toBeInTheDocument()
    })

    // Try submitting form with empty instructions
    const submitBtn = screen.getByRole('button', { name: /Save Draft|Publish Product/i })
    fireEvent.click(submitBtn)

    // Inline error should appear
    await waitFor(() => {
      expect(screen.getByTestId('pickup-instructions-error')).toBeInTheDocument()
      expect(screen.getByTestId('pickup-instructions-error')).toHaveTextContent(/Please provide pickup instructions for meeting at this public location/i)
    })

    // Click dynamic suggestion chip to auto-populate
    const suggestionBtn = await screen.findByText(/Meet near the main front entrance parking area/i)
    expect(suggestionBtn).toBeInTheDocument()
    fireEvent.click(suggestionBtn)

    // Instructions input should now be filled and error cleared
    const instructionsInput = screen.getByTestId('pickup-instructions-input') as HTMLInputElement
    expect(instructionsInput.value).toContain('Meet near the main front entrance parking area')
    expect(screen.queryByTestId('pickup-instructions-error')).not.toBeInTheDocument()
  })

  it('handles buyer advance notice selection', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(<AddProductListing />)

    // Select 15 min notice button
    const notice15Btn = screen.getByTestId('pickup-notice-15')
    expect(notice15Btn).toBeInTheDocument()
    fireEvent.click(notice15Btn)

    // Verify callout updates
    expect(screen.getByText(/15 minutes before arriving/i)).toBeInTheDocument()

    // Select 60 min notice button
    const notice60Btn = screen.getByTestId('pickup-notice-60')
    fireEvent.click(notice60Btn)
    expect(screen.getByText(/60 minutes before arriving/i)).toBeInTheDocument()
  })
})
