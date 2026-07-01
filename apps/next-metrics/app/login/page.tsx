'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)

  // Check if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        checkStaffAndRedirect(session.user.email)
      }
    })
  }, [])

  async function checkStaffAndRedirect(userEmail: string) {
    const { data: isStaff } = await supabase
      .rpc('is_staff_email', { check_email: userEmail.toLowerCase() })

    if (!isStaff) {
      setError('This email is not registered as a staff member.')
      await supabase.auth.signOut()
      return
    }

    router.push('/')
  }

  async function handleSocialLogin(provider: 'google' | 'apple') {
    setError('')
    setLoading(true)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (oauthError) throw oauthError
    } catch (e: any) {
      setLoading(false)
      setError(e.message || 'Social login failed')
    }
  }

  async function handleSendCode() {
    if (!email.includes('@')) {
      setError('Please enter a valid email')
      return
    }

    // Check staff first
    const { data: isStaff } = await supabase
      .rpc('is_staff_email', { check_email: email.toLowerCase() })

    if (!isStaff) {
      setError('This email is not registered as a staff member.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email })
      if (otpError) throw otpError

      // Dev: try to auto-fetch OTP from Mailpit
      try {
        const res = await fetch('http://127.0.0.1:8025/api/v1/messages?limit=1')
        if (res.ok) {
          const data = await res.json()
          const body = data?.messages?.[0]?.Text || data?.messages?.[0]?.HTML || ''
          const match = body.match(/(\d{6})/)
          if (match) {
            setDevOtp(match[1])
            setOtp(match[1])
          }
        }
      } catch {}

      setStep('otp')
    } catch (e: any) {
      setError(e.message || 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    if (otp.length < 6) {
      setError('Please enter the 6-digit code')
      return
    }

    setError('')
    setLoading(true)

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      })
      if (verifyError) throw verifyError
      router.push('/')
    } catch (e: any) {
      setError(e.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card animate-in">
        <div className="login-header">
          <div className="login-icon">📊</div>
          <h1 className="login-title">
            {step === 'otp' ? 'Verify Email' : 'CasaGrown Metrics'}
          </h1>
          <p className="login-subtitle">
            {step === 'otp'
              ? `Enter the code sent to ${email}`
              : 'Staff login — analytics & business intelligence'}
          </p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="login-form">
          {step === 'email' && (
            <>
              <input
                className="input"
                type="email"
                placeholder="staff@casagrown.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={handleSendCode}
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Verification Code'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0', width: '100%' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-default, rgba(255,255,255,0.1))' }} />
                <span style={{ margin: '0 12px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>OR</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-default, rgba(255,255,255,0.1))' }} />
              </div>

              <button
                className="btn btn-ghost"
                onClick={() => handleSocialLogin('google')}
                disabled={loading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              >
                <span style={{ fontSize: '1.1rem' }}>🌐</span> Continue with Google
              </button>

              <button
                className="btn btn-ghost"
                onClick={() => handleSocialLogin('apple')}
                disabled={loading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              >
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}></span> Continue with Apple
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <input
                className="input"
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.3em' }}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={handleVerify}
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>
              {devOtp && (
                <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--accent-green)' }}>
                  🔑 Dev OTP auto-filled: {devOtp}
                </p>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => { setStep('email'); setOtp(''); setError('') }}
                style={{ marginTop: '4px' }}
              >
                ← Change Email
              </button>
            </>
          )}
        </div>

        {step === 'email' && (
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '24px' }}>
            Staff access only. Your email must be registered as a staff member.
          </p>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="login-container">
        <div className="spinner" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
