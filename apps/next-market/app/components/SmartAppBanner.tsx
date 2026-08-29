'use client'

import { useState, useEffect } from 'react'
import styles from './SmartAppBanner.module.css'

export function SmartAppBanner() {
  const [deviceOS, setDeviceOS] = useState<'ios' | 'android' | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Don't render inside native app wrapper or if native=true in query
    if ((window as any).IS_NATIVE_APP === true || window.location.search.includes('native=true')) {
      return
    }

    if (localStorage.getItem('smart_banner_dismissed') === 'true') {
      return
    }

    const ua = navigator.userAgent || ''
    if (/iPad|iPhone|iPod/i.test(ua) && !(window as any).MSStream) {
      setDeviceOS('ios')
      setDismissed(false)
    } else if (/android/i.test(ua)) {
      setDeviceOS('android')
      setDismissed(false)
    }
  }, [])

  if (dismissed || !deviceOS) return null

  const handleDismiss = () => {
    localStorage.setItem('smart_banner_dismissed', 'true')
    setDismissed(true)
  }

  return (
    <div className={styles.appBanner}>
      <button className={`${styles.closeBtn} appBannerClose`} onClick={handleDismiss} aria-label="Dismiss app banner">
        ×
      </button>
      <div className={styles.bannerInfo}>
        <span className={styles.bannerTitle}>CasaGrown</span>
        <span className={styles.bannerSubtitle}>Get our official app for the best experience</span>
      </div>
      {deviceOS === 'ios' ? (
        <a
          href="https://apps.apple.com/app/id6774057094"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.bannerAction}
        >
          <img src="/app-store-badge.svg" alt="Download on the App Store" className={styles.badgeImg} />
        </a>
      ) : (
        <a
          href="https://play.google.com/store/apps/details?id=com.casagrown.market"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.bannerAction}
        >
          <img src="/google-play-badge.svg" alt="Get it on Google Play" className={styles.badgeImg} />
        </a>
      )}
    </div>
  )
}
