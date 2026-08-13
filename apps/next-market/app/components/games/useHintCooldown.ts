'use client'

import { useState, useEffect, useRef } from 'react'

export interface UseHintCooldownOptions {
  maxHints?: number
  cooldownDurationSeconds?: number
}

export function useHintCooldown({
  maxHints = 3,
  cooldownDurationSeconds = 3,
}: UseHintCooldownOptions = {}) {
  const [hintsUsed, setHintsUsed] = useState(0)
  const [isCoolingDown, setIsCoolingDown] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [highlightedStep, setHighlightedStep] = useState<number | string | null>(null)
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hintsRemaining = Math.max(0, maxHints - hintsUsed)
  const canUseHint = hintsRemaining > 0 && !isCoolingDown

  const triggerHint = (onExecuteHint: () => number | string | void) => {
    if (!canUseHint) return false

    // 1. Execute the 1-step hint callback
    const resultKey = onExecuteHint()
    if (resultKey !== undefined) {
      setHighlightedStep(resultKey)
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedStep(null)
      }, 2500)
    }

    // 2. Increment hints used
    setHintsUsed((prev) => prev + 1)

    // 3. Start Cooldown Timer
    setIsCoolingDown(true)
    setSecondsLeft(cooldownDurationSeconds)

    if (timerRef.current) clearInterval(timerRef.current)
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setIsCoolingDown(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    timerRef.current = interval

    return true
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [])

  return {
    hintsUsed,
    hintsRemaining,
    isCoolingDown,
    secondsLeft,
    canUseHint,
    highlightedStep,
    triggerHint,
  }
}
