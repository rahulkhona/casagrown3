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
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          full_name: form.name,
          street_address: form.street,
          city: form.city,
          state_code: form.state,
          zip_plus4: form.zip,
          avatar_url: avatarUrl || null,
        })
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
            const path = `${user.id}.jpg`
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
          <label className="label" htmlFor="street">Street</label>
          <input id="street" className="input" value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} placeholder="123 Main St" />
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
