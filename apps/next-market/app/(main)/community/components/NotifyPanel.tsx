'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../../../../lib/supabase'
import styles from '../page.module.css'

interface NotifyPanelProps {
  userId: string
  onClose: () => void
}

interface GrowerProduce {
  id: string
  produce_name: string
  notify_on_search: boolean
}

export default function NotifyPanel({ userId, onClose }: NotifyPanelProps) {
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

  return (
    <div className={styles.findPanel}>
      {/* Header */}
      <div className={styles.findHeader}>
        <button className={styles.findCloseBtn} onClick={onClose}>←</button>
        <h3 className={styles.findTitle}>🔔 Notify Me</h3>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--gray-600)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Tell us what you grow. When a neighbor searches for it and you don&apos;t have an active listing, we&apos;ll send you a notification so you can list it.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Loading...</p>
        ) : (
          <>
            {/* Current produces */}
            {produces.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {produces.map(p => (
                  <span
                    key={p.id}
                    style={{
                      padding: '5px 12px', borderRadius: 16,
                      background: p.notify_on_search ? 'var(--green-100)' : 'var(--gray-100)',
                      color: p.notify_on_search ? 'var(--green-800)' : 'var(--gray-500)',
                      fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    🌱 {p.produce_name}
                    <button
                      onClick={() => toggleNotify(p.id, p.notify_on_search)}
                      title={p.notify_on_search ? 'Notifications on' : 'Notifications off'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >{p.notify_on_search ? '🔔' : '🔕'}</button>
                    <button
                      onClick={() => removeProduce(p.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--gray-400)', padding: 0 }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            {produces.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-500)' }}>
                <span style={{ fontSize: 32 }}>🌱</span>
                <p style={{ fontSize: 13, marginTop: 8 }}>No produces added yet. Start typing below!</p>
              </div>
            )}

            {/* Add input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProduce() } }}
                placeholder="Add what you grow (e.g. Tomatoes)..."
                autoFocus
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--gray-300)', fontSize: 14,
                }}
              />
              <button
                onClick={addProduce}
                disabled={!customInput.trim() || saving}
                style={{
                  padding: '10px 18px', borderRadius: 10,
                  border: 'none', background: 'var(--green-600)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: !customInput.trim() ? 0.4 : 1,
                }}
              >
                {saving ? '...' : '+ Add'}
              </button>
            </div>

            {/* Permission warning */}
            {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
              <div style={{
                marginTop: 12, padding: 10, borderRadius: 8,
                background: '#fef3c7', border: '1px solid #f59e0b',
                fontSize: 12, color: '#92400e',
              }}>
                ⚠️ Push notifications are blocked in your browser. To receive alerts, enable them in your browser settings.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
