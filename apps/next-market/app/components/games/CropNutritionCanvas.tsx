'use client'

import { useState } from 'react'

interface CropNutritionCanvasProps {
  questionStr: string
  correctAnswer: string | number
  nutritionFact?: string
  onSolve: () => void
}

export default function CropNutritionCanvas({
  questionStr = '🍋 Meyer Lemons provide 53mg of Vitamin C per 100g. How many mg of Vitamin C are in 300g of fresh backyard Meyer Lemons?',
  correctAnswer = '159',
  nutritionFact = '💡 Backyard Meyer lemons are packed with Vitamin C and potassium, helping boost immune health and heart wellness naturally!',
  onSolve,
}: CropNutritionCanvasProps) {
  const [userAnswer, setUserAnswer] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [solved, setSolved] = useState(false)

  const handleSubmit = () => {
    if (!userAnswer.trim()) return

    const normalizedUser = userAnswer.trim().toLowerCase()
    const normalizedTarget = String(correctAnswer).trim().toLowerCase()

    if (normalizedUser === normalizedTarget) {
      setSolved(true)
      onSolve()
    } else {
      setErrorMsg('Not quite right! Try calculating again or request a hint below. 🌿')
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* NUTRITIONAL QUESTION BOX */}
      <div style={{ background: '#eff6ff', border: '1.5px solid #3b82f6', borderRadius: 12, padding: 20, marginBottom: 20, textAlign: 'left' }}>
        <div style={{ fontSize: 12, fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', marginBottom: 6 }}>
          🥗 Garden Nutrition Challenge
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.5 }}>
          {questionStr}
        </div>
      </div>

      {/* EDUCATIONAL NUTRITION FACT CARD */}
      <div style={{ background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 10, padding: 14, marginBottom: 20, textAlign: 'left', fontSize: 13, color: '#047857', lineHeight: 1.5 }}>
        {nutritionFact}
      </div>

      {/* ANSWER INPUT CONTROL */}
      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 10 }}>
          Enter Your Answer:
        </label>

        <div style={{ display: 'flex', gap: 10, maxWidth: 360, margin: '0 auto' }}>
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => {
              setErrorMsg('')
              setUserAnswer(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            placeholder="Type answer (e.g. 159)"
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 8,
              border: '2px solid #94a3b8',
              fontSize: 16,
              fontWeight: 'bold',
              textAlign: 'center',
              outline: 'none',
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!userAnswer.trim()}
            style={{
              background: userAnswer.trim() ? '#059669' : '#e5e7eb',
              color: userAnswer.trim() ? '#ffffff' : '#9ca3af',
              border: 'none',
              padding: '12px 20px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 14,
              cursor: userAnswer.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Submit ↵
          </button>
        </div>

        {errorMsg && (
          <div style={{ color: '#d97706', fontSize: 12, fontWeight: 'bold', marginTop: 12 }}>
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  )
}
