// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import DailyGamesMicrostrip from '../DailyGamesMicrostrip'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => React.createElement('a', { href, ...props }, children),
}))

vi.mock('../../../../lib/useGuestGameStats', () => ({
  getGuestGameStats: () => ({ streakDays: 3 }),
}))

vi.mock('../../../../lib/gamesCatalog', () => ({
  getTodayDateStr: () => '2026-08-28',
  getTodayGames: () => [
    { id: 'garden_spell_001', title: 'Garden Spell', categoryName: 'Garden Spell' },
  ],
}))

describe('DailyGamesMicrostrip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders expanded microstrip by default with streak and link to /games', () => {
    render(<DailyGamesMicrostrip />)
    expect(screen.getByText(/Daily Game:/i)).toBeInTheDocument()
    expect(screen.getByText('Garden Spell')).toBeInTheDocument()
    expect(screen.getByText(/🔥 3d Streak/i)).toBeInTheDocument()
    expect(screen.queryByText(/pts/i)).not.toBeInTheDocument()

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/games')
  })

  it('minimizes into compact left-margin mini-bubble when dismiss is clicked', () => {
    render(<DailyGamesMicrostrip />)
    const dismissBtn = screen.getByTitle('Dismiss for today')
    fireEvent.click(dismissBtn)

    // Expanded banner is gone
    expect(screen.queryByText(/Daily Game:/i)).not.toBeInTheDocument()

    // Mini bubble button is rendered
    const miniBubble = screen.getByTitle('Tap to view Daily Games')
    expect(miniBubble).toBeInTheDocument()
    expect(screen.getByText(/🔥3/i)).toBeInTheDocument()
  })

  it('expands back when mini-bubble is tapped', () => {
    render(<DailyGamesMicrostrip />)
    // 1. Dismiss
    const dismissBtn = screen.getByTitle('Dismiss for today')
    fireEvent.click(dismissBtn)

    // 2. Click mini bubble to expand
    const miniBubble = screen.getByTitle('Tap to view Daily Games')
    fireEvent.click(miniBubble)

    // 3. Expanded banner is back
    expect(screen.getByText(/Daily Game:/i)).toBeInTheDocument()
    expect(screen.getByText('Play →')).toBeInTheDocument()
  })
})
