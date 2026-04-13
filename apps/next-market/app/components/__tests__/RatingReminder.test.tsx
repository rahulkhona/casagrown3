// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock supabase
vi.mock('../../../lib/supabase', () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            ascending: vi.fn().mockResolvedValue({ data: [] }),
          }),
          in: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null }),
  }),
}))

// Mock localStorage
const mockLocalStorage: Record<string, string> = {}
vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => mockLocalStorage[key] ?? null)
vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => { mockLocalStorage[key] = val })

import { RatingReminder } from '../RatingReminder'

describe('RatingReminder', () => {
  it('renders null initially (no unrated orders)', () => {
    const { container } = render(React.createElement(RatingReminder))
    // Without any auth triggering, it should render nothing
    expect(container.innerHTML).toBe('')
  })

  it('does not crash on mount', () => {
    expect(() => render(React.createElement(RatingReminder))).not.toThrow()
  })
})
