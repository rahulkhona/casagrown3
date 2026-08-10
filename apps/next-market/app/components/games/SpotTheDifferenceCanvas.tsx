'use client'

import { useState } from 'react'

interface DifferenceTarget {
  id: number
  x: number // percentage 0..100
  y: number // percentage 0..100
  label: string
  emoji: string
}

interface SpotTheDifferenceCanvasProps {
  imageUrl: string
  differences?: DifferenceTarget[]
  onSolve: () => void
}

const DIFFERENCES_LIST: DifferenceTarget[] = [
  { id: 1, x: 28, y: 24, label: 'Garden Leaf 🍃', emoji: '🍃' },
  { id: 2, x: 55, y: 20, label: 'Pollinator Bee 🐝', emoji: '🐝' },
  { id: 3, x: 32, y: 68, label: 'Ladybug Beetle 🐞', emoji: '🐞' },
  { id: 4, x: 74, y: 48, label: 'Dew Drop 💧', emoji: '💧' },
  { id: 5, x: 62, y: 78, label: 'Harvest Sunflower 🌻', emoji: '🌻' },
]

export default function SpotTheDifferenceCanvas({
  imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg',
  onSolve,
}: SpotTheDifferenceCanvasProps) {
  const [foundIds, setFoundIds] = useState<number[]>([])
  const [solved, setSolved] = useState(false)

  const handleDifferenceClick = (id: number) => {
    if (solved || foundIds.includes(id)) return

    const updated = [...foundIds, id]
    setFoundIds(updated)

    if (updated.length >= DIFFERENCES_LIST.length) {
      setSolved(true)
      onSolve()
    }
  }

  const handleQuickSolve = () => {
    setFoundIds(DIFFERENCES_LIST.map((d) => d.id))
    setSolved(true)
    onSolve()
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* PROGRESS COUNTER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: 12, padding: '12px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#047857' }}>
          🔍 Spot 5 Differences: <span style={{ fontSize: 20, color: '#065f46' }}>{foundIds.length} / {DIFFERENCES_LIST.length} Found</span>
        </div>
        <div style={{ fontSize: 13, color: '#047857', fontWeight: 700 }}>
          Tap the 5 extra garden items on Photo B!
        </div>
      </div>

      {/* DUAL IMAGE SIDE-BY-SIDE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16, marginBottom: 20 }}>
        
        {/* IMAGE A: CLEAN ORIGINAL PHOTO */}
        <div style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#4b5563', marginBottom: 10, textTransform: 'uppercase' }}>
            📷 Original Photo A
          </div>
          <div style={{ position: 'relative', width: '100%', height: 230, borderRadius: 10, overflow: 'hidden' }}>
            <img
              src={imageUrl}
              alt="Original Harvest"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        </div>

        {/* IMAGE B: MODIFIED PHOTO WITH BOLD VISIBLE DIFFERENCES */}
        <div style={{ background: '#ffffff', border: '2.5px solid #059669', borderRadius: 14, padding: 12, boxShadow: '0 4px 16px rgba(5, 150, 105, 0.15)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#059669', marginBottom: 10, textTransform: 'uppercase' }}>
            🔍 Photo B (5 Differences Added — Tap Each!)
          </div>
          
          <div style={{ position: 'relative', width: '100%', height: 230, borderRadius: 10, overflow: 'hidden', userSelect: 'none' }}>
            {/* BASE PHOTO B WITH WARM COLOR TINT */}
            <img
              src={imageUrl}
              alt="Modified Harvest"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                filter: 'sepia(0.12) saturate(1.15)',
              }}
            />

            {/* BOLD INTERACTIVE DIFFERENCE BUTTONS OVERLAID ON PHOTO B */}
            {DIFFERENCES_LIST.map((diff) => {
              const isFound = foundIds.includes(diff.id)

              return (
                <button
                  key={diff.id}
                  type="button"
                  onClick={() => handleDifferenceClick(diff.id)}
                  style={{
                    position: 'absolute',
                    left: `${diff.x}%`,
                    top: `${diff.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: isFound ? '3px solid #10b981' : '2px dashed #f59e0b',
                    background: isFound ? '#ecfdf5' : '#ffffff',
                    boxShadow: isFound ? '0 0 12px rgba(16, 185, 129, 0.8)' : '0 4px 12px rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: isFound ? 20 : 24,
                    cursor: isFound ? 'default' : 'pointer',
                    zIndex: 10,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isFound ? '✅' : diff.emoji}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
