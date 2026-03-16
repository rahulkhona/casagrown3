'use client'

/**
 * NotificationPromptModal — Push notification permission prompt for the market app.
 *
 * 4 variants matching the community app's design:
 *   1. First-time prompt ("Stay in the Loop!")
 *   2. Permission denied ("Notifications Blocked")
 *   3. iOS Safari PWA guide
 *   4. iOS Chrome PWA guide
 */

import type { NotificationModalProps } from '../../lib/useNotificationPrompt'
import styles from './NotificationPrompt.module.css'

// =============================================================================
// Benefits (shared across variants)
// =============================================================================

const BENEFITS = [
  { icon: '📦', text: 'Get notified when your order is accepted, shipped, or delivered', bg: '#dcfce7' },
  { icon: '💬', text: 'Never miss a message from buyers or sellers',                   bg: '#dbeafe' },
  { icon: '📋', text: 'Instant alerts for new orders on your booth',                   bg: '#fef3c7' },
]

// =============================================================================
// Main Component
// =============================================================================

export function NotificationPromptModal({
  visible,
  variant,
  onEnable,
  onDismiss,
  onPermanentDismiss,
}: NotificationModalProps) {
  if (!visible) return null

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

// =============================================================================
// Variant 1: First-Time
// =============================================================================

function FirstTimePrompt({ onEnable, onDismiss, onPermanentDismiss }: {
  onEnable: () => void; onDismiss: () => void; onPermanentDismiss: () => void
}) {
  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#dcfce7' }}>🔔</div>
      <h2 className={styles.title}>Stay in the Loop!</h2>
      <p className={styles.body}>
        Enable notifications so you never miss an update on your orders, messages, or booth activity.
      </p>
      <BenefitsList />
      <button className={styles.enableBtn} onClick={onEnable}>
        🔔 Enable Notifications
      </button>
      <button className={styles.dismissLink} onClick={onDismiss}>Not now</button>
      <button className={styles.permanentDismiss} onClick={onPermanentDismiss}>Don&#39;t ask again</button>
    </>
  )
}

// =============================================================================
// Variant 2: Denied
// =============================================================================

function DeniedPrompt({ onDismiss, onPermanentDismiss }: {
  onDismiss: () => void; onPermanentDismiss: () => void
}) {
  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#fef3c7' }}>⚠️</div>
      <h2 className={styles.title}>Notifications Blocked</h2>
      <p className={styles.body}>
        You previously blocked notifications. To get order and message alerts, please re-enable them in your browser settings:
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
      <button className={`${styles.enableBtn} ${styles.amber}`} onClick={onDismiss}>
        Got It
      </button>
      <button className={styles.dismissLink} onClick={onDismiss}>Maybe later</button>
      <button className={styles.permanentDismiss} onClick={onPermanentDismiss}>Don&#39;t ask again</button>
    </>
  )
}

// =============================================================================
// Variant 3/4: iOS PWA Guide
// =============================================================================

function PWAGuide({ browser, onDismiss, onPermanentDismiss }: {
  browser: 'safari' | 'chrome'; onDismiss: () => void; onPermanentDismiss: () => void
}) {
  const isSafari = browser === 'safari'
  const shareIcon = isSafari ? '⬆️' : '📤'

  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#dcfce7' }}>🔔</div>
      <h2 className={styles.title}>Stay in the Loop!</h2>
      <p className={styles.body} style={{ marginBottom: 12 }}>
        Enable notifications so you never miss an update on your orders, messages, or booth activity.
      </p>
      <BenefitsList compact />
      <div className={styles.pwaInfoBox}>
        📱 <strong>iOS requires one extra step.</strong> Add CasaGrown to your Home Screen first, then notifications will work like a native app.
      </div>
      <div className={styles.pwaStepsBox}>
        <PWAStep icon={shareIcon} step={1} text={isSafari
          ? 'Tap the Share button at the bottom of Safari'
          : 'Tap the ⋯ menu (or Share button) in Chrome'
        } />
        <PWAStep icon="➕" step={2} text={isSafari
          ? 'Scroll down and tap "Add to Home Screen"'
          : 'Tap "Add to Home Screen"'
        } />
        <PWAStep icon="✅" step={3} text='Tap "Add" to confirm' />
        <PWAStep icon="🏠" step={4} text="Open CasaGrown from your home screen" />
        <PWAStep icon="🔔" step={5} text="You'll be prompted to enable notifications" />
      </div>
      <button className={styles.enableBtn} onClick={onDismiss}>
        Got It!
      </button>
      <button className={styles.dismissLink} onClick={onDismiss}>Remind me later</button>
      <button className={styles.permanentDismiss} onClick={onPermanentDismiss}>Don&#39;t ask again</button>
    </>
  )
}

// =============================================================================
// Shared Sub-Components
// =============================================================================

function BenefitsList({ compact }: { compact?: boolean }) {
  return (
    <div className={styles.benefitsList} style={compact ? { gap: 8, marginBottom: 12 } : undefined}>
      {BENEFITS.map((b, i) => (
        <div key={i} className={styles.benefitItem}>
          <div className={`${styles.benefitIcon} ${compact ? styles.compact : ''}`} style={{ background: b.bg }}>
            {b.icon}
          </div>
          <span className={`${styles.benefitText} ${compact ? styles.compact : ''}`}>{b.text}</span>
        </div>
      ))}
    </div>
  )
}

function PWAStep({ icon, step, text }: { icon: string; step: number; text: string }) {
  return (
    <div className={styles.pwaStep}>
      <div className={styles.pwaStepIcon}>{icon}</div>
      <span className={styles.pwaStepText}>
        <span className={styles.pwaStepBold}>Step {step}:</span> {text}
      </span>
    </div>
  )
}
