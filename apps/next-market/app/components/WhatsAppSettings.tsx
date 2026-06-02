'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

/**
 * WhatsAppSettings — Elite-only WhatsApp Business settings.
 * Supports provisioned (Twilio) or seller-provided numbers.
 * Matches FacebookStatus card styling.
 */
export function WhatsAppSettings() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [showTips, setShowTips] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('seller_fb_connections')
      .select('wa_number_source, wa_display_phone, wa_phone_number_id, wa_auto_reply_enabled, twilio_wa_phone_sid')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        setConnection(data)
        if (data?.wa_display_phone) setPhoneInput(data.wa_display_phone)
        setLoading(false)
      })
  }, [user])

  const isConnected = !!connection?.wa_phone_number_id || !!connection?.wa_display_phone
  const isSellerProvided = connection?.wa_number_source === 'seller_provided'

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

  const handleSavePhone = async () => {
    if (!phoneInput.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('seller_fb_connections')
      .update({ wa_display_phone: phoneInput.trim(), wa_number_source: 'seller_provided' })
      .eq('user_id', user!.id)
    setConnection((prev: any) => ({ ...prev, wa_display_phone: phoneInput.trim(), wa_number_source: 'seller_provided' }))
    setSaving(false)
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
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Connect your existing WhatsApp Business number</div>
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

      {/* Own number input */}
      {isSellerProvided && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <input type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="+1 (555) 123-4567"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid #d1d5db', fontSize: 14, background: '#f9fafb',
            }} />
          <button onClick={handleSavePhone} disabled={saving || !phoneInput.trim()}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: '#059669', color: 'white', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer', opacity: saving || !phoneInput.trim() ? 0.6 : 1,
            }}>
            {saving ? 'Saving…' : 'Save'}
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
