// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'

// Mock Next.js navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/market',
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => React.createElement('a', { href, ...props }, children),
}))

vi.mock('../../../lib/store', () => ({
  useMarket: () => ({
    state: { marketSchedule: null, marketNeverCloses: true },
    dispatch: vi.fn(),
  }),
  isMarketOpen: () => true,
}))

// ── useAuth mock — fully onboarded user ──
vi.mock('../../../lib/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@test.com' },
    isAuthenticated: true,
    tosAccepted: true,
    profileComplete: true,
    loading: false,
    isBanned: false,
    banReason: null,
  }),
}))

vi.mock('../BottomNav.module.css', () => ({ default: new Proxy({}, { get: (_, key) => key }) }))

import { BottomNav } from '../BottomNav'

describe('BottomNav', () => {
  it('renders without crashing', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container).toBeTruthy()
  })

  it('shows Market tab', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('Market')
  })

  it('shows Orders tab', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('Orders')
  })

  it('renders tab icons', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('🧺')
    expect(container.textContent).toContain('📦')
  })

  it('renders nav links with correct hrefs', () => {
    const { container } = render(React.createElement(BottomNav))
    const links = container.querySelectorAll('a')
    const hrefs = Array.from(links).map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/market')
    expect(hrefs).toContain('/orders')
  })

  it('shows market status dot', () => {
    const { container } = render(React.createElement(BottomNav))
    // Green dot when market is open (rgb(34, 197, 94))
    const dots = container.querySelectorAll('span')
    const hasDot = Array.from(dots).some(s => {
      const style = s.getAttribute('style') || ''
      return style.includes('#22c55e') || style.includes('rgb(34, 197, 94)')
    })
    expect(hasDot).toBe(true)
  })

  it('applies active style to current tab', () => {
    const { container } = render(React.createElement(BottomNav))
    const marketLink = container.querySelector('a[href="/market"]')
    expect(marketLink?.className).toContain('Active')
  })
})
