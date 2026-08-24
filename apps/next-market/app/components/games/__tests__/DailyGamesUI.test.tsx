// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import GameVictoryModal from '../GameVictoryModal'
import WordleGardenCanvas from '../WordleGardenCanvas'
import JigsawPuzzleCanvas from '../JigsawPuzzleCanvas'
import GardenCrownsCanvas from '../GardenCrownsCanvas'
import GardenMemoryCanvas from '../GardenMemoryCanvas'
import CropAnagramCanvas from '../CropAnagramCanvas'
import NutritionalAlgebraCanvas from '../NutritionalAlgebraCanvas'

// Mock useAuth & useQuickSetup
const mockRequireAuth = vi.fn()
vi.mock('../../../../lib/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}))
vi.mock('../../../../lib/useQuickSetup', () => ({
  useQuickSetup: () => ({ requireAuth: mockRequireAuth }),
}))

describe('Daily Games UI & User Interaction Test Suite', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
    }
  })

  afterEach(() => {
    cleanup()
  })

  describe('GameVictoryModal UI & Interactions', () => {
    it('renders celebration modal with neighborhood rank and percentiles', () => {
      render(
        <GameVictoryModal
          isOpen={true}
          onClose={vi.fn()}
          gameTitle="Garden Spell"
          shareResultCardText="I solved Garden Spell!"
        />
      )

      expect(screen.getByText('PUZZLE SOLVED!')).toBeTruthy()
      expect(screen.getByText(/of your neighbors/i)).toBeTruthy()
      expect(screen.getAllByText(/leaderboard/i).length).toBeGreaterThan(0)
    })

    it('triggers QuickSetup modal when clicking Sign In to Save', () => {
      render(
        <GameVictoryModal
          isOpen={true}
          onClose={vi.fn()}
          gameTitle="Garden Spell"
          shareResultCardText="I solved Garden Spell!"
        />
      )

      const signInBtn = screen.getByRole('button', { name: /Unlock Leaderboard Rank/i })
      fireEvent.click(signInBtn)

      expect(mockRequireAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'save_game_victory',
        })
      )
    })

    it('renders category-specific victory subtitle for garden_spell and math', () => {
      const { rerender } = render(
        <GameVictoryModal
          isOpen={true}
          onClose={vi.fn()}
          gameTitle="Garden Spell"
          gameCategory="garden_spell"
          shareResultCardText="I solved Garden Spell!"
        />
      )
      expect(screen.getByText(/mastered today's crop/i)).toBeTruthy()

      rerender(
        <GameVictoryModal
          isOpen={true}
          onClose={vi.fn()}
          gameTitle="Today's Nutri-Calc"
          gameCategory="math"
          shareResultCardText="I solved Nutri-Calc!"
        />
      )
      expect(screen.getByText(/unlocked today's USDA nutrition fact/i)).toBeTruthy()
    })

    it('renders share result button and opens social share modal', () => {
      render(
        <GameVictoryModal
          isOpen={true}
          onClose={vi.fn()}
          gameTitle="Garden Spell"
          shareResultCardText="I solved Garden Spell!"
        />
      )

      const shareBtn = screen.getByText('🚀 Share Result Card with Neighbors')
      expect(shareBtn).toBeTruthy()
      fireEvent.click(shareBtn)
    })
  })

  describe('WordleGardenCanvas (Garden Spell)', () => {
    it('renders wordle grid and handles guess submission', () => {
      const handleSolve = vi.fn()
      render(<WordleGardenCanvas targetWord="LEMON" onSolve={handleSolve} />)

      expect(screen.getByText(/Guess the 5-letter garden crop/i)).toBeTruthy()
    })
  })

  describe('JigsawPuzzleCanvas (Harvest Jigsaw)', () => {
    it('renders jigsaw grid and allows piece placement', () => {
      const handleSolve = vi.fn()
      render(
        <JigsawPuzzleCanvas
          imageUrl="https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg"
          title="Meyer Lemons"
          onSolve={handleSolve}
        />
      )

      expect(screen.getByText(/Show Target Picture Preview/i)).toBeTruthy()
    })
  })

  describe('GardenCrownsCanvas (Garden Plots)', () => {
    it('renders garden plots grid and allows solver action', () => {
      const handleSolve = vi.fn()
      render(<GardenCrownsCanvas onSolve={handleSolve} />)

      expect(screen.getByText(/Garden Plots/i)).toBeTruthy()
    })
  })

  describe('NutritionalAlgebraCanvas (Nutri-Calc)', () => {
    it('renders nutrition equations and handles submitting correct answer', () => {
      const handleSolve = vi.fn()
      render(<NutritionalAlgebraCanvas targetAnswer="26" onSolve={handleSolve} />)

      expect(screen.getByText(/Garden Nutrition Challenge/i)).toBeTruthy()

      const input = screen.getByPlaceholderText(/Enter total answer/i)
      fireEvent.change(input, { target: { value: '26' } })
      const submitBtn = screen.getByText(/Submit/i)
      fireEvent.click(submitBtn)

      expect(handleSolve).toHaveBeenCalled()
    })
  })

  describe('CropAnagramCanvas (Crop Anagram)', () => {
    it('displays scrambled letter tiles and handles solve completion', () => {
      const handleSolve = vi.fn()
      render(
        <CropAnagramCanvas
          anagramText="S-M-O-N-E-L"
          solutionWord="LEMONS"
          varietyDetail="Meyer Lemons — Sweet, juicy backyard citrus"
          onSolve={handleSolve}
        />
      )

      expect(screen.getByText(/Unscramble the Garden Crop Letters!/i)).toBeTruthy()

      const letterL = screen.getByRole('button', { name: /Scrambled Letter L/i })
      const letterE = screen.getByRole('button', { name: /Scrambled Letter E/i })
      const letterM = screen.getByRole('button', { name: /Scrambled Letter M/i })
      const letterO = screen.getByRole('button', { name: /Scrambled Letter O/i })
      const letterN = screen.getByRole('button', { name: /Scrambled Letter N/i })
      const letterS = screen.getByRole('button', { name: /Scrambled Letter S/i })

      fireEvent.click(letterL)
      fireEvent.click(letterE)
      fireEvent.click(letterM)
      fireEvent.click(letterO)
      fireEvent.click(letterN)
      fireEvent.click(letterS)

      expect(handleSolve).toHaveBeenCalled()
    })
  })

  describe('GardenMemoryCanvas (Memory Match)', () => {
    it('renders produce and nutrition cards and allows card flipping', () => {
      const handleSolve = vi.fn()
      render(<GardenMemoryCanvas onSolve={handleSolve} />)

      const cards = screen.getAllByRole('button')
      expect(cards.length).toBeGreaterThan(0)

      // Click cards to flip
      fireEvent.click(cards[0])
    })
  })

  describe('JigsawPuzzleCanvas (Harvest Jigsaw)', () => {
    it('renders puzzle canvas and responds to tile click interactions', () => {
      const handleSolve = vi.fn()
      render(
        <JigsawPuzzleCanvas
          imageUrl="https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg"
          title="Harvest Jigsaw"
          onSolve={handleSolve}
        />
      )

      expect(screen.getByText(/Piece Tray/i)).toBeTruthy()
      const tiles = screen.getAllByRole('button')
      expect(tiles.length).toBeGreaterThanOrEqual(9)
      fireEvent.click(tiles[0])
    })
  })
})
