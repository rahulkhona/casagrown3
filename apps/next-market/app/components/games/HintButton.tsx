'use client'

import React from 'react'

interface HintButtonProps {
  hintsRemaining: number
  isCoolingDown: boolean
  secondsLeft: number
  onClick: () => void
  disabled?: boolean
}

export default function HintButton({
  hintsRemaining,
  isCoolingDown,
  secondsLeft,
  onClick,
  disabled = false,
}: HintButtonProps) {
  const isLocked = disabled || hintsRemaining <= 0 || isCoolingDown

  return (
    <div style={{ margin: '14px 0', textAlign: 'center' }}>
      <style>{`
        @keyframes hintPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
          50% { transform: scale(1.04); box-shadow: 0 0 16px 4px rgba(245, 158, 11, 0.9); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
        @keyframes hintSnapGlow {
          0% { transform: scale(0.92); opacity: 0.5; box-shadow: 0 0 0 rgba(16, 185, 129, 0); }
          50% { transform: scale(1.06); opacity: 1; box-shadow: 0 0 20px rgba(16, 185, 129, 0.9); }
          100% { transform: scale(1); opacity: 1; box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); }
        }
      `}</style>
      <button
        type="button"
        aria-label="Hint Button"
        onClick={onClick}
        disabled={isLocked}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          borderRadius: 24,
          fontWeight: 800,
          fontSize: 14,
          cursor: isLocked ? 'not-allowed' : 'pointer',
          border: 'none',
          outline: 'none',
          transition: 'all 0.2s ease',
          background: isCoolingDown
            ? '#cbd5e1'
            : hintsRemaining <= 0
            ? '#e2e8f0'
            : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: isCoolingDown ? '#475569' : hintsRemaining <= 0 ? '#94a3b8' : '#ffffff',
          boxShadow: isLocked ? 'none' : '0 4px 14px rgba(217, 119, 6, 0.35)',
          opacity: isLocked && !isCoolingDown ? 0.7 : 1,
        }}
      >
        {isCoolingDown ? (
          <>
            <span style={{ fontSize: 16 }}>⏳</span>
            <span>Cooldown ({secondsLeft}s)</span>
          </>
        ) : hintsRemaining <= 0 ? (
          <>
            <span style={{ fontSize: 16 }}>💡</span>
            <span>No Hints Remaining</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 16 }}>💡</span>
            <span>Need a Hint? ({hintsRemaining} left)</span>
          </>
        )}
      </button>
    </div>
  )
}
