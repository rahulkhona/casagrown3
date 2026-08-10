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
  { icon: '🎮', text: 'Get notified when new daily games drop to keep your streak alive', bg: '#fef3c7' },
  { icon: '🌱', text: 'Get notified of new orders on your produce stand',             bg: '#fef9c3' },
  { icon: '📦', text: 'Get notified when your order is accepted, shipped, or delivered', bg: '#dcfce7' },
  { icon: '💬', text: 'Never miss a message from buyers or sellers',                   bg: '#dbeafe' },
]

// =============================================================================
// Main Component
// =============================================================================

import { useState, useEffect } from 'react'

export function NotificationPromptModal({
  visible,
  variant,
  onEnable,
  onDismiss,
  onPermanentDismiss,
  onOpenSettings,
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
        <button className={styles.closeBtn} onClick={onDismiss} aria-label="Close modal">
          ✕
        </button>
        {variant === 'first-time' && <FirstTimePrompt onEnable={onEnable} onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} />}
        {variant === 'denied' && <DeniedPrompt onDismiss={onDismiss} onPermanentDismiss={onPermanentDismiss} onOpenSettings={onOpenSettings} />}
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

function DeniedPrompt({ onDismiss, onPermanentDismiss, onOpenSettings }: {
  onDismiss: () => void; onPermanentDismiss: () => void; onOpenSettings?: () => void
}) {
  return (
    <>
      <div className={styles.iconCircle} style={{ background: '#fef3c7' }}>⚠️</div>
      <h2 className={styles.title}>Notifications Blocked</h2>
      <p className={styles.body}>
        You previously blocked notifications. To get order and message alerts, please re-enable them in your device settings.
      </p>
      
      {onOpenSettings ? (
        <>
          <div className={styles.stepsList}>
            <div className={styles.stepItem}>
              <span className={styles.stepNum}>1</span>
              <div className={styles.stepContent}>
                <p className={styles.stepTitle}>Open Settings</p>
                <p className={styles.stepDesc}>Tap the button below to open your device settings</p>
              </div>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepNum}>2</span>
              <div className={styles.stepContent}>
                <p className={styles.stepTitle}>Enable Notifications</p>
                <p className={styles.stepDesc}>Tap <strong>Notifications</strong> → find <strong>{typeof window !== 'undefined' && (window as any).NATIVE_APP_NAME ? (window as any).NATIVE_APP_NAME : 'CasaGrown'}</strong> → toggle <strong>Allow Notifications</strong> on</p>
              </div>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepNum}>3</span>
              <div className={styles.stepContent}>
                <p className={styles.stepTitle}>Come Back</p>
                <p className={styles.stepDesc}>Return to CasaGrown and tap <strong>🔔 Enable Notifications</strong> in the ☰ menu</p>
              </div>
            </div>
          </div>
          <button className={`${styles.enableBtn} ${styles.amber}`} onClick={onOpenSettings} style={{ marginTop: 16 }}>
            ⚙️ Open Settings
          </button>
        </>
      ) : (
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
          <button className={`${styles.enableBtn} ${styles.amber}`} onClick={onDismiss}>
            Got It
          </button>
        </div>
      )}
      
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
      <h2 className={styles.title}>Get Notifications on iOS</h2>
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
