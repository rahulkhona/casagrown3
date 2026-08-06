'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import CameraCapture from '../../../components/CameraCapture'
import ImageCropper from '../../../components/ImageCropper'
import AddressInput from '../../components/AddressInput'
import { type AddressFields, normalizeStateCode, validateProfileFields } from '../../../lib/address'
import { useNotificationPrompt, isNotificationsEnabled } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../components/NotificationPromptModal'
import { useErrorToast } from '../../components/ErrorToast'
import QRCode from 'react-qr-code'
import styles from './page.module.css'

function ProfilePageInner() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  const [form, setForm] = useState({
    name: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zip: '',
  })
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Email change states
  const [initialEmail, setInitialEmail] = useState('')
  const [emailVerificationSent, setEmailVerificationSent] = useState(false)
  const [emailOtp, setEmailOtp] = useState('')
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState('')
  const [geolocating, setGeolocating] = useState(false)
  const [cachedLat, setCachedLat] = useState<number | null>(null)
  const [cachedLng, setCachedLng] = useState<number | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)

  // Phone & SMS
  const [phone, setPhone] = useState('')
  const [initialPhone, setInitialPhone] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [showVerify, setShowVerify] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [twilioBlocked, setTwilioBlocked] = useState(false)

  // Camera & Cropper
  const [showCamera, setShowCamera] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // Business profile fields
  const [hasBooth, setHasBooth] = useState(false)
  const [showBusiness, setShowBusiness] = useState(false)
  const [biz, setBiz] = useState({
    farmName: '',
    businessType: '',
    sellerBio: '',
    businessLicense: '',
    foodHandlerPermit: '',
    cottageFoodPermit: '',
    insuranceProvider: '',
  })

  const { showSuccess: showToastSuccess } = useErrorToast()

  // Fetch actual profile from Supabase
  useEffect(() => {
    if (!user) {
      if (!authLoading) setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('profiles')
      .select('full_name, street_address, city, state_code, zip_code, zip_plus4, avatar_url, phone_number, phone_verified, sms_enabled, twilio_blocked, farm_name, business_type, seller_bio, business_license, food_handler_permit, cottage_food_permit, insurance_provider')
      .eq('id', user.id)
      .single()
      .then(({ data, error: fetchErr }: { data: any; error: any }) => {
        if (fetchErr) console.warn('Profile fetch error:', fetchErr.message)
        setForm({
          name: data?.full_name || '',
          email: user.email || '',
          street: data?.street_address || '',
          city: data?.city || '',
          state: data?.state_code || '',
          zip: data?.zip_code || (data?.zip_plus4 ? data.zip_plus4.split('-')[0] : ''),
        })
        setInitialEmail(user.email || '')
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url)
          setAvatarPreview(data.avatar_url)
        }
        if (data?.phone_number) {
          setPhone(data.phone_number)
          setInitialPhone(data.phone_number)
          setPhoneVerified(!!data.phone_verified)
          setSmsEnabled(!!data.sms_enabled)
          setTwilioBlocked(!!data.twilio_blocked)
        }
        // Business fields
        setBiz({
          farmName: data?.farm_name || '',
          businessType: data?.business_type || '',
          sellerBio: data?.seller_bio || '',
          businessLicense: data?.business_license || '',
          foodHandlerPermit: data?.food_handler_permit || '',
          cottageFoodPermit: data?.cottage_food_permit || '',
          insuranceProvider: data?.insurance_provider || '',
        })
        // Auto-expand if any business field is already filled
        if (data?.farm_name || data?.business_type || data?.seller_bio || data?.business_license || data?.food_handler_permit || data?.cottage_food_permit || data?.insurance_provider) {
          setShowBusiness(true)
        }
      })
      .finally(() => {
        setLoading(false)
      })

    // Check if user has a booth
    supabase.from('market_booths').select('id').eq('owner_id', user.id).limit(1).then(({ data }: { data: any }) => {
      if (data && data.length > 0) setHasBooth(true)
    })
  }, [user, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchParams.get('verifyPhone') === 'true' && !phoneVerified) {
      setError('Please verify your phone number below to ensure you receive order notifications.')
    } else if (searchParams.get('verifyPhone') === 'true' && phoneVerified) {
      setError('')
    }
  }, [searchParams, phoneVerified])

  // Handle file upload from gallery
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCropSrc(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    // ── Required field validation ──
    const profileError = validateProfileFields({
      fullName: form.name,
      street: form.street,
      city: form.city,
      state: form.state,
      zip: form.zip,
    }, { requireFullAddress: true })
    if (profileError) {
      setError(profileError)
      return
    }
    if (form.email !== initialEmail) {
      setError('You must verify your new email address by clicking "Verify Code" before continuing.')
      return
    }
    if (phone.trim() && !phoneVerified) {
      setError('Please verify your phone number by clicking "Send Code", or clear the field before saving.')
      return
    }
    setSaving(true)
    setError('')

    try {
      // ── 1. Validate address via USPS (recompute ZIP+4 on any address change) ──
      let validatedStreet = form.street.trim()
      let validatedCity = form.city.trim()
      let validatedState = normalizeStateCode(form.state)
      let validatedZipPlus4 = form.zip.trim()
      let county: string | null = null

      if (validatedStreet && validatedCity && validatedState) {
        try {
          const { data: uspsResult, error: uspsError } = await supabase.functions.invoke('resolve-usps-address', {
            body: {
              streetAddress: validatedStreet,
              city: validatedCity,
              state: validatedState,
              zipCode: validatedZipPlus4.split('-')[0],
            },
          })
          if (!uspsError && uspsResult?.address) {
            validatedStreet = uspsResult.address.streetAddress || validatedStreet
            validatedCity = uspsResult.address.city || validatedCity
            validatedState = normalizeStateCode(uspsResult.address.state || validatedState)
            validatedZipPlus4 = uspsResult.address.ZIPPlus4 || validatedZipPlus4
            county = uspsResult.jurisdiction?.county || null
            setForm(prev => ({ ...prev, street: validatedStreet, city: validatedCity, state: validatedState, zip: validatedZipPlus4.split('-')[0] }))
          } else {
            console.warn('USPS validation failed, using user-entered address:', uspsError)
          }
        } catch (err) {
          console.warn('USPS edge function unavailable, using user-entered address:', err)
        }
      }

      // ── 2. Geocode address to compute H3 community index ──
      let h3Index: string | null = null
      let geoLat: number | null = cachedLat
      let geoLng: number | null = cachedLng
      
      if (validatedStreet && validatedCity && validatedState) {
        try {
          if (!geoLat || !geoLng) {
            const { geocodeAddress } = await import('../../../lib/geocode')
            const geo = await geocodeAddress(`${validatedStreet}, ${validatedCity}, ${validatedState} ${validatedZipPlus4.split('-')[0]}`)
            if (geo) {
              geoLat = geo.lat
              geoLng = geo.lng
            }
          }
          if (geoLat && geoLng) {
            const { latLngToCell } = await import('h3-js')
            h3Index = latLngToCell(geoLat, geoLng, 7)
          }
        } catch (err) {
          console.warn('H3 computation failed:', err)
        }
      }

      // ── 3. Save profile ──
      const profileUpdate: Record<string, any> = {
        full_name: form.name,
        street_address: validatedStreet,
        city: validatedCity,
        state_code: validatedState,
        zip_plus4: validatedZipPlus4,
        zip_code: validatedZipPlus4.split('-')[0],
        county,
        avatar_url: avatarUrl || null,
        sms_enabled: smsEnabled,
        // Business fields
        farm_name: biz.farmName || null,
        business_type: biz.businessType || null,
        seller_bio: biz.sellerBio || null,
        business_license: biz.businessLicense || null,
        food_handler_permit: biz.foodHandlerPermit || null,
        cottage_food_permit: biz.cottageFoodPermit || null,
        insurance_provider: biz.insuranceProvider || null,
      }
      if (phone.trim() && phoneVerified) {
        profileUpdate.phone_number = phone.startsWith('+') ? phone.trim() : `+1${phone.replace(/\D/g, '')}`
        profileUpdate.phone_verified = true
      } else if (!phone.trim()) {
        profileUpdate.phone_number = null
        profileUpdate.phone_verified = false
        profileUpdate.sms_enabled = false
      }
      if (h3Index) {
        profileUpdate.home_community_h3_index = h3Index
      }
      if (geoLat !== null && geoLng !== null) {
        profileUpdate.home_location = `SRID=4326;POINT(${geoLng} ${geoLat})`
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id)

      if (updateErr) {
        setError('Save failed: ' + updateErr.message)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setError('Save failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // ── Geolocation: auto-fill address from GPS ──
  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser'); return }
    setGeolocating(true); setError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const addr = data.address || {}
          const houseNumber = addr.house_number || ''
          const road = addr.road || ''
          setForm(prev => ({
            ...prev,
            street: [houseNumber, road].filter(Boolean).join(' '),
            city: addr.city || addr.town || addr.village || addr.hamlet || '',
            state: addr.state ? (addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state.slice(0, 2)).toUpperCase() : '',
            zip: addr.postcode?.split('-')[0] || '',
          }))
          setCachedLat(pos.coords.latitude)
          setCachedLng(pos.coords.longitude)
        } catch {
          setError('Could not look up address from location')
        }
        setGeolocating(false)
      },
      () => { setError('Location access denied'); setGeolocating(false); setLocationDenied(true) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }


  // ── Phone Verification ──
  const handleSendOtp = async () => {
    setPhoneError('')
    if (!phone) return
    setIsSendingOtp(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-phone-otp', {
        body: { phoneNumber: phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}` }
      })
      if (error || !data?.success) {
        setPhoneError(error?.message || data?.error || 'Failed to send code')
      } else {
        setShowVerify(true)
      }
    } catch (e: any) {
      setPhoneError(e.message)
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleVerifyPhone = async () => {
    setPhoneError('')
    if (verifyCode.length < 4) return
    setIsVerifyingOtp(true)
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone-otp', {
        body: { 
          phoneNumber: phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`,
          code: verifyCode 
        }
      })
      if (error || !data?.success) {
        setPhoneError(error?.message || data?.error || 'Invalid code')
      } else {
        setPhoneVerified(true)
        setInitialPhone(phone)
        setShowVerify(false)
        setPhoneError('')
      }
    } catch (e: any) {
      setPhoneError(e.message)
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  if (authLoading || loading) return <div className="container-sm" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>

  if (!isAuthenticated) {
    return (
      <div className="container-sm" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2>Please sign in to view your profile</h2>
        <a href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</a>
      </div>
    )
  }

  return (
    <div className="container-sm">
      <div className={styles.header}>
        {/* Avatar — tappable to open camera */}
        <button type="button" className={styles.avatarTap} onClick={() => setShowCamera(true)}>
          {avatarPreview ? (
            <img src={avatarPreview} alt="Profile" className={styles.avatar} style={{ objectFit: 'cover' }} />
          ) : (
            <div className={styles.avatar}>{form.name?.charAt(0) || '?'}</div>
          )}
          <span className={styles.avatarOverlay}>📷</span>
        </button>

        {/* Photo action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCamera(true)}>
            📷 Take Photo
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
            📁 Upload Photo
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Manage your personal information</p>
      </div>

      {/* ===== PROFILE & FOLLOW QR PASS CARD ===== */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid var(--gray-200, #e5e7eb)',
        borderRadius: 16,
        padding: '24px 16px',
        marginBottom: 24,
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--green-700, #15803d)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>
          MY PROFILE & SELLER FOLLOW QR PASS
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900, #111827)', marginBottom: 12 }}>
          {form.name || 'User Profile'}
        </div>
        <div style={{
          background: '#ffffff',
          padding: 16,
          borderRadius: 16,
          display: 'inline-block',
          border: '1px solid var(--gray-200, #e5e7eb)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <QRCode
            value={`${typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'}/u/${user?.id || ''}?ref=${user?.id || ''}&intent=follow`}
            size={160}
            level="M"
          />
        </div>
        <p style={{ fontSize: 12, color: 'var(--gray-600, #4b5563)', marginTop: 12, marginBottom: 12 }}>
          Share or show this QR code to let neighbors follow your profile & install the CasaGrown app!
        </p>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'}/u/${user?.id || ''}?ref=${user?.id || ''}&intent=follow`
            if (navigator.clipboard) {
              navigator.clipboard.writeText(url)
              showToastSuccess('Profile QR link copied to clipboard!')
            }
          }}
        >
          📋 Copy Profile Referral Link
        </button>
      </div>

      {/* Camera → sends to cropper */}
      {showCamera && (
        <CameraCapture
          facingMode="user"
          onClose={() => setShowCamera(false)}
          onCapture={({ file }) => {
            setShowCamera(false)
            const reader = new FileReader()
            reader.onload = (ev) => setCropSrc(ev.target?.result as string)
            reader.readAsDataURL(file)
          }}
        />
      )}

      {/* Image Cropper with circle guide → uploads result */}
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspectRatio={1}
          circleGuide
          onCancel={() => setCropSrc(null)}
          onCrop={async (file) => {
            setCropSrc(null)
            if (!user) return
            const reader = new FileReader()
            reader.onload = (ev) => setAvatarPreview(ev.target?.result as string)
            reader.readAsDataURL(file)
            const path = `${user.id}/avatar.jpg`
            const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
            if (uploadErr) {
              console.warn('Upload failed:', uploadErr.message)
              setError('Photo upload failed: ' + uploadErr.message)
              return
            }
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
            if (urlData?.publicUrl) setAvatarUrl(urlData.publicUrl)
          }}
        />
      )}

      {error && (
        <div style={{
          background: 'var(--red-50)', border: '1px solid var(--red-200)',
          borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16,
          color: 'var(--red-700)', fontSize: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSave} className={styles.form}>
        <div className="form-group">
          <label className="label" htmlFor="name">Full Name</label>
          <input id="name" className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </div>

        {/* Email (Confirm/Change) */}
        <div className="form-group">
          <label className="label" htmlFor="email">Email Address</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              id="email" 
              type="email" 
              className="input" 
              value={form.email} 
              onChange={e => {
                setForm({ ...form, email: e.target.value })
                setEmailError('')
                setEmailSuccess('')
              }}
              disabled={emailVerificationSent || isVerifyingEmail}
            />
            {form.email !== initialEmail && !emailVerificationSent && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', fontSize: '13px' }}
                onClick={async () => {
                  setEmailError('')
                  setEmailSuccess('')
                  if (!form.email.trim()) { setEmailError('Please enter a valid email'); return }
                  setIsVerifyingEmail(true)
                  const { error: sendErr } = await supabase.auth.updateUser({ email: form.email.trim() })
                  setIsVerifyingEmail(false)
                  if (sendErr) {
                    setEmailError(sendErr.message)
                  } else {
                    setEmailVerificationSent(true)
                    setEmailSuccess('Verification code sent to ' + form.email)
                  }
                }}
                disabled={isVerifyingEmail}
              >
                {isVerifyingEmail ? 'Sending...' : 'Verify Code'}
              </button>
            )}
          </div>
          {emailError && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--red-600, #dc2626)' }}>{emailError}</p>}
          {emailSuccess && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--green-600, #16a34a)' }}>{emailSuccess}</p>}
          {form.email !== initialEmail && !emailVerificationSent && (
            <p className="form-helper" style={{ color: '#b45309' }}>
              ⚠️ You must verify your new email address before saving.
            </p>
          )}
        </div>

        {/* Email OTP Verification Inline */}
        {emailVerificationSent && (
          <div className="form-group" style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <label className="label" htmlFor="email-otp">Enter 6-Digit Email Code</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="email-otp"
                type="text"
                maxLength={6}
                className="input"
                placeholder="123456"
                value={emailOtp}
                onChange={e => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '18px' }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  setEmailError('')
                  setEmailSuccess('')
                  if (emailOtp.length < 6) { setEmailError('Please enter the 6-digit code'); return }
                  setIsVerifyingEmail(true)
                  const { error: verifyErr } = await supabase.auth.verifyOtp({
                    email: form.email.trim(),
                    token: emailOtp,
                    type: 'email_change'
                  })
                  setIsVerifyingEmail(false)
                  if (verifyErr) {
                    setEmailError(verifyErr.message)
                  } else {
                    setEmailVerificationSent(false)
                    setInitialEmail(form.email)
                    setEmailOtp('')
                    setEmailSuccess('Email updated and verified successfully!')
                  }
                }}
                disabled={isVerifyingEmail || emailOtp.length < 6}
              >
                {isVerifyingEmail ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
            <button
              type="button"
              className={styles.changeEmail}
              style={{ marginTop: '8px', padding: 0 }}
              onClick={() => {
                setEmailVerificationSent(false)
                setEmailOtp('')
              }}
            >
              Cancel / Edit Email
            </button>
          </div>
        )}

        {/* Phone feature flag check */}
        {process.env.NEXT_PUBLIC_ENABLE_PHONE_VERIFICATION === 'true' && (
          <>
            <div className="divider" />
            <h3 className={styles.sectionTitle}>Phone & Notifications</h3>

            {!isNotificationsEnabled() && (
              <div style={{ background: 'var(--yellow-50)', padding: 16, borderRadius: 12, marginBottom: 16, border: '1px solid var(--yellow-200)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--yellow-900)' }}>🔔 Push Notifications Disabled</h4>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--yellow-800)', lineHeight: 1.4 }}>
                      Turn on push notifications to instantly see when buyers message you or place orders.
                    </p>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => showPrompt(true)} style={{ whiteSpace: 'nowrap' }}>
                    Enable Push
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="label" htmlFor="phone">Phone Number <span style={{fontSize: 12, color: 'var(--gray-500)', fontWeight: 'normal'}}>(for order/payout SMS if push is unavailable)</span></label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  id="phone" 
                  className="input" 
                  value={phone} 
                  onChange={e => { 
                    setPhone(e.target.value)
                    if (e.target.value !== initialPhone) {
                      setPhoneVerified(false)
                      setShowVerify(false)
                    } else if (e.target.value && e.target.value === initialPhone) {
                      setPhoneVerified(true)
                    }
                  }} 
                  placeholder="(555) 000-0000" 
                  disabled={isSendingOtp}
                />
                {phone && !phoneVerified && !showVerify && (
                  <button type="button" className="btn btn-outline" onClick={handleSendOtp} disabled={isSendingOtp}>
                    {isSendingOtp ? 'Sending...' : 'Send Code'}
                  </button>
                )}
                {phoneVerified && <span style={{ color: 'var(--green-600)', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>✓ Verified</span>}
              </div>
              {phoneError && <p className="form-helper" style={{ color: 'var(--red-600)' }}>{phoneError}</p>}
            </div>

            {showVerify && !phoneVerified && (
              <div style={{ background: 'var(--gray-50)', padding: 16, borderRadius: 12, marginBottom: 16, border: '1px solid var(--gray-200)' }}>
                <label className="label" style={{ fontSize: 13, marginBottom: 8 }}>Enter the code sent to {phone}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="123456" maxLength={8} disabled={isVerifyingOtp} />
                  <button type="button" className="btn btn-primary" onClick={handleVerifyPhone} disabled={isVerifyingOtp || verifyCode.length < 4}>
                    {isVerifyingOtp ? 'Checking...' : 'Confirm'}
                  </button>
                </div>
              </div>
            )}

            {process.env.NEXT_PUBLIC_ENABLE_SMS_NOTIFICATIONS === 'true' && (
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input type="checkbox" id="smsEnabled" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label htmlFor="smsEnabled" style={{ fontSize: 13, color: 'var(--gray-700)', cursor: 'pointer', fontWeight: 600 }}>
                    Enable Order SMS Notifications
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
                    By providing your phone number and checking this box, you consent to receive critical transactional SMS notifications (like order updates) from CasaGrown. Reply STOP to cancel. Msg & data rates may apply.
                  </span>
                </div>
              </div>
            )}

            {process.env.NEXT_PUBLIC_ENABLE_SMS_NOTIFICATIONS === 'true' && smsEnabled && twilioBlocked && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 12, borderRadius: 8, marginTop: 12 }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#991b1b', fontSize: 13 }}>⚠️ Carrier Block Detected</p>
                <p style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: 13 }}>
                  You previously replied STOP to our notifications. To resume critical alerts, you must text <b>START</b> to <b>+1 (555) 000-0000</b>.
                </p>
              </div>
            )}
          </>
        )}

        <div className="divider" />
        <h3 className={styles.sectionTitle}>Address</h3>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}
          >
            <label className="label">Address</label>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={geolocating}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--green-600)', fontSize: 13, fontWeight: 600,
                padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {geolocating ? '⏳ Locating...' : '📍 Use My Location'}
            </button>
          </div>
          <AddressInput
            value={{ street: form.street, city: form.city, state: form.state, zip: form.zip }}
            onChange={(val: AddressFields) => {
              setForm(prev => ({ ...prev, street: val.street, city: val.city, state: val.state, zip: val.zip }))
            }}
            placeholderStreet="123 Main St"
          />
          {locationDenied && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#b45309', lineHeight: 1.4 }}>
              {typeof window !== 'undefined' && (window as any).IS_NATIVE_APP ? (
                <>
                  🔒 To enable: open your iOS/Android device <strong>Settings</strong> → <strong>Privacy &amp; Security</strong> → <strong>Location Services</strong> → find <strong>{typeof window !== 'undefined' && (window as any).NATIVE_APP_NAME ? (window as any).NATIVE_APP_NAME : 'CasaGrown'}</strong> → allow <strong>Location</strong> permissions, then restart.
                  <button
                    type="button"
                    onClick={async () => {
                      const { NativeBridge } = await import('../../../lib/nativeBridge')
                      NativeBridge.openAppSettings()
                    }}
                    style={{
                      background: 'none', border: 'none', padding: 0, margin: '4px 0 0',
                      color: '#ea580c', textDecoration: 'underline', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, display: 'block'
                    }}
                  >
                    ⚙️ Open Settings
                  </button>
                </>
              ) : (
                <>🔒 To enable: tap the <strong>lock icon</strong> in your address bar → <strong>Site settings</strong> → allow <strong>Location</strong>, then reload.</>
              )}
            </p>
          )}
        </div>

        {/* ── Business Profile (sellers only) ── */}
        {hasBooth && (
          <>
            <div className="divider" />
            {!showBusiness ? (
              <button
                type="button"
                onClick={() => setShowBusiness(true)}
                style={{
                  width: '100%', padding: '14px 16px', background: 'var(--gray-50, #f9fafb)',
                  border: '1.5px dashed var(--gray-300, #d1d5db)', borderRadius: 12,
                  cursor: 'pointer', fontSize: 14, color: 'var(--gray-600)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                🏢 Add Business Profile <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>(Optional)</span>
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className={styles.sectionTitle}>Business Profile</h3>
                  <button
                    type="button"
                    onClick={() => setShowBusiness(false)}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--gray-400)', cursor: 'pointer' }}
                  >
                    Collapse ▲
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '0 0 14px', lineHeight: 1.4 }}>
                  Optional — adds credibility to your booth. Verified credentials may display as trust badges.
                </p>

                <div className="form-group">
                  <label className="label" htmlFor="farmName">Farm / Business Name</label>
                  <input id="farmName" className="input" value={biz.farmName} onChange={e => setBiz({ ...biz, farmName: e.target.value })} placeholder="e.g., Green Valley Farm" />
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="businessType">Business Type</label>
                  <select id="businessType" className="input" value={biz.businessType} onChange={e => setBiz({ ...biz, businessType: e.target.value })} style={{ appearance: 'auto' }}>
                    <option value="">Select...</option>
                    <option value="hobby_gardener">🌱 Hobby Gardener</option>
                    <option value="small_farm">🚜 Small Farm</option>
                    <option value="cottage_food">🏠 Cottage Food Operation</option>
                    <option value="urban_farm">🏙️ Urban Farm</option>
                    <option value="homestead">🌾 Homestead</option>
                    <option value="community_garden">🌻 Community Garden</option>
                    <option value="gardening_service">🌿 Gardening Service Provider</option>
                    <option value="landscaping_service">🏡 Landscaping Service Provider</option>
                    <option value="commercial">🏢 Commercial / Licensed</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="sellerBio">About / Bio</label>
                  <textarea
                    id="sellerBio"
                    className="input"
                    value={biz.sellerBio}
                    onChange={e => setBiz({ ...biz, sellerBio: e.target.value })}
                    placeholder="Tell buyers about your growing practices, experience, etc."
                    rows={3}
                    style={{ resize: 'vertical', minHeight: 72 }}
                  />
                </div>

                <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid var(--gray-100)' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📄 Licenses & Permits
                  </p>

                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="label" htmlFor="businessLicense" style={{ fontSize: 12 }}>Business License #</label>
                    <input id="businessLicense" className="input" value={biz.businessLicense} onChange={e => setBiz({ ...biz, businessLicense: e.target.value })} placeholder="Optional" style={{ fontSize: 13 }} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="label" htmlFor="foodHandlerPermit" style={{ fontSize: 12 }}>Food Handler Permit #</label>
                    <input id="foodHandlerPermit" className="input" value={biz.foodHandlerPermit} onChange={e => setBiz({ ...biz, foodHandlerPermit: e.target.value })} placeholder="Optional" style={{ fontSize: 13 }} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="label" htmlFor="cottageFoodPermit" style={{ fontSize: 12 }}>Cottage Food Permit #</label>
                    <input id="cottageFoodPermit" className="input" value={biz.cottageFoodPermit} onChange={e => setBiz({ ...biz, cottageFoodPermit: e.target.value })} placeholder="Optional" style={{ fontSize: 13 }} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label" htmlFor="insuranceProvider" style={{ fontSize: 12 }}>Insurance Provider</label>
                    <input id="insuranceProvider" className="input" value={biz.insuranceProvider} onChange={e => setBiz({ ...biz, insuranceProvider: e.target.value })} placeholder="Optional" style={{ fontSize: 13 }} />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }} disabled={saving}>
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Profile'}
        </button>
      </form>



      {/* Delete Account — positioned at the very bottom of the profile page */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--gray-200)' }}>
        <button
          data-testid="delete-account-link"
          className="btn btn-outline"
          style={{
            width: '100%', justifyContent: 'flex-start',
            color: 'var(--red-600)', borderColor: 'var(--red-200)',
          }}
          onClick={() => window.location.assign('/delete-account')}
        >
          🗑️ Delete Account
        </button>
      </div>

      <NotificationPromptModal {...modalProps} />
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ProfilePageInner />
    </Suspense>
  )
}
