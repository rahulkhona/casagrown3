'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMarket } from '../../../lib/store'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'

interface GrowerProduce {
  id: string
  produce_name: string
  emoji?: string
  notify_on_search: boolean
}

function GrowerSettings({ userId }: { userId: string }) {
  const supabase = createClient()
  const [produces, setProduces] = useState<GrowerProduce[]>([])
  const [loading, setLoading] = useState(true)
  const [customInput, setCustomInput] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('grower_produces')
      .select('id, produce_name, notify_on_search')
      .eq('user_id', userId)
      .order('produce_name')
    setProduces(data || [])
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const addProduce = async () => {
    const trimmed = customInput.trim()
    if (!trimmed) return
    setSaving(true)
    await supabase.from('grower_produces').upsert({
      user_id: userId,
      produce_name: trimmed,
      category: 'other',
      notify_on_search: true,
    }, { onConflict: 'user_id,produce_name' })
    setCustomInput('')
    await load()
    setSaving(false)
  }

  const removeProduce = async (id: string) => {
    await supabase.from('grower_produces').delete().eq('id', id)
    setProduces(prev => prev.filter(p => p.id !== id))
  }

  const toggleNotify = async (id: string, current: boolean) => {
    await supabase.from('grower_produces').update({ notify_on_search: !current }).eq('id', id)
    setProduces(prev => prev.map(p => p.id === id ? { ...p, notify_on_search: !current } : p))
  }

  const allNotify = produces.length > 0 && produces.every(p => p.notify_on_search)
  const noneNotify = produces.every(p => !p.notify_on_search)

  const toggleAll = async () => {
    const newVal = !allNotify
    await supabase.from('grower_produces').update({ notify_on_search: newVal }).eq('user_id', userId)
    setProduces(prev => prev.map(p => ({ ...p, notify_on_search: newVal })))
  }

  if (loading) return <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Loading...</p>

  return (
    <div>
      {/* Current produces */}
      {produces.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {produces.map(p => (
            <span
              key={p.id}
              style={{
                padding: '4px 10px', borderRadius: 14,
                background: p.notify_on_search ? 'var(--green-100)' : 'var(--gray-100)',
                color: p.notify_on_search ? 'var(--green-800)' : 'var(--gray-600)',
                fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              🌱 {p.produce_name}
              <button
                onClick={() => toggleNotify(p.id, p.notify_on_search)}
                title={p.notify_on_search ? 'Notifications on — click to mute' : 'Notifications off — click to enable'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}
              >{p.notify_on_search ? '🔔' : '🔕'}</button>
              <button
                onClick={() => removeProduce(p.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--gray-400)', padding: 0 }}
              >×</button>
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
          You haven&apos;t told us what you grow yet. Add items below!
        </p>
      )}

      {/* Add produce */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={customInput}
          onChange={e => setCustomInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProduce() } }}
          placeholder="Add produce (e.g. Tomatoes)..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: 13 }}
        />
        <button
          onClick={addProduce}
          disabled={!customInput.trim() || saving}
          style={{
            padding: '8px 16px', borderRadius: 8,
            border: '1px solid var(--green-300)', background: 'var(--green-50)',
            color: 'var(--green-700)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            opacity: !customInput.trim() ? 0.4 : 1,
          }}
        >
          + Add
        </button>
      </div>

      {/* Master toggle */}
      {produces.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-600)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={allNotify} onChange={toggleAll} style={{ accentColor: 'var(--green-600)' }} />
            Notify me when neighbors search for what I grow
          </label>
          {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
            <span style={{ fontSize: 11, color: 'var(--orange-600)' }}>⚠️ Browser notifications blocked</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { state, dispatch } = useMarket()
  const router = useRouter()
  const { user } = useAuth()

  return (
    <div className="container-sm">
      <div className="page-header"><h1 className="page-title">Settings</h1></div>

      {/* What I Grow */}
      {user && (
        <div className="card" style={{ padding: 20, marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>🌱 What I Grow</strong>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2, marginBottom: 12 }}>
            Tell your neighbors what you grow. We&apos;ll notify you when someone nearby searches for it.
          </p>
          <GrowerSettings userId={user.id} />
        </div>
      )}

      {/* Push Notifications */}
      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong style={{ fontSize: 15 }}>🔔 Push Notifications</strong>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>Receive alerts for orders, messages, and market openings</p>
          </div>
          <button
            className="switch active"
            onClick={() => dispatch({ type: 'ADD_TOAST', payload: { message: 'Push notifications enabled!', type: 'success' } })}
          />
        </div>
      </div>

      {/* PWA Install */}
      {typeof window !== 'undefined' && !window.IS_NATIVE_APP && (
        <div className="card" style={{ padding: 20, marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>📱 Install App</strong>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2, marginBottom: 12 }}>
            Add CasaGrown Market to your home screen for the best experience.
          </p>
          <div style={{ fontSize: 13, color: 'var(--gray-600)', background: 'var(--gray-50)', padding: 14, borderRadius: 'var(--radius-lg)', lineHeight: 1.7 }}>
            <strong>iOS:</strong> Tap the Share button → &quot;Add to Home Screen&quot;<br />
            <strong>Android:</strong> Tap the ⋮ menu → &quot;Install app&quot;<br />
            <strong>Desktop:</strong> Click the install icon in the address bar
          </div>
        </div>
      )}

      {/* Account */}
      <div className="card" style={{ padding: 20, marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>👤 Account</strong>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => router.push('/profile-setup')}>
            ✏️ Edit Profile
          </button>
          {state.isAuthenticated && (
            <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => {
              dispatch({ type: 'LOGOUT' })
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Logged out', type: 'info' } })
              router.push('/')
            }}>
              🚪 Log Out
            </button>
          )}
        </div>
      </div>

      {/* Legal */}
      <div className="card" style={{ padding: 20, marginBottom: 40 }}>
        <strong style={{ fontSize: 15 }}>📄 Legal</strong>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--gray-500)', padding: '8px 0' }}>Terms of Service</span>
          <span style={{ fontSize: 13, color: 'var(--gray-500)', padding: '8px 0' }}>Privacy Policy</span>
          <span style={{ fontSize: 13, color: 'var(--gray-500)', padding: '8px 0' }}>Community Guidelines</span>
        </div>
      </div>
    </div>
  )
}
