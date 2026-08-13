'use client'

import { useState } from 'react'
import { useHintCooldown } from './useHintCooldown'
import HintButton from './HintButton'

interface CropAnagramCanvasProps {
  anagramText?: string // e.g. "L-E-M-O-N-S"
  solutionWord?: string // e.g. "LEMONS"
  varietyDetail?: string // e.g. "Meyer Lemons (Sweet backyard citrus)"
  onSolve: () => void
}

export default function CropAnagramCanvas({
  anagramText = 'S-M-O-N-E-L',
  solutionWord = 'LEMONS',
  varietyDetail = 'Meyer Lemons — Sweet backyard citrus popular in San Jose gardens',
  onSolve,
}: CropAnagramCanvasProps) {
  const target = solutionWord.toUpperCase().replace(/\s+/g, '')

  // Extract scrambled letters and ensure they are genuinely scrambled!
  let scrambledLetters = anagramText
    .replace(/[^A-Z]/gi, '')
    .toUpperCase()
    .split('')

  // Automatic Scramble Safeguard: If input string matches target, reverse/shuffle it!
  if (scrambledLetters.join('') === target) {
    scrambledLetters = [...scrambledLetters].reverse()
  }

  const [userLetters, setUserLetters] = useState<string[]>([])
  const [availableLetters, setAvailableLetters] = useState<Array<{ id: number; char: string; used: boolean }>>(
    scrambledLetters.map((char, idx) => ({ id: idx, char, used: false }))
  )
  const [errorMsg, setErrorMsg] = useState('')
  const [solved, setSolved] = useState(false)

  const { hintsRemaining, isCoolingDown, secondsLeft, highlightedStep, triggerHint } = useHintCooldown({
    maxHints: 3,
    cooldownDurationSeconds: 3,
  })

  const handleApplyHint = () => {
    if (solved) return

    triggerHint(() => {
      // Find next required letter from target that user needs
      const nextIdx = userLetters.length
      if (nextIdx >= target.length) return

      const neededChar = target[nextIdx]
      const freeLetterObj = availableLetters.find((l) => !l.used && l.char === neededChar)
      if (!freeLetterObj) return

      const updatedPool = availableLetters.map((l) => (l.id === freeLetterObj.id ? { ...l, used: true } : l))
      const updatedUser = [...userLetters, neededChar]

      setAvailableLetters(updatedPool)
      setUserLetters(updatedUser)
      setErrorMsg('')

      if (updatedUser.length === target.length) {
        if (updatedUser.join('') === target) {
          setSolved(true)
          onSolve()
        }
      }

      return nextIdx
    })
  }


  // Tap scrambled letter badge to append to answer
  const handleLetterTap = (letterObj: { id: number; char: string; used: boolean }) => {
    if (solved || letterObj.used) return
    setErrorMsg('')

    const updatedPool = availableLetters.map((l) => (l.id === letterObj.id ? { ...l, used: true } : l))
    const updatedUser = [...userLetters, letterObj.char]

    setAvailableLetters(updatedPool)
    setUserLetters(updatedUser)

    if (updatedUser.length === target.length) {
      if (updatedUser.join('') === target) {
        setSolved(true)
        onSolve()
      } else {
        setErrorMsg('Not quite right! Tap a letter to remove it and try rearranging. 🌿')
      }
    }
  }

  // Remove letter from user answer
  const handleRemoveUserLetter = (index: number) => {
    if (solved) return
    setErrorMsg('')

    const charToRemove = userLetters[index]
    const updatedUser = userLetters.filter((_, i) => i !== index)

    let unmarked = false
    const updatedPool = availableLetters.map((l) => {
      if (!unmarked && l.used && l.char === charToRemove) {
        unmarked = true
        return { ...l, used: false }
      }
      return l
    })

    setUserLetters(updatedUser)
    setAvailableLetters(updatedPool)
  }

  const handleReset = () => {
    setUserLetters([])
    setAvailableLetters(availableLetters.map((l) => ({ ...l, used: false })))
    setErrorMsg('')
  }

  const handleQuickSolve = () => {
    setUserLetters(target.split(''))
    setSolved(true)
    onSolve()
  }

  return (
    <div data-solution={target} style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* INSTRUCTIONS BANNER (NO SOLUTION SHOWN) */}
      <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 12, padding: 14, marginBottom: 14, textAlign: 'left' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#1e40af' }}>
          🔤 Unscramble the Garden Crop Letters!
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: '#1e3a8a' }}>
          Tap the scrambled letter tiles below to spell out the {target.length}-letter garden produce item!
        </p>
      </div>

      {/* HINT BUTTON */}
      {!solved && (
        <HintButton
          hintsRemaining={hintsRemaining}
          isCoolingDown={isCoolingDown}
          secondsLeft={secondsLeft}
          onClick={handleApplyHint}
        />
      )}

      {/* PRODUCE VARIETY LEARNING NOTE (REVEALED ONLY AFTER SOLVING) */}
      {solved ? (
        <div style={{ background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: 12, padding: 14, marginBottom: 20, textAlign: 'left', fontSize: 13, color: '#047857', fontWeight: 600 }}>
          🎉 <strong>Correct! Harvest Variety Info:</strong> {varietyDetail}
        </div>
      ) : (
        <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 10, padding: 12, marginBottom: 20, textAlign: 'left', fontSize: 12, color: '#854d0e' }}>
          💡 <strong>Tip:</strong> Tap the scrambled harvest letter tiles in order to spell today's garden crop!
        </div>
      )}

      {/* USER ANSWER LETTER TILES ROW */}
      <div style={{ background: '#ffffff', border: '2px solid #059669', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: 12 }}>
          Your Solution ({userLetters.length} / {target.length} Letters)
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', minHeight: 52, marginBottom: 12 }}>
          {Array.from({ length: target.length }).map((_, idx) => {
            const char = userLetters[idx] || ''
            const isHinted = highlightedStep === idx

            return (
              <button
                key={idx}
                type="button"
                onClick={() => char && handleRemoveUserLetter(idx)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  border: isHinted ? '3px solid #f59e0b' : char ? '2px solid #059669' : '2px dashed #cbd5e1',
                  background: isHinted ? '#fef3c7' : char ? '#ecfdf5' : '#f8fafc',
                  color: '#111827',
                  fontSize: 20,
                  fontWeight: 800,
                  cursor: char ? 'pointer' : 'default',
                  boxShadow: isHinted ? '0 0 16px rgba(245, 158, 11, 0.8)' : char ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  animation: isHinted ? 'hintPulse 1.2s ease-in-out infinite' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {char}
              </button>
            )
          })}
        </div>

        {errorMsg && (
          <div style={{ color: '#d97706', fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>{errorMsg}</div>
        )}

        <button
          onClick={handleReset}
          style={{ background: '#f3f4f6', border: '1px solid #d1d5db', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 'bold', color: '#4b5563', cursor: 'pointer' }}
        >
          🔄 Reset Letter Choice
        </button>
      </div>

      {/* SCRAMBLED LETTER POOL TRAY */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 12 }}>
          Scrambled Harvest Letters (Tap to Pick)
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {availableLetters.map((lObj) => (
            <button
              key={lObj.id}
              type="button"
              aria-label={`Scrambled Letter ${lObj.char} ID ${lObj.id}`}
              onClick={() => handleLetterTap(lObj)}
              disabled={lObj.used}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: lObj.used ? 'none' : '2px solid #3b82f6',
                background: lObj.used ? '#e2e8f0' : '#ffffff',
                color: lObj.used ? '#94a3b8' : '#1e40af',
                fontSize: 20,
                fontWeight: 800,
                cursor: lObj.used ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: lObj.used ? 'none' : '0 3px 8px rgba(0,0,0,0.1)',
                opacity: lObj.used ? 0.4 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {lObj.char}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
