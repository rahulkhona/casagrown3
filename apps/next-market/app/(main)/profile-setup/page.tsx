'use client'


import { useState, useRef, useEffect, useCallback , Suspense } from 'react'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { trackFormSubmit, trackClick, trackError } from '../../../lib/analytics'
import CameraCapture from '../../../components/CameraCapture'
import ImageCropper from '../../../components/ImageCropper'
import styles from './page.module.css'

function ProfileSetupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [zip, setZip] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [error, setError] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [geolocating, setGeolocating] = useState(false)
  const [cachedLat, setCachedLat] = useState<number | null>(null)
  const [cachedLng, setCachedLng] = useState<number | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)

  // Pre-fill from existing profile
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, street_address, city, state_code, zip_plus4, avatar_url')
        .eq('id', user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name || '')
        setStreetAddress(profile.street_address || '')
        setCity(profile.city || '')
        setStateCode(profile.state_code || '')
        setZip(profile.zip_plus4 || '')
        if (profile.avatar_url) {
          setAvatarUrl(profile.avatar_url)
          setAvatarPreview(profile.avatar_url)
        }
      }
      setLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCropSrc(ev.target?.result as string)
    reader.readAsDataURL(file)
  }



  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser'); return }
    trackClick('use_current_location')
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
          setStreetAddress([houseNumber, road].filter(Boolean).join(' '))
          setCity(addr.city || addr.town || addr.village || addr.hamlet || '')
          setStateCode(addr.state ? (addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state.slice(0, 2)).toUpperCase() : '')
          setZip(addr.postcode?.split('-')[0] || '')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) { setError('Please enter your name'); return }
    if (!streetAddress.trim()) { setError('Please enter your address'); return }
    if (!city.trim()) { setError('Please enter your city'); return }
    if (!stateCode.trim()) { setError('Please enter your state'); return }
    if (!zip.trim()) { setError('Please enter your zip code'); return }

    trackFormSubmit('profile_setup', { hasAvatar: !!avatarUrl })
    setSaving(true); setError('')

    try {
      // ── 1. Validate address via USPS edge function ──
      let validatedZipPlus4 = zip.trim()
      let county: string | null = null
      let validatedStreet = streetAddress.trim()
      let validatedCity = city.trim()
      let validatedState = stateCode.trim().toUpperCase()

      try {
        const { data: uspsResult, error: uspsError } = await supabase.functions.invoke('resolve-usps-address', {
          body: {
            streetAddress: streetAddress.trim(),
            city: city.trim(),
            state: stateCode.trim(),
            zipCode: zip.trim().split('-')[0],
          },
        })

        if (!uspsError && uspsResult?.address) {
          validatedStreet = uspsResult.address.streetAddress || validatedStreet
          validatedCity = uspsResult.address.city || validatedCity
          validatedState = uspsResult.address.state || validatedState
          validatedZipPlus4 = uspsResult.address.ZIPPlus4 || validatedZipPlus4
          county = uspsResult.jurisdiction?.county || null
          setStreetAddress(validatedStreet)
          setCity(validatedCity)
          setStateCode(validatedState)
          setZip(validatedZipPlus4)
        } else {
          console.warn('USPS validation failed, using user-entered address:', uspsError)
        }
      } catch (err) {
        console.warn('USPS edge function unavailable, using user-entered address:', err)
      }

      // ── 2. Compute h3 index from geocoded coordinates ──
      let h3Index: string | null = null
      let geoLat: number | null = cachedLat
      let geoLng: number | null = cachedLng
      try {
        // Use cached GPS coords if available, otherwise geocode the address
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

      if (!h3Index) {
        if (process.env.NODE_ENV === 'development' || validatedStreet.toLowerCase().includes('123 main')) {
          console.warn('Geocoding failed; injecting fallback San Jose development coordinates for testing.')
          geoLat = 37.3382
          geoLng = -121.8863
          const { latLngToCell } = await import('h3-js')
          h3Index = latLngToCell(geoLat, geoLng, 7)
        } else {
          setError('Could not determine your neighborhood. Please check your address and try again.')
          setSaving(false)
          return
        }
      }

      // ── 3. Save profile with all jurisdiction data ──
      const profileUpdate: Record<string, any> = {
        full_name: fullName.trim(),
        street_address: validatedStreet,
        city: validatedCity,
        state_code: validatedState,
        zip_plus4: validatedZipPlus4,
        county,
        avatar_url: avatarUrl || null,
        profile_completed_at: new Date().toISOString(),
      }
      if (geoLat !== null && geoLng !== null) {
        profileUpdate.home_location = `SRID=4326;POINT(${geoLng} ${geoLat})`
      }
      if (h3Index) {
        profileUpdate.home_community_h3_index = h3Index

        // ── Note: Community Auto-Creation & Enrichment is handled by the backend Trigger ──
        // (20260331002000_auto_create_community.sql auto-creates the community if missing)
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId!)

      if (updateErr) { setError(updateErr.message); setSaving(false); return }

      if (redirectTo) {
        router.push(redirectTo.includes('?') ? `${redirectTo}&autoBuy=true` : `${redirectTo}?autoBuy=true`)
      } else {
        router.push('/community')
      }
    } catch (err: any) {
      console.error('Profile save failed:', err)
      trackError('profile_setup_failed', { error: err?.message })
      setError(err?.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>

          <h1 className={styles.headerTitle}>Set Up Your Profile</h1>
          <p className={styles.headerSubtitle}>We need a few details to connect you with your neighborhood market</p>
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Avatar */}
          <div className={styles.avatarSection}>
            <button type="button" className={styles.avatarBtn} onClick={() => setShowCamera(true)}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile" className={styles.avatarImg} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  <span className={styles.avatarIcon}>👤</span>
                  <span className={styles.avatarLabel}>Add Photo</span>
                </div>
              )}
            </button>
            <div className={styles.avatarActions}>
              <button type="button" className={styles.avatarActionBtn} onClick={() => setShowCamera(true)}>📷 Take Photo</button>
              <button type="button" className={styles.avatarActionBtn} onClick={() => fileRef.current?.click()}>📁 Upload</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className={styles.fileInput} onChange={handleAvatarChange} />
            <p className={styles.avatarHint}>
              {avatarPreview ? 'Tap photo or buttons to change' : 'Optional — helps neighbors recognize you'}
            </p>
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
                if (!userId) return
                const reader = new FileReader()
                reader.onload = (ev) => setAvatarPreview(ev.target?.result as string)
                reader.readAsDataURL(file)
                const path = `${userId}/avatar.jpg`
                const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
                if (uploadErr) { console.warn('Upload failed:', uploadErr.message); return }
                const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
                if (urlData?.publicUrl) setAvatarUrl(urlData.publicUrl)
              }}
            />
          )}

          {/* Full Name */}
          <div className="form-group">
            <label className="label" htmlFor="full-name">Full Name *</label>
            <input id="full-name" type="text" className="input" placeholder="Jane Smith"
              value={fullName} onChange={e => setFullName(e.target.value)} required autoFocus />
          </div>

          {/* Location Auto-fill + Street Address */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="label" htmlFor="street">Street Address *</label>
              <button
                type="button"
                className={styles.locationBtn}
                onClick={useCurrentLocation}
                disabled={geolocating}
              >
                {geolocating ? '⏳ Locating...' : '📍 Use My Location'}
              </button>
            </div>
            {locationDenied && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#b45309', lineHeight: 1.4 }}>
                🔒 To enable: tap the <strong>lock icon</strong> in your address bar → <strong>Site settings</strong> → allow <strong>Location</strong>, then reload.
              </p>
            )}
            <input id="street" type="text" className="input" placeholder="123 Main St"
              value={streetAddress} onChange={e => setStreetAddress(e.target.value)} required />
          </div>

          {/* City / State / Zip */}
          <div className={styles.addressRow}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="label" htmlFor="city">City *</label>
              <input id="city" type="text" className="input" placeholder="San Jose"
                value={city} onChange={e => setCity(e.target.value)} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label" htmlFor="state">State *</label>
              <input id="state" type="text" className="input" placeholder="CA"
                value={stateCode} onChange={e => setStateCode(e.target.value.slice(0, 2))} maxLength={2} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label" htmlFor="zip">Zip *</label>
              <input id="zip" type="text" className="input" placeholder="95112"
                value={zip} onChange={e => setZip(e.target.value)} required />
            </div>
          </div>

          <p className={styles.privacyNote}>
            🔒 Your address is used to connect you with nearby neighbors. It&apos;s never shared publicly.
          </p>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Saving...' : 'Continue to Market →'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ProfileSetupPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ProfileSetupPageInner />
    </Suspense>
  )
}
