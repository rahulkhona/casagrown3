'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'

interface Section {
  id: string
  icon: string
  title: string
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'alpha',
    icon: '🧪',
    title: 'Alpha Testing — What to Know',
    content: (
      <>
        <p>You&apos;re using an <strong>early test version</strong> of CasaGrown Market. Here&apos;s what that means:</p>
        <ul>
          <li>💳 <strong>Money transactions are simulated</strong> — no real charges will be made to your card</li>
          <li>🥬 You <strong>can trade real produce</strong> — the marketplace works, just the payments are test-only</li>
          <li>🐛 You may encounter <strong>bugs</strong> — please report them using the ❓ button in the top bar</li>
          <li>📊 Your feedback directly shapes the product — every report is read by our team</li>
        </ul>
        <p className={styles.tip}>💡 <strong>Tip:</strong> Use the ❓ button to send bug reports, feature requests, or support questions. A screenshot is auto-captured for you!</p>
      </>
    ),
  },
  {
    id: 'schedule',
    icon: '📅',
    title: 'Market Schedule & Hours',
    content: (
      <>
        <p>The market is open <strong>every Saturday and Sunday from 8:00 AM to 11:00 AM</strong> (your local time).</p>
        <p><strong>Why limited hours?</strong> Fresher produce, fairer access, and a true community shopping experience — just like a real farmers market. We&apos;ll notify you before the market opens!</p>
        <ul>
          <li>Browse booths and place orders during market hours</li>
          <li>Sellers can list products anytime — they&apos;ll go live when the market opens</li>
          <li>Orders placed during market hours are fulfilled the same day</li>
        </ul>
      </>
    ),
  },
  {
    id: 'buying',
    icon: '🛒',
    title: 'Buying: Search, Order & Payment',
    content: (
      <>
        <p>CasaGrown connects you directly with neighbors who grow. <strong>No middlemen, no markup</strong> — just fresh produce from down the street:</p>
        <ol>
          <li><strong>Enter your address</strong> — We&apos;ll show you booths near you</li>
          <li><strong>Browse products</strong> — Tap any booth to see what&apos;s available</li>
          <li><strong>Add to cart & order</strong> — Select quantities and place your order</li>
          <li><strong>Pay securely</strong> — We use Stripe for safe, encrypted payments</li>
          <li><strong>Get delivery or pick up</strong> — Coordinate with your seller</li>
        </ol>
        <p className={styles.tip}>💡 <strong>Tip:</strong> Follow your favorite booths to get notified when they list new products!</p>
      </>
    ),
  },
  {
    id: 'selling',
    icon: '🧺',
    title: 'Selling: Booth Setup & Listings',
    content: (
      <>
        <p>Got a garden, fruit tree, or even a few extra herbs? <strong>Turn your harvest into income</strong> instead of letting it go to waste:</p>
        <ol>
          <li><strong>Create your produce stand</strong> — Give it a name and description</li>
          <li><strong>Add products</strong> — Upload photos, set prices, choose units (lb, bunch, etc.)</li>
          <li><strong>Set market dates</strong> — Choose which weekends you&apos;ll be selling</li>
          <li><strong>Manage orders</strong> — Accept, prepare, and fulfill incoming orders</li>
        </ol>
        <p>You can also <strong>invite helpers</strong> to assist with your produce stand — they can see orders and chat with buyers on your behalf.</p>
      </>
    ),
  },
  {
    id: 'earnings',
    icon: '💰',
    title: 'Settlements & Earnings',
    content: (
      <>
        <p>At market close, all orders are netted. Your <strong>sales minus purchases and fees equals your earnings</strong>.</p>
        <p>For each person, we calculate: <em>sales − purchases − fees ± refunds = net earnings</em>.</p>
        <p>Once your balance is ready, you choose how to get paid:</p>
        <ul>
          <li><strong>Settlement runs:</strong> Every day at midnight</li>
          <li><strong>Cash out options:</strong> PayPal, gift cards, or donate to charity</li>
          <li><strong>Auto payout:</strong> Set up automatic PayPal payouts so your earnings are sent to you without lifting a finger</li>
          <li><strong>Minimum cashout:</strong> $5.00</li>
          <li><strong>Processing time:</strong> 1–3 business days for PayPal</li>
        </ul>
        <p>Track all your earnings and transaction history in the <strong>Earnings</strong> tab.</p>
      </>
    ),
  },
  {
    id: 'community',
    icon: '🐝',
    title: 'Community',
    content: (
      <>
        <p><strong>Community</strong> is our neighborhood community chat. Here you can:</p>
        <ul>
          <li>Share gardening tips and harvest photos</li>
          <li>Ask questions about growing produce</li>
          <li>Coordinate with neighbors for bulk orders</li>
          <li>Get notified about new booths in your area</li>
        </ul>
        <p>Community conversations are organized by neighborhood — you&apos;ll see posts from people near you.</p>
      </>
    ),
  },
  {
    id: 'safety',
    icon: '🛡️',
    title: 'Safety & Trust',
    content: (
      <>
        <p>Your neighbors are real people, and we treat this community with care:</p>
        <ul>
          <li><strong>Payment protection</strong> — Your card is only charged upon completed delivery, not when you place the order</li>
          <li><strong>Secure payments</strong> — Stripe handles all transactions (we never see your card)</li>
          <li><strong>Ratings & reviews</strong> — Rate your experience after each purchase</li>
          <li><strong>Report concerns</strong> — Flag any product or conversation that feels off</li>
          <li><strong>Community guidelines</strong> — Clear rules for respectful interaction</li>
        </ul>
      </>
    ),
  },
  {
    id: 'support',
    icon: '💬',
    title: 'Feedback & Support',
    content: (
      <>
        <p>We&apos;re here to help:</p>
        <ul>
          <li><strong>Send Feedback</strong> — Tap the bug icon (❓) in the menu to report issues or suggest features</li>
          <li><strong>Community Voice</strong> — Post on our public feedback board</li>
          <li><strong>Email</strong> — Reach us at <a href="mailto:support@casagrown.com">support@casagrown.com</a></li>
        </ul>
        <p>Your feedback directly shapes what we build next. Every report is read by our team. 💚</p>
      </>
    ),
  },
]

