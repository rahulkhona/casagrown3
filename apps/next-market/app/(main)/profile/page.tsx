'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import CameraCapture from '../../../components/CameraCapture'
import ImageCropper from '../../../components/ImageCropper'
import styles from './page.module.css'

export default function ProfilePage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

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

  // Camera & Cropper
  const [showCamera, setShowCamera] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // Fetch actual profile from Supabase
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('full_name, street_address, city, state_code, zip_plus4, avatar_url')
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
          zip: data?.zip_plus4 || '',
        })
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url)
          setAvatarPreview(data.avatar_url)
        }
        setLoading(false)
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setSaving(true)
    setError('')

    try {
      // Geocode address to compute H3 community index
      let h3Index: string | null = null
      let geoLat: number | null = cachedLat
      let geoLng: number | null = cachedLng
      
      if (form.street && form.city && form.state) {
        try {
          if (!geoLat || !geoLng) {
            const { geocodeAddress } = await import('../../../lib/geocode')
            const geo = await geocodeAddress(`${form.street}, ${form.city}, ${form.state} ${form.zip?.split('-')[0] || ''}`)
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

      const profileUpdate: Record<string, any> = {
        full_name: form.name,
        street_address: form.street,
        city: form.city,
        state_code: form.state,
        zip_plus4: form.zip,
        avatar_url: avatarUrl || null,
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

        <div className="divider" />
        <h3 className={styles.sectionTitle}>Address</h3>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="label" htmlFor="street">Street</label>
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
          <input id="street" className="input" value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} placeholder="123 Main St" />
          {locationDenied && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#b45309', lineHeight: 1.4 }}>
              🔒 To enable: tap the <strong>lock icon</strong> in your address bar → <strong>Site settings</strong> → allow <strong>Location</strong>, then reload.
            </p>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="label" htmlFor="city">City</label>
            <input id="city" className="input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="San Jose" />
          </div>
          <div className="form-group" style={{ maxWidth: 100 }}>
            <label className="label" htmlFor="state">State</label>
            <input id="state" className="input" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="CA" maxLength={2} />
          </div>
          <div className="form-group" style={{ maxWidth: 120 }}>
            <label className="label" htmlFor="zip">ZIP</label>
            <input id="zip" className="input" value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="95112" maxLength={10} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} disabled={saving}>
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Profile'}
        </button>
      </form>
    </div>
  )
}
