'use client'

import { useState } from 'react'
import { useMarket } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'

export default function ProfilePage() {
  const { state, dispatch } = useMarket()
  const [form, setForm] = useState({
    name: state.user?.name || '',
    email: state.user?.email || '',
    phone: state.user?.phone || '',
    street: state.user?.address?.street || '',
    city: state.user?.address?.city || '',
    state: state.user?.address?.state || '',
    zip: state.user?.address?.zip || '',
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    dispatch({
      type: 'UPDATE_PROFILE',
      payload: {
        name: form.name,
        phone: form.phone,
        address: { street: form.street, city: form.city, state: form.state, zip: form.zip },
      },
    })
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Profile updated!', type: 'success' } })
  }

  const { isAuthenticated, loading: authLoading } = useAuth()

  if (authLoading) return <div className="container-sm" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>

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
        <div className={styles.avatar}>{state.user?.name?.charAt(0)}</div>
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

        <div className="form-group">
          <label className="label" htmlFor="phone">Phone Number</label>
          <div className={styles.phoneRow}>
            <input id="phone" className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: 'ADD_TOAST', payload: { message: 'Phone verified! ✓', type: 'success' } })}>
              Verify
            </button>
          </div>
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
            <input id="zip" className="input" value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="95112" maxLength={5} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }}>
          Save Profile
        </button>
      </form>
    </div>
  )
}
