'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useMarket, isMarketOpen, getNextMarketOpen } from '../../../lib/store'
import styles from './page.module.css'

/** Booth themes — visual styles for the booth. */
const BOOTH_THEMES = [
  {
    id: 'rustic',
    name: 'Rustic',
    emoji: '🪵',
    tagline: 'Warm earth tones with a handmade feel',
    description: 'A natural, farm-to-table aesthetic with warm golden tones. Perfect for garden and produce booths.',
    color: '#fef3c7',
    border: '#d97706',
  },
  {
    id: 'tropical',
    name: 'Tropical',
    emoji: '🌴',
    tagline: 'Fresh greens and sunny vibes',
    description: 'Bright, lively colors inspired by tropical gardens and citrus groves. Great for fruit sellers.',
    color: '#d1fae5',
    border: '#16a34a',
  },
  {
    id: 'cottage',
    name: 'Cottage',
    emoji: '🏡',
    tagline: 'Cozy and charming like a country kitchen',
    description: 'Soft blues and welcoming warmth. Ideal for baked goods, eggs, and homemade treats.',
    color: '#e0f2fe',
    border: '#0ea5e9',
  },
  {
    id: 'floral',
    name: 'Floral',
    emoji: '🌸',
    tagline: 'Soft pinks and a garden party feel',
    description: 'Elegant and inviting with gentle floral tones. A beautiful look for any booth.',
    color: '#fce7f3',
    border: '#ec4899',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    emoji: '✨',
    tagline: 'Clean, modern, and professional',
    description: 'A sleek, no-fuss design that lets your products speak for themselves.',
    color: '#f3f4f6',
    border: '#6b7280',
  },
  {
    id: 'harvest',
    name: 'Harvest',
    emoji: '🌾',
    tagline: 'Golden fields and autumn warmth',
    description: 'Rich harvest tones that evoke autumn farmers markets and seasonal abundance.',
    color: '#fef3c7',
    border: '#f59e0b',
  },
]

