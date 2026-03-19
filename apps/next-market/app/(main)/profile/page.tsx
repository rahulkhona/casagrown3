'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'

export default function ProfilePage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    avatarUrl: '',
  })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // Fetch actual profile from Supabase
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('full_name, street_address, city, state_code, zip_plus4, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setForm({
          name: data?.full_name || '',
          email: user.email || '',
          street: data?.street_address || '',
          city: data?.city || '',
          state: data?.state_code || '',
          zip: data?.zip_plus4 || '',
          avatarUrl: data?.avatar_url || '',
        })
        setLoading(false)
      })
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({
        full_name: form.name,
        street_address: form.street,
        city: form.city,
        state_code: form.state,
        zip_plus4: form.zip,
      })
      .eq('id', user.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
        {form.avatarUrl ? (
          <img src={form.avatarUrl} alt="" className={styles.avatar} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div className={styles.avatar}>{form.name?.charAt(0) || '?'}</div>
        )}
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Manage your personal information</p>
      </div>

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

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }}>
          {saved ? '✓ Saved' : 'Save Profile'}
        </button>
      </form>
    </div>
  )
}
