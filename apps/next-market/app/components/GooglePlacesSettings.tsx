'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

/**
 * GooglePlacesSettings — Elite-only Google Business Profile connection & sync controls.
 * Reads from `seller_google_connections` table.
 */
export function GooglePlacesSettings() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('seller_google_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }: { data: any }) => {
        setConnection(data)
        setLoading(false)
      })
  }, [user])

  const isConnected = !!connection?.google_location_id

  const handleConnect = async () => {
    setConnecting(true)
    setConnectError('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke(
        'connect-google',
        { body: { return_path: '/pro-manage' } },
      )
      if (error) {
        console.error('Google connect error:', error)
        setConnectError('Failed to start Google connection. Please try again.')
        setConnecting(false)
        return
      }
      if (data?.url) {
        window.location.href = data.url
      } else {
        setConnectError('Could not generate Google login URL.')
        setConnecting(false)
      }
    } catch (err: any) {
      console.error('Google connect error:', err)
      setConnectError(err.message || 'Something went wrong.')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Business Profile? Your syncing and auto-posting will stop.'))
      return
    setDisconnecting(true)
    const supabase = createClient()
    await supabase
      .from('seller_google_connections')
      .delete()
      .eq('user_id', user!.id)
    setConnection(null)
    setDisconnecting(false)
  }

  const handleToggle = async (field: string, currentValue: boolean) => {
    const newValue = !currentValue
    setSavingField(field)
    setConnection((prev: any) => ({ ...prev, [field]: newValue }))
    const supabase = createClient()
    await supabase
      .from('seller_google_connections')
      .update({ [field]: newValue })
      .eq('user_id', user!.id)
    setSavingField(null)
  }

  if (loading) {
    return (
      <div style={{ padding: 12, color: '#9ca3af', fontSize: 14 }}>
        Loading…
      </div>
    )
  }

  if (!connection || !isConnected) {
    return (
      <div
        style={{
          border: '1px dashed #d1d5db',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            fontSize: 14,
            color: '#6b7280',
          }}
        >
          Connect your Google Business Profile to sync products and auto-post
          daily specials to Google Maps.
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleConnect()
          }}
          disabled={connecting}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#4285f4',
            color: 'white',
            fontWeight: 600,
            fontSize: 14,
            cursor: connecting ? 'wait' : 'pointer',
            opacity: connecting ? 0.7 : 1,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {connecting ? '🔗 Connecting…' : '🔗 Connect Google Business'}
        </button>
        {connectError && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>
            ⚠️ {connectError}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
      }}
    >
      {/* Connection header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {connection.google_location_name || 'Google Business'}
          </span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              background: '#dcfce7',
              color: '#15803d',
            }}
          >
            ✓ Connected
          </span>
        </div>
      </div>

      {/* Toggle controls */}
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          {
            field: 'auto_sync_catalog',
            label: '📦 Sync products to Google Business catalog',
            description:
              'Automatically keep your Google Business product catalog in sync with your CasaGrown inventory.',
            testId: 'toggle-google-sync',
          },
          {
            field: 'auto_post_specials',
            label: '📣 Post daily specials to Google Maps',
            description:
              'GrowBot will automatically publish your daily specials as Google Business posts visible on Maps and Search.',
            testId: 'toggle-google-post',
          },
        ].map(({ field, label, description, testId }) => (
          <div
            key={field}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <button
              type="button"
              role="switch"
              aria-checked={!!connection[field]}
              data-testid={testId}
              onClick={() => handleToggle(field, !!connection[field])}
              style={{
                position: 'relative',
                width: 44,
                height: 24,
                borderRadius: 12,
                border: 'none',
                background: connection[field] ? '#22c55e' : '#d1d5db',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background 0.2s',
                padding: 0,
                marginTop: 1,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: connection[field] ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }}
              />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                {label}
                {savingField === field && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: '#9ca3af',
                    }}
                  >
                    Saving…
                  </span>
                )}
              </div>
              {description && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {description}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Disconnect button */}
      <div style={{ marginTop: 16 }}>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #fecaca',
            background: 'white',
            color: '#dc2626',
            fontSize: 13,
            cursor: disconnecting ? 'wait' : 'pointer',
          }}
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  )
}
