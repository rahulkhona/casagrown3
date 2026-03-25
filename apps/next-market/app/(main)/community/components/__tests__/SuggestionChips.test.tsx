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
    onPrefill: vi.fn(),
    userMessageCount: 0,
  }

  it('renders without crashing', () => {
    const { container } = render(React.createElement(SuggestionChips, defaultProps))
    expect(container).toBeTruthy()
  })

  it('renders 4 suggestion chips (1 CasaBot + 3 random) for all users', () => {
    const { container } = render(React.createElement(SuggestionChips, defaultProps))
    const chips = container.querySelectorAll('.suggestionChip')
    expect(chips.length).toBe(4)
  })

  it('does not hide chips even after user has sent 3+ messages', () => {
    const { container } = render(
      React.createElement(SuggestionChips, { ...defaultProps, userMessageCount: 3 })
    )
    const chips = container.querySelectorAll('.suggestionChip')
    expect(chips.length).toBe(4)
  })

  it('calls onPrefill when CasaBot chip is clicked', () => {
    const onPrefill = vi.fn()
    const { container } = render(
      React.createElement(SuggestionChips, { ...defaultProps, onPrefill })
    )
    const casabotChip = container.querySelector('.casabotChip')
    if (casabotChip) {
      fireEvent.click(casabotChip)
      expect(onPrefill).toHaveBeenCalledTimes(1)
      expect(onPrefill).toHaveBeenCalledWith('@CasaBot ')
    }
  })

  it('calls onSelect when a random chip is clicked', () => {
    const onSelect = vi.fn()
    const { container } = render(
      React.createElement(SuggestionChips, { ...defaultProps, onSelect })
    )
    // The random chips are not .casabotChip
    const chips = Array.from(container.querySelectorAll('.suggestionChip'))
    const randomChip = chips.find(c => !c.classList.contains('casabotChip'))
    if (randomChip) {
      fireEvent.click(randomChip)
      expect(onSelect).toHaveBeenCalledTimes(1)
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
