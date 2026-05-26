'use client'

import React, { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../../../(main)/terms/page'

type PromotionDetails = {
  id: string
  name: string
  description_html: string
  enrollment_deadline: string
  allow_existing_users: boolean
  is_capacity_reached?: boolean
  giveaway?: { title?: string; description?: string; start_date: string; end_date: string; photos: string[] }
  credits?: { 
    amount_usd: number; 
    credit_type: string; 
    cap_type: string;
    cap_value: number;
    frequency: string; 
    occurrences: number; 
    start_date: string;
    image_url?: string | null;
  }
  sub_discount?: {
    discount_pct: number;
    duration_months: number | null;
    pro_monthly_price: number;
  }
  hero_image_url: string | null
}

function PromoContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = params.slug as string
  const campaign_id = searchParams.get('campaign_id')
  const promo_id = searchParams.get('promo')

  const [loading, setLoading] = useState(true)
  const [promo, setPromo] = useState<PromotionDetails | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isExistingUser, setIsExistingUser] = useState(false)

  // Form states
  const [step, setStep] = useState<'initial' | 'profile' | 'otp' | 'success'>('initial')
  const [fallbackMode, setFallbackMode] = useState<{message: string} | null>(null)
  const [skipPromo, setSkipPromo] = useState(false)
  const [email, setEmail] = useState('')
  const [interested, setInterested] = useState(false)
  const [name, setName] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [phone, setPhone] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const [tosAccepted, setTosAccepted] = useState(false)
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalContent, setModalContent] = useState<'tos' | 'privacy' | null>(null)

  // Determine Fallback Background Image
  const getBackgroundImage = () => {
    return '/tote-bag-hero.png'
  }

  // Format Renewal Text
  const getRenewalText = () => {
    if (!promo?.credits?.start_date) return ''
    const date = new Date(promo.credits.start_date)
    if (promo.credits.frequency === 'monthly') {
      const day = date.getDate()
      const s = ["th", "st", "nd", "rd"]
      const v = day % 100
      const suffix = s[(v - 20) % 10] || s[v] || s[0]
      return `Credits renewed on the ${day}${suffix} of every month`
    }
    if (promo.credits.frequency === 'weekly') {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
      return `Credits renewed every ${dayName}`
    }
    return `First cycle begins ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  useEffect(() => {
    setIsMounted(true)
    let isCurrent = true
    async function fetchPromo() {
      const supabase = createClient()
      try {
        const { data: promoData, error: rpcErr } = await supabase
          .rpc('crm_get_landing_page_promotion', { p_slug: slug, p_promo_id: promo_id || null })
        
        if (rpcErr || !promoData) throw new Error('Promotion not found or no longer active.')

        if (isCurrent) {
          setPromo({
            id: promoData.id,
            name: promoData.name,
            description_html: promoData.description_html,
            enrollment_deadline: promoData.enrollment_deadline,
            allow_existing_users: promoData.allow_existing_users,
            is_capacity_reached: promoData.is_capacity_reached,
            giveaway: promoData.giveaway || undefined,
            credits: promoData.credits || undefined,
            sub_discount: promoData.sub_discount || undefined,
            hero_image_url: promoData.hero_image_url || null
          })
        }
      } catch (err: any) {
        if (isCurrent) setErrorMsg(err.message || 'Failed to load promotion.')
      } finally {
        if (isCurrent) setLoading(false)
      }
    }
    fetchPromo()
    return () => { isCurrent = false }
  }, [slug, promo_id])

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !interested) return
    setSubmitting(true)
    setErrorMsg('')
    const supabase = createClient()
    try {
      const { data, error } = await supabase.rpc('crm_check_promo_eligibility', { p_promo_id: promo?.id, p_email: email })
      if (error) throw error
      
      if (!data.eligible) {
        setFallbackMode({ message: data.error })
        setSubmitting(false)
        return
      }

      if (data.is_registered) {
        setIsExistingUser(true)
        const { error: otpErr } = await supabase.auth.signInWithOtp({ email })
        if (otpErr) throw otpErr
        setStep('otp')
      } else {
        setIsExistingUser(false)
        setStep('profile')
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase()
      if (msg.includes('database error saving new user') || msg.includes('not available for registration')) {
        setErrorMsg('This email address has been permanently closed and cannot be used to create a new account.')
      } else {
        setErrorMsg(err.message || 'Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !street || !city || !state || !zip || !phone || !tosAccepted) return
    
    if (!/^\d{5}$/.test(zip.trim())) {
      setErrorMsg('This promotion is currently only available for US residents. Please enter a valid 5-digit US ZIP Code.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    const supabase = createClient()
    const fullAddress = `${street}, ${city}, ${state} ${zip}`
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: { full_name: name, street_address: fullAddress, phone, sms_consent: smsConsent, tos_accepted: true }
        }
      })
      if (error) {
        const msg = (error.message || '').toLowerCase()
        if (msg.includes('database error saving new user') || msg.includes('not available for registration')) {
          throw new Error('This email address has been permanently closed and cannot be used to create a new account.')
        }
        throw error
      }
      setStep('otp')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send OTP.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp) return
    setSubmitting(true)
    setErrorMsg('')
    const supabase = createClient()
    try {
      const { data: { session }, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
      if (verifyError) throw verifyError
      
      if (!skipPromo) {
        const { error: enrollErr } = await supabase.rpc('crm_enroll_in_promotion', { 
          p_promotion_id: promo?.id,
          p_campaign_id: campaign_id || null
        })
        if (enrollErr && !enrollErr.message.includes('already enrolled')) {
          throw enrollErr
        }
      }
      setStep('success')
      setTimeout(() => {
        if (!isExistingUser && smsConsent && phone.trim()) {
          router.push('/profile?verifyPhone=true')
        } else {
          router.push('/market')
        }
      }, 3000)
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid code. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="promo-loading"><div className="spinner"></div>Loading Promotion...</div>
  if (!promo) return <div className="promo-error-page">{errorMsg || 'Promotion not found.'}</div>

  const isDeadlinePassed = new Date() > new Date(promo.enrollment_deadline)
  const bgImage = promo.hero_image_url || getBackgroundImage()

  const incentivesContent = (
    <div className="promo-incentive-grid">
      {promo.giveaway && (
        <div className="incentive-item giveaway-item">
          {promo.giveaway.photos && promo.giveaway.photos.length > 0 ? (
            <img src={promo.giveaway.photos[0]} alt={promo.giveaway.title || 'Giveaway'} className="incentive-photo" />
          ) : (
            <span className="incentive-icon">🎁</span>
          )}
          <div className="incentive-text">
            <strong>{promo.giveaway.title || 'Exclusive Giveaway'}</strong>
            {promo.giveaway.description ? (
              <div className="giveaway-html" dangerouslySetInnerHTML={{ __html: promo.giveaway.description.replace(/&nbsp;/g, ' ') }} />
            ) : (
              <p>Enter for a chance to win our prize bundle.</p>
            )}
          </div>
        </div>
      )}
      {promo.credits && (
        <div className="incentive-item credits-item">
          {promo.credits.image_url ? (
            <img src={promo.credits.image_url} alt="Credit Bonus" className="incentive-photo" />
          ) : (
            <span className="incentive-icon">💰</span>
          )}
          <div className="incentive-text">
            <strong>${promo.credits.amount_usd} Purchase Credit</strong>
            <p>Issued {promo.credits.frequency === 'monthly' ? 'once a month' : `every ${promo.credits.frequency}`} for {promo.credits.occurrences} {promo.credits.occurrences === 1 ? 'month' : 'months'}.</p>
            <ul className="credit-rules">
              {getRenewalText() && <li>✓ {getRenewalText()}</li>}
              <li>✓ Valid towards {promo.credits.credit_type === 'universal' ? 'purchases and fees' : promo.credits.credit_type === 'platform_fee' ? 'platform fees' : 'purchases'} on casagrown.com</li>
              <li>✓ Covers up to {promo.credits.cap_type === 'percentage' ? `${promo.credits.cap_value}%` : `$${promo.credits.cap_value}`} per order</li>
              <li>✓ Credits expire after 1 {promo.credits.frequency === 'monthly' ? 'month' : promo.credits.frequency === 'weekly' ? 'week' : promo.credits.frequency.replace('ly', '')}</li>
              <li>✓ Cannot be exchanged for cash or payouts</li>
            </ul>
          </div>
        </div>
      )}
      {promo.sub_discount && (() => {
        const pct = promo.sub_discount.discount_pct
        const price = promo.sub_discount.pro_monthly_price
        const discounted = (price * (1 - pct / 100)).toFixed(2)
        const savings = (price * pct / 100).toFixed(2)
        const duration = promo.sub_discount.duration_months
        return (
          <div className="incentive-item" style={{ borderLeft: '4px solid #a855f7' }}>
            <span className="incentive-icon">⭐</span>
            <div className="incentive-text">
              <strong>Pro Subscription — {pct}% Off</strong>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#7e22ce', margin: '8px 0' }}>
                ${discounted}/mo <span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#9ca3af', textDecoration: 'line-through' }}>${price.toFixed(2)}/mo</span>
              </p>
              <ul className="credit-rules">
                <li>✓ Save ${savings} every month on your Pro membership</li>
                <li>✓ {duration ? `Discount lasts ${duration} month${duration > 1 ? 's' : ''}` : 'Discount lasts forever — lock in this rate!'}</li>
                <li>✓ Lower platform fees, Stripe fee options & more</li>
              </ul>
            </div>
          </div>
        )
      })()}
    </div>
  )

  return (
    <>
      {/* Dynamic Full-Bleed Background Image */}
      <div className="promo-bg-layer" style={{ backgroundImage: `url(${bgImage})` }}>
        <div className="promo-bg-overlay"></div>
      </div>

      <div className="promo-content-wrapper">
        <div className="promo-main-glass">
          <div className="promo-hero-section">
            <h1 className="promo-headline">{promo.name}</h1>
            {promo.description_html && (
              <div className="promo-description" dangerouslySetInnerHTML={{ __html: promo.description_html.replace(/&nbsp;/g, ' ') }} />
            )}

            {isMounted && isDeadlinePassed ? (
              <div className="promo-badge deadline-passed">Promotion Ended</div>
            ) : isMounted && promo.is_capacity_reached ? (
              <div className="promo-badge deadline-passed">Promotion Limit Reached</div>
            ) : isMounted ? (
              <div className="promo-badge active">
                Ends {new Date(promo.enrollment_deadline).toLocaleDateString()}
              </div>
            ) : (
              <div className="promo-badge active" style={{ opacity: 0 }}>Ends...</div>
            )}

            <div className="desktop-incentives">
              {incentivesContent}
            </div>
          </div>

          <div className="promo-form-section">
            {step === 'success' ? (
              <div className="form-success-state">
                <div className="success-icon">🎉</div>
                <h2>You're Enrolled!</h2>
                <p>Redirecting you to the market...</p>
              </div>
            ) : isMounted && isDeadlinePassed ? (
              <div className="form-error-state">
                We're sorry, but the deadline for this promotion has passed.
              </div>
            ) : isMounted && promo.is_capacity_reached ? (
              <div className="form-fallback-state fade-in-up" style={{ background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 16px 40px rgba(0,0,0,0.08)' }}>
                <div className="form-error-banner" style={{ marginBottom: '24px' }}>
                  We're sorry, but this promotion has reached its maximum capacity.
                </div>
                <h2 className="form-heading">You can still join CasaGrown!</h2>
                <p className="form-subheading">While you missed out on this specific offer, you can still sign up to access the market and receive future promotions.</p>
                <Link href="/market" className="btn-action" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Continue to Market
                </Link>
              </div>
            ) : fallbackMode ? (
              <div className="form-fallback-state fade-in-up" style={{ background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 16px 40px rgba(0,0,0,0.08)' }}>
                <div className="form-error-banner" style={{ marginBottom: '24px' }}>
                  {fallbackMode.message}
                </div>
                <h2 className="form-heading">You can still join CasaGrown!</h2>
                <p className="form-subheading">While you aren't eligible for this specific offer, you can still sign up to access the market and receive future promotions.</p>
                <button onClick={() => { setSkipPromo(true); setFallbackMode(null); setStep('profile') }} className="btn-action" style={{ marginBottom: '16px' }}>
                  Continue Sign Up Without Promo
                </button>
                <Link href="/market" style={{ display: 'block', textAlign: 'center', color: '#166534', textDecoration: 'underline', fontWeight: 600 }}>
                  Or browse the market
                </Link>
              </div>
            ) : isMounted ? (
              <div className="dynamic-form">
                {errorMsg && <div className="form-error-banner">{errorMsg}</div>}
                
                {step === 'initial' && (
                  <form onSubmit={handleInitialSubmit} className="fade-in-up">
                    <h2 className="form-heading">Claim Your Offer</h2>
                    <p className="form-subheading">Enter your email below to secure your <strong>{promo.name}</strong> promotion.</p>
                    <div className="input-group">
                      <label>Email Address</label>
                      <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@example.com" />
                    </div>
                    <label className="checkbox-wrap">
                      <input type="checkbox" required checked={interested} onChange={e => setInterested(e.target.checked)} />
                      <span className="checkbox-text">I want to claim this promotion</span>
                    </label>
                    <button type="submit" disabled={submitting || !email || !interested} className="btn-action">
                      {submitting ? 'Checking...' : 'Continue to Claim'}
                    </button>
                  </form>
                )}

                {step === 'profile' && (
                  <form onSubmit={handleProfileSubmit} className="fade-in-up">
                    <h2 className="form-heading">Where should we send it?</h2>
                    <p className="form-subheading">Create your profile to claim your rewards. Your gift will be shipped here!</p>
                    <div className="input-group">
                      <label>Country</label>
                      <input type="text" value="United States" disabled style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed', borderColor: '#d1d5db' }} />
                    </div>
                    <div className="input-group">
                      <label>Full Name</label>
                      <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
                    </div>
                    <div className="input-group">
                      <label>Street Address</label>
                      <input type="text" required value={street} onChange={e => setStreet(e.target.value)} placeholder="123 Farm Road" />
                    </div>
                    <div className="input-row">
                      <div className="input-group">
                        <label>City</label>
                        <input type="text" required value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 60px' }}>
                        <label>State</label>
                        <input type="text" required value={state} onChange={e => setState(e.target.value)} placeholder="ST" maxLength={2} />
                      </div>
                      <div className="input-group" style={{ flex: '0 0 100px' }}>
                        <label>ZIP Code</label>
                        <input type="text" required value={zip} onChange={e => setZip(e.target.value)} placeholder="12345" maxLength={10} />
                      </div>
                    </div>
                    <div className="input-group">
                      <label>Phone Number</label>
                      <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
                    </div>
                    <label className="checkbox-wrap" style={{ marginBottom: '16px' }}>
                      <input type="checkbox" checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)} />
                      <div className="checkbox-text">
                        <strong>Enable Order SMS Notifications</strong>
                        <div style={{ fontSize: '0.8rem', marginTop: '4px', color: '#6b7280', lineHeight: 1.4 }}>
                          By providing your phone number and checking this box, you consent to receive critical transactional SMS notifications (like order updates) from CasaGrown. Reply STOP to cancel. Msg & data rates may apply.
                        </div>
                      </div>
                    </label>
                    <label className="checkbox-wrap">
                      <input type="checkbox" required checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)} />
                      <span className="checkbox-text">
                        I agree to the <button type="button" className="link-button" onClick={(e) => { e.preventDefault(); setModalContent('tos') }}>Terms of Service</button> & <button type="button" className="link-button" onClick={(e) => { e.preventDefault(); setModalContent('privacy') }}>Privacy Policy</button>
                      </span>
                    </label>
                    <button type="submit" disabled={submitting || !name || !street || !city || !state || !zip || !phone || !tosAccepted} className="btn-action">
                      {submitting ? 'Sending Code...' : 'Send Login Code'}
                    </button>
                  </form>
                )}

                {step === 'otp' && (
                  <form onSubmit={handleOtpSubmit} className="fade-in-up">
                    <h2 className="form-heading">Verify Your Email</h2>
                    <p className="form-subheading">We sent a secure code to <strong>{email}</strong>.</p>
                    <div className="input-group otp-group">
                      <label>Login Code</label>
                      <input type="text" required value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" maxLength={6} />
                    </div>
                    <button type="submit" disabled={submitting || !otp} className="btn-action">
                      {submitting ? 'Verifying...' : 'Verify & Claim Offer'}
                    </button>
                  </form>
                )}
              </div>
            ) : null}
          </div>

          <div className="mobile-incentives">
            {incentivesContent}
          </div>
        </div>
      </div>

      {modalContent && (
        <div className="modal-overlay" onClick={() => setModalContent(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalContent(null)}>×</button>
            <h2>{modalContent === 'tos' ? 'Terms of Use' : 'Privacy Policy'}</h2>
            <div className="modal-body" style={{ overflowY: 'auto', padding: '32px' }}>
              {(modalContent === 'tos' ? TERMS_SECTIONS : PRIVACY_SECTIONS).map((section, si) => (
                <div key={si} style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: '#1f2937', marginBottom: '12px', fontWeight: 700 }}>{section.title}</h3>
                  {section.paragraphs.map((p, pi) => (
                    <p key={pi} style={{ fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.6, marginBottom: '12px' }}>{p}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function PromoPage() {
  return (
    <div className="casagrown-promo-page">
      {/* Sticky Premium Navbar */}
      <nav className="casagrown-nav">
        <div className="nav-left">
          <Link href="https://casagrown.com" className="nav-brand">
            <img src="/logo.png" alt="CasaGrown" className="nav-logo-img" />
            <span className="nav-brand-name">CasaGrown</span>
          </Link>
          <span className="nav-tagline">Fresh. Local. Trusted.</span>
        </div>
      </nav>

      <Suspense fallback={<div className="promo-loading"><div className="spinner"></div>Loading...</div>}>
        <PromoContent />
      </Suspense>

      {/* Vanilla CSS - No Tailwind Required */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .casagrown-promo-page {
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
          color: #1a3320;
          overflow-x: hidden;
        }

        /* Background Layers */
        .promo-bg-layer {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-size: cover;
          background-position: center;
          z-index: -2;
          transform: scale(1.02); /* slight punch in to prevent edge bleed */
        }
        .promo-bg-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(135deg, rgba(20,83,45,0.7) 0%, rgba(20,83,45,0.2) 100%);
          z-index: -1;
        }

        /* Navbar */
        .casagrown-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.4);
          box-shadow: 0 4px 30px rgba(0,0,0,0.05);
          z-index: 10;
        }
        .nav-left { display: flex; align-items: center; gap: 20px; }
        .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .nav-brand-name { font-weight: 800; font-size: 1.4rem; color: #14532d; letter-spacing: -0.5px; }
        .nav-logo-img { height: 40px; width: auto; }
        .nav-tagline { font-weight: 600; font-size: 0.95rem; color: #166534; letter-spacing: 0.5px; border-left: 2px solid #bbf7d0; padding-left: 20px; }

        /* Main Content Wrapper */
        .promo-content-wrapper {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 60px 24px;
        }

        /* Glassmorphism Card */
        .promo-main-glass {
          display: flex;
          flex-direction: row;
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 32px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.3) inset;
          max-width: 1100px;
          width: 100%;
          overflow: hidden;
        }

        /* Split layout */
        .promo-hero-section {
          flex: 1;
          min-width: 0;
          padding: 60px;
          background: rgba(220, 252, 231, 0.4);
          border-right: 1px solid rgba(255,255,255,0.5);
        }
        .promo-form-section {
          flex: 1;
          min-width: 0;
          padding: 60px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }

        /* Text & Badges */
        .promo-headline { font-size: 3rem; font-weight: 800; color: #14532d; line-height: 1.1; margin-bottom: 24px; letter-spacing: -1px; }
        .promo-description { font-size: 1.15rem; color: #166534; line-height: 1.6; margin-bottom: 32px; }
        .promo-description p { margin-bottom: 12px; }
        
        .promo-badge { display: inline-flex; align-items: center; padding: 10px 20px; border-radius: 30px; font-weight: 700; font-size: 0.95rem; margin-bottom: 40px; }
        .promo-badge.active { background: #bbf7d0; color: #14532d; border: 1px solid #86efac; }
        .promo-badge.deadline-passed { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

        /* Incentive Items */
        .desktop-incentives { display: block; }
        .mobile-incentives { display: none; }
        .promo-incentive-grid { display: flex; flex-direction: column; gap: 20px; }
        .incentive-item { display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); padding: 20px; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); border: 1px solid rgba(255,255,255,0.8); }
        .incentive-icon { font-size: 2.5rem; flex-shrink: 0; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
        .incentive-text { flex: 1; min-width: 0; }
        .incentive-text strong, .incentive-text p { word-wrap: break-word; overflow-wrap: break-word; white-space: normal; }
        .incentive-photo { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; flex-shrink: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .incentive-text strong { display: block; font-size: 1.1rem; color: #166534; margin-bottom: 4px; }
        .incentive-text p { font-size: 0.95rem; color: #4b5563; margin: 0; line-height: 1.4; }
        .giveaway-html { font-size: 0.95rem; color: #4b5563; line-height: 1.4; margin: 0; }
        .giveaway-html p { margin-bottom: 6px; }
        .credit-rules { list-style: none; padding: 0; margin-top: 10px; }
        .credit-rules li { font-size: 0.85rem; color: #166534; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }

        /* Form Styles */
        .dynamic-form { display: flex; flex-direction: column; gap: 24px; background: white; padding: 40px; border-radius: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.05); }
        .form-heading { font-size: 2rem; font-weight: 800; color: #14532d; margin-bottom: 8px; }
        .form-subheading { font-size: 1.05rem; color: #4b5563; margin-bottom: 24px; line-height: 1.5; }
        
        .input-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .input-group label { font-size: 0.95rem; font-weight: 700; color: #374151; }
        .input-group input { padding: 16px 20px; border: 2px solid #e5e7eb; border-radius: 16px; font-size: 1.05rem; transition: all 0.2s ease; background: #f9fafb; color: #1f2937; }
        .input-group input:focus { outline: none; border-color: #22c55e; background: white; box-shadow: 0 0 0 4px rgba(34,197,94,0.1); }
        
        .otp-group input { font-size: 1.5rem; letter-spacing: 4px; text-align: center; font-weight: 700; }

        .checkbox-wrap { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; margin-bottom: 32px; padding: 16px; background: #f9fafb; border-radius: 16px; border: 1px solid #e5e7eb; transition: all 0.2s; }
        .checkbox-wrap:hover { background: #f3f4f6; }
        .checkbox-wrap input { margin-top: 4px; width: 20px; height: 20px; accent-color: #22c55e; cursor: pointer; }
        .checkbox-text { font-size: 0.95rem; color: #4b5563; line-height: 1.5; font-weight: 500; }
        .link-button { background: none; border: none; padding: 0; color: #166534; text-decoration: underline; font-weight: 700; cursor: pointer; font-family: inherit; font-size: inherit; }
        .link-button:hover { color: #14532d; }

        .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal-content { background: white; border-radius: 24px; width: 100%; max-width: 800px; height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); position: relative; animation: fadeInUp 0.3s ease-out; }
        .modal-close { position: absolute; top: 20px; right: 20px; background: #f1f5f9; border: none; width: 40px; height: 40px; border-radius: 20px; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #4b5563; transition: background 0.2s; }
        .modal-close:hover { background: #e2e8f0; color: #1f2937; }
        .modal-content h2 { padding: 24px 32px; margin: 0; border-bottom: 1px solid #e5e7eb; font-size: 1.5rem; color: #1f2937; }
        .modal-body { flex: 1; padding: 0; background: #f8fafc; }
        .modal-body iframe { width: 100%; height: 100%; border: none; }

        .btn-action { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; padding: 18px 32px; font-size: 1.15rem; font-weight: 800; border-radius: 16px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); width: 100%; box-shadow: 0 10px 25px rgba(34,197,94,0.3); }
        .btn-action:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(34,197,94,0.4); }
        .btn-action:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

        .form-error-banner { background: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; padding: 16px; border-radius: 12px; font-weight: 600; font-size: 0.95rem; }
        
        .form-success-state { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
        .success-icon { font-size: 5rem; margin-bottom: 24px; animation: bounce 2s infinite ease-in-out; }
        .form-success-state h2 { font-size: 2.5rem; font-weight: 800; color: #15803d; margin-bottom: 16px; }
        .form-success-state p { font-size: 1.1rem; color: #4b5563; font-weight: 500; }

        .form-error-state { text-align: center; background: #fee2e2; color: #991b1b; padding: 40px; border-radius: 24px; font-size: 1.2rem; font-weight: 600; }
        .promo-error-page { text-align: center; padding: 60px; font-size: 1.5rem; font-weight: 600; color: #991b1b; background: #fef2f2; margin: 40px; border-radius: 24px; }

        /* Utilities */
        .fade-in-up { animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }

        .promo-loading { display: flex; flex-direction: column; gap: 20px; align-items: center; justify-content: center; height: 100vh; font-size: 1.2rem; font-weight: 600; color: #166534; }
        .spinner { width: 40px; height: 40px; border: 4px solid rgba(34,197,94,0.2); border-left-color: #22c55e; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        /* Responsive Design */
        @media (max-width: 900px) {
          .promo-content-wrapper { padding: 20px 16px; align-items: flex-start; }
          .promo-main-glass { flex-direction: column; }
          .promo-hero-section { 
            padding: 32px 24px; 
            border-right: none; 
            border-bottom: 1px solid rgba(255,255,255,0.5); 
          }
          .desktop-incentives { display: none; }
          .mobile-incentives { 
            display: block; 
            padding: 32px 24px; 
            background: rgba(220, 252, 231, 0.4); 
            border-top: 1px solid rgba(255,255,255,0.5); 
          }
          .promo-form-section { padding: 32px 24px; }
          .promo-headline { font-size: 2rem; margin-bottom: 16px; }
          .casagrown-nav { padding: 16px 24px; text-align: center; }
          .nav-left { flex-direction: column; gap: 8px; align-items: center; width: 100%; }
          .nav-brand { flex-direction: row; justify-content: center; gap: 12px; }
          .nav-tagline { border-left: none; padding-left: 0; border-top: none; padding-top: 0; margin-top: 0; width: 100%; }
          .promo-badge { margin-bottom: 0; }
          .incentive-item { padding: 16px; gap: 12px; }
          .incentive-icon { font-size: 2rem; }
          .incentive-photo { width: 48px; height: 48px; }
        }
      `}</style>
    </div>
  )
}
