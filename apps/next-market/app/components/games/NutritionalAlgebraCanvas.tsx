'use client'

import { useState } from 'react'

interface EquationRow {
  leftStr: string
  rightVal: string
  colorTheme: string
}

interface NutritionalAlgebraCanvasProps {
  title?: string
  metricUnit?: string // e.g. "g Dietary Fiber", "Glycemic Index Points", "mg Vitamin C", "Calories"
  rows?: EquationRow[]
  factBreakdown?: string[]
  targetAnswer?: string
  onSolve: () => void
}

export default function NutritionalAlgebraCanvas({
  title = 'Dietary Fiber & Carbohydrates Algebra Challenge',
  metricUnit = 'g Dietary Fiber',
  rows = [
    { leftStr: '🥑 Avocado + 🥑 Avocado + 🥑 Avocado', rightVal: '30g Fiber', colorTheme: '#ecfdf5' },
    { leftStr: '🥑 Avocado + 🫐 Blueberries + 🫐 Blueberries', rightVal: '18g Fiber', colorTheme: '#eff6ff' },
    { leftStr: '🫐 Blueberries + 🍎 Apple', rightVal: '8g Fiber', colorTheme: '#fff1f2' },
    { leftStr: '🥑 Avocado + 🫐 Blueberries × 🍎 Apple', rightVal: '? Total Fiber', colorTheme: '#fef3c7' },
  ],
  factBreakdown = [
    '🥑 1 Hass Avocado = 10g Dietary Fiber (36% Daily Value for gut health!)',
    '🫐 1 Cup Blueberries = 4g Dietary Fiber & rich in brain-boosting antioxidants',
    '🍎 1 Medium Apple = 4g Dietary Fiber (Pectin for digestive wellness)',
  ],
  targetAnswer = '26', // 10 + (4 * 4) = 26g
  onSolve,
}: NutritionalAlgebraCanvasProps) {
  const [userAnswer, setUserAnswer] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [solved, setSolved] = useState(false)

  const handleSubmit = () => {
    if (!userAnswer.trim()) return

    if (userAnswer.trim() === targetAnswer) {
      setSolved(true)
      onSolve()
    } else {
      setErrorMsg(`Not quite right! (Hint: Remember order of operations — multiplication × is evaluated before addition +!) 🌿`)
    }
  }

  return (
    <div style={{ maxWidth: 550, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* TITLE & LEARNING INSTRUCTIONS */}
      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'left' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
          🥗 Garden Nutrition Challenge: {metricUnit}
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
          Each crop represents its unknown USDA nutritional value in <strong>{metricUnit}</strong>. Solve the top rows to deduce each crop's value, then calculate the final equation!
        </p>
      </div>

      {/* MULTI-ROW NUTRITIONAL EQUATIONS (EACH ON ITS OWN ROW) */}
      <div style={{ background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: 16, padding: 20, marginBottom: 20, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((row, idx) => (
          <div
            key={idx}
            style={{
              background: row.colorTheme,
              border: '1.5px solid rgba(0,0,0,0.08)',
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 800,
              color: '#1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{row.leftStr}</span>
            <span style={{ color: '#059669', fontWeight: 900 }}>= {row.rightVal}</span>
          </div>
        ))}
      </div>

      {/* REVEAL USDA NUTRITIONAL VALUE BREAKDOWN ONLY AFTER SOLVING */}
      {solved ? (
        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'left', fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
          <strong style={{ display: 'block', fontSize: 14, marginBottom: 6, color: '#15803d' }}>
            🎉 Correct! Real USDA Nutrition Breakdown ({metricUnit}):
          </strong>
          {factBreakdown.map((item, i) => (
            <div key={i} style={{ marginBottom: 4 }}>{item}</div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 10, padding: 12, marginBottom: 20, textAlign: 'left', fontSize: 12, color: '#854d0e' }}>
          💡 <strong>How to play:</strong> Deduce the nutritional value of each crop from the top 3 rows. Use order of operations (multiplication × before addition +) to solve the bottom row!
        </div>
      )}

      {/* ANSWER INPUT CONTROLS */}
      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 10 }}>
          Enter Total ({metricUnit}) Answer:
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
            placeholder="Enter total answer..."
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 8,
              border: '2px solid #94a3b8',
              fontSize: 18,
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
