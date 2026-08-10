'use client'

import { useState, useRef, useEffect } from 'react'

interface WordleGardenCanvasProps {
  targetWord: string
  onSolve: () => void
}

export default function WordleGardenCanvas({
  targetWord = 'LEMON',
  onSolve,
}: WordleGardenCanvasProps) {
  const target = targetWord.toUpperCase()
  const wordLength = target.length

  const initialGuess = target[0] || ''
  const [currentGuess, setCurrentGuess] = useState(initialGuess)
  const [isFocused, setIsFocused] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleTileClick = () => {
    inputRef.current?.focus()
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    if (currentGuess.length !== wordLength || isGameOver) return

    if (currentGuess === target) {
      setIsGameOver(true)
      onSolve()
    } else {
      setFeedbackMsg('Not quite right, try again! 🌿')
    }
  }

  // Active box index (0 to wordLength - 1)
  const activeBoxIndex = Math.min(currentGuess.length, wordLength - 1)

  return (
    <div style={{ maxWidth: 550, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* CONTROLLED HIDDEN INPUT */}
      <input
        ref={inputRef}
        type="text"
        value={currentGuess}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={(e) => {
          setFeedbackMsg('')
          let val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '')
          if (!val.startsWith(target[0])) {
            val = target[0] + val.replace(new RegExp(`^${target[0]}`), '')
          }
          if (val.length < 1) val = target[0]
          setCurrentGuess(val.slice(0, wordLength))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSubmit()
          }
        }}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: 1,
          height: 1,
        }}
      />

      <p style={{ fontSize: 14, color: '#374151', marginBottom: 20, fontWeight: 600 }}>
        🌿 Guess the {wordLength}-letter garden crop! Starts with &quot;<span style={{ color: '#059669', fontWeight: 800 }}>{target[0]}</span>&quot;
      </p>

      {/* SINGLE ROW OF LETTER BOXES (NO NYT GRID) */}
      <div onClick={handleTileClick} style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 24, cursor: 'pointer', flexWrap: 'wrap' }}>
        {Array.from({ length: wordLength }).map((_, colIdx) => {
          const char = currentGuess[colIdx] || ''
          const isCurrentFocusBox = isFocused && colIdx === activeBoxIndex

          return (
            <div
              key={colIdx}
              style={{
                width: wordLength > 7 ? 46 : 56,
                height: wordLength > 7 ? 46 : 56,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: wordLength > 7 ? 20 : 24,
                fontWeight: 800,
                background: isCurrentFocusBox ? '#ecfdf5' : '#ffffff',
                color: '#111827',
                border: isCurrentFocusBox ? '3px solid #059669' : '2px solid #cbd5e1',
                boxShadow: isCurrentFocusBox
                  ? '0 0 0 4px rgba(5, 150, 105, 0.2)'
                  : char ? '0 3px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {char}
            </div>
          )
        })}
      </div>

      {feedbackMsg && (
        <div style={{ color: '#d97706', fontSize: 13, fontWeight: 'bold', marginBottom: 16 }}>
          {feedbackMsg}
        </div>
      )}

      {/* SUBMIT ACTION BUTTON */}
      <button
        onClick={handleSubmit}
        disabled={currentGuess.length !== wordLength}
        style={{
          width: '100%',
          maxWidth: 280,
          background: currentGuess.length === wordLength ? '#059669' : '#e5e7eb',
          color: currentGuess.length === wordLength ? '#ffffff' : '#9ca3af',
          border: 'none',
          padding: '12px 20px',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 15,
          cursor: currentGuess.length === wordLength ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
        }}
      >
        Submit {wordLength}-Letter Guess ↵
      </button>
    </div>
  )
}
