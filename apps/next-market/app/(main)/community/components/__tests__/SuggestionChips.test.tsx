// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, fireEvent } from '@testing-library/react'

// Mock CSS modules
vi.mock('../../page.module.css', () => ({
  default: new Proxy({}, { get: (_, prop) => String(prop) }),
}))

import SuggestionChips from '../../components/SuggestionChips'

describe('SuggestionChips', () => {
  const defaultProps = {
    onSelect: vi.fn(),
    userMessageCount: 0,
  }

  it('renders without crashing', () => {
    const { container } = render(React.createElement(SuggestionChips, defaultProps))
    expect(container).toBeTruthy()
  })

  it('renders 3 suggestion chips for new users', () => {
    const { container } = render(React.createElement(SuggestionChips, defaultProps))
    const chips = container.querySelectorAll('.suggestionChip')
    expect(chips.length).toBe(3)
  })

  it('hides chips after user has sent 3+ messages', () => {
    const { container } = render(
      React.createElement(SuggestionChips, { ...defaultProps, userMessageCount: 3 })
    )
    const chips = container.querySelectorAll('.suggestionChip')
    expect(chips.length).toBe(0)
  })

  it('calls onSelect when a chip is clicked', () => {
    const onSelect = vi.fn()
    const { container } = render(
      React.createElement(SuggestionChips, { ...defaultProps, onSelect })
    )
    const firstChip = container.querySelector('.suggestionChip')
    if (firstChip) {
      fireEvent.click(firstChip)
      expect(onSelect).toHaveBeenCalledTimes(1)
      // Called with the chip text
      expect(typeof onSelect.mock.calls[0][0]).toBe('string')
      expect(onSelect.mock.calls[0][0].length).toBeGreaterThan(0)
    }
  })

  it('shows different chips on different renders (random)', () => {
    const results = new Set<string>()
    // Render multiple times and collect chip texts
    for (let i = 0; i < 10; i++) {
      const { container } = render(React.createElement(SuggestionChips, defaultProps))
      const chips = container.querySelectorAll('.suggestionChip')
      chips.forEach(chip => results.add(chip.textContent || ''))
    }
    // With truly random selection from 110+ chips, we should see variety
    expect(results.size).toBeGreaterThan(3)
  })

  it('chip text is non-empty', () => {
    const { container } = render(React.createElement(SuggestionChips, defaultProps))
    const chips = container.querySelectorAll('.suggestionChip')
    chips.forEach(chip => {
      expect(chip.textContent?.trim().length).toBeGreaterThan(0)
    })
  })
})
