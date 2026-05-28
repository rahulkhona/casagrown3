'use client'


import { useState, useEffect , Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarket } from '../../../lib/store'
import { createClient } from '../../../lib/supabase'
import { needsTosAcceptance } from '../../../lib/legal'
import { trackFormSubmit, trackError } from '../../../lib/analytics'
import { getReferralData, getTouchHistory, clearReferralData } from '../../../lib/useReferralCapture'
import styles from './page.module.css'

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { dispatch } = useMarket()
  const template = searchParams.get('template')
  const redirectTo = searchParams.get('redirect')
  const isBuyRedirect = redirectTo && redirectTo.includes('/product/')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown(p => p - 1), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const supabase = createClient()

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('tos_accepted_at, full_name, street_address')
        .eq('id', user.id)
        .single()

      if (needsTosAcceptance(profile?.tos_accepted_at)) {
        router.replace('/terms')
      } else if (!profile?.full_name || !profile?.street_address) {
        router.replace('/profile-setup')
      } else if (redirectTo) {
        router.replace(redirectTo)
      } else {
        router.replace('/market')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmailSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!email) return
    trackFormSubmit('login_email')
    setLoading(true)
    setError('')

    // Bypass OTP email sending for Store Reviewers
    if (email.toLowerCase() === 'apple@casagrown.com') {
      setLoading(false)
      setStep('otp')
      setResendCooldown(60)
      return
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { data: getReferralData() },
    })

    if (otpError) {
      // Check for banned user (account closure)
      const msg = otpError.message?.toLowerCase() || ''
      if (msg.includes('banned') || msg.includes('user is banned')) {
        setError('This account has been permanently closed. If you\'d like to use CasaGrown again, please sign up with a different email address.')
      } else if (msg.includes('database error saving new user') || msg.includes('not available for registration')) {
        setError('This email address has been permanently closed and cannot be used to create a new account. Please use a different email address.')
      } else {
        setError(otpError.message)
      }
      trackError('login_otp_send_failed', { error: otpError.message })
      setLoading(false)
      return
    }

    setLoading(false)
    setStep('otp')
    setResendCooldown(60)
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 6) return
    trackFormSubmit('login_otp_verify')
    setLoading(true)
    setError('')

    let data, verifyError;

    // Intercept review login and authenticate securely with Supabase password behind the scenes
    if (email.toLowerCase() === 'apple@casagrown.com' && otp === '123456') {
      const res = await supabase.auth.signInWithPassword({
        email: 'apple@casagrown.com',
        password: 'CasaGrownAppleReview2026!',
      })
      data = res.data
      verifyError = res.error
    } else {
      const res = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      })
      data = res.data
      verifyError = res.error
    }

    if (verifyError) {
      trackError('login_verify_failed', { error: verifyError.message })
      setError(verifyError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      dispatch({ type: 'LOGIN', payload: { email } })

      // Insert referral touch history into the database
      try {
        const touchHistory = getTouchHistory()
        if (touchHistory.length > 0) {
          const rows = touchHistory.map(t => ({
            user_id: data.user!.id,
            source: t.source,
            referrer_id: t.referrer_id || null,
            utm_source: t.utm_source || null,
            utm_medium: t.utm_medium || null,
            utm_campaign: t.utm_campaign || null,
            landing_url: t.landing_url || null,
            touched_at: t.landed_at,
          }))
          await supabase.from('referral_touches').insert(rows)
        }
        clearReferralData()
      } catch (err) {
        console.warn('Failed to save referral touches:', err)
      }

      // Check ToS acceptance
      const { data: profile } = await supabase
        .from('profiles')
        .select('tos_accepted_at, full_name, street_address')
        .eq('id', data.user.id)
        .single()

      const redirectParam = redirectTo ? `redirect=${encodeURIComponent(redirectTo)}` : ''
      const isGrowBotRedirect = redirectTo?.includes('/messages/a0000000-0000-0000-0000-00000ca5ab07') || redirectTo === '/messages/growbot'

      if (isGrowBotRedirect) {
        // PROGRESSIVE PROFILING: Bypass ToS and Profile Setup for GrowBot
        router.push(redirectTo!)
      } else if (needsTosAcceptance(profile?.tos_accepted_at)) {
        const termsUrl = template ? `/terms?template=${template}` : `/terms${redirectParam ? `?${redirectParam}` : ''}`
        router.push(termsUrl)
      } else if (!profile?.full_name || !profile?.street_address) {
        router.push(`/profile-setup${redirectParam ? `?${redirectParam}` : ''}`)
      } else if (redirectTo) {
        router.push(redirectTo.includes('?') ? `${redirectTo}&autoBuy=true` : `${redirectTo}?autoBuy=true`)
      } else {
        router.push('/market')
      }
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <img src="/logo.png" alt="CasaGrown" className={styles.logo} />
          <h1 className={styles.title}>CasaGrown Market</h1>
          <p className={styles.subtitle}>Fresh. Local. Trusted.</p>
        </div>

        {isBuyRedirect && (
          <div className={styles.purchaseBanner}>
            <strong>🛒 Sign in to complete your purchase</strong>
            <p>You'll be returned to your item after signing in. Here's what to expect:</p>
            <ol>
              <li>Enter your email — we'll send a one-time code</li>
              <li>Verify the code from your inbox</li>
              <li>Accept our Terms of Service (first time only)</li>
              <li>Complete your profile (first time only)</li>
              <li>You'll be taken back to complete your purchase</li>
            </ol>
          </div>
        )}

        {error && <p className={styles.errorText}>{error}</p>}

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className={styles.form}>
            <div className="form-group">
              <label className="label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="text"
                inputMode="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Sending code...' : 'Send Login Code →'}
            </button>
            <p className={styles.helperText}>
              We'll send a one-time code to your email. No password needed.
              <br />
              <small>Check your inbox (or Mailpit at localhost:54324 for local dev)</small>
            </p>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className={styles.form}>
            <div className={styles.otpSent}>
              <span className={styles.checkIcon}>✉️</span>
              <p>Code sent to <strong>{email}</strong></p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button type="button" className={styles.changeEmail} onClick={() => { setStep('email'); setError('') }}>
                  Change email
                </button>
                <span style={{ color: '#aaa' }}>|</span>
                <button 
                  type="button" 
                  data-testid="resend-code-btn"
                  className={styles.changeEmail} 
                  disabled={resendCooldown > 0 || loading} 
                  onClick={() => handleEmailSubmit()}
                  style={resendCooldown > 0 ? { color: '#9ca3af', cursor: 'not-allowed', textDecoration: 'none' } : {}}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="otp">Enter Code</label>
              <input
                id="otp"
                type="text"
                className={`input ${styles.otpInput}`}
                placeholder="123456"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading || otp.length < 6}>
              {loading ? 'Signing in...' : 'Verify & Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <LoginPageInner />
    </Suspense>
  )
}
