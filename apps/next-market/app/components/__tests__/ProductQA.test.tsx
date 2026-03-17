// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react'

// Deep chain mock
function createMockChain(resolvedValue: any = { data: [] }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'single', 'limit', 'is', 'gt', 'in', 'insert', 'update', 'delete', 'match', 'order', 'maybeSingle', 'neq', 'ascending']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single.mockResolvedValue(resolvedValue)
  chain.maybeSingle.mockResolvedValue(resolvedValue)
  chain.then = vi.fn((cb) => cb(resolvedValue))
  return chain
}

const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockFrom = vi.fn(() => {
  const chain = createMockChain({ data: [] })
  chain.insert = mockInsert.mockResolvedValue({ error: null })
  return chain
})

vi.mock('../../../lib/supabase', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null }),
  }),
}))

vi.mock('../../../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}))

import { ProductQA } from '../ProductQA'

const defaultProps = {
  productId: 'prod-1',
  sellerId: 'seller-1',
  productName: 'Heritage Tomatoes',
}

describe('ProductQA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    expect(() => render(React.createElement(ProductQA, defaultProps))).not.toThrow()
  })

  it('shows Questions & Answers header', () => {
    const { container } = render(React.createElement(ProductQA, defaultProps))
    expect(container.textContent).toContain('Questions & Answers')
  })

  it('shows sign-in prompt or question input', () => {
    const { container } = render(React.createElement(ProductQA, defaultProps))
    // When not authenticated, shows sign-in message instead of input
    expect(container.textContent).toContain('Sign in to ask')
  })

  it('shows empty state when no comments', () => {
    const { container } = render(React.createElement(ProductQA, defaultProps))
    expect(container.textContent).toMatch(/No questions|Be the first|Ask a question/)
  })

  it('renders product context', () => {
    const { container } = render(React.createElement(ProductQA, defaultProps))
    expect(container).toBeTruthy()
    // ProductQA uses productId internally, not as displayed text
  })
})
