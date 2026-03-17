// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'

// Track mock calls
const mockTrackPageView = vi.fn()
const mockSetAnalyticsUser = vi.fn()

vi.mock('../../../lib/analytics', () => ({
  trackPageView: (...args: any[]) => mockTrackPageView(...args),
  setAnalyticsUser: (...args: any[]) => mockSetAnalyticsUser(...args),
}))

vi.mock('../../../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' }, loading: false }),
}))

const mockPathname = vi.fn(() => '/market')
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

import { AnalyticsTracker } from '../AnalyticsTracker'

describe('AnalyticsTracker', () => {
  it('renders null (invisible component)', () => {
    const { container } = render(React.createElement(AnalyticsTracker))
    expect(container.innerHTML).toBe('')
  })

  it('sets analytics user on mount', () => {
    render(React.createElement(AnalyticsTracker))
    expect(mockSetAnalyticsUser).toHaveBeenCalledWith('user-123')
  })

  it('tracks page view on mount', () => {
    mockPathname.mockReturnValue('/market')
    render(React.createElement(AnalyticsTracker))
    expect(mockTrackPageView).toHaveBeenCalledWith('/market')
  })

  it('tracks different routes', () => {
    mockPathname.mockReturnValue('/orders')
    render(React.createElement(AnalyticsTracker))
    expect(mockTrackPageView).toHaveBeenCalledWith('/orders')
  })

  it('does not crash without user', () => {
    vi.doMock('../../../lib/useAuth', () => ({
      useAuth: () => ({ user: null, loading: false }),
    }))
    expect(() => render(React.createElement(AnalyticsTracker))).not.toThrow()
  })
})
