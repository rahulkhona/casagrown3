'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../lib/supabase'
import { needsTosAcceptance } from '../../lib/legal'
import styles from './page.module.css'

export default function HomePage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  // Check auth on mount — redirect logged-in users
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setChecking(false)
        return
      }

      // User is logged in — check their progress
      const { data: profile } = await supabase
        .from('profiles')
        .select('tos_accepted_at, full_name, street_address')
        .eq('id', user.id)
        .single()

      if (needsTosAcceptance(profile?.tos_accepted_at)) {
        router.replace('/terms')
      } else if (!profile?.full_name || !profile?.street_address) {
        router.replace('/profile-setup')
      } else {
        router.replace('/market')
      }
    })
  }, [router])

  // Show loading while checking auth
  if (checking) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p style={{ color: 'var(--gray-500)', fontSize: 16 }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* ──── Hero — Community-style ──── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          {/* Left: Text Content */}
          <div className={styles.heroText}>
            {/* Logo + Brand */}
            <div className={styles.logoBrand}>
              <img src="/logo.png" alt="CasaGrown" className={styles.heroLogo} />
              <div className={styles.brandStack}>
                <span className={styles.brandName}>CasaGrown</span>
                <span className={styles.brandBadge}>FRESH • LOCAL • TRUSTED</span>
              </div>
            </div>

            <h1 className={styles.heroTitle}>
              Fresh from Neighbors&apos; backyard&nbsp;🌿
            </h1>

            <p className={styles.heroDesc}>
              Buy and sell fresh, locally-grown produce from your neighbors&apos; backyards. 
              Join a hyper-local community working together to reduce waste and expand access to fresh food.
            </p>

            <Link href="/login" className={styles.joinBtn} id="hero-join-btn">
              Join the Movement!&nbsp;&nbsp;→
            </Link>
          </div>

          {/* Right: Hero Image */}
          <div className={styles.heroImage}>
            <img src="/hero.jpg" alt="Neighbors sharing produce" />
          </div>
        </div>
      </section>

      {/* ──── Why Trade Homegrown — 4 value prop cards ──── */}
      <section className={styles.section}>
        <div className="container">
          <div className={styles.whyGrid}>
            <div className={`${styles.whyCard} ${styles.whyCardGreen}`}>
              <div className={`${styles.whyIcon} ${styles.whyIconGreen}`}>✨</div>
              <h3 className={styles.whyTitle}>Incredible Freshness</h3>
              <p className={styles.whyDesc}>
                Produce picked fresh from a neighbor&apos;s tree, not sitting in a warehouse for weeks.
              </p>
            </div>
            <div className={`${styles.whyCard} ${styles.whyCardAmber}`}>
              <div className={`${styles.whyIcon} ${styles.whyIconAmber}`}>🚫</div>
              <h3 className={styles.whyTitle}>Stop Food Waste</h3>
              <p className={styles.whyDesc}>
                Over 11.5B lbs of backyard produce goes to waste every year. Help us save it.
              </p>
            </div>
            <div className={`${styles.whyCard} ${styles.whyCardBlue}`}>
              <div className={`${styles.whyIcon} ${styles.whyIconBlue}`}>📈</div>
              <h3 className={styles.whyTitle}>Beat Inflation</h3>
              <p className={styles.whyDesc}>
                Earn extra cash from your garden or save money on high-quality produce next door.
              </p>
            </div>
            <div className={`${styles.whyCard} ${styles.whyCardPink}`}>
              <div className={`${styles.whyIcon} ${styles.whyIconPink}`}>🎓</div>
              <h3 className={styles.whyTitle}>Teen Opportunity</h3>
              <p className={styles.whyDesc}>
                Empower teens to learn business skills and earn pocket money selling produce.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──── Safety ──── */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Safe &amp; Secure</h2>
          <p className={styles.sectionSubtitle}>Built-in protections for every transaction</p>
          <div className={styles.safetyGrid}>
            {[
              { icon: '🔒', title: 'Secure Payments', desc: 'Credit card holds via Stripe. You\'re only charged after delivery.' },
              { icon: '📷', title: 'Proof of Delivery', desc: 'Photo proof for deliveries. QR/passcode verification for pickups.' },
              { icon: '⚖️', title: 'Dispute Resolution', desc: 'Fair process: sellers offer discounts, buyers can accept or escalate.' },
              { icon: '📊', title: 'Net Settlements', desc: 'Orders are netted at market close to minimize processing fees.' },
              { icon: '📋', title: '1099 Compliance', desc: 'Automatic tracking toward state and federal reporting thresholds.' },
              { icon: '🔔', title: 'Real-time Updates', desc: 'Push notifications for orders, messages, and market openings.' },
            ].map((item, i) => (
              <div key={i} className={styles.safetyCard}>
                <span className={styles.safetyIcon}>{item.icon}</span>
                <h4 className={styles.safetyTitle}>{item.title}</h4>
                <p className={styles.safetyDesc}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──── Final CTA ──── */}
      <section className={styles.section}>
        <div className="container-sm" style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle}>Ready to Get Started?</h2>
          <p className={styles.sectionSubtitle}>Join your neighborhood&apos;s market — it&apos;s free!</p>
          <Link href="/login" className="btn btn-primary btn-lg" style={{ marginTop: 24 }}>
            🌱 Join the Movement →
          </Link>
        </div>
      </section>

      {/* ──── Footer ──── */}
      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <div className={styles.footerLogoRow}>
                <img src="/logo.png" alt="CasaGrown" className={styles.footerLogo} />
                <span className={styles.logoText}>CasaGrown <span className={styles.logoAccent}>Market</span></span>
              </div>
              <p className={styles.footerTagline}>Fresh. Local. Trusted.</p>
            </div>
            <div className={styles.footerLinks}>
              <Link href="/login">Join the Movement</Link>
            </div>
          </div>
          <div className={styles.footerBottom}>
            © 2026 CasaGrown. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
