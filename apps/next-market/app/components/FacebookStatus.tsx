'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

/**
 * FacebookStatus — Shows Facebook connection state and sync controls.
 * Used on profile page (gated behind ProGate).
 */
export function FacebookStatus() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('seller_fb_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setConnection(data)
        setLoading(false)
      })
  }, [user])

  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  const handleConnect = async () => {
    setConnecting(true)
    setConnectError('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke(
        'connect-facebook',
        { body: { return_path: window.location.pathname + window.location.search } },
      )
      if (error) {
        console.error('Facebook connect error:', error)
        setConnectError('Failed to start Facebook connection. Please try again.')
        setConnecting(false)
        return
      }
      if (data?.url) {
        window.location.href = data.url
      } else {
        setConnectError('Could not generate Facebook login URL.')
        setConnecting(false)
      }
    } catch (err: any) {
      console.error('Facebook connect error:', err)
      setConnectError(err.message || 'Something went wrong.')
      setConnecting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    const supabase = createClient()
    await supabase.functions.invoke('sync-facebook-catalog', {
      body: { user_id: user?.id },
    })
    // Refresh connection status
    const { data } = await supabase
      .from('seller_fb_connections')
      .select('*')
      .eq('user_id', user!.id)
      .single()
    setConnection(data)
    setSyncing(false)
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Facebook? Your catalogs will stop syncing.'))
      return
    setDisconnecting(true)
    const supabase = createClient()
    await supabase
      .from('seller_fb_connections')
      .update({ status: 'disconnected', auto_sync_enabled: false })
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
      .from('seller_fb_connections')
      .update({ [field]: newValue })
      .eq('user_id', user!.id)
    setSavingField(null)
  }

  if (loading) {
    return (
      <div style={{ padding: 12, color: '#9ca3af', fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  if (!connection || connection.status === 'disconnected') {
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
          Connect your Facebook Page to sync your product catalog
          automatically.
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
            background: '#1877f2',
            color: 'white',
            fontWeight: 600,
            fontSize: 14,
            cursor: connecting ? 'wait' : 'pointer',
            opacity: connecting ? 0.7 : 1,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {connecting ? '🔗 Connecting...' : '🔗 Connect Facebook'}
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            📘 {connection.fb_page_name || 'Facebook Page'}
          </span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              background:
                connection.status === 'connected'
                  ? '#dcfce7'
                  : '#fee2e2',
              color:
                connection.status === 'connected'
                  ? '#15803d'
                  : '#dc2626',
            }}
          >
            {connection.status === 'connected'
              ? '✓ Connected'
              : '⚠ ' + connection.status}
          </span>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#6b7280',
          marginBottom: 12,
        }}
      >
        {connection.last_sync_at
          ? `Last sync: ${new Date(connection.last_sync_at).toLocaleString()} · ${connection.last_sync_product_count} products`
          : 'Not yet synced'}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: 'white',
            fontSize: 13,
            cursor: syncing ? 'wait' : 'pointer',
            opacity: syncing ? 0.6 : 1,
          }}
        >
          {syncing ? '🔄 Syncing...' : '🔄 Sync Now'}
        </button>
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
          Disconnect
        </button>
      </div>

      {/* Auto-post opt-in toggles */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          {
            field: 'auto_sync_enabled',
            label: '📦 Automatic catalog sync',
            description: null,
            testId: 'toggle-auto-sync',
          },
          {
            field: 'auto_post_enabled',
            label: '📣 Post daily available items to my Facebook Page',
            description:
              'GrowBot will automatically post a beautiful daily update of your in-stock products, prices, pickup/delivery details, and a product photo carousel.',
            testId: 'toggle-auto-post',
          },
          {
            field: 'casagrown_post_enabled',
            label: '🌱 Allow CasaGrown to feature my products',
            description:
              'Promote your booth with free organic traffic! Your daily listings and new seller welcomes may be featured on the official CasaGrown Facebook Page.',
            testId: 'toggle-casagrown-post',
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

      {connection.last_error && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 12,
            color: '#dc2626',
          }}
        >
          ⚠️ {connection.last_error}
        </p>
      )}
    </div>
  )
}
