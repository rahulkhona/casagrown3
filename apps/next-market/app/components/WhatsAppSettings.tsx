'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

/**
 * WhatsApp Embedded Signup configuration.
 * The config_id comes from the Meta Developer Console Embedded Signup setup.
 */
const WA_EMBEDDED_SIGNUP_CONFIG = {
  appId: '1878838186137452',
  configId: '1015862774319265',
}

/**
 * Build the WhatsApp Embedded Signup URL for a seller.
 * This opens Meta's hosted onboarding wizard where the seller can connect their
 * WhatsApp Business account and grant CasaGrown permission to send/receive messages.
 */
function buildEmbeddedSignupUrl(userId: string, returnPath: string, siteUrl: string): string {
  const state = `${userId}:${encodeURIComponent(returnPath)}`
  const redirectUri = `${siteUrl}/api/whatsapp-callback`
  const extras = JSON.stringify({
    version: 'v4',
    sessionInfoVersion: '3',
    featureType: 'whatsapp_business_app_onboarding',
  })

  return (
    `https://business.facebook.com/messaging/whatsapp/onboard/` +
    `?app_id=${WA_EMBEDDED_SIGNUP_CONFIG.appId}` +
    `&config_id=${WA_EMBEDDED_SIGNUP_CONFIG.configId}` +
    `&extras=${encodeURIComponent(extras)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`
  )
}

/**
 * WhatsAppSettings — Elite-only WhatsApp Business settings.
 * Supports provisioned (Twilio) or seller-provided numbers (via Embedded Signup).
 * Matches FacebookStatus card styling.
 */