export default function GuidePage() {
  const [openSection, setOpenSection] = useState<string | null>('alpha')

  const toggle = (id: string) => {
    setOpenSection(prev => prev === id ? null : id)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.titleIcon}>📖</span>
          How It Works
        </h1>
        <p className={styles.subtitle}>
          Everything you need to know about CasaGrown Market
        </p>
      </div>

      {/* Table of Contents */}
      <nav className={styles.toc}>
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`${styles.tocItem} ${openSection === s.id ? styles.tocItemActive : ''}`}
            onClick={e => { e.preventDefault(); toggle(s.id) }}
          >
            <span>{s.icon}</span>
            <span>{s.title}</span>
          </a>
        ))}
      </nav>

      {/* Accordion Sections */}
      <div className={styles.sections}>
        {SECTIONS.map(section => (
          <div key={section.id} id={section.id} className={styles.section}>
            <button
              className={`${styles.sectionHeader} ${openSection === section.id ? styles.sectionHeaderOpen : ''}`}
              onClick={() => toggle(section.id)}
            >
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>{section.icon}</span>
                <span>{section.title}</span>
              </div>
              <span className={styles.chevron}>
                {openSection === section.id ? '▲' : '▼'}
              </span>
            </button>
            {openSection === section.id && (
              <div className={styles.sectionContent}>
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className={styles.bottomCta}>
        <p>Ready to get started?</p>
        <Link href="/market" className={styles.ctaButton}>
          Browse the Market 🧺
        </Link>
      </div>
    </div>
  )
}