export default function GetStartedPage() {
  const { state } = useMarket()
  const open = isMarketOpen(state.marketSchedule)
  const next = getNextMarketOpen(state.marketSchedule)
  const [reminderSet, setReminderSet] = useState(false)
  const [showIOSPrompt, setShowIOSPrompt] = useState<false | 'safari' | 'chrome'>(false)

  const isIOS = () => {
    if (typeof navigator === 'undefined') return false
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }

  const isIOSChrome = () => typeof navigator !== 'undefined' && /CriOS/.test(navigator.userAgent)

  const isStandalone = () => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true
  }

  const requestReminder = async () => {
    // iOS (any browser) not in PWA mode — show "Add to Home Screen" instructions
    if (isIOS() && !isStandalone()) {
      setShowIOSPrompt(isIOSChrome() ? 'chrome' : 'safari')
      return
    }

    // Desktop / Android / iOS PWA — request notification permission
    if ('Notification' in window && 'serviceWorker' in navigator) {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        // Register push subscription
        try {
          const registration = await navigator.serviceWorker.ready
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
            // VAPID key will be set via env when backend is ready
            // applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
          })
        } catch (e) {
          console.log('[Push] Subscription not available yet (VAPID key needed)', e)
        }
        new Notification('CasaGrown Market Reminder Set! 🛒', {
          body: next
            ? `We'll remind you when the market opens — ${next.dayName} at ${next.openTime} AM`
            : 'We\'ll notify you when the market opens!',
          icon: '/logo.png',
        })
        try { localStorage.setItem('casagrown_market_reminder', 'push') } catch {}
        setReminderSet(true)
        return
      }
    }
    // Fallback: download calendar file
    if (!next) return
    const now = new Date()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const targetDay = dayNames.indexOf(next.dayName)
    const daysAhead = (targetDay - now.getDay() + 7) % 7 || 7
    const eventDate = new Date(now)
    eventDate.setDate(now.getDate() + daysAhead)
    const [h] = (next.openTime || '8').split(':').map(Number)
    eventDate.setHours(h, 0, 0, 0)
    const endDate = new Date(eventDate)
    endDate.setHours(h + 4)
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `DTSTART:${fmt(eventDate)}`, `DTEND:${fmt(endDate)}`,
      'SUMMARY:CasaGrown Market is Open!',
      'DESCRIPTION:Browse and order fresh produce from your neighbors at CasaGrown Market.',
      `URL:${window.location.origin}/market`,
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'casagrown-market.ics'; a.click()
    URL.revokeObjectURL(url)
    setReminderSet(true)
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <section className={styles.header}>
        <h1 className={styles.title}>Claim Your Booth</h1>
        <p className={styles.subtitle}>
          Choose a theme for your booth — this sets the visual look and feel.
          You can sell whatever you like and change your theme anytime.
        </p>
        {open ? (
          <Link href="/market" className={styles.buyerLink}>
            🛒 I don&apos;t grow produce — take me to the market →
          </Link>
        ) : reminderSet ? (
          <span className={styles.buyerLink} style={{ cursor: 'default' }}>
            ✅ Reminder set! We&apos;ll notify you when the market opens.
          </span>
        ) : (
          <button onClick={requestReminder} className={styles.buyerLink}>
            🔔 I don&apos;t grow produce — remind me when the market opens →
          </button>
        )}

        {/* iOS "Add to Home Screen" instructions */}
        {showIOSPrompt && (
          <div className={styles.iosPrompt}>
            <button className={styles.iosClose} onClick={() => setShowIOSPrompt(false)}>✕</button>
            <p className={styles.iosTitle}>📱 Add to Home Screen for Notifications</p>
            <p className={styles.iosDesc}>
              To receive reminders when the market opens, add CasaGrown to your home screen:
            </p>
            {showIOSPrompt === 'safari' ? (
              <ol className={styles.iosSteps}>
                <li>Tap the <strong>Share</strong> button <span style={{ fontSize: 18 }}>⬆️</span> at the bottom of Safari</li>
                <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
                <li>Tap <strong>&quot;Add&quot;</strong> in the top right</li>
                <li>Open <strong>CasaGrown Market</strong> from your home screen</li>
                <li>Come back here and tap <strong>&quot;Remind me&quot;</strong> again</li>
              </ol>
            ) : (
              <ol className={styles.iosSteps}>
                <li>Tap the <strong>Share</strong> button <span style={{ fontSize: 18 }}>📤</span> (or <strong>⋯</strong> menu)</li>
                <li>Tap <strong>&quot;Add to Home Screen&quot;</strong></li>
                <li>Tap <strong>&quot;Add&quot;</strong> to confirm</li>
                <li>Open <strong>CasaGrown Market</strong> from your home screen</li>
                <li>Come back here and tap <strong>&quot;Remind me&quot;</strong> again</li>
              </ol>
            )}
          </div>
        )}
      </section>

      {/* Theme Grid */}
      <section className={styles.grid}>
        {BOOTH_THEMES.map(t => (
          <Link
            key={t.id}
            href={`/login?template=${t.id}`}
            className={styles.card}
            style={{ borderColor: t.border }}
          >
            <div className={styles.cardHeader} style={{ background: t.color }}>
              <span className={styles.cardEmoji}>{t.emoji}</span>
              <h2 className={styles.cardName}>{t.name}</h2>
              <p className={styles.cardTagline}>{t.tagline}</p>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.cardDesc}>{t.description}</p>
            </div>
            <div className={styles.cardFooter}>
              <span className={styles.chooseBtn}>Choose This Theme →</span>
            </div>
          </Link>
        ))}
      </section>

      {/* Bottom CTA */}
      <section className={styles.bottom}>
        <p className={styles.bottomText}>
          Don&apos;t see your style? No worries — you can change your theme anytime from booth settings.
        </p>
        <Link href="/login" className="btn btn-secondary btn-lg">
          Skip &amp; Create Booth →
        </Link>
      </section>
    </div>
  )
}
