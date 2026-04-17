'use client'

import styles from './NotificationPrompt.module.css'
import type { NotificationModalProps } from '../../lib/useVoicePush'

const BENEFITS = [
  { icon: '💬', text: 'Know instantly when staff reply to your feedback', bg: '#dcfce7' },
  { icon: '📣', text: 'Get notified when your idea gets traction', bg: '#dbeafe' },
  { icon: '🏷️', text: 'Stay updated on CasaGrown announcements', bg: '#fef3c7' },
]

import { useState, useEffect } from 'react'

export function NotificationPromptModal({
  visible,
  variant,
  onEnable,
  onDismiss,
  onPermanentDismiss,
}: NotificationModalProps) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => { setIsMounted(true) }, [])

  if (!isMounted || !visible) return null

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div
        className={`${styles.card} ${(variant === 'ios-safari' || variant === 'ios-chrome') ? styles.wide : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {variant === 'first-time' && <FirstTimePrompt onEnable={onEnable} onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
        {variant === 'denied' && <DeniedPrompt onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
        {variant === 'ios-safari' && <PWAGuide browser="safari" onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
        {variant === 'ios-chrome' && <PWAGuide browser="chrome" onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
      </div>
    </div>
  )
}

function FirstTimePrompt({ onEnable, onDismiss, onPermanentDismiss }: {
  onEnable: () => void; onDismiss: () => void; onPermanentDismiss: () => void
}) {
  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#dcfce7' }}>🔔</div>
      <h2 className={styles.title}>Stay in the Loop!</h2>
      <p className={styles.body}>
        Enable notifications so you never miss a reply to your feedback or community updates from CasaGrown.
      </p>
      <div className={styles.benefitsList}>
        {BENEFITS.map((b, i) => (
          <div key={i} className={styles.benefitItem}>
            <div className={styles.benefitIcon} style={{ background: b.bg }}>{b.icon}</div>
            <span className={styles.benefitText}>{b.text}</span>
          </div>
        ))}
      </div>
      <button className={styles.enableBtn} onClick={onEnable}>
        🔔 Enable Notifications
      </button>
      <button className={styles.dismissLink} onClick={onDismiss}>Not now</button>
      <button className={styles.permanentDismiss} onClick={onPermanentDismiss}>Don&#39;t ask again</button>
    </>
  )
}

function DeniedPrompt({ onDismiss, onPermanentDismiss }: {
  onDismiss: () => void; onPermanentDismiss: () => void
}) {
  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#fef3c7' }}>⚠️</div>
      <h2 className={styles.title}>Notifications Blocked</h2>
      <p className={styles.body}>
        To get alerts when staff reply to your feedback, please re-enable notifications in your browser settings.
      </p>
      <div className={styles.stepsList}>
        <div className={styles.stepItem}>
          <span className={styles.stepNum}>1</span>
          <div className={styles.stepContent}>
            <p className={styles.stepTitle}>Open Browser Settings</p>
            <p className={styles.stepDesc}>Click the 🔒 lock icon in the address bar</p>
          </div>
        </div>
        <div className={styles.stepItem}>
          <span className={styles.stepNum}>2</span>
          <div className={styles.stepContent}>
            <p className={styles.stepTitle}>Find Notifications</p>
            <p className={styles.stepDesc}>Look for &quot;Notifications&quot; in the site permissions</p>
          </div>
        </div>
        <div className={styles.stepItem}>
          <span className={styles.stepNum}>3</span>
          <div className={styles.stepContent}>
            <p className={styles.stepTitle}>Allow Notifications</p>
            <p className={styles.stepDesc}>Change the setting from &quot;Block&quot; to &quot;Allow&quot;</p>
          </div>
        </div>
      </div>
      <button className={`${styles.enableBtn} ${styles.amber}`} onClick={onDismiss}>Got It</button>
      <button className={styles.dismissLink} onClick={onDismiss}>Maybe later</button>
      <button className={styles.permanentDismiss} onClick={onPermanentDismiss}>Don&#39;t ask again</button>
    </>
  )
}

function PWAGuide({ browser, onDismiss, onPermanentDismiss }: {
  browser: 'safari' | 'chrome'; onDismiss: () => void; onPermanentDismiss: () => void
}) {
  const isSafari = browser === 'safari'
  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#dcfce7' }}>🔔</div>
      <h2 className={styles.title}>Get Notifications on iOS</h2>
      <p className={styles.body}>Know instantly when staff reply to your feedback — just like a regular app.</p>
      <div className={styles.pwaStepsBox}>
        {isSafari ? (
          <>
            <div className={styles.pwaStep}><span>⬆️ Tap Share → Add to Home Screen → Add</span></div>
          </>
        ) : (
          <>
            <div className={styles.pwaStep}><span>⋯ Tap menu → Add to Home Screen → Add</span></div>
          </>
        )}
      </div>
      <button className={styles.enableBtn} onClick={onDismiss}>Got It — I&#39;ll Set It Up!</button>
      <button className={styles.dismissLink} onClick={onDismiss}>Remind me later</button>
      <button className={styles.permanentDismiss} onClick={onPermanentDismiss}>Don&#39;t ask again</button>
    </>
  )
}
