// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock supabase
const mockInsert = vi.fn().mockResolvedValue({ error: null })
vi.mock('../../../lib/supabase', () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue({ insert: mockInsert }),
  }),
}))

import { FlagModal } from '../FlagModal'

describe('FlagModal', () => {
  const defaultProps = {
    productId: 'prod-1',
    productName: 'Heritage Tomatoes',
    onClose: vi.fn(),
    onFlagged: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('renders with product name', () => {
    const { container } = render(React.createElement(FlagModal, defaultProps))
    expect(container.textContent).toContain('Heritage Tomatoes')
    expect(container.textContent).toContain('Flag Product')
  })

  it('shows all 4 flag reasons', () => {
    const { container } = render(React.createElement(FlagModal, defaultProps))
    expect(container.textContent).toContain('Offensive content')
    expect(container.textContent).toContain('Misleading description')
    expect(container.textContent).toContain('Prohibited item')
    expect(container.textContent).toContain('Other')
  })

  it('submit button starts disabled', () => {
    const { container } = render(React.createElement(FlagModal, defaultProps))
    const buttons = container.querySelectorAll('button')
    const submitBtn = Array.from(buttons).find(b => b.textContent?.includes('Submit Flag'))
    expect(submitBtn?.disabled).toBe(true)
  })

  it('calls onClose when cancel clicked', () => {
    const { container } = render(React.createElement(FlagModal, defaultProps))
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Cancel')
    fireEvent.click(cancelBtn!)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when overlay clicked', () => {
    const { container } = render(React.createElement(FlagModal, defaultProps))
    const overlay = container.firstElementChild!
    fireEvent.click(overlay)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('enables submit after reason selection', () => {
    const { container } = render(React.createElement(FlagModal, defaultProps))
    // Click "Offensive content" reason button
    const reasonBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Offensive content'))
    fireEvent.click(reasonBtn!)
    const submitBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Submit Flag'))
    expect(submitBtn?.disabled).toBe(false)
  })

  it('submits flag with selected reason', async () => {
    const { container } = render(React.createElement(FlagModal, defaultProps))
    const reasonBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Offensive content'))
    fireEvent.click(reasonBtn!)
    const submitBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Submit Flag'))
    fireEvent.click(submitBtn!)

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith({
        product_id: 'prod-1',
        reason: 'offensive',
        details: null,
      })
    })
  })

  it('shows already-flagged error', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const { container } = render(React.createElement(FlagModal, defaultProps))
    const reasonBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Offensive content'))
    fireEvent.click(reasonBtn!)
    const submitBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Submit Flag'))
    fireEvent.click(submitBtn!)

    await waitFor(() => {
      expect(container.textContent).toContain('You have already flagged this product')
    })
  })
})
