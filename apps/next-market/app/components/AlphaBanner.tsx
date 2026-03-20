'use client'

import { useState, useEffect } from 'react'
import styles from './AlphaBanner.module.css'

const ALPHA_ACK_KEY = 'casagrown_alpha_ack'

export function AlphaBanner() {
  const [acknowledged, setAcknowledged] = useState(true) // start hidden to avoid flash

  useEffect(() => {
    try {
      const ack = localStorage.getItem(ALPHA_ACK_KEY)
      if (!ack) setAcknowledged(false)
    } catch { /* SSR or storage error */ }
  }, [])

  const handleAcknowledge = () => {
    setAcknowledged(true)
    try { localStorage.setItem(ALPHA_ACK_KEY, 'true') } catch { /* ignore */ }
  }

  // After acknowledgment, show small persistent badge
  if (acknowledged) {
    return (
      <div className={styles.badge} data-testid="alpha-banner">
        <span className={styles.badgeText}>🧪 ALPHA</span>
      </div>
    )
  }

  // First-visit modal
  return (
    <div className={styles.overlay} data-testid="alpha-banner">
      <div className={styles.modal}>
        <div className={styles.modalIcon}>🧪</div>
        <h2 className={styles.modalTitle}>Welcome to Alpha!</h2>
        <p className={styles.modalDesc}>
          You&apos;re using an <strong>early test version</strong> of CasaGrown Market.
        </p>
        <ul className={styles.modalList}>
          <li>💳 <strong>Money transactions are simulated</strong> — no real charges</li>
          <li>🥬 You <strong>can trade real produce</strong> with your neighbors</li>
          <li>🐛 You may encounter bugs — please report them via Community Voice</li>
        </ul>
        <button
          className={styles.modalBtn}
          onClick={handleAcknowledge}
          data-testid="alpha-banner-close"
          id="alpha-acknowledge-btn"
        >
          I Understand — Let&apos;s Go! 🚀
        </button>
      </div>
    </div>
  )
}
