'use client'

import { useState } from 'react'
import styles from './AlphaBanner.module.css'

export function AlphaBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className={styles.banner} data-testid="alpha-banner">
      <div className={styles.content}>
        <span className={styles.badge}>ALPHA</span>
        <span className={styles.text}>
          This is a test environment — <strong>money transactions are simulated</strong>, 
          but you can trade produce for real!
        </span>
      </div>
      <button className={styles.close} onClick={() => setDismissed(true)} aria-label="Dismiss" data-testid="alpha-banner-close">✕</button>
    </div>
  )
}
