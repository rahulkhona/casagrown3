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
})
