'use client'

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react'
import { createClient } from '../../lib/supabase'
import { useBootstrap } from '../../lib/useBootstrap'
import { geocodeAddress, toPostgisPoint } from '../../lib/geocode'
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../(main)/terms/page'
import styles from './QuickSetupModal.module.css'

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
}

type Step = 'profile' | 'otp' | 'final'
type LegalView = null | 'terms' | 'privacy'

export default function QuickSetupModal({ isOpen, onClose, onComplete, trigger }: QuickSetupModalProps) {
  const supabase = createClient()
  const { refresh } = useBootstrap()

  // ── Step State ──
  const [step, setStep] = useState<Step>('profile')
  const [legalView, setLegalView] = useState<LegalView>(null)
  const [isReturningUser, setIsReturningUser] = useState(false)

  // ── Step 1: Profile Fields ──
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [geolocating, setGeolocating] = useState(false)

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

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('profile')
      setLegalView(null)
      setIsReturningUser(false)
      setFullName('')
      setEmail('')
      setStreet('')
      setCity('')
      setState('')
      setZip('')
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
    }
  }, [isOpen])

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

  // ══════════════════════════════════════════════════════════════════════════
  // Geolocation: Use My Location
  // ══════════════════════════════════════════════════════════════════════════
  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser'); return }
    setGeolocating(true); setError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
            { headers: { 'Accept-Language': 'en', 'User-Agent': 'CasaGrown-Market/1.0 (https://casagrown.com)' } }
          )
          if (!res.ok) {
            setError('Could not look up address — please enter it manually')
            setGeolocating(false)
            return
          }
          const data = await res.json()
          const addr = data.address || {}
          const houseNumber = addr.house_number || ''
          const road = addr.road || ''
          setStreet([houseNumber, road].filter(Boolean).join(' '))
          setCity(addr.city || addr.town || addr.village || addr.hamlet || '')
          setState(addr.state ? (addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state.slice(0, 2)).toUpperCase() : '')
          setZip(addr.postcode?.split('-')[0] || '')
        } catch {
          setError('Could not look up address — please enter it manually')
        }
        setGeolocating(false)
      },
      () => { setError('Location access denied'); setGeolocating(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // Step 1: Profile → Send OTP
  // ══════════════════════════════════════════════════════════════════════════
  const handleContinue = useCallback(async () => {
    setError('')
    if (!isReturningUser && !fullName.trim()) { setError('Please enter your name'); return }
    if (!email.trim()) { setError('Please enter your email'); return }

    // For new users, validate address
    if (!isReturningUser) {
      if (!street.trim()) { setError('Please enter your street address'); return }
      if (!city.trim()) { setError('Please enter your city'); return }
      if (!state.trim()) { setError('Please enter your state'); return }
      if (!zip.trim()) { setError('Please enter your zip code'); return }
    }

    setLoading(true)

    try {
      // Check if user exists (returning user detection)
      // We do this by attempting signInWithOtp — Supabase will create the user if new
      // We can detect returning users after OTP verification by checking profile_completed_at

      // USPS Address Validation (for new users)
      if (!isReturningUser) {
        try {
          const { data: uspsResult, error: uspsError } = await supabase.functions.invoke('resolve-usps-address', {
            body: { streetAddress: street.trim(), city: city.trim(), state: state.trim().toUpperCase(), zipCode: zip.trim().split('-')[0] },
          })
          if (!uspsError && uspsResult?.address) {
            const correctedStreet = uspsResult.address.streetAddress || street.trim()
            const correctedCity = uspsResult.address.city || city.trim()
            const correctedState = uspsResult.address.state || state.trim().toUpperCase()
            const correctedZip = uspsResult.address.ZIPPlus4 || zip.trim()
            const originalAddr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`
            const correctedAddr = `${correctedStreet}, ${correctedCity}, ${correctedState} ${correctedZip}`

            if (originalAddr.toLowerCase() !== correctedAddr.toLowerCase()) {
              setUspsCorrection({
                original: originalAddr,
                corrected: correctedAddr,
                correctedFields: { street: correctedStreet, city: correctedCity, state: correctedState, zip: correctedZip },
              })
            }
          }
        } catch { /* Use user-entered address if USPS fails */ }
      }

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
      // Focus first OTP input after render
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      setError(err?.message || 'Failed to send verification code')
    }
    setLoading(false)
  }, [fullName, email, street, city, state, zip, isReturningUser, supabase])

  // ══════════════════════════════════════════════════════════════════════════
  // Step 2: Verify OTP
  // ══════════════════════════════════════════════════════════════════════════
  const handleVerifyOtp = useCallback(async () => {
    const code = otpDigits.join('')
    if (code.length < 6) return
    setError('')
    setLoading(true)

    try {
      // Intercept review login and sign in via email/password
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

      // Check if this is a returning user (already has profile)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('full_name, profile_completed_at, tos_accepted_at')
        .eq('id', userId)
        .single()

      if (existingProfile?.profile_completed_at && existingProfile?.tos_accepted_at) {
        // Returning user — all done! Refresh bootstrap and complete
        await refresh()
        setLoading(false)
        onComplete()
        return
      }

      // New user or incomplete profile — save profile data
      const finalStreet = uspsCorrection && useCorrected ? uspsCorrection.correctedFields.street : street.trim()
      const finalCity = uspsCorrection && useCorrected ? uspsCorrection.correctedFields.city : city.trim()
      const finalState = uspsCorrection && useCorrected ? uspsCorrection.correctedFields.state : state.trim().toUpperCase()
      const finalZip = uspsCorrection && useCorrected ? uspsCorrection.correctedFields.zip : zip.trim()

      // Geocode & H3
      let geoLat: number | null = null
      let geoLng: number | null = null
      let h3Index: string | null = null

      try {
        const geo = await geocodeAddress(`${finalStreet}, ${finalCity}, ${finalState} ${finalZip.split('-')[0]}`)
        if (geo) {
          geoLat = geo.lat
          geoLng = geo.lng
        }
        if (geoLat && geoLng) {
          const { latLngToCell } = await import('h3-js')
          h3Index = latLngToCell(geoLat, geoLng, 7)
        }
      } catch { /* ignore */ }

      // Fallback for dev/test environments
      if (!h3Index) {
        if (process.env.NODE_ENV === 'development' || finalStreet.toLowerCase().includes('123 main')) {
          geoLat = 37.3382; geoLng = -121.8863
          const { latLngToCell } = await import('h3-js')
          h3Index = latLngToCell(geoLat, geoLng, 7)
        }
      }

      // Save profile
      const profileUpdate: Record<string, any> = {
        full_name: fullName.trim(),
        street_address: finalStreet,
        city: finalCity,
        state_code: finalState,
        zip_code: finalZip.split('-')[0],
        zip_plus4: finalZip,
        profile_completed_at: new Date().toISOString(),
      }
      if (geoLat !== null && geoLng !== null) {
        profileUpdate.home_location = toPostgisPoint(geoLat, geoLng)
      }
      if (h3Index) {
        profileUpdate.home_community_h3_index = h3Index
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)

      if (updateErr) {
        setError('Failed to save profile: ' + updateErr.message)
        setLoading(false)
        return
      }

      // If TOS already accepted, we're done
      if (existingProfile?.tos_accepted_at) {
        await refresh()
        setLoading(false)
        onComplete()
        return
      }

      // Move to Step 3 for TOS + optional SMS
      setStep('final')
    } catch (err: any) {
      setError(err?.message || 'Verification failed')
    }
    setLoading(false)
  }, [otpDigits, email, supabase, fullName, street, city, state, zip, uspsCorrection, useCorrected, refresh, onComplete])

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

  return (
    <div className={styles.overlay} onClick={legalView ? undefined : onClose} data-testid="quick-setup-modal">
      <div className={styles.card} onClick={e => e.stopPropagation()}>

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
            {/* Mode Switcher Tabs */}
            <div className={styles.tabsContainer}>
              <button
                type="button"
                onClick={() => { setIsReturningUser(false); setError('') }}
                className={`${styles.tabBtn} ${!isReturningUser ? styles.tabBtnActive : ''}`}
              >
                Sign Up
              </button>
              <button
                type="button"
                data-testid="returning-user-toggle"
                onClick={() => { setIsReturningUser(true); setError('') }}
                className={`${styles.tabBtn} ${isReturningUser ? styles.tabBtnActive : ''}`}
              >
                Sign In
              </button>
            </div>

            {isReturningUser ? (
              <>
                <h2 className={styles.stepTitle}>👋 Welcome Back</h2>
                <p className={styles.stepSubtitle}>
                  Enter your email to sign in. We'll send a verification code.
                </p>

                {/* Email only for returning users */}
                <div className={styles.field}>
                  <label className={styles.label}>Email</label>
                  <input
                    className={`${styles.input} ${error && !email.trim() ? styles.inputError : ''}`}
                    name="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>

                {error && <div className={styles.errorMsg}>{error}</div>}

                <button
                  className={styles.primaryBtn}
                  onClick={handleContinue}
                  disabled={loading || !email.trim()}
                >
                  {loading ? <><span className={styles.spinner} /> Sending code...</> : 'Send Code →'}
                </button>


              </>
            ) : (
              <>
                <h2 className={styles.stepTitle}>🌱 Quick Setup</h2>
                <p className={styles.stepSubtitle}>
                  Create your account to continue. Takes less than 2 minutes.
                </p>

                {/* Name */}
                <div className={styles.field}>
                  <label className={styles.label}>Full Name</label>
                  <input
                    className={`${styles.input} ${error && !fullName.trim() ? styles.inputError : ''}`}
                    name="fullName"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    autoFocus
                  />
                </div>

                {/* Email */}
                <div className={styles.field}>
                  <label className={styles.label}>Email</label>
                  <input
                    className={`${styles.input} ${error && !email.trim() ? styles.inputError : ''}`}
                    name="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                {/* Address Section */}
                {!isReturningUser && (
                  <>
                    <div className={styles.infoCard}>
                      <span className={styles.infoIcon}>🔒</span>
                      <span className={styles.infoText}>
                        We use your address to find sellers who deliver to your area, show your nearest booths, and calculate delivery options.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={useCurrentLocation}
                      disabled={geolocating}
                      style={{
                        width: '100%', padding: '8px 12px', marginBottom: 8,
                        background: 'var(--green-50, #f0fdf4)', border: '1px solid var(--green-200, #bbf7d0)',
                        borderRadius: 8, color: 'var(--green-700, #15803d)',
                        fontSize: 13, fontWeight: 600, cursor: geolocating ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      {geolocating ? '⏳ Locating...' : '📍 Use My Location'}
                    </button>

                    <div className={styles.field}>
                      <label className={styles.label}>Street Address</label>
                      <input
                        className={`${styles.input} ${error && !street.trim() ? styles.inputError : ''}`}
                        name="street"
                        value={street}
                        onChange={e => setStreet(e.target.value)}
                        placeholder="123 Main St"
                      />
                    </div>

                    <div className={styles.addressRow}>
                      <div className={styles.field}>
                        <label className={styles.label}>City</label>
                        <input
                          className={`${styles.input} ${error && !city.trim() ? styles.inputError : ''}`}
                          name="city"
                          value={city}
                          onChange={e => setCity(e.target.value)}
                          placeholder="San Jose"
                        />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>State</label>
                        <input
                          className={`${styles.input} ${error && !state.trim() ? styles.inputError : ''}`}
                          name="state"
                          value={state}
                          onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
                          placeholder="CA"
                          maxLength={2}
                        />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Zip</label>
                        <input
                          className={`${styles.input} ${error && !zip.trim() ? styles.inputError : ''}`}
                          name="zip"
                          value={zip}
                          onChange={e => setZip(e.target.value)}
                          placeholder="95120"
                          maxLength={10}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* USPS Address Correction */}
                {uspsCorrection && (
                  <div className={styles.addressCorrection}>
                    <div className={styles.addressCorrectionTitle}>📬 Did you mean?</div>
                    <label className={`${styles.addressOption} ${useCorrected ? styles.addressOptionSelected : ''}`} onClick={() => setUseCorrected(true)}>
                      <input type="radio" className={styles.addressRadio} checked={useCorrected} onChange={() => setUseCorrected(true)} />
                      <div>
                        <div className={styles.addressLabel}>Suggested</div>
                        <div className={styles.addressText}>{uspsCorrection.corrected}</div>
                      </div>
                    </label>
                    <label className={`${styles.addressOption} ${!useCorrected ? styles.addressOptionSelected : ''}`} onClick={() => setUseCorrected(false)}>
                      <input type="radio" className={styles.addressRadio} checked={!useCorrected} onChange={() => setUseCorrected(false)} />
                      <div>
                        <div className={styles.addressLabel}>As entered</div>
                        <div className={styles.addressText}>{uspsCorrection.original}</div>
                      </div>
                    </label>
                  </div>
                )}

                {error && <div className={styles.errorMsg}>{error}</div>}

                <button
                  className={styles.primaryBtn}
                  onClick={handleContinue}
                  disabled={loading || !fullName.trim() || !email.trim()}
                >
                  {loading ? <><span className={styles.spinner} /> Sending code...</> : 'Continue →'}
                </button>


              </>
            )}
          </div>
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
              onClick={handleCompleteSetup}
              disabled={loading || !tosChecked}
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
