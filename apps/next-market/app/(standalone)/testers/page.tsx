'use client'

import { useState, useEffect } from 'react'
import styles from './page.module.css'

export default function TestersPage() {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    nearest_highschool: '',
    zip_code: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [referralSource, setReferralSource] = useState('')
  const [referralUrl, setReferralUrl] = useState('')
  const [campaignCode, setCampaignCode] = useState('')

  // Capture referral info on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const utmSource = params.get('utm_source') || params.get('ref') || ''
    setReferralSource(utmSource)

    const campaign = params.get('campaign') || params.get('c') || ''
    setCampaignCode(campaign)

    if (document.referrer) {
      setReferralUrl(document.referrer)
      if (!utmSource) {
        const ref = document.referrer.toLowerCase()
        if (ref.includes('facebook.com') || ref.includes('fb.com')) setReferralSource('facebook')
        else if (ref.includes('nextdoor.com')) setReferralSource('nextdoor')
        else if (ref.includes('instagram.com')) setReferralSource('instagram')
        else if (ref.includes('twitter.com') || ref.includes('x.com')) setReferralSource('twitter')
        else if (ref.includes('google.com')) setReferralSource('google')
        else setReferralSource('referral')
      }
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.full_name.trim()) { setError('Please enter your name'); return }
    if (!form.email.trim() || !form.email.includes('@')) { setError('Please enter a valid email'); return }
    if (!form.nearest_highschool.trim()) { setError('Please enter your nearest high school'); return }
    if (!form.zip_code.trim() || form.zip_code.length < 5) { setError('Please enter a valid zip code'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'}/rest/v1/beta_testers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone_number: form.phone_number.trim() || null,
          nearest_highschool: form.nearest_highschool.trim(),
          zip_code: form.zip_code.trim(),
          campaign_code: campaignCode || null,
          referral_source: referralSource || null,
          referral_url: referralUrl || null,
        }),
      })

      if (res.ok || res.status === 201) {
        setSubmitted(true)
      } else {
        const data = await res.json().catch(() => ({}))
        if (data?.code === '23505') {
          setError('This email is already registered! We\'ll be in touch soon.')
        } else {
          setError(data?.message || 'Something went wrong. Please try again.')
        }
      }
    } catch {
      setError('Could not reach the server. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.successContainer}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>📬</div>
            <h1 className={styles.successTitle}>Thank You, {form.full_name.split(' ')[0]}!</h1>
            <p className={styles.successDesc}>
              Your application to beta test CasaGrown has been received.
            </p>
            <p className={styles.successNext}>
              Our team will review your application and send a <strong>confirmation email</strong> to{' '}
              <strong>{form.email}</strong> with your test schedule, compensation details, and next steps.
            </p>
            <p className={styles.successNext}>
              This usually takes 1–2 business days. We appreciate your patience!
            </p>
            <div className={styles.successBadge}>
              <span>🌱</span> Application Received
            </div>
          </div>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <img src="/logo.png" alt="CasaGrown" className={styles.footerLogo} />
              <span>CasaGrown</span>
            </div>
            <p className={styles.footerTagline}>Fresh. Local. Trusted.</p>
            <a href="https://casagrown.com" className={styles.footerLink}>casagrown.com</a>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* ──── Hero + Form Side by Side (form prominent, above the fold) ──── */}
      <section className={styles.hero}>
        <div className={styles.heroFormLayout}>
          {/* Left: Branding + Message */}
          <div className={styles.heroText}>
            <div className={styles.logoBrand}>
              <img src="/logo.png" alt="CasaGrown" className={styles.heroLogo} />
              <div>
                <span className={styles.brandName}>CasaGrown</span>
                <span className={styles.brandBadge}>FRESH • LOCAL • TRUSTED</span>
              </div>
            </div>

            <h1 className={styles.heroTitle}>
              Help Us Build a Community Focused on Reducing Food Waste and eat Fresh&nbsp;🌿
            </h1>
            <p className={styles.heroDesc}>
              We&apos;re building CasaGrown — a hyper-local marketplace where neighbors 
              buy and sell fresh, homegrown produce. We need real people to test drive 
              the experience and tell us what works and what doesn&apos;t.
            </p>

            <div className={styles.paidBadge}>
              <span>💰</span>
              <div>
                <strong>Paid Testing Opportunity</strong>
                <p>Testers are compensated for their time and feedback</p>
              </div>
            </div>
          </div>

          {/* Right: Form (prominent) */}
          <div className={styles.formContainer}>
            <div className={styles.formHeader}>
              <h2 className={styles.formTitle}>🧪 Sign Up to Get Paid to Test</h2>
              <p className={styles.formSubtitle}>
                Apply below. After review, we&apos;ll send your confirmation email 
                with compensation details and test schedule.
              </p>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className="form-group">
                <label htmlFor="full_name" className="label">Full Name *</label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  className={`input ${error && !form.full_name.trim() ? 'input-error' : ''}`}
                  placeholder="e.g. Maria Garcia"
                  value={form.full_name}
                  onChange={handleChange}
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email" className="label">Email Address *</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={`input ${error && (!form.email.trim() || !form.email.includes('@')) ? 'input-error' : ''}`}
                  placeholder="e.g. maria@gmail.com"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone_number" className="label">Phone Number</label>
                <input
                  id="phone_number"
                  name="phone_number"
                  type="tel"
                  className="input"
                  placeholder="e.g. (408) 555-1234"
                  value={form.phone_number}
                  onChange={handleChange}
                  autoComplete="tel"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="nearest_highschool" className="label">Nearest High School *</label>
                  <input
                    id="nearest_highschool"
                    name="nearest_highschool"
                    type="text"
                    className={`input ${error && !form.nearest_highschool.trim() ? 'input-error' : ''}`}
                    placeholder="e.g. Leland High School"
                    value={form.nearest_highschool}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="zip_code" className="label">Zip Code *</label>
                  <input
                    id="zip_code"
                    name="zip_code"
                    type="text"
                    className={`input ${error && (!form.zip_code.trim() || form.zip_code.length < 5) ? 'input-error' : ''}`}
                    placeholder="e.g. 95120"
                    value={form.zip_code}
                    onChange={handleChange}
                    maxLength={5}
                    pattern="[0-9]{5}"
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </div>
              </div>

              {error && (
                <div className={styles.errorMsg}>
                  <span>⚠️</span> {error}
                </div>
              )}

              <button
                type="submit"
                className={`btn btn-primary btn-lg ${styles.submitBtn}`}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className={styles.spinner}></span>
                    Signing Up...
                  </>
                ) : (
                  <>🌱 Apply Now</>
                )}
              </button>

              <p className={styles.formDisclaimer}>
                By signing up, you agree to receive emails about the CasaGrown beta program. 
                We&apos;ll never spam or share your information.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* ──── Value Proposition ──── */}
      <section className={styles.valueSection}>
        <h2 className={styles.sectionTitle}>Why CasaGrown?</h2>
        <div className={styles.valueGrid}>
          <div className={`${styles.valueCard} ${styles.valueGreen}`}>
            <span className={styles.valueEmoji}>🥬</span>
            <h3>Incredible Freshness</h3>
            <p>Fruits in grocery stores often take weeks to months to reach the shelves. CasaGrown connects you with neighbors for produce picked fresh from the tree.</p>
          </div>
          <div className={`${styles.valueCard} ${styles.valueAmber}`}>
            <span className={styles.valueEmoji}>🌍</span>
            <h3>Stop Food Waste</h3>
            <p>Over 11.5 billion pounds of backyard produce goes to waste every year. Join us in saving it to feed 28 million people.</p>
          </div>
          <div className={`${styles.valueCard} ${styles.valueBlue}`}>
            <span className={styles.valueEmoji}>💸</span>
            <h3>Beat Inflation</h3>
            <p>Earn extra cash from your garden selling homegrown abundance to neighbors, or save money by finding high-quality produce right next door.</p>
          </div>
          <div className={`${styles.valueCard} ${styles.valuePink}`}>
            <span className={styles.valueEmoji}>🧑‍🎓</span>
            <h3>Teen Opportunity</h3>
            <p>Empower teens to learn business skills and earn pocket money by selling and delivering homegrown produce.</p>
          </div>
        </div>
      </section>

      {/* ──── What Testers Do ──── */}
      <section className={styles.whatSection}>
        <h2 className={styles.sectionTitle}>What Beta Testers Do</h2>
        <div className={styles.whatGrid}>
          <div className={styles.whatCard}>
            <div className={styles.whatNumber}>1</div>
            <h3>Explore the Market</h3>
            <p>Browse booths, search for products, set reminders, and experience the market open/close cycle.</p>
          </div>
          <div className={styles.whatCard}>
            <div className={styles.whatNumber}>2</div>
            <h3>Simulate Buy &amp; Sell</h3>
            <p>List produce, place orders, and walk through the full flow — no real payments or deliveries required. Everything runs in test mode.</p>
          </div>
          <div className={styles.whatCard}>
            <div className={styles.whatNumber}>3</div>
            <h3>Report Issues</h3>
            <p>Found something confusing? Spotted a bug? Your feedback helps us polish the experience before launch.</p>
          </div>
        </div>
      </section>

      {/* ──── Footer ──── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <img src="/logo.png" alt="CasaGrown" className={styles.footerLogo} />
            <span>CasaGrown</span>
          </div>
          <p className={styles.footerTagline}>Fresh. Local. Trusted.</p>
          <a href="https://casagrown.com" className={styles.footerLink} target="_blank" rel="noopener noreferrer">
            casagrown.com
          </a>
          <p className={styles.copyright}>© 2026 CasaGrown. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
