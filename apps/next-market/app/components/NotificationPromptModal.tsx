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

  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#dcfce7' }}>🔔</div>
      <h2 className={styles.title}>Get Notifications on iPhone</h2>
      <p className={styles.body} style={{ marginBottom: 12 }}>
        Know instantly when your order ships, a buyer messages you, or the market opens — just like a regular app.
      </p>
      <BenefitsList compact />
      <div className={styles.pwaInfoBox}>
        📱 <strong>One quick setup step.</strong> Apple requires you to save CasaGrown to your Home Screen first.
        It takes 30 seconds and notifications will work just like any other app!
      </div>
      <div className={styles.pwaStepsBox}>
        {isSafari ? (
          <>
            <PWAStep icon="⬆️" step={1} text='Tap the Share button (⬆️) at the bottom of your screen' />
            <PWAStep icon="➕" step={2} text='Scroll down and tap "Add to Home Screen"' />
            <PWAStep icon="✅" step={3} text='Tap "Add" in the top-right corner' />
          </>
        ) : (
          <>
            <PWAStep icon="⋯" step={1} text='Tap the ⋯ menu button in Chrome' />
            <PWAStep icon="📲" step={2} text='Tap "Add to Home Screen"' />
            <PWAStep icon="✅" step={3} text='Tap "Add" to confirm' />
          </>
        )}
      </div>
      <div className={styles.pwaInfoBox} style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
        ⚠️ <strong>Important:</strong> After adding, close this browser tab and open CasaGrown from your Home Screen.
        Always use the Home Screen app — it will ask you to allow notifications the first time you open it.
      </div>
      <p style={{ fontSize: 12, color: 'var(--gray-500)', textAlign: 'center', margin: '8px 0 0' }}>
        💡 After this, CasaGrown works just like an app — no App Store needed!
      </p>
      <button className={styles.enableBtn} onClick={onDismiss}>
        Got It — I&#39;ll Set It Up!
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
