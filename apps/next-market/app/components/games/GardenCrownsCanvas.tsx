'use client'

import { useState } from 'react'

interface GardenPlotsCanvasProps {
  onSolve: () => void
}

// 6x6 Grid with 6 colored garden plot regions (represented by numbers 0..5)
const REGION_MAP = [
  [0, 0, 1, 1, 1, 2],
  [0, 0, 1, 1, 2, 2],
  [3, 3, 3, 1, 2, 2],
  [3, 4, 4, 4, 2, 5],
  [3, 4, 4, 5, 5, 5],
  [3, 4, 5, 5, 5, 5],
]

const REGION_COLORS = [
  '#fef3c7', // Yellow plot
  '#ecfdf5', // Green plot
  '#eff6ff', // Blue plot
  '#fce7f3', // Pink plot
  '#f3e8ff', // Purple plot
  '#ffedd5', // Orange plot
]

// Cell state: 0 = empty, 1 = produce item 🍋, 2 = cross ❌
type CellState = 0 | 1 | 2

export default function GardenPlotsCanvas({ onSolve }: GardenPlotsCanvasProps) {
  const gridSize = 6
  const [grid, setGrid] = useState<CellState[][]>(
    Array.from({ length: gridSize }, () => Array(gridSize).fill(0))
  )
  const [solved, setSolved] = useState(false)
  const [showRules, setShowRules] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Cycle cell state: 0 (empty) -> 1 (🍋) -> 2 (❌) -> 0
  const handleCellClick = (r: number, c: number) => {
    if (solved) return
    setErrorMsg('')

    const nextGrid = grid.map((row, rIdx) =>
      row.map((cell, cIdx) => {
        if (rIdx === r && cIdx === c) {
          return cell === 0 ? 1 : cell === 1 ? 2 : 0
        }
        return cell
      })
    )

    setGrid(nextGrid)
    checkWinCondition(nextGrid)
  }

  const checkWinCondition = (currentGrid: CellState[][]) => {
    let totalItems = 0
    const rowCounts = Array(gridSize).fill(0)
    const colCounts = Array(gridSize).fill(0)
    const regionCounts = Array(gridSize).fill(0)

    const itemPositions: Array<[number, number]> = []

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (currentGrid[r][c] === 1) {
          totalItems++
          rowCounts[r]++
          colCounts[c]++
          const reg = REGION_MAP[r][c]
          regionCounts[reg]++
          itemPositions.push([r, c])
        }
      }
    }

    if (totalItems !== gridSize) return

    // Validate 1 item per row, col, and region
    const validCounts =
      rowCounts.every((cnt) => cnt === 1) &&
      colCounts.every((cnt) => cnt === 1) &&
      regionCounts.every((cnt) => cnt === 1)

    if (!validCounts) return

    // Check no two items touch adjacent or diagonal
    for (let i = 0; i < itemPositions.length; i++) {
      for (let j = i + 1; j < itemPositions.length; j++) {
        const [r1, c1] = itemPositions[i]
        const [r2, c2] = itemPositions[j]
        if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) {
          return // Diagonal/adjacent touch violation
        }
      }
    }

    setSolved(true)
    onSolve()
  }

  const handleQuickSolve = () => {
    const solution: Array<[number, number]> = [
      [0, 1],
      [1, 3],
      [2, 5],
      [3, 0],
      [4, 2],
      [5, 4],
    ]

    const newGrid: CellState[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(0))
    solution.forEach(([r, c]) => {
      newGrid[r][c] = 1
    })

    setGrid(newGrid)
    setSolved(true)
    onSolve()
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* HOW TO PLAY BANNER */}
      <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 12, padding: 14, marginBottom: 16, textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e40af' }}>
            📖 How to Play Garden Plots
          </h3>
          <button
            onClick={() => setShowRules(!showRules)}
            style={{ background: 'transparent', border: 'none', color: '#2563eb', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}
          >
            {showRules ? 'Hide Rules ▲' : 'Show Rules ▼'}
          </button>
        </div>

        {showRules && (
          <div style={{ fontSize: 13, color: '#1e3a8a', lineHeight: 1.5 }}>
            <div>1️⃣ Plant exactly <strong>1 Meyer Lemon 🍋</strong> in each row and column.</div>
            <div>2️⃣ Each <strong>colored plot region</strong> must contain exactly 1 Lemon 🍋.</div>
            <div>3️⃣ Lemons <strong>cannot touch</strong> each other (not even diagonally).</div>
            <div style={{ marginTop: 6, fontWeight: 'bold', color: '#059669' }}>
              💡 Controls: Tap once = 🍋 Lemon | Tap twice = ❌ Mark Empty
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>{errorMsg}</div>
      )}

      {/* 6x6 GARDEN PLOT GRID */}
      <div
        style={{
          width: 320,
          height: 320,
          margin: '0 auto 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gridTemplateRows: 'repeat(6, 1fr)',
          gap: 2,
          background: '#94a3b8',
          padding: 3,
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}
      >
        {grid.map((row, rIdx) =>
          row.map((cell, cIdx) => {
            const regId = REGION_MAP[rIdx][cIdx]
            const bg = REGION_COLORS[regId]

            return (
              <button
                key={`${rIdx}-${cIdx}`}
                type="button"
                onClick={() => handleCellClick(rIdx, cIdx)}
                style={{
                  background: bg,
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'none',
                  transition: 'transform 0.1s ease',
                }}
              >
                {cell === 1 ? '🍋' : cell === 2 ? '❌' : ''}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
