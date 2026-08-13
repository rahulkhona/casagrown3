/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import WordleGardenCanvas from '../WordleGardenCanvas'
import JigsawPuzzleCanvas from '../JigsawPuzzleCanvas'
import CropAnagramCanvas from '../CropAnagramCanvas'
import GardenCrownsCanvas from '../GardenCrownsCanvas'
import GardenMemoryCanvas from '../GardenMemoryCanvas'
import NutritionalAlgebraCanvas from '../NutritionalAlgebraCanvas'

describe('CasaGrown Games — Hint Engine Unit Tests', () => {
  it('renders Hint button and applies 1-step hint with cooldown on WordleGardenCanvas', () => {
    const handleSolve = vi.fn()
    render(<WordleGardenCanvas targetWord="LEMON" onSolve={handleSolve} />)

    const hintBtn = screen.getByRole('button', { name: /Hint Button/i })
    expect(hintBtn).toBeInTheDocument()
    expect(hintBtn).not.toBeDisabled()

    // Click Hint 1
    fireEvent.click(hintBtn)

    // Button enters cooldown
    expect(screen.getByRole('button', { name: /Hint Button/i })).toBeDisabled()
  })

  it('renders Hint button and applies 1-step hint on JigsawPuzzleCanvas', () => {
    const handleSolve = vi.fn()
    render(<JigsawPuzzleCanvas imageUrl="test.jpg" title="Test" onSolve={handleSolve} />)

    const hintBtn = screen.getByRole('button', { name: /Hint Button/i })
    expect(hintBtn).toBeInTheDocument()

    fireEvent.click(hintBtn)
    expect(screen.getByRole('button', { name: /Hint Button/i })).toBeDisabled()
  })

  it('renders Hint button on CropAnagramCanvas', () => {
    const handleSolve = vi.fn()
    render(<CropAnagramCanvas anagramText="S-M-O-N-E-L" solutionWord="LEMONS" onSolve={handleSolve} />)

    const hintBtn = screen.getByRole('button', { name: /Hint Button/i })
    expect(hintBtn).toBeInTheDocument()

    fireEvent.click(hintBtn)
    expect(screen.getByRole('button', { name: /Hint Button/i })).toBeDisabled()
  })

  it('renders Hint button on GardenCrownsCanvas', () => {
    const handleSolve = vi.fn()
    render(<GardenCrownsCanvas onSolve={handleSolve} />)

    const hintBtn = screen.getByRole('button', { name: /Hint Button/i })
    expect(hintBtn).toBeInTheDocument()

    fireEvent.click(hintBtn)
    expect(screen.getByRole('button', { name: /Hint Button/i })).toBeDisabled()
  })

  it('renders Hint button on GardenMemoryCanvas', () => {
    const handleSolve = vi.fn()
    render(<GardenMemoryCanvas onSolve={handleSolve} />)

    const hintBtn = screen.getByRole('button', { name: /Hint Button/i })
    expect(hintBtn).toBeInTheDocument()

    fireEvent.click(hintBtn)
    expect(screen.getByRole('button', { name: /Hint Button/i })).toBeDisabled()
  })

  it('renders Hint button on NutritionalAlgebraCanvas', () => {
    const handleSolve = vi.fn()
    render(<NutritionalAlgebraCanvas onSolve={handleSolve} />)

    const hintBtn = screen.getByRole('button', { name: /Hint Button/i })
    expect(hintBtn).toBeInTheDocument()

    fireEvent.click(hintBtn)
    expect(screen.getByRole('button', { name: /Hint Button/i })).toBeDisabled()
  })
})
