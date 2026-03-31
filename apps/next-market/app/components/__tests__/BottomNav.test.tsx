// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'

// Mock Next.js navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/community',
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

vi.mock('../../../lib/supabase', () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    }),
  }),
}))

vi.mock('../BottomNav.module.css', () => ({ default: new Proxy({}, { get: (_, key) => key }) }))

import { BottomNav } from '../BottomNav'

describe('BottomNav', () => {
  it('renders without crashing', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container).toBeTruthy()
  })

  it('shows Community tab first', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('Community')
  })

  it('shows Market tab', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('Market')
  })

  it('shows Orders tab', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('Orders')
  })

  it('shows Messages tab', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('Messages')
  })

  it('renders correct tab icons (Community=👥, Market=🛍️, Orders=📦, Messages=💬)', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).toContain('👥')
    expect(container.textContent).toContain('📦')
    expect(container.textContent).toContain('💬')
    expect(container.textContent).toContain('🛍️')
  })

  it('has NO market basket icon (old icon removed)', () => {
    const { container } = render(React.createElement(BottomNav))
    expect(container.textContent).not.toContain('🧺')
  })

  it('renders nav links with correct hrefs', () => {
    const { container } = render(React.createElement(BottomNav))
    const links = container.querySelectorAll('a')
    const hrefs = Array.from(links).map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/community')
    expect(hrefs).toContain('/market')
    expect(hrefs).toContain('/orders')
    expect(hrefs).toContain('/messages')
  })

  it('tab order is Community → Orders → Messages → Market', () => {
    const { container } = render(React.createElement(BottomNav))
    const links = container.querySelectorAll('a')
    const hrefs = Array.from(links).map(l => l.getAttribute('href'))
    expect(hrefs[0]).toBe('/community')
    expect(hrefs[1]).toBe('/orders')
    expect(hrefs[2]).toBe('/messages')
    expect(hrefs[3]).toBe('/market')
  })

  it('has NO market status dot (market is always on)', () => {
    const { container } = render(React.createElement(BottomNav))
    // Ensure no green/red status dot exists
    const dots = container.querySelectorAll('span')
    const hasDot = Array.from(dots).some(s => {
      const style = s.getAttribute('style') || ''
      return style.includes('#22c55e') || style.includes('rgb(34, 197, 94)')
        || style.includes('#ef4444') || style.includes('rgb(239, 68, 68)')
    })
    expect(hasDot).toBe(false)
  })

  it('applies active style to Community tab on /community path', () => {
    const { container } = render(React.createElement(BottomNav))
    const communityLink = container.querySelector('a[href="/community"]')
    expect(communityLink?.className).toContain('Active')
  })
})
