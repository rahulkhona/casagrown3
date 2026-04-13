'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../lib/supabase'
import { needsTosAcceptance } from '../../lib/legal'
import { LoadingSpinner } from '../components/LoadingSpinner'
import styles from './page.module.css'

export default function HomePage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  // Check auth on mount — redirect fully-set-up users to community
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) {
        setChecking(false)
        return
      }

      // User is logged in — only redirect if fully set up
      const { data: profile } = await supabase
        .from('profiles')
        .select('tos_accepted_at, full_name, street_address')
        .eq('id', user.id)
        .single()

      if (profile?.full_name && profile?.street_address && !needsTosAcceptance(profile?.tos_accepted_at)) {
        // Fully set-up users go straight to community
        router.replace('/community')
        return
      }
      // Not fully set up — just show the landing page (don't force ToS here)
      setChecking(false)
    })
  }, [router])

  // Show loading while checking auth
  if (checking) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <LoadingSpinner />
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

            <Link href="/community" className={styles.joinBtn} id="hero-join-btn">
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
              <h3 className={styles.whyTitle}>Incredible Freshness</h3>
              <p className={styles.whyDesc}>
                Fruits in grocery stores often take weeks to months to reach the shelves. CasaGrown connects you with neighbors for produce picked fresh from the tree.
              </p>
            </div>
            <div className={`${styles.whyCard} ${styles.whyCardAmber}`}>
              <h3 className={styles.whyTitle}>Stop Food Waste</h3>
              <p className={styles.whyDesc}>
                Over 11.5 billion pounds of backyard produce goes to waste every year. Join us in saving it to feed 28 million people.
              </p>
            </div>
            <div className={`${styles.whyCard} ${styles.whyCardBlue2}`}>
              <h3 className={styles.whyTitle}>Beat Inflation</h3>
              <p className={styles.whyDesc}>
                Earn extra cash from your garden selling homegrown abundance to neighbors, or save money by finding high-quality produce right next door.
              </p>
            </div>
            <div className={`${styles.whyCard} ${styles.whyCardPink}`}>
              <h3 className={styles.whyTitle}>Teen Opportunity</h3>
              <p className={styles.whyDesc}>
                Empower teens to learn business skills and earn pocket money by selling and delivering homegrown produce.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──── How the Market Works ──── */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className="container">
          <h2 className={styles.sectionTitle}>How the Market Works</h2>
          <p className={styles.sectionSubtitle}>
            Your neighborhood marketplace — always open, always fresh
          </p>

          {/* Schedule Highlight */}
          <div className={styles.scheduleHighlight}>
            <div className={styles.scheduleIcon}>🌿</div>
            <div className={styles.scheduleInfo}>
              <h3 className={styles.scheduleMainText}>
                Market is <span className={styles.scheduleAccent}>Always Open</span>
              </h3>
              <p className={styles.scheduleSubText}>
                Browse, buy, and sell anytime. Products are always fresh — listings expire automatically 
                so you only see what&apos;s truly available.
              </p>
              <p className={styles.scheduleBuzzNote}>
                👥 Visit <Link href="/community" className={styles.buzzLink}>Community</Link> to post, 
                discuss, and connect with your local neighbors anytime!
              </p>
            </div>
          </div>

          {/* 5-Step Process */}
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepEmoji}>📸</div>
              <h4 className={styles.stepTitle}>List Your Produce</h4>
              <p className={styles.stepDesc}>
                Snap photos of your excess fruits, veggies, or eggs anytime. Set your price and quantity. Open or close your produce stand before each market day.
              </p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepEmoji}>📅</div>
              <h4 className={styles.stepTitle}>Browse &amp; Buy</h4>
              <p className={styles.stepDesc}>
                Neighbors browse your produce stand and place orders anytime. Fresh produce is always available.
              </p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepEmoji}>📦</div>
              <h4 className={styles.stepTitle}>Deliver or Pickup</h4>
              <p className={styles.stepDesc}>
                Drop off at their porch or they pick up from you. Photo proof verifies every delivery.
              </p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>4</div>
              <div className={styles.stepEmoji}>⚖️</div>
              <h4 className={styles.stepTitle}>Nightly Settlement</h4>
              <p className={styles.stepDesc}>
                Every night at midnight, all orders are netted. Your sales minus purchases and fees equals your earnings.
              </p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>5</div>
              <div className={styles.stepEmoji}>💰</div>
              <h4 className={styles.stepTitle}>Withdraw</h4>
              <p className={styles.stepDesc}>
                Funds clear in ~2 days. Cash out via Venmo or PayPal, redeem as gift cards, or donate to charity.
              </p>
            </div>
          </div>

          {/* Settlement Process Explainer */}
          <div className={styles.settlementExplainer}>
            <h3 className={styles.settlementTitle}>🏦 How Daily Settlement Works</h3>
            <div className={styles.settlementSteps}>
              <div className={styles.settlementStep}>
                <div className={styles.settlementIcon}>🔔</div>
                <div className={styles.settlementText}>
                  <strong>Nightly Settlement</strong>
                <span>Every night at midnight, all completed orders for the day are settled.</span>
                </div>
              </div>
              <div className={styles.settlementArrow}>→</div>
              <div className={styles.settlementStep}>
                <div className={styles.settlementIcon}>⚖️</div>
                <div className={styles.settlementText}>
                  <strong>Netting</strong>
                  <span>For each person, we calculate: sales − purchases − fees ± refunds = net earnings.</span>
                </div>
              </div>
              <div className={styles.settlementArrow}>→</div>
              <div className={styles.settlementStep}>
                <div className={styles.settlementIcon}>💳</div>
                <div className={styles.settlementText}>
                  <strong>Stripe Capture</strong>
                  <span>Credit card holds are captured for the exact amount owed. Unused holds are released.</span>
                </div>
              </div>
              <div className={styles.settlementArrow}>→</div>
              <div className={styles.settlementStep}>
                <div className={styles.settlementIcon}>⏳</div>
                <div className={styles.settlementText}>
                  <strong>Clearance (~2 days)</strong>
                  <span>Stripe transfers funds to CasaGrown. Your balance moves from &quot;pending&quot; to &quot;available.&quot;</span>
                </div>
              </div>
              <div className={styles.settlementArrow}>→</div>
              <div className={styles.settlementStep}>
                <div className={styles.settlementIcon}>🎉</div>
                <div className={styles.settlementText}>
                  <strong>Withdraw</strong>
                  <span>Cash out via Venmo or PayPal, redeem as gift cards, or donate to charity.</span>
                </div>
              </div>
            </div>
            <p className={styles.settlementNote}>
              💡 Because we net all orders before capturing, you pay fewer processing fees — and if you both buy and sell, only the difference is charged!
            </p>
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
              { icon: '📊', title: 'Net Settlements', desc: 'Orders are netted nightly at midnight to minimize processing fees.' },
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
          <Link href="/community" className="btn btn-primary btn-lg" style={{ marginTop: 24 }}>
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
              <Link href="/community">Join the Movement</Link>
              <Link href="/terms">Terms of Use</Link>
              <Link href="/terms?tab=privacy">Privacy Policy</Link>
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