export function WhatsAppSettings() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showTips, setShowTips] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('seller_fb_connections')
      .select('wa_number_source, wa_display_phone, wa_phone_number_id, wa_auto_reply_enabled, twilio_wa_phone_sid, wa_business_account_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        setConnection(data)
        setLoading(false)
      })
  }, [user])

  const isConnected = !!connection?.wa_phone_number_id || !!connection?.wa_display_phone
  const isSellerProvided = connection?.wa_number_source === 'seller_provided'
  const hasEmbeddedSignup = isSellerProvided && !!connection?.wa_phone_number_id && !!connection?.wa_business_account_id

  const handleSourceChange = async (source: 'twilio_provisioned' | 'seller_provided') => {
    setSaving(true)
    setConnection((prev: any) => ({ ...prev, wa_number_source: source }))
    const supabase = createClient()
    await supabase
      .from('seller_fb_connections')
      .update({ wa_number_source: source })
      .eq('user_id', user!.id)
    setSaving(false)
  }

  const handleConnectWhatsApp = () => {
    if (!user) return
    const siteUrl = typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001')
    const returnPath = window.location.pathname + window.location.search
    const url = buildEmbeddedSignupUrl(user.id, returnPath, siteUrl)
    window.location.href = url
  }

  const handleDisconnectWhatsApp = async () => {
    if (!confirm('Disconnect your WhatsApp Business number? GrowBot will stop auto-replying on this number.')) return
    setDisconnecting(true)
    const supabase = createClient()
    await supabase
      .from('seller_fb_connections')
      .update({
        wa_business_account_id: null,
        wa_phone_number_id: null,
        wa_display_phone: null,
        wa_number_source: 'twilio_provisioned',
        wa_auto_reply_enabled: false,
      })
      .eq('user_id', user!.id)
    setConnection((prev: any) => ({
      ...prev,
      wa_business_account_id: null,
      wa_phone_number_id: null,
      wa_display_phone: null,
      wa_number_source: 'twilio_provisioned',
      wa_auto_reply_enabled: false,
    }))
    setDisconnecting(false)
  }

  const handleCopy = () => {
    if (connection?.wa_display_phone) {
      navigator.clipboard.writeText(connection.wa_display_phone)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return <div style={{ padding: 12, color: '#9ca3af', fontSize: 14 }}>Loading...</div>
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      {/* Status bar — matches Facebook/Google/Instagram pattern */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {connection?.wa_display_phone || 'WhatsApp Number'}
        </span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 6,
          background: isConnected ? '#dcfce7' : '#f3f4f6',
          color: isConnected ? '#15803d' : '#9ca3af',
        }}>
          {isConnected ? '✓ Connected' : 'Not connected'}
        </span>
      </div>

      {/* Number source selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderRadius: 10, cursor: 'pointer',
          border: !isSellerProvided ? '2px solid #059669' : '1px solid #e5e7eb',
          background: !isSellerProvided ? '#f0fdf4' : '#fff',
        }}>
          <input type="radio" name="wa_source" checked={!isSellerProvided}
            onChange={() => handleSourceChange('twilio_provisioned')}
            style={{ accentColor: '#059669' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Use CasaGrown-provisioned number</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>We assign a dedicated WhatsApp number for your business</div>
          </div>
        </label>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderRadius: 10, cursor: 'pointer',
          border: isSellerProvided ? '2px solid #059669' : '1px solid #e5e7eb',
          background: isSellerProvided ? '#f0fdf4' : '#fff',
        }}>
          <input type="radio" name="wa_source" checked={isSellerProvided}
            onChange={() => handleSourceChange('seller_provided')}
            style={{ accentColor: '#059669' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Use my own WhatsApp Business number</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Connect your existing WhatsApp Business account for GrowBot auto-replies</div>
          </div>
        </label>
      </div>

      {/* Provisioned number display */}
      {!isSellerProvided && connection?.wa_display_phone && (
        <div style={{
          padding: '14px 16px', borderRadius: 12, marginBottom: 12,
          background: 'linear-gradient(135deg, #065f46, #059669)', color: 'white',
        }}>
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Your WhatsApp Number</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{connection.wa_display_phone}</span>
            <button onClick={handleCopy} style={{
              padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12, cursor: 'pointer',
            }}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Sharing tips */}
      {!isSellerProvided && connection?.wa_display_phone && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowTips(!showTips)} style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: 13, color: '#059669', cursor: 'pointer', fontWeight: 500,
          }}>
            {showTips ? '▾' : '▸'} How to share with your audience
          </button>
          {showTips && (
            <div style={{
              marginTop: 8, padding: '12px 14px', borderRadius: 10,
              background: '#f0fdf4', fontSize: 12, color: '#065f46', lineHeight: 1.6,
            }}>
              <div style={{ marginBottom: 4 }}>📱 Add to your social media bios</div>
              <div style={{ marginBottom: 4 }}>🪧 Print on business cards and signage</div>
              <div style={{ marginBottom: 4 }}>📧 Include in your email signature</div>
              <div>💬 Share in farmer&apos;s market group chats</div>
            </div>
          )}
        </div>
      )}

      {/* Seller-provided: Connected via Embedded Signup */}
      {isSellerProvided && hasEmbeddedSignup && (
        <div style={{
          padding: '14px 16px', borderRadius: 12, marginBottom: 12,
          background: 'linear-gradient(135deg, #065f46, #059669)', color: 'white',
        }}>
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Your Connected WhatsApp Number</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{connection.wa_display_phone}</span>
            <button onClick={handleCopy} style={{
              padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12, cursor: 'pointer',
            }}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            ✅ GrowBot auto-reply is active on this number
          </div>
        </div>
      )}

      {/* Seller-provided: Not connected yet — show Embedded Signup button */}
      {isSellerProvided && !hasEmbeddedSignup && (
        <div style={{
          marginBottom: 12, padding: '16px', borderRadius: 12,
          background: '#f9fafb', border: '1px dashed #d1d5db', textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
            Connect your WhatsApp Business account so GrowBot can auto-reply to your customers.
          </div>
          <button
            onClick={handleConnectWhatsApp}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: '#25D366', color: 'white', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Connect WhatsApp Business
          </button>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
            You&apos;ll be redirected to Meta to authorize access
          </div>
        </div>
      )}

      {/* Disconnect button for seller-provided */}
      {isSellerProvided && hasEmbeddedSignup && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={handleDisconnectWhatsApp}
            disabled={disconnecting}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid #fecaca', background: 'white',
              color: '#dc2626', fontSize: 13,
              cursor: disconnecting ? 'wait' : 'pointer',
            }}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect WhatsApp'}
          </button>
        </div>
      )}

      {/* Catalog note */}
      <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 12px', background: '#f9fafb', borderRadius: 8 }}>
        📦 Your product catalog is shared with customers when they message your WhatsApp number.
      </div>
    </div>
  )
}
