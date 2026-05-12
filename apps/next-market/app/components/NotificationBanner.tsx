'use client'

/**
 * NotificationBanner — Persistent inline banner for key pages.
 *
 * Shows on orders, earnings, and my-booth pages when push notifications
 * are not enabled. On iOS browsers, shows PWA setup instructions instead.
 *
 * Dismissable per-session (reappears next session).
 */

import { useState, useEffect } from 'react'
import { isNotificationsEnabled, isIOSBrowser, detectPlatform, getPermissionStatus } from '../../lib/useNotificationPrompt'
import styles from './NotificationPrompt.module.css'

interface NotificationBannerProps {
  /** Context message, e.g. "order updates", "new orders", "payout alerts" */
  context: string
  /** Optional: callback when user clicks "Enable" */
  onEnableClick?: () => void
}

export function NotificationBanner({ context, onEnableClick }: NotificationBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [shouldShow, setShouldShow] = useState(false)
  const [showIOSSteps, setShowIOSSteps] = useState(false)
  const [isiOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Only run on client
    import('../../lib/nativeBridge').then(({ NativeBridge }) => {
      if (NativeBridge.isNative) {
        setShouldShow(false)
        return
      }

      const enabled = isNotificationsEnabled()
      const ios = isIOSBrowser()
      const permission = getPermissionStatus()

      // Show if not granted and not unsupported (except iOS browser which needs PWA)
      if (!enabled && (permission !== 'unsupported' || ios)) {
        setShouldShow(true)
      }
      setIsIOS(ios)
    })
  }, [])

  if (!shouldShow || dismissed) return null

  const isSafari = detectPlatform() === 'ios-safari-browser'

  if (isiOS) {
    return (
      <div className={`${styles.banner} ${styles.ios}`}>
        <span className={styles.bannerIcon}>📱</span>
        <span className={styles.bannerText}>
          Add CasaGrown to your Home Screen for {context}.{' '}
          <button className={styles.bannerLink} onClick={() => setShowIOSSteps(!showIOSSteps)}>
            {showIOSSteps ? 'Hide steps' : 'Show me how'}
          </button>
          {showIOSSteps && (
            <span style={{ display: 'block', marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
              {isSafari ? (
                <>1. Tap <strong>Share</strong> ⬆️ → 2. <strong>&quot;Add to Home Screen&quot;</strong> → 3. Open from home screen</>
              ) : (
                <>1. Tap <strong>⋯ menu</strong> → 2. <strong>&quot;Add to Home Screen&quot;</strong> → 3. Open from home screen</>
              )}
            </span>
          )}
        </span>
        <button className={styles.bannerClose} onClick={() => setDismissed(true)}>✕</button>
      </div>
    )
  }

  return (
    <div className={styles.banner}>
      <span className={styles.bannerIcon}>🔔</span>
      <span className={styles.bannerText}>
        Enable notifications for {context}.{' '}
        {onEnableClick && (
          <button className={styles.bannerLink} onClick={onEnableClick}>
            Enable now
          </button>
        )}
      </span>
      <button className={styles.bannerClose} onClick={() => setDismissed(true)}>✕</button>
    </div>
  )
}
