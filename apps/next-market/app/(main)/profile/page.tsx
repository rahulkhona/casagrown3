'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import CameraCapture from '../../../components/CameraCapture'
import ImageCropper from '../../../components/ImageCropper'
import AddressInput from '../../components/AddressInput'
import type { AddressFields } from '../../../lib/address'
import { useNotificationPrompt, isNotificationsEnabled } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../components/NotificationPromptModal'
import { useSubscription } from '../../../lib/useSubscription'
import { UpgradePrompt } from '../../components/UpgradePrompt'
import { ProCarousel } from '../../components/ProCarousel'
import { useErrorToast } from '../../components/ErrorToast'
import { useProEnabled } from '../../../lib/useProEnabled'
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

  // Pro interest checkbox
  const [proInterest, setProInterest] = useState(false)
  const [proEmailSending, setProEmailSending] = useState(false)
  const { showSuccess: showToastSuccess } = useErrorToast()

  // Fetch actual profile from Supabase
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('full_name, street_address, city, state_code, zip_code, zip_plus4, avatar_url, phone_number, phone_verified, sms_enabled, twilio_blocked')
      .eq('id', user.id)
      .single()
      .then(({ data, error: fetchErr }) => {
        if (fetchErr) console.warn('Profile fetch error:', fetchErr.message)
        setForm({
          name: data?.full_name || '',
          email: user.email || '',
          street: data?.street_address || '',
          city: data?.city || '',
          state: data?.state_code || '',
          zip: data?.zip_code || (data?.zip_plus4 ? data.zip_plus4.split('-')[0] : ''),
        })
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
        setLoading(false)
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

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
      let validatedState = form.state.trim().toUpperCase()
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
            validatedState = uspsResult.address.state || validatedState
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
        sms_enabled: smsEnabled
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

      // Send Pro interest email if checkbox is checked (after successful save)
      if (proInterest) {
        console.log('[Pro Interest] Sending pro interest email...')
        try {
          const { error: fnError } = await supabase.functions.invoke('send-pro-interest-email', { body: {} })
          if (fnError) {
            console.error('[Pro Interest] Edge function error:', fnError)
          } else {
            console.log('[Pro Interest] Email sent successfully')
            showToastSuccess('📧 Check your email for details about CasaGrown Pro!')
            setProInterest(false)
          }
        } catch (err) {
          console.error('[Pro Interest] Failed to invoke function:', err)
        }
      }
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
  const proEnabled = useProEnabled()

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

        <div className="form-group">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" value={form.email} disabled style={{ background: 'var(--gray-50)' }} />
          <p className="form-helper">Email cannot be changed</p>
        </div>

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

        {/* ── My Plan / Upgrade ── */}
        {proEnabled && (
          <div id="my-plan" style={{ marginTop: 16 }}>
            <div className="divider" />
            <PlanSection proInterest={proInterest} setProInterest={setProInterest} />
          </div>
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

/** Plan section — shows Pro badge or upgrade prompt */
function PlanSection({ proInterest, setProInterest }: { proInterest: boolean; setProInterest: (v: boolean) => void }) {
  const { plan, isPro, status, trialEndsAt, currentPeriodEnd, canceledAt } = useSubscription()
  const { user, profileComplete } = useAuth()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { showSuccess } = useErrorToast()
  const [sendingLink, setSendingLink] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  const handleSendLink = async () => {
    setSendingLink(true)
    try {
      await supabase.functions.invoke('send-pro-interest-email', { body: {} })
      setLinkSent(true)
      showSuccess('📧 Details sent — check your inbox!')
    } catch {
      // Silently fail
    } finally {
      setSendingLink(false)
    }
  }

  const isCancelPending = isPro && !!canceledAt

  const handleCancelPro = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'cancel' },
      })
      if (error) throw error
      setShowConfirm(false)
      window.location.reload()
    } catch (err) {
      console.error('Cancel failed:', err)
      setLoading(false)
      setShowConfirm(false)
    }
  }

  const handleResumePro = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'resume' },
      })
      if (error) throw error
      window.location.reload()
    } catch (err) {
      console.error('Resume failed:', err)
      setLoading(false)
    }
  }

  if (isPro) {
    return (
      <>
      <h3 className={styles.sectionTitle}>My Plan</h3>
      <div style={{
        background: isCancelPending
          ? 'linear-gradient(135deg, #92400e, #b45309)'
          : 'linear-gradient(135deg, #065f46, #059669)',
        borderRadius: 12, padding: 16, color: 'white',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700 }}>🚜 CasaGrown Pro</span>
            <span style={{
              marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.2)',
            }}>
              {isCancelPending
                ? '⏳ Cancels soon'
                : status === 'trialing' ? '🎉 Trial' : '✓ Active'}
            </span>
          </div>
          {isCancelPending ? (
            <button
              onClick={handleResumePro}
              disabled={loading}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: 'white', color: '#065f46',
                fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Resuming...' : '↩ Resume Pro'}
            </button>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading}
              style={{
                padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                fontSize: 12, cursor: loading ? 'wait' : 'pointer',
              }}
            >
              Cancel Pro
            </button>
          )}
        </div>

        {/* Status info */}
        {isCancelPending && currentPeriodEnd && (
          <div style={{
            margin: '12px 0 0', padding: '12px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.15)', fontSize: 13,
          }}>
            <div style={{ marginBottom: 6 }}>
              ⚠️ Your Pro subscription will <strong>permanently cancel on {new Date(currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>
              After that date, Pro features will be disabled and you'll need to sign up again to re-activate.
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Changed your mind? Click <strong>"↩ Resume Pro"</strong> above to keep your subscription going.
            </div>
          </div>
        )}
        {!isCancelPending && status === 'trialing' && trialEndsAt && (
          <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
            Trial ends {new Date(trialEndsAt).toLocaleDateString()}
          </p>
        )}
        {!isCancelPending && currentPeriodEnd && status === 'active' && (
          <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
            Next billing: {new Date(currentPeriodEnd).toLocaleDateString()}
          </p>
        )}

        {/* Manage link */}
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <a href="/pro-manage" style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', textDecoration: 'underline' }}>
            Manage your Pro subscription →
          </a>
        </div>
      </div>

      {/* Styled cancel confirmation */}
      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', padding: 16,
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={() => setShowConfirm(false)}
        >
          <div
            style={{
              background: 'white', borderRadius: 20, padding: '28px 24px',
              maxWidth: 360, width: '100%', textAlign: 'center',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              animation: 'slideUp 0.3s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
              background: '#fef2f2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 28,
            }}>
              😢
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>
              Cancel CasaGrown Pro?
            </h3>
            <div style={{
              textAlign: 'left', fontSize: 13, color: '#6b7280', lineHeight: 1.6,
              margin: '16px 0', padding: '12px 16px',
              background: '#f9fafb', borderRadius: 12,
            }}>
              <div style={{ marginBottom: 6 }}>✓ Pro features stay active until your billing period ends</div>
              <div style={{ marginBottom: 6 }}>✓ You can resume anytime before the period ends</div>
              <div>✓ Full refund available within the first 7 days</div>
            </div>
            <button
              onClick={handleCancelPro}
              disabled={loading}
              style={{
                width: '100%', padding: 14, border: 'none', borderRadius: 9999,
                background: '#dc2626', color: 'white', fontSize: 15, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
                marginBottom: 8,
              }}
            >
              {loading ? 'Cancelling...' : 'Yes, Cancel Pro'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{
                width: '100%', padding: 10, border: 'none', borderRadius: 9999,
                background: 'transparent', color: '#9ca3af', fontSize: 13,
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              Never mind, keep Pro
            </button>
          </div>
        </div>
      )}
      </>
    )
  }

  if (!profileComplete) {
    return (
      <>
        <h3 className={styles.sectionTitle}>Grow your business with CasaGrown Pro</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
          Unlock powerful growth tools to scale your produce sales:
        </p>
        <ProCarousel compact />

        {/* Interest checkbox — triggers email on next profile save */}
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          marginTop: 16, padding: '14px 16px', borderRadius: 12,
          background: 'var(--green-50, #f0fdf4)', border: '1px solid var(--green-200, #bbf7d0)',
          cursor: 'pointer', fontSize: 14, color: 'var(--gray-700, #374151)',
          lineHeight: 1.5,
        }}>
          <input
            type="checkbox"
            checked={proInterest}
            onChange={e => setProInterest(e.target.checked)}
            style={{ marginTop: 3, width: 18, height: 18, accentColor: '#059669', flexShrink: 0 }}
          />
          <span>
            ✉️ Send me details about CasaGrown Pro features and pricing
            <span style={{ display: 'block', fontSize: 12, color: 'var(--gray-500, #6b7280)', marginTop: 2 }}>
              Check this box and save your profile to receive an email with everything you need to know about Pro.
            </span>
          </span>
        </label>
      </>
    )
  }

  // When profileComplete is true, render a beautiful green container with the activation email trigger
  return (
    <>
      <h3 className={styles.sectionTitle}>CasaGrown Pro</h3>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        marginTop: 16,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--green-50, #f0fdf4)',
        border: '1px solid var(--green-200, #bbf7d0)',
      }}>
        <span style={{ fontSize: 20, marginTop: 2, flexShrink: 0 }}>✉️</span>
        <div style={{ flex: 1 }}>
          <button
            type="button"
            disabled={sendingLink || linkSent}
            onClick={handleSendLink}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--green-700)',
              cursor: sendingLink || linkSent ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              textDecoration: linkSent ? 'none' : 'underline',
              display: 'block',
            }}
          >
            {sendingLink ? (
              <>⏳ Sending details...</>
            ) : linkSent ? (
              <>✅ Details sent — check your inbox!</>
            ) : (
              <>Send me details about CasaGrown Pro features & pricing</>
            )}
          </button>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--gray-500, #6b7280)', marginTop: 4, lineHeight: 1.4 }}>
            Click above to receive an email with everything you need to know about Pro features, pricing, and onboarding support.
          </span>
        </div>
      </div>
    </>
  )
}



export default function ProfilePage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ProfilePageInner />
    </Suspense>
  )
}
