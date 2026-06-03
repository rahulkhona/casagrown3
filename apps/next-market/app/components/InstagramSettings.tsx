'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

/**
 * InstagramSettings — Elite-only Instagram Business settings.
 * Instagram connects via the same Facebook OAuth flow.
 * Controls: posting, video posts.
 */
export function InstagramSettings() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [savingField, setSavingField] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('seller_fb_connections')
      .select('ig_business_account_id, ig_username, ig_auto_post_enabled, ig_messenger_enabled, ig_video_posts_enabled, auto_sync_enabled, status')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        setConnection(data)
        setLoading(false)
      })
  }, [user])

  const isConnected = !!connection?.ig_business_account_id

  const handleToggle = async (field: string, currentValue: boolean) => {
    if (!isConnected) return
    const newValue = !currentValue
    setSavingField(field)
    setConnection((prev: any) => ({ ...prev, [field]: newValue }))
    const supabase = createClient()
    await supabase
      .from('seller_fb_connections')
      .update({ [field]: newValue })
      .eq('user_id', user!.id)
    setSavingField(null)
  }

  const renderToggle = (field: string, label: string, description: string, disabled?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: disabled ? 0.5 : 1 }}>
      <button
        type="button" role="switch" aria-checked={!!connection?.[field]}
        onClick={() => !disabled && handleToggle(field, !!connection?.[field])}
        style={{
          position: 'relative', width: 44, height: 24, borderRadius: 12,
          border: 'none', background: connection?.[field] ? '#22c55e' : '#d1d5db',
          cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
          transition: 'background 0.2s', padding: 0, marginTop: 1,
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: connection?.[field] ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
        }} />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
          {label}
          {savingField === field && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af' }}>Saving…</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{description}</div>
      </div>
    </div>
  )

  if (loading) {
    return <div style={{ padding: 12, color: '#9ca3af', fontSize: 14 }}>Loading...</div>
  }

  // Not connected
  if (!isConnected) {
    return (
      <div style={{ border: '1px dashed #d1d5db', borderRadius: 12, padding: 20, textAlign: 'center' }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6b7280' }}>
          Instagram Business accounts are linked through your Facebook Page.
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
          Connect your Facebook Page first — your Instagram will be detected automatically.
        </p>
      </div>
    )
  }

  // Connected
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>@{connection.ig_username || 'Instagram'}</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#15803d' }}>
          ✓ Connected
        </span>
      </div>

      {/* Feature toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Daily Posting */}
        {renderToggle('ig_auto_post_enabled', '📣 Post daily listings to Instagram', 'GrowBot will post a daily update of your available products to your Instagram Business account.')}

        {/* Video Posts — nested under posting */}
        {connection.ig_auto_post_enabled && (
          <div style={{ marginLeft: 54 }}>
            {renderToggle('ig_video_posts_enabled', '🎬 Include video posts', 'Generate engaging AI video Reels from your product photos alongside regular posts.')}
          </div>
        )}
      </div>
    </div>
  )
}
