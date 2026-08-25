'use client'

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react'
import { createClient } from '../../lib/supabase'
import { useBootstrap } from '../../lib/useBootstrap'
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../(main)/terms/page'
import { ENABLE_SOCIAL_LOGIN } from '../../lib/featureFlags'
import styles from './QuickSetupModal.module.css'
import { trackEvent, trackFieldInteract, trackStepTiming, resetSessionId } from '../../lib/crm-analytics'

// ── US State Codes ──
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

// ── Props ──
interface QuickSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  trigger?: string
  defaultSignIn?: boolean
  addressNote?: string
  redirectTo?: string
  prefill?: {
    name?: string
    email?: string
    zip?: string
    phone?: string
    street?: string
    city?: string
    state?: string
  }
}

type Step = 'profile' | 'otp' | 'final'
type LegalView = null | 'terms' | 'privacy'

export default function QuickSetupModal({ isOpen, onClose, onComplete, trigger, defaultSignIn, addressNote, redirectTo, prefill }: QuickSetupModalProps) {
  const supabase = createClient()
  const { refresh, user } = useBootstrap()

  const PAGE_SLUG = '/quicksetup'
  const isCompleted = useRef(false)
  const stepStartRef = useRef<number>(0)
  const prevStepRef = useRef<number>(1)

  // ── Step State ──
  const [step, setStep] = useState<Step>('profile')
  const [legalView, setLegalView] = useState<LegalView>(null)
  // ── Step 1: Profile Fields ──
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  // ── USPS Correction ──
  const [uspsCorrection, setUspsCorrection] = useState<{
    original: string; corrected: string; correctedFields: { street: string; city: string; state: string; zip: string }
  } | null>(null)
  const [useCorrected, setUseCorrected] = useState(true)

  // ── Step 2: OTP ──
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Step 3: Final ──
  const [tosChecked, setTosChecked] = useState(false)
  const [wantsSms, setWantsSms] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneSent, setPhoneSent] = useState(false)
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0)

  // ── UI State ──
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Saved state from OTP step ──
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null)

  // Reset state and check for existing auth session when modal opens
  
  const currentStepIndex = step === 'profile' ? 1 : step === 'otp' ? 2 : 3
  const currentStepName = currentStepIndex === 1 ? 'auth' : currentStepIndex === 2 ? 'otp' : 'final'

  useEffect(() => {
    if (isOpen) {
      resetSessionId(PAGE_SLUG)
      isCompleted.current = false
      stepStartRef.current = Date.now()
      prevStepRef.current = currentStepIndex
      trackEvent('wizard_step', PAGE_SLUG, { step_index: currentStepIndex, step_name: currentStepName })
      
      return () => {
        if (!isCompleted.current) {
          trackEvent('wizard_abandon', PAGE_SLUG)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (isOpen && prevStepRef.current !== currentStepIndex) {
      const duration = (Date.now() - stepStartRef.current) / 1000
      const prevName = prevStepRef.current === 1 ? 'auth' : prevStepRef.current === 2 ? 'otp' : prevStepRef.current === 3 ? 'profile' : 'final'
      if (duration > 0) {
        trackStepTiming(PAGE_SLUG, prevStepRef.current, prevName, duration)
      }
      trackEvent('wizard_step', PAGE_SLUG, { step_index: currentStepIndex, step_name: currentStepName })
      stepStartRef.current = Date.now()
      prevStepRef.current = currentStepIndex
    }
  }, [currentStepIndex, currentStepName, isOpen])

  useEffect(() => {
    if (isOpen) {
      setLegalView(null)
      setUspsCorrection(null)
      setUseCorrected(true)
      setOtpDigits(['', '', '', '', '', ''])
      setResendCooldown(0)
      setTosChecked(false)
      setWantsSms(false)
      setPhone('')
      setPhoneSent(false)
      setPhoneOtp('')
      setPhoneVerified(false)
      setPhoneResendCooldown(0)
      setLoading(false)
      setError('')
      setVerifiedUserId(null)

      // Restore draft profile if saved before social login redirect
      const draftStr = typeof window !== 'undefined' ? sessionStorage.getItem('quick_setup_draft_profile') : null
      let draft: any = null
      if (draftStr) {
        try {
          draft = JSON.parse(draftStr)
        } catch (e) {
          console.error(e)
        }
      }

      supabase.auth.getUser().then(async ({ data: { user } }: any) => {
        if (user) {
          setEmail(user.email || '')

          if (draft?.fullName) {
            setFullName(draft.fullName)
          } else if (!fullName) {
            setFullName(user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.custom_claims?.name || '')
          }

          let profile: any = null
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('full_name, street_address, city, state_code, zip_code, profile_completed_at, tos_accepted_at')
              .eq('id', user.id)
              .single()
            if (!error) {
              profile = data
            }
          } catch (e) {
            console.error('Failed to select profile', e)
          }

          if (profile?.profile_completed_at && profile?.tos_accepted_at) {
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('quick_setup_draft_profile')
            }
            isCompleted.current = true
            onComplete()
            return
          }

          if (defaultSignIn) {
            setVerifiedUserId(null)
            setStep('profile')
            setEmail(user.email || prefill?.email || '')
            setFullName(user.user_metadata?.full_name || prefill?.name || '')
            return
          }

          // User is authenticated (newly verified or returning incomplete) -> go directly to final step (Name + TOS)
          setVerifiedUserId(user.id)
          setStep('final')
        } else {
          setVerifiedUserId(null)
          setStep('profile')
          setFullName(prefill?.name || '')
          setEmail(prefill?.email || '')
        }
      }).catch((e: any) => {
        console.error('Error fetching user', e)
        setVerifiedUserId(null)
        setStep('profile')
        setFullName(prefill?.name || '')
        setEmail(prefill?.email || '')
      })
    }
  }, [isOpen, user, supabase, onComplete, defaultSignIn])

  // Resend cooldown timers
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown(p => p - 1), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  useEffect(() => {
    if (phoneResendCooldown <= 0) return
    const timer = setInterval(() => setPhoneResendCooldown(p => p - 1), 1000)
    return () => clearInterval(timer)
  }, [phoneResendCooldown])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !legalView) onClose()
      if (e.key === 'Escape' && legalView) setLegalView(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, legalView, onClose])

  const handleSaveProfileOnly = async () => {
    setError('')
    if (!fullName.trim()) {
      setError('Please enter your full name')
      return
    }
    if (!tosChecked) {
      setError('Please accept the Terms of Service to continue')
      return
    }
    setLoading(true)
    try {
      const profileUpdate: Record<string, any> = {
        full_name: fullName.trim(),
        profile_completed_at: new Date().toISOString(),
        tos_accepted_at: new Date().toISOString(),
      }
      
      if (wantsSms && phoneVerified) {
        profileUpdate.sms_enabled = true
        profileUpdate.phone_number = phone.trim()
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', verifiedUserId)

      if (updateErr) {
        setError('Failed to save profile: ' + updateErr.message)
        setLoading(false)
        return
      }

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('quick_setup_draft_profile')
      }

      await refresh()
      setLoading(false)
      isCompleted.current = true
      onComplete()
    } catch (err: any) {
      setError(err?.message || 'Failed to save profile')
      setLoading(false)
    }
  }

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setLoading(true)
    setError('')

    if (typeof window !== 'undefined' && (window as any).IS_NATIVE_APP) {
      if (typeof (window as any).ReactNativeWebView?.postMessage === 'function') {
        const type = provider === 'apple' ? 'START_NATIVE_APPLE_LOGIN' : 'START_SOCIAL_LOGIN';
        (window as any).ReactNativeWebView.postMessage(
          JSON.stringify({ type, provider })
        )
      } else {
        setError('Native connection not ready. Please try again.')
      }
      setLoading(false)
      return
    }

    const targetUrl = redirectTo || (window.location.pathname + window.location.search)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(targetUrl)}`,
        queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined
      }
    })

    if (oauthError) {
      setError(oauthError.message)
      setLoading(false)
    }
  }

  const handleSocialSignUpClick = (provider: 'google' | 'apple') => {
    handleSocialLogin(provider)
  }


  // ══════════════════════════════════════════════════════════════════════════
  // Step 1: Profile → Send OTP
  // ══════════════════════════════════════════════════════════════════════════
  const handleContinue = async () => {
    setError('')
    if (verifiedUserId) {
      handleSaveProfileOnly()
      return
    }
    if (!email.trim()) { setError('Please enter your email'); return }

    setLoading(true)

    try {
      // Bypass OTP email sending for Store/Platform Reviewers
      const REVIEW_EMAILS = ['apple@casagrown.com', 'google@casagrown.com', 'facebook@casagrown.com']
      if (REVIEW_EMAILS.includes(email.trim().toLowerCase())) {
        setStep('otp')
        setResendCooldown(60)
        setTimeout(() => otpRefs.current[0]?.focus(), 100)
        setLoading(false)
        return
      }

      // Send OTP
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      })
      if (otpError) {
        const msg = otpError.message?.toLowerCase() || ''
        if (msg.includes('banned')) {
          setError('This account has been closed. Please use a different email address.')
        } else {
          setError(otpError.message)
        }
        setLoading(false)
        return
      }

      setStep('otp')
      setResendCooldown(60)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      setError(err?.message || 'Failed to send verification code')
    }
    setLoading(false)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 2: Verify OTP
  // ══════════════════════════════════════════════════════════════════════════
  const handleVerifyOtp = async () => {
    const code = otpDigits.join('')
    if (code.length < 6) return
    setError('')
    setLoading(true)

    try {
      const REVIEW_EMAILS = ['apple@casagrown.com', 'google@casagrown.com', 'facebook@casagrown.com']
      let data, verifyError
      if (REVIEW_EMAILS.includes(email.trim().toLowerCase()) && code === '123456') {
        const res = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: 'ReviewerPassword123!',
        })
        data = res.data
        verifyError = res.error
      } else {
        const res = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: 'email',
        })
        data = res.data
        verifyError = res.error
      }
      if (verifyError) { setError(verifyError.message); setLoading(false); return }
      if (!data.user) { setError('Verification failed. Please try again.'); setLoading(false); return }

      const userId = data.user.id
      setVerifiedUserId(userId)

      try {
        const { data: leadData } = await supabase
          .from('crm_leads')
          .select('id, utm_source, utm_medium, utm_campaign')
          .eq('email', email.trim())
          .single()

        if (leadData?.id) {
          // 1. Mark lead converted in crm_leads
          await supabase
            .from('crm_leads')
            .update({
              converted_at: new Date().toISOString(),
              status: 'converted',
            })
            .eq('id', leadData.id)

          // 2. Link unlinked lead produce interests to userId
          await supabase
            .from('crm_produce_interests')
            .update({ user_id: userId })
            .eq('lead_id', leadData.id)
            .is('user_id', null)

          // 3. Carry lead UTM attribution forward to user profile if profile lacks UTM info
          if (leadData.utm_source || leadData.utm_campaign) {
            await supabase
              .from('profiles')
              .update({
                utm_source: leadData.utm_source || undefined,
                utm_medium: leadData.utm_medium || undefined,
                utm_campaign: leadData.utm_campaign || undefined,
              })
              .eq('id', userId)
              .is('utm_source', null)
          }
        }
      } catch (err) {
        console.error('Failed to link lead interests and carry forward attribution', err)
      }

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('full_name, profile_completed_at, tos_accepted_at')
        .eq('id', userId)
        .single()

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('quick_setup_draft_profile')
      }

      if (existingProfile?.full_name) {
        setFullName(existingProfile.full_name)
      }

      if (existingProfile?.full_name && existingProfile?.tos_accepted_at) {
        // Returning user — all done! Refresh bootstrap and complete
        await supabase.from('profiles').update({ profile_completed_at: new Date().toISOString() }).eq('id', userId)
        await refresh()
        setLoading(false)
        isCompleted.current = true
        onComplete()
        return
      }

      // Missing name or ToS, go to final step to collect them
      setStep('final')
    } catch (err: any) {
      setError(err?.message || 'Verification failed')
    }
    setLoading(false)
  }

  // Auto-verify when all 6 digits entered
  useEffect(() => {
    if (step === 'otp' && otpDigits.every(d => d !== '') && otpDigits.join('').length === 6) {
      handleVerifyOtp()
    }
  }, [otpDigits, step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── OTP Input Handlers ──
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newDigits = [...otpDigits]
    newDigits[index] = value.slice(-1)
    setOtpDigits(newDigits)
    // Auto-advance to next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pastedData.length > 0) {
      const newDigits = [...otpDigits]
      for (let i = 0; i < pastedData.length && i < 6; i++) {
        newDigits[i] = pastedData[i]
      }
      setOtpDigits(newDigits)
      const nextEmpty = Math.min(pastedData.length, 5)
      otpRefs.current[nextEmpty]?.focus()
    }
  }

  // ── Resend OTP ──
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    setLoading(true); setError('')
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() })
    if (otpError) setError(otpError.message)
    else setResendCooldown(60)
    setLoading(false)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 3: Final Setup (TOS + SMS)
  // ══════════════════════════════════════════════════════════════════════════

  // Send phone OTP
  const handleSendPhoneOtp = async () => {
    if (phoneResendCooldown > 0 || !phone.trim()) return
    setLoading(true); setError('')
    const formatted = phone.startsWith('+') ? phone.trim() : `+1${phone.replace(/\D/g, '')}`
    try {
      const { error: smsErr } = await supabase.functions.invoke('send-phone-otp', {
        body: { phoneNumber: formatted },
      })
      if (smsErr) {
        // Dev fallback: simulate success when edge function isn't available
        if (process.env.NODE_ENV === 'development') {
          console.warn('[DEV] send-phone-otp failed, using dev fallback. Use code: 123456')
          setPhoneSent(true)
          setPhoneResendCooldown(60)
          setError('Dev mode: use code 123456')
        } else {
          setError(smsErr.message || 'Failed to send code')
        }
      } else {
        setPhoneSent(true)
        setPhoneResendCooldown(60)
      }
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DEV] send-phone-otp failed, using dev fallback. Use code: 123456')
        setPhoneSent(true)
        setPhoneResendCooldown(60)
        setError('Dev mode: use code 123456')
      } else {
        setError(err?.message || 'Failed to send code')
      }
    }
    setLoading(false)
  }

  // Verify phone OTP
  const handleVerifyPhone = async () => {
    if (phoneOtp.length < 4) return
    setLoading(true); setError('')
    const formatted = phone.startsWith('+') ? phone.trim() : `+1${phone.replace(/\D/g, '')}`

    // Dev fallback: accept 123456 without calling edge function
    if (process.env.NODE_ENV === 'development' && phoneOtp === '123456') {
      if (verifiedUserId) {
        await supabase.from('profiles').update({
          phone_number: formatted,
          phone_verified: true,
          sms_enabled: true,
        }).eq('id', verifiedUserId)
      }
      setPhoneVerified(true)
      setError('')
      setLoading(false)
      return
    }

    try {
      const { data, error: verifyErr } = await supabase.functions.invoke('verify-phone-otp', {
        body: { phoneNumber: formatted, code: phoneOtp },
      })
      if (verifyErr || !data?.success) {
        setError(verifyErr?.message || data?.error || 'Invalid code')
        setLoading(false)
        return
      }
      if (verifiedUserId) {
        await supabase.from('profiles').update({
          phone_number: formatted,
          phone_verified: true,
          sms_enabled: true,
        }).eq('id', verifiedUserId)
      }
      setPhoneVerified(true)
    } catch (err: any) {
      setError(err?.message || 'Verification failed')
    }
    setLoading(false)
  }

  // Complete setup
  const handleCompleteSetup = async () => {
    if (!tosChecked) return
    setLoading(true); setError('')
    try {
      if (verifiedUserId) {
        const updates: Record<string, any> = {
          tos_accepted_at: new Date().toISOString(),
        }
        // Save SMS preference from quick setup
        if (wantsSms) {
          updates.sms_enabled = true
        }
        await supabase.from('profiles').update(updates).eq('id', verifiedUserId)
      }
      await refresh()
      setLoading(false)
      isCompleted.current = true
      onComplete()
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  if (!isOpen) return null

  const stepIndex = step === 'profile' ? 0 : step === 'otp' ? 1 : 2
  const isDark = trigger === 'header_login'

  return (
    <div className={styles.overlay} onClick={legalView ? undefined : onClose} data-testid="quick-setup-modal">
      <div className={`${styles.card} ${isDark ? styles.dark : ''}`} onClick={e => e.stopPropagation()}>

        {/* Close button */}
        {!legalView && (
          <button className={styles.closeBtn} onClick={onClose} data-testid="quick-setup-close" aria-label="Close">
            ✕
          </button>
        )}

        {/* ── Legal Review Panel (overlay on card) ── */}
        {legalView && (
          <div className={styles.legalPanel} data-testid={legalView === 'terms' ? 'quick-setup-tos-panel' : 'quick-setup-privacy-panel'}>
            <div className={styles.legalPanelHeader}>
              <button className={styles.legalBackBtn} onClick={() => setLegalView(null)} data-testid="quick-setup-legal-back">
                ← Back
              </button>
              <span className={styles.legalPanelTitle}>
                {legalView === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </span>
            </div>
            <div className={styles.legalPanelContent}>
              {(legalView === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS).map((section: any, i: number) => (
                <div key={i} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a2e1a', marginBottom: 8 }}>
                    {section.title}
                  </h3>
                  {section.paragraphs.map((p: string, pi: number) => (
                    <p key={pi} style={{ marginBottom: 10 }}>{p}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step Indicator */}
        {!legalView && (
          <div className={styles.stepIndicator}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`${styles.stepDot} ${i === stepIndex ? styles.stepDotActive : ''} ${i < stepIndex ? styles.stepDotCompleted : ''}`}
              />
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: Profile / Email */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 'profile' && !legalView && (
          <div data-testid="quick-setup-step-1">
            <h2 className={styles.stepTitle}>👋 Welcome</h2>
            <p className={styles.stepSubtitle}>
              Sign in or create an account to continue.
            </p>

            {ENABLE_SOCIAL_LOGIN && !verifiedUserId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <button
                  type="button"
                  className={styles.socialButton}
                  onClick={() => handleSocialLogin('google')}
                  disabled={loading}
                >
                  <span style={{ fontSize: '15px' }}>🌐</span> Continue with Google
                </button>
                {!(typeof window !== 'undefined' && (window as any).IS_NATIVE_APP && !(window as any).NATIVE_SUPPORTS_APPLE_LOGIN) && (
                <button
                  type="button"
                  className={styles.socialButton}
                  onClick={() => handleSocialLogin('apple')}
                  disabled={loading}
                >
                  <span style={{ fontSize: '15px' }}></span> Continue with Apple
                </button>
                )}
                <div className={styles.divider}>
                  <span>or</span>
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Email Address</label>
              <input
                className={`${styles.input} ${error && !email.trim() ? styles.inputError : ''}`}
                name="email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onBlur={() => trackFieldInteract(PAGE_SLUG, currentStepIndex, 'email', !!email)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <button
              className={styles.primaryBtn}
              onClick={handleContinue}
              disabled={loading || !email.trim()}
              style={{ marginTop: '12px' }}
            >
              {loading ? <><span className={styles.spinner} /> Sending code...</> : 'Continue →'}
            </button>          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: Verify OTP */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 'otp' && !legalView && (
          <div data-testid="quick-setup-step-2">
            <h2 className={styles.stepTitle}>✉️ Verify Email</h2>
            <p className={styles.stepSubtitle}>
              We sent a 6-digit code to <strong>{email}</strong>
            </p>

            {/* OTP Inputs */}
            <div className={styles.otpRow} onPaste={handleOtpPaste}>
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el }}
                  className={styles.otpInput}
                  data-testid={`otp-input-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  onBlur={() => { if (i === 5) trackFieldInteract(PAGE_SLUG, currentStepIndex, 'otp', otpDigits.join('').length === 6) }}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <div className={styles.otpMeta}>
              <button
                className={`${styles.otpLink} ${resendCooldown > 0 ? styles.otpLinkDisabled : ''}`}
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || loading}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
              <span>•</span>
              <button
                className={styles.otpLink}
                onClick={() => { setStep('profile'); setError(''); setOtpDigits(['', '', '', '', '', '']) }}
              >
                Change email
              </button>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <button
              className={styles.primaryBtn}
              onClick={handleVerifyOtp}
              disabled={loading || otpDigits.join('').length < 6}
            >
              {loading ? <><span className={styles.spinner} /> Verifying...</> : 'Verify →'}
            </button>

            <p style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>
              Check your email inbox (and spam folder) for the code.
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STEP 3: Final Setup (TOS + SMS) */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 'final' && !legalView && (
          <div data-testid="quick-setup-step-3">
            <h2 className={styles.stepTitle}>🌱 Almost Done!</h2>
            <p className={styles.stepSubtitle}>
              Just one more thing before you continue.
            </p>
            
            <div className={styles.field} style={{ marginBottom: '20px' }}>
              <label className={styles.label}>Full Name</label>
              <input
                className={`${styles.input} ${error && !fullName.trim() ? styles.inputError : ''}`}
                name="fullName"
                value={fullName}
                onChange={e => { setFullName(e.target.value); setError('') }}
                onBlur={() => trackFieldInteract(PAGE_SLUG, currentStepIndex, 'fullName', !!fullName)}
                placeholder="Jane Smith"
                autoFocus
              />
            </div>

            {/* SMS Section */}
            <div className={styles.smsSection}>
              <div className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={wantsSms}
                  onChange={e => { setWantsSms(e.target.checked); if (!e.target.checked) { setPhoneSent(false); setPhoneOtp(''); setPhoneVerified(false) } }}
                  id="sms-opt-in"
                />
                <label htmlFor="sms-opt-in" className={styles.checkboxLabel}>
                  📱 Get text alerts when your order is confirmed, shipped, or delivered
                </label>
              </div>

              {wantsSms && !phoneVerified && (
                <div className={styles.smsPhoneRow}>
                  <input
                    className={`${styles.input} ${styles.smsPhoneInput}`}
                    type="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setPhoneSent(false); setPhoneOtp('') }}
                    placeholder="(555) 000-0000"
                  />
                  <button
                    className={styles.smsSendBtn}
                    onClick={handleSendPhoneOtp}
                    disabled={loading || phoneResendCooldown > 0 || phone.replace(/\D/g, '').length < 10}
                  >
                    {phoneResendCooldown > 0 ? `${phoneResendCooldown}s` : 'Send Code'}
                  </button>
                </div>
              )}

              {wantsSms && phoneSent && !phoneVerified && (
                <div className={styles.smsOtpRow}>
                  {[0, 1, 2, 3].map(i => (
                    <input
                      key={i}
                      className={styles.smsOtpInput}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={phoneOtp[i] || ''}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(-1)
                        const newOtp = phoneOtp.split('')
                        newOtp[i] = val
                        setPhoneOtp(newOtp.join(''))
                        // Auto-advance
                        if (val && i < 3) {
                          const next = e.target.nextElementSibling as HTMLInputElement
                          next?.focus()
                        }
                      }}
                    />
                  ))}
                  <button className={styles.smsSendBtn} onClick={handleVerifyPhone} disabled={loading || phoneOtp.replace(/\D/g, '').length < 4}>
                    Verify
                  </button>
                  <button className={styles.skipLink} onClick={() => { setWantsSms(false); setPhoneSent(false); setPhoneOtp('') }}>
                    Skip
                  </button>
                </div>
              )}

              {phoneVerified && (
                <div className={styles.verifiedBadge}>✅ Phone verified — you&apos;ll get SMS updates</div>
              )}
            </div>

            <hr className={styles.divider} />

            {/* TOS Section */}
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={tosChecked}
                onChange={e => setTosChecked(e.target.checked)}
                id="tos-agree"
                data-testid="quick-setup-tos-checkbox"
              />
              <label htmlFor="tos-agree" className={styles.checkboxLabel}>
                I have read and agree to the{' '}
                <button className={styles.legalLink} onClick={() => setLegalView('terms')} data-testid="quick-setup-tos-link">
                  Terms of Service
                </button>
                {' '}and the{' '}
                <button className={styles.legalLink} onClick={() => setLegalView('privacy')} data-testid="quick-setup-privacy-link">
                  Privacy Policy
                </button>
              </label>
            </div>

            {error && <div className={styles.errorMsg}>{error}</div>}

            <button
              className={styles.primaryBtn}
              onClick={handleSaveProfileOnly}
              disabled={loading || !tosChecked || !fullName.trim()}
              data-testid="quick-setup-complete-btn"
            >
              {loading ? <><span className={styles.spinner} /> Completing...</> : 'Complete Setup →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
