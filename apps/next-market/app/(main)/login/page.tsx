'use client'


import { useState, useEffect , Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarket } from '../../../lib/store'
import { createClient } from '../../../lib/supabase'
import { needsTosAcceptance } from '../../../lib/legal'
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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    const { error: otpError } = await supabase.auth.signInWithOtp({ email })

    if (otpError) {
      setError(otpError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    setStep('otp')
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 6) return
    setLoading(true)
    setError('')

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })

    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      dispatch({ type: 'LOGIN', payload: { email } })

      // Check ToS acceptance
      const { data: profile } = await supabase
        .from('profiles')
        .select('tos_accepted_at, full_name, street_address')
        .eq('id', data.user.id)
        .single()

      const redirectParam = redirectTo ? `redirect=${encodeURIComponent(redirectTo)}` : ''

      if (needsTosAcceptance(profile?.tos_accepted_at)) {
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
                type="email"
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
              <button type="button" className={styles.changeEmail} onClick={() => { setStep('email'); setError('') }}>
                Change email
              </button>
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
