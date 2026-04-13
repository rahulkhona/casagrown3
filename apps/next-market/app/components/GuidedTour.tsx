'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../lib/useAuth'
import styles from './GuidedTour.module.css'

const STORAGE_KEY = 'casagrown_tutorial_done'

interface TourStep {
  target: string  // DOM data-tour value, or 'card' for card-only steps
  title: string
  description: string
  position: 'top' | 'bottom'
}

const STEPS: TourStep[] = [
  {
    target: 'nav-buzz',
    title: '👥 Community',
    description: 'Your neighborhood hub. Share gardening tips, photos, ask questions, and connect with fellow growers.',
    position: 'top',
  },
  {
    target: 'nav-orders',
    title: '📦 Orders',
    description: 'Track your purchases and manage incoming orders if you\'re a seller.',
    position: 'top',
  },
  {
    target: 'nav-messages',
    title: '💬 Messages',
    description: 'Direct messages with buyers, sellers, and neighbors. Send offers, request help, and coordinate.',
    position: 'top',
  },
  {
    target: 'nav-market',
    title: '🛍️ Market',
    description: 'Browse and buy fresh produce from your neighbors. Enter your address to find sellers near you.',
    position: 'top',
  },
  {
    target: 'nav-feedback',
    title: '❓ Feedback',
    description: 'Found a bug? Have a feature idea? Tap here to report issues, suggest features, or get support — with a screenshot auto-attached.',
    position: 'bottom',
  },
  {
    target: 'nav-hamburger',
    title: '☰ Menu',
    description: 'Access your produce stand, earnings, profile, settings, and the full "How It Works" guide.',
    position: 'bottom',
  },
  // Card-only explanation steps (no spotlight)
  {
    target: 'card',
    title: '💳 Payment Protection',
    description: 'Your card is only charged upon completed delivery — not when you place the order. All payments are handled securely through Stripe.',
    position: 'bottom',
  },
  {
    target: 'card',
    title: '💰 Nightly Settlement',
    description: 'Every night at midnight, your sales minus purchases and fees are netted into your earnings. You can cash out via PayPal, gift cards, or donate.',
    position: 'bottom',
  },
]

export function GuidedTour() {
  const { profileComplete } = useAuth()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    // Tour is only triggered manually from the hamburger menu "Replay Tutorial"
    // Check if the page just reloaded after resetTour cleared the flag
    if (profileComplete && localStorage.getItem('casagrown_tour_pending')) {
      localStorage.removeItem('casagrown_tour_pending')
      const timer = setTimeout(() => setActive(true), 800)
      return () => clearTimeout(timer)
    }
  }, [profileComplete])

  const currentStep = STEPS[step]
  const isCardStep = currentStep?.target === 'card'

  // Track the target element (only for spotlight steps)
  useEffect(() => {
    if (!active || isCardStep) return
    let raf: number
    const track = () => {
      const els = document.querySelectorAll(`[data-tour="${STEPS[step].target}"]`)
      let visible: Element | null = null
      els.forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && !visible) visible = el
      })
      if (visible) {
        setRect((visible as Element).getBoundingClientRect())
      }
      raf = requestAnimationFrame(track)
    }
    raf = requestAnimationFrame(track)
    return () => cancelAnimationFrame(raf)
  }, [active, step, isCardStep])

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    setActive(false)
  }, [])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else dismiss()
  }, [step, dismiss])

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1)
  }, [step])

  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, next, prev, dismiss])

  if (!active) return null

  const isLast = step === STEPS.length - 1

  // ── Card-only step (centered modal, no spotlight) ──
  if (isCardStep) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)' }} onClick={dismiss} />
        <div
          className={styles.tooltip}
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 320,
            maxWidth: 'calc(100vw - 32px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className={styles.tooltipHeader}>
            <h3 className={styles.tooltipTitle}>{currentStep.title}</h3>
            <span className={styles.stepCount}>{step + 1}/{STEPS.length}</span>
          </div>
          <p className={styles.tooltipDesc}>{currentStep.description}</p>
          <div className={styles.tooltipFooter}>
            <button className={styles.btnSkip} onClick={dismiss}>Skip</button>
            <div className={styles.tooltipBtns}>
              {step > 0 && <button className={styles.btnPrev} onClick={prev}>← Back</button>}
              <button className={styles.btnNext} onClick={next}>
                {isLast ? 'Done! 🎉' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Spotlight step (highlight UI element) ──
  if (!rect) return null

  const pad = 8
  const cx = rect.left - pad
  const cy = rect.top - pad
  const cw = rect.width + pad * 2
  const ch = rect.height + pad * 2

  const tooltipWidth = 300
  const tooltipLeft = Math.max(12, Math.min(
    rect.left + rect.width / 2 - tooltipWidth / 2,
    window.innerWidth - tooltipWidth - 12
  ))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
      {/* Overlay — 4 dark rectangles around the spotlight */}
      <div style={{ position: 'fixed', inset: 0 }} onClick={dismiss}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: cy, background: 'rgba(0,0,0,0.65)' }} />
        <div style={{ position: 'fixed', top: cy + ch, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)' }} />
        <div style={{ position: 'fixed', top: cy, left: 0, width: cx, height: ch, background: 'rgba(0,0,0,0.65)' }} />
        <div style={{ position: 'fixed', top: cy, left: cx + cw, right: 0, height: ch, background: 'rgba(0,0,0,0.65)' }} />
      </div>

      {/* Highlight ring */}
      <div className={styles.ring} style={{
        position: 'fixed', left: cx, top: cy, width: cw, height: ch, pointerEvents: 'none',
      }} />

      {/* Tooltip */}
      <div
        className={styles.tooltip}
        style={{
          position: 'fixed',
          left: tooltipLeft,
          width: tooltipWidth,
          ...(rect.top < window.innerHeight / 2
            ? { top: rect.bottom + 14 }
            : { bottom: window.innerHeight - rect.top + 14 }
          ),
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.tooltipHeader}>
          <h3 className={styles.tooltipTitle}>{currentStep.title}</h3>
          <span className={styles.stepCount}>{step + 1}/{STEPS.length}</span>
        </div>
        <p className={styles.tooltipDesc}>{currentStep.description}</p>
        <div className={styles.tooltipFooter}>
          <button className={styles.btnSkip} onClick={dismiss}>Skip</button>
          <div className={styles.tooltipBtns}>
            {step > 0 && <button className={styles.btnPrev} onClick={prev}>← Back</button>}
            <button className={styles.btnNext} onClick={next}>
              {isLast ? 'Done! 🎉' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function resetTour() {
  localStorage.setItem('casagrown_tour_pending', 'true')
  window.location.reload()
}
