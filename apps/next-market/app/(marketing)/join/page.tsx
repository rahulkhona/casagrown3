'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useMarketingAnalytics, trackEvent } from '../../../lib/crm-analytics'
import { getReferralData, getTouchHistory, clearReferralData } from '../../../lib/useReferralCapture'

type Step = 'profile' | 'otp' | 'phone-verify' | 'welcome'

function JoinContent() {
  const searchParams = useSearchParams()
  const intent = searchParams.get('intent') ?? 'buyer'
  const redirectTo = searchParams.get('redirect')

  useMarketingAnalytics('/join')

  const supabase = createClient()

  // ── Step state ──
  const [step, setStep] = useState<Step>('profile')

  // ── Profile fields ──
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [zip, setZip] = useState('')


  // ── OTP state ──
  const [otp, setOtp] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  // ── Phone verify state ──
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0)
  const [phoneSending, setPhoneSending] = useState(false)

  // ── UI state ──
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [geolocating, setGeolocating] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)
  const [formStarted, setFormStarted] = useState(false)

  // ── Location cache ──
  const [cachedLat, setCachedLat] = useState<number | null>(null)
  const [cachedLng, setCachedLng] = useState<number | null>(null)

  // ── Formatted phone for display ──
  const formattedPhone = phone.startsWith('+') ? phone.trim() : `+1${phone.replace(/\D/g, '')}`

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

  const handleFocus = () => {
    if (!formStarted) {
      trackEvent('form_start', '/join', { intent })
      setFormStarted(true)
    }
  }

  // ── Use Current Location ──
  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser'); return }
    setGeolocating(true); setError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
            { headers: { 'Accept-Language': 'en', 'User-Agent': 'CasaGrown-Market/1.0 (https://casagrown.com)' } }
          )
          if (!res.ok) { setError('Could not look up address — please enter it manually'); setGeolocating(false); return }
          const data = await res.json()
          const addr = data.address || {}
          const houseNumber = addr.house_number || ''
          const road = addr.road || ''
          setStreetAddress([houseNumber, road].filter(Boolean).join(' '))
          setCity(addr.city || addr.town || addr.village || addr.hamlet || '')
          setStateCode(addr.state ? (addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state.slice(0, 2)).toUpperCase() : '')
          setZip(addr.postcode?.split('-')[0] || '')
          setCachedLat(pos.coords.latitude)
          setCachedLng(pos.coords.longitude)
        } catch {
          setError('Could not look up address — please enter it manually')
        }
        setGeolocating(false)
      },
      () => { setError('Location access denied'); setGeolocating(false); setLocationDenied(true) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── Step 1: Submit profile → send OTP ──
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) { setError('Please enter your name'); return }
    if (!email.trim()) { setError('Please enter your email'); return }
    if (!streetAddress.trim()) { setError('Please enter your street address'); return }
    if (!city.trim()) { setError('Please enter your city'); return }
    if (!stateCode.trim()) { setError('Please enter your state'); return }
    if (!zip.trim()) { setError('Please enter your zip code'); return }

    setLoading(true); setError('')

    // Insert into crm_leads as backup (fire-and-forget)
    const params = new URLSearchParams(window.location.search)
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/crm_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        name: fullName, email, phone: null,
        source_platform: params.get('utm_source') || 'direct',
        source_url: window.location.href,
        utm_campaign: params.get('utm_campaign') || null,
        utm_content: params.get('utm_content') || null,
        utm_medium: params.get('utm_medium') || null,
        form_version: 'v2-join-account',
        accepts_email: true, accepts_sms: false,
        metadata: { intent, address: { streetAddress, city, state: stateCode, zip } },
      }),
    }).catch(() => { /* ignore */ })

    // Send OTP
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { data: getReferralData() },
      })
      if (otpError) {
        const msg = otpError.message?.toLowerCase() || ''
        if (msg.includes('banned') || msg.includes('user is banned')) {
          setError('This account has been closed. Please use a different email address.')
        } else {
          setError(otpError.message)
        }
        setLoading(false)
        return
      }
      setStep('otp')
      setResendCooldown(60)
    } catch (err: any) {
      setError(err?.message || 'Failed to send verification code')
    }
    setLoading(false)
  }

  // ── Step 2: Verify OTP → create account → save profile ──
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 6) return
    setLoading(true); setError('')

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: 'email',
      })
      if (verifyError) { setError(verifyError.message); setLoading(false); return }
      if (!data.user) { setError('Verification failed. Please try again.'); setLoading(false); return }

      const userId = data.user.id

      // Save referral touches
      try {
        const touchHistory = getTouchHistory()
        if (touchHistory.length > 0) {
          const rows = touchHistory.map(t => ({
            user_id: userId,
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
      } catch { /* ignore */ }

      // Check if profile is already complete
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('full_name, street_address, profile_completed_at')
        .eq('id', userId)
        .single()

      if (existingProfile?.profile_completed_at) {
        // Already has a complete profile — skip to welcome
        setStep('welcome')
        setLoading(false)
        return
      }

      // ── USPS Address Validation ──
      let validatedStreet = streetAddress.trim()
      let validatedCity = city.trim()
      let validatedState = stateCode.trim().toUpperCase()
      let validatedZipPlus4 = zip.trim()
      let county: string | null = null

      try {
        const { data: uspsResult, error: uspsError } = await supabase.functions.invoke('resolve-usps-address', {
          body: { streetAddress: validatedStreet, city: validatedCity, state: validatedState, zipCode: zip.trim().split('-')[0] },
        })
        if (!uspsError && uspsResult?.address) {
          validatedStreet = uspsResult.address.streetAddress || validatedStreet
          validatedCity = uspsResult.address.city || validatedCity
          validatedState = uspsResult.address.state || validatedState
          validatedZipPlus4 = uspsResult.address.ZIPPlus4 || validatedZipPlus4
          county = uspsResult.jurisdiction?.county || null
        }
      } catch { /* use user-entered address */ }

      // ── Geocode & H3 ──
      let h3Index: string | null = null
      let geoLat: number | null = cachedLat
      let geoLng: number | null = cachedLng

      try {
        if (!geoLat || !geoLng) {
          const { geocodeAddress } = await import('../../../lib/geocode')
          const geo = await geocodeAddress(`${validatedStreet}, ${validatedCity}, ${validatedState} ${validatedZipPlus4.split('-')[0]}`)
          if (geo) { geoLat = geo.lat; geoLng = geo.lng }
        }
        if (geoLat && geoLng) {
          const { latLngToCell } = await import('h3-js')
          h3Index = latLngToCell(geoLat, geoLng, 7)
        }
      } catch { /* ignore */ }

      if (!h3Index) {
        if (process.env.NODE_ENV === 'development' || validatedStreet.toLowerCase().includes('123 main')) {
          geoLat = 37.3382; geoLng = -121.8863
          const { latLngToCell } = await import('h3-js')
          h3Index = latLngToCell(geoLat, geoLng, 7)
        } else {
          setError('Could not determine your neighborhood. Please check your address.')
          setLoading(false)
          return
        }
      }

      // ── Save Profile ──
      const profileUpdate: Record<string, any> = {
        full_name: fullName.trim(),
        street_address: validatedStreet,
        city: validatedCity,
        state_code: validatedState,
        zip_plus4: validatedZipPlus4,
        zip_code: validatedZipPlus4.split('-')[0],
        county,
        profile_completed_at: new Date().toISOString(),
      }
      if (geoLat !== null && geoLng !== null) {
        profileUpdate.home_location = `SRID=4326;POINT(${geoLng} ${geoLat})`
      }
      if (h3Index) {
        profileUpdate.home_community_h3_index = h3Index
      }
      const { error: updateErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)

      if (updateErr) { setError(updateErr.message); setLoading(false); return }

      // Welcome email fires automatically via DB trigger (on_profile_completed)
      setStep('phone-verify')
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  // ── Resend email OTP ──
  const handleResend = async () => {
    if (resendCooldown > 0) return
    setLoading(true); setError('')
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() })
    if (otpError) setError(otpError.message)
    else setResendCooldown(60)
    setLoading(false)
  }

  // ── Phone OTP: send ──
  const handleResendPhoneOtp = async () => {
    if (phoneResendCooldown > 0) return
    setPhoneSending(true); setError('')
    try {
      const { error: smsErr } = await supabase.functions.invoke('send-phone-otp', {
        body: { phoneNumber: formattedPhone }
      })
      if (smsErr) setError(smsErr.message || 'Failed to send code')
      else setPhoneResendCooldown(60)
    } catch (err: any) {
      setError(err?.message || 'Failed to send code')
    }
    setPhoneSending(false)
  }

  // ── Phone OTP: verify ──
  const handlePhoneVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phoneOtp.length < 4) return
    setLoading(true); setError('')
    try {
      const { data, error: verifyErr } = await supabase.functions.invoke('verify-phone-otp', {
        body: { phoneNumber: formattedPhone, code: phoneOtp }
      })
      if (verifyErr || !data?.success) {
        setError(verifyErr?.message || data?.error || 'Invalid code')
        setLoading(false)
        return
      }
      // Update profile with verified phone
      await supabase.from('profiles').update({
        phone_number: formattedPhone,
        phone_verified: true,
        sms_enabled: true,
      }).eq('id', (await supabase.auth.getUser()).data.user!.id)

      setStep('welcome')
    } catch (err: any) {
      setError(err?.message || 'Verification failed')
    }
    setLoading(false)
  }

  // ── Skip phone verify ──
  const handleSkipPhone = () => {
    setStep('welcome')
  }

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════

  return (
    <>
      {/* Navbar */}
      <nav className="join-nav">
        <div className="join-nav-left">
          <Link href="/" className="join-nav-brand">
            <img src="/logo.png" alt="CasaGrown" className="join-nav-logo-img" />
            <span className="join-nav-brand-name">CasaGrown</span>
          </Link>
          <span className="join-nav-tagline">Fresh. Local. Trusted.</span>
        </div>
        {(step === 'profile' || step === 'otp') && (
          <div className="join-nav-links">
            <Link href="/market" className="join-nav-link">Browse Market</Link>
            <Link href="/login" className="join-nav-link join-nav-login">Log In</Link>
          </div>
        )}
      </nav>

      {/* Background */}
      <div className="join-bg-layer" style={{ backgroundImage: "url('/tote-bag-hero.png')" }}>
        <div className="join-bg-overlay"></div>
      </div>

      <div className="join-content-wrapper">
        <div className="join-main-glass">
          {/* Left Hero */}
          <div className="join-hero-section">
            <h1 className="join-headline">
              {intent === 'seller'
                ? 'Turn your backyard into a neighborhood market.'
                : 'Fresh food from your neighbors, delivered to your door.'}
            </h1>
            <div className="join-hero-desc">
              {intent === 'seller' ? (
                <p>Join thousands of home growers earning from their gardens. Set up your booth in minutes and start selling to neighbors who want what you're growing.</p>
              ) : (
                <p>CasaGrown connects you with neighbors growing fresh, organic produce right in your community. Fresher than any store, with prices that support local growers.</p>
              )}
            </div>
            <div className="join-hero-benefits">
              <div className="join-benefit-item">
                <span className="join-benefit-icon">🌱</span>
                <div>
                  <strong>Hyper-Local</strong>
                  <p>Food from your own neighborhood</p>
                </div>
              </div>
              <div className="join-benefit-item">
                <span className="join-benefit-icon">💳</span>
                <div>
                  <strong>Free to Join</strong>
                  <p>No fees until you transact</p>
                </div>
              </div>
              <div className="join-benefit-item">
                <span className="join-benefit-icon">🤝</span>
                <div>
                  <strong>Community First</strong>
                  <p>Build connections while sharing food</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Form */}
          <div className="join-form-section">
            <div className="join-form-card">

              {/* ── STEP 1: Profile Info ── */}
              {step === 'profile' && (
                <form onSubmit={handleProfileSubmit} className="join-fade-in">
                  <h2 className="join-form-heading">Create Your Account</h2>
                  <p className="join-form-subheading">Join your neighborhood market in under 2 minutes.</p>

                  <div className="join-input-group">
                    <label htmlFor="join-name">Full Name *</label>
                    <input id="join-name" type="text" placeholder="Jane Smith" required
                      value={fullName} onChange={e => setFullName(e.target.value)} onFocus={handleFocus} autoFocus />
                  </div>

                  <div className="join-input-group">
                    <label htmlFor="join-email">Email Address *</label>
                    <input id="join-email" type="email" placeholder="you@example.com" required
                      value={email} onChange={e => setEmail(e.target.value)} onFocus={handleFocus} />
                  </div>

                  <div className="join-input-group">
                    <div className="join-label-row">
                      <label htmlFor="join-street">Street Address *</label>
                      <button type="button" className="join-location-btn" onClick={useCurrentLocation} disabled={geolocating}>
                        {geolocating ? '⏳ Locating...' : '📍 Use My Location'}
                      </button>
                    </div>
                    {locationDenied && (
                      <p className="join-location-hint">
                        🔒 Tap the lock icon in your address bar → Site settings → allow Location, then reload.
                      </p>
                    )}
                    <input id="join-street" type="text" placeholder="123 Main St" required
                      value={streetAddress} onChange={e => setStreetAddress(e.target.value)} onFocus={handleFocus} />
                  </div>

                  <div className="join-address-row">
                    <div className="join-input-group" style={{ flex: 2 }}>
                      <label htmlFor="join-city">City *</label>
                      <input id="join-city" type="text" placeholder="San Jose" required
                        value={city} onChange={e => setCity(e.target.value)} />
                    </div>
                    <div className="join-input-group" style={{ flex: 1 }}>
                      <label htmlFor="join-state">State *</label>
                      <input id="join-state" type="text" placeholder="CA" maxLength={2} required
                        value={stateCode} onChange={e => setStateCode(e.target.value.slice(0, 2))} />
                    </div>
                    <div className="join-input-group" style={{ flex: 1 }}>
                      <label htmlFor="join-zip">Zip *</label>
                      <input id="join-zip" type="text" placeholder="95112" required
                        value={zip} onChange={e => setZip(e.target.value)} />
                    </div>
                  </div>



                  {error && <p className="join-error">{error}</p>}

                  <button type="submit" id="join-submit-btn" className="join-btn-action" disabled={loading || !fullName || !email}>
                    {loading ? 'Sending verification...' : 'Continue →'}
                  </button>

                  <p className="join-privacy">🔒 Your address is used to find your neighborhood. Never shared publicly.</p>
                </form>
              )}

              {/* ── STEP 2: Verify OTP ── */}
              {step === 'otp' && (
                <form onSubmit={handleOtpSubmit} className="join-fade-in">
                  <h2 className="join-form-heading">Verify Your Email</h2>
                  <div className="join-otp-sent">
                    <span className="join-otp-icon">✉️</span>
                    <p>Code sent to <strong>{email}</strong></p>
                    <div className="join-otp-actions">
                      <button type="button" className="join-text-btn" onClick={() => { setStep('profile'); setError(''); setOtp('') }}>
                        Change email
                      </button>
                      <span className="join-otp-divider">|</span>
                      <button type="button" className="join-text-btn" disabled={resendCooldown > 0 || loading} onClick={handleResend}>
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                      </button>
                    </div>
                  </div>

                  <div className="join-input-group">
                    <label htmlFor="join-otp">Enter 6-Digit Code</label>
                    <input id="join-otp" type="text" className="join-otp-input" placeholder="123456"
                      value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoFocus />
                  </div>

                  {error && <p className="join-error">{error}</p>}

                  <button type="submit" className="join-btn-action" disabled={loading || otp.length < 6}>
                    {loading ? 'Setting up your account...' : 'Verify & Join →'}
                  </button>

                  <p className="join-helper">Check your email inbox (or spam folder) for the code.</p>
                </form>
              )}


              {/* ── STEP 3: Add & Verify Phone ── */}
              {step === 'phone-verify' && (
                <div className="join-fade-in">
                  <h2 className="join-form-heading">Phone & Notifications</h2>

                  <div className="join-input-group">
                    <label htmlFor="join-phone">Phone Number <span className="join-optional">(for order/payout SMS if push is unavailable)</span></label>
                    <div className="join-phone-row">
                      <input id="join-phone" type="tel" placeholder="(555) 000-0000"
                        value={phone} onChange={e => { setPhone(e.target.value); setPhoneOtp(''); setError('') }}
                        disabled={phoneSending} autoFocus />
                      {phone.replace(/\D/g, '').length >= 10 && phoneOtp === '' && (
                        <button type="button" className="join-send-code-btn" onClick={handleResendPhoneOtp}
                          disabled={phoneSending || phoneResendCooldown > 0}>
                          {phoneSending ? 'Sending...' : phoneResendCooldown > 0 ? `${phoneResendCooldown}s` : 'Send Code'}
                        </button>
                      )}
                    </div>
                  </div>

                  {phoneResendCooldown > 0 && (
                    <form onSubmit={handlePhoneVerify}>
                      <div className="join-input-group">
                        <label htmlFor="join-phone-otp">Enter the code sent to {formattedPhone}</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input id="join-phone-otp" type="text" placeholder="123456"
                            value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} maxLength={8} autoFocus />
                          <button type="submit" className="join-send-code-btn" disabled={loading || phoneOtp.length < 4}>
                            {loading ? 'Checking...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  <div className="join-consent-box">
                    <p className="join-consent-title">Enable Order SMS Notifications</p>
                    <p className="join-consent-text">
                      By providing your phone number, you consent to receive critical transactional SMS notifications (like order updates) from CasaGrown. Reply STOP to cancel. Msg &amp; data rates may apply.
                    </p>
                  </div>

                  {error && <p className="join-error">{error}</p>}

                  <button type="button" className="join-skip-btn" onClick={handleSkipPhone}>
                    Skip for now →
                  </button>
                </div>
              )}

              {/* ── STEP 4: Welcome ── */}
              {step === 'welcome' && (
                <div className="join-fade-in join-welcome">
                  <div className="join-welcome-icon">🎉</div>
                  <h2 className="join-welcome-title">Welcome to CasaGrown!</h2>
                  <p className="join-welcome-subtitle">
                    Your account is set up and ready to go. Here&apos;s what you can do next:
                  </p>

                  <div className="join-welcome-grid">
                    <Link href="/market" className="join-welcome-card">
                      <span className="join-welcome-card-icon">🛒</span>
                      <strong>Browse Market</strong>
                      <p>Discover fresh produce from your neighbors</p>
                    </Link>
                    <Link href="/get-started" className="join-welcome-card">
                      <span className="join-welcome-card-icon">🌿</span>
                      <strong>Start Selling</strong>
                      <p>Set up your booth and list your harvest</p>
                    </Link>
                    <Link href="/growbot" className="join-welcome-card">
                      <span className="join-welcome-card-icon">🤖</span>
                      <strong>Ask GrowBot</strong>
                      <p>Get AI-powered gardening advice</p>
                    </Link>
                    <Link href="/community" className="join-welcome-card">
                      <span className="join-welcome-card-icon">👥</span>
                      <strong>Community</strong>
                      <p>Connect with growers in your area</p>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .join-nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; background: rgba(255,255,255,0.9); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.4); z-index: 10; position: relative; }
        .join-nav-left { display: flex; align-items: center; gap: 20px; }
        .join-nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .join-nav-brand-name { font-weight: 800; font-size: 1.4rem; color: #14532d; letter-spacing: -0.5px; }
        .join-nav-logo-img { height: 40px; width: auto; }
        .join-nav-tagline { font-weight: 600; font-size: 0.95rem; color: #166534; letter-spacing: 0.5px; border-left: 2px solid #bbf7d0; padding-left: 20px; }
        .join-nav-links { display: flex; align-items: center; gap: 24px; }
        .join-nav-link { font-size: 0.95rem; font-weight: 600; color: #14532d; text-decoration: none; transition: color 0.2s; }
        .join-nav-link:hover { color: #22c55e; }
        .join-nav-login { background: linear-gradient(135deg, #22c55e, #16a34a); color: white !important; padding: 8px 20px; border-radius: 10px; }
        .join-nav-login:hover { color: white !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(34,197,94,0.3); }

        .join-bg-layer { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-size: cover; background-position: center; z-index: -2; transform: scale(1.02); }
        .join-bg-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(135deg, rgba(20,83,45,0.8) 0%, rgba(20,83,45,0.4) 100%); z-index: -1; }

        .join-content-wrapper { flex: 1; display: flex; justify-content: center; align-items: center; padding: 40px 24px; min-height: calc(100vh - 80px); position: relative; }

        .join-main-glass { display: flex; flex-direction: row; background: rgba(255,255,255,0.45); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(255,255,255,0.6); border-radius: 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.15); max-width: 1100px; width: 100%; overflow: hidden; }

        .join-hero-section { flex: 1; padding: 60px; background: rgba(220,252,231,0.5); border-right: 1px solid rgba(255,255,255,0.5); display: flex; flex-direction: column; justify-content: center; }
        .join-headline { font-size: 2.8rem; font-weight: 800; color: #14532d; line-height: 1.1; margin-bottom: 20px; letter-spacing: -1px; }
        .join-hero-desc { font-size: 1.05rem; color: #166534; line-height: 1.6; margin-bottom: 32px; }
        .join-hero-desc p { margin: 0; }
        .join-hero-benefits { display: flex; flex-direction: column; gap: 16px; }
        .join-benefit-item { display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.7); padding: 16px 20px; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
        .join-benefit-icon { font-size: 1.8rem; flex-shrink: 0; }
        .join-benefit-item strong { display: block; font-size: 0.95rem; color: #14532d; margin-bottom: 2px; }
        .join-benefit-item p { font-size: 0.85rem; color: #4b5563; margin: 0; line-height: 1.3; }

        .join-form-section { flex: 1.1; padding: 40px; display: flex; flex-direction: column; justify-content: center; overflow-y: auto; max-height: calc(100vh - 160px); }
        .join-form-card { background: white; padding: 36px; border-radius: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.05); }

        .join-form-heading { font-size: 1.6rem; font-weight: 800; color: #14532d; margin-bottom: 4px; }
        .join-form-subheading { font-size: 0.95rem; color: #4b5563; margin-bottom: 20px; line-height: 1.4; }

        .join-input-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .join-input-group label { font-size: 0.85rem; font-weight: 700; color: #374151; }
        .join-input-group input { padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 0.95rem; background: #f9fafb; transition: all 0.2s; font-family: 'Inter', sans-serif; }
        .join-input-group input:focus { outline: none; border-color: #22c55e; background: white; box-shadow: 0 0 0 4px rgba(34,197,94,0.1); }
        .join-optional { font-weight: 400; color: #9ca3af; }

        .join-label-row { display: flex; justify-content: space-between; align-items: center; }
        .join-location-btn { background: none; border: none; color: #16a34a; font-weight: 600; font-size: 0.8rem; cursor: pointer; padding: 0; }
        .join-location-btn:disabled { color: #9ca3af; cursor: wait; }
        .join-location-hint { margin: 2px 0 0; font-size: 0.7rem; color: #b45309; line-height: 1.3; }

        .join-address-row { display: flex; gap: 10px; }

        .join-checkboxes { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .join-checkbox-item { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 0.85rem; color: #4b5563; padding: 10px 14px; background: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb; transition: all 0.2s; }
        .join-checkbox-item:hover { background: #f3f4f6; }
        .join-checkbox-item input { width: 18px; height: 18px; accent-color: #22c55e; cursor: pointer; flex-shrink: 0; }

        .join-error { color: #dc2626; font-size: 0.85rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; }

        .join-btn-action { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; padding: 16px 28px; font-size: 1.05rem; font-weight: 800; border-radius: 14px; cursor: pointer; transition: all 0.3s; width: 100%; box-shadow: 0 8px 20px rgba(34,197,94,0.3); font-family: 'Inter', sans-serif; }
        .join-btn-action:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(34,197,94,0.4); }
        .join-btn-action:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

        .join-btn-secondary { display: block; text-align: center; color: #16a34a; font-weight: 600; font-size: 0.9rem; text-decoration: none; margin-top: 12px; transition: color 0.2s; }
        .join-btn-secondary:hover { color: #14532d; }

        .join-privacy { font-size: 0.75rem; color: #6b7280; text-align: center; margin-top: 12px; }
        .join-helper { font-size: 0.8rem; color: #6b7280; text-align: center; margin-top: 12px; }

        /* OTP Step */
        .join-otp-sent { text-align: center; margin-bottom: 20px; }
        .join-otp-icon { font-size: 2.5rem; display: block; margin-bottom: 8px; }
        .join-otp-sent p { color: #374151; font-size: 0.95rem; margin: 0 0 8px; }
        .join-otp-actions { display: flex; align-items: center; justify-content: center; gap: 10px; }
        .join-text-btn { background: none; border: none; color: #16a34a; font-weight: 600; font-size: 0.85rem; cursor: pointer; padding: 0; }
        .join-text-btn:disabled { color: #9ca3af; cursor: not-allowed; }
        .join-otp-divider { color: #d1d5db; }
        .join-otp-input { text-align: center; font-size: 1.8rem !important; font-weight: 700; letter-spacing: 8px; padding: 16px !important; }

        /* Welcome Step */
        .join-welcome { text-align: center; }
        .join-welcome-icon { font-size: 4rem; margin-bottom: 12px; animation: bounceIn 0.6s ease-out; }
        .join-welcome-title { font-size: 1.8rem; font-weight: 800; color: #14532d; margin-bottom: 8px; }
        .join-welcome-subtitle { font-size: 1rem; color: #4b5563; margin-bottom: 24px; line-height: 1.5; }
        .join-welcome-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .join-welcome-card { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 16px; text-decoration: none; transition: all 0.2s; cursor: pointer; }
        .join-welcome-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(34,197,94,0.15); border-color: #22c55e; }
        .join-welcome-card-icon { font-size: 1.8rem; margin-bottom: 8px; }
        .join-welcome-card strong { font-size: 0.95rem; color: #14532d; margin-bottom: 4px; }
        .join-welcome-card p { font-size: 0.75rem; color: #4b5563; margin: 0; line-height: 1.3; }

        .join-skip-btn { background: none; border: none; color: #6b7280; font-size: 0.85rem; cursor: pointer; margin-top: 12px; width: 100%; text-align: center; padding: 8px; transition: color 0.2s; }
        .join-skip-btn:hover { color: #374151; }

        .join-phone-row { display: flex; gap: 8px; align-items: center; }
        .join-phone-row input { flex: 1; }
        .join-send-code-btn { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; padding: 12px 18px; font-size: 0.85rem; font-weight: 700; border-radius: 12px; cursor: pointer; white-space: nowrap; transition: all 0.2s; flex-shrink: 0; }
        .join-send-code-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(34,197,94,0.3); }
        .join-send-code-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .join-consent-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
        .join-consent-title { font-size: 0.85rem; font-weight: 700; color: #374151; margin: 0 0 6px; }
        .join-consent-text { font-size: 0.72rem; color: #6b7280; margin: 0; line-height: 1.4; }

        @keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        .join-fade-in { animation: joinFadeUp 0.4s ease-out forwards; }
        @keyframes joinFadeUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 900px) {
          .join-main-glass { flex-direction: column; }
          .join-hero-section { padding: 40px 24px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.5); }
          .join-form-section { padding: 24px; max-height: none; }
          .join-headline { font-size: 2rem; }
          .join-nav { padding: 16px 24px; }
          .join-nav-tagline { display: none; }
          .join-address-row { flex-direction: column; gap: 0; }
          .join-hero-benefits { display: none; }
        }
      `}</style>
    </>
  )
}

export default function JoinPage() {
  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
        <JoinContent />
      </Suspense>
    </div>
  )
}
