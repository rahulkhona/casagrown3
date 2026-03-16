'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useMarket, isMarketOpen, getNextMarketOpen } from '../../../lib/store'
import { useNotificationPrompt } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../components/NotificationPromptModal'
import { useAuth } from '../../../lib/useAuth'
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
  const open = isMarketOpen(state.marketSchedule, state.marketNeverCloses)
  const next = getNextMarketOpen(state.marketSchedule)
  const [reminderSet, setReminderSet] = useState(false)
  const { user } = useAuth()
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  const requestReminder = () => {
    showPrompt()
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
      </section>

      {/* Notification Prompt Modal */}
      <NotificationPromptModal {...modalProps} />

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
