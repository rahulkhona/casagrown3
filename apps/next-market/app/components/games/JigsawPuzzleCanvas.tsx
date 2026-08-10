'use client'

import { useState } from 'react'

interface JigsawPuzzleCanvasProps {
  imageUrl: string
  title: string
  onSolve: () => void
}

export default function JigsawPuzzleCanvas({
  imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg',
  title = 'Meyer Lemons',
  onSolve,
}: JigsawPuzzleCanvasProps) {
  // Grid slots 0..8 (null if empty, or piece ID 1..9)
  const [gridSlots, setGridSlots] = useState<Array<number | null>>([
    null, null, null,
    null, null, null,
    null, null, null,
  ])

  // Selected piece from tray (ID 1..9)
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [solved, setSolved] = useState(false)

  // Unplaced pieces in tray (scrambled 1..9)
  const allPieces = [4, 1, 9, 2, 7, 3, 8, 5, 6]
  const unplacedPieces = allPieces.filter((p) => !gridSlots.includes(p))

  // Select piece from tray
  const handleSelectPiece = (pieceId: number) => {
    if (solved) return
    setSelectedPiece(selectedPiece === pieceId ? null : pieceId)
  }

  // Place selected piece into grid slot
  const handleSlotClick = (slotIdx: number) => {
    if (solved) return

    // If slot has a piece, return piece back to tray
    if (gridSlots[slotIdx] !== null) {
      const updated = [...gridSlots]
      updated[slotIdx] = null
      setGridSlots(updated)
      return
    }

    // If a piece is selected from tray, place it in this slot
    if (selectedPiece !== null) {
      const updated = [...gridSlots]
      updated[slotIdx] = selectedPiece
      setGridSlots(updated)
      setSelectedPiece(null)

      // Check win condition (all 9 slots filled in exact order 1..9)
      const isComplete = updated.every((val, idx) => val === idx + 1)
      if (isComplete) {
        setSolved(true)
        onSolve()
      }
    }
  }

  const handleQuickSolve = () => {
    setGridSlots([1, 2, 3, 4, 5, 6, 7, 8, 9])
    setSolved(true)
    onSolve()
  }

  return (
    <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <p style={{ fontSize: 14, color: '#374151', marginBottom: 12, fontWeight: 600 }}>
        🧩 Tap a piece from the tray below, then tap a grid box to place it!
      </p>

      {/* TARGET PREVIEW TOGGLE */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowPreview(!showPreview)}
          style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 'bold', color: '#4b5563', cursor: 'pointer' }}
        >
          {showPreview ? '🙈 Hide Picture Preview' : '👁️ Show Target Picture Preview'}
        </button>
      </div>

      {showPreview && (
        <div style={{ marginBottom: 16 }}>
          <img src={imageUrl} alt={title} style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, border: '2px solid #059669' }} />
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 'bold', marginTop: 4 }}>Target Picture</div>
        </div>
      )}

      {/* 3x3 MAIN JIGSAW PUZZLE FRAME (300px x 300px) */}
      <div
        style={{
          width: 300,
          height: 300,
          margin: '0 auto 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 96px)',
          gridTemplateRows: 'repeat(3, 96px)',
          gap: 4,
          background: '#f1f5f9',
          padding: 4,
          borderRadius: 12,
          border: '2px solid #94a3b8',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
      >
        {gridSlots.map((pieceId, slotIdx) => {
          if (pieceId === null) {
            // Empty grid slot waiting for a piece
            return (
              <button
                key={slotIdx}
                type="button"
                onClick={() => handleSlotClick(slotIdx)}
                style={{
                  width: 96,
                  height: 96,
                  background: selectedPiece !== null ? '#ecfdf5' : '#ffffff',
                  borderRadius: 6,
                  border: selectedPiece !== null ? '2px dashed #059669' : '1px dashed #cbd5e1',
                  cursor: selectedPiece !== null ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              >
                {selectedPiece !== null ? 'Tap to Place' : `Slot ${slotIdx + 1}`}
              </button>
            )
          }

          // Render placed piece
          const originalRow = Math.floor((pieceId - 1) / 3)
          const originalCol = (pieceId - 1) % 3
          const posX = -originalCol * 96
          const posY = -originalRow * 96

          return (
            <button
              key={slotIdx}
              type="button"
              onClick={() => handleSlotClick(slotIdx)}
              title="Tap to remove piece back to tray"
              style={{
                width: 96,
                height: 96,
                padding: 0,
                borderRadius: 6,
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: '290px 290px',
                backgroundPosition: `${posX}px ${posY}px`,
                cursor: 'pointer',
                border: '2px solid #059669',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}
            />
          )
        })}
      </div>

      {/* UNPLACED PIECES TRAY */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 10, textTransform: 'uppercase' }}>
          🧩 Piece Tray ({unplacedPieces.length} Remaining)
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', minHeight: 70 }}>
          {unplacedPieces.length === 0 ? (
            <div style={{ fontSize: 13, color: '#059669', fontWeight: 'bold', padding: 12 }}>
              🎉 All pieces placed in grid!
            </div>
          ) : (
            unplacedPieces.map((pieceId) => {
              const originalRow = Math.floor((pieceId - 1) / 3)
              const originalCol = (pieceId - 1) % 3
              const posX = -originalCol * 66
              const posY = -originalRow * 66

              const isSelected = selectedPiece === pieceId

              return (
                <button
                  key={pieceId}
                  type="button"
                  onClick={() => handleSelectPiece(pieceId)}
                  style={{
                    width: 66,
                    height: 66,
                    padding: 0,
                    borderRadius: 8,
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: '200px 200px',
                    backgroundPosition: `${posX}px ${posY}px`,
                    cursor: 'pointer',
                    border: isSelected ? '3px solid #059669' : '2px solid #ffffff',
                    boxShadow: isSelected ? '0 0 0 4px rgba(5, 150, 105, 0.3)' : '0 2px 6px rgba(0,0,0,0.12)',
                    transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                />
              )
            })
          )}
        </div>
      </div>

    </div>
  )
}
