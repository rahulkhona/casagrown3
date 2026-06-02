'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

/**
 * GrowBotAlertPreferences — Notification channel selection for when
 * GrowBot auto-responder needs the seller's personal attention.
 * Available for Pro and Elite users.
 */
export function GrowBotAlertPreferences() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [savingField, setSavingField] = useState<string | null>(null)

  // Push state
  const [hasPushSub, setHasPushSub] = useState(false)
  const [pushRequesting, setPushRequesting] = useState(false)
  const [pushError, setPushError] = useState('')

  // SMS/Phone verification state
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [phoneSubmitting, setPhoneSubmitting] = useState(false)
  const [phoneError, setPhoneError] = useState('')

  useEffect(() => {
    if (!user) return
    const supabase = createClient()

    // Load profile
    supabase
      .from('profiles')
      .select('email_notifications_enabled, push_enabled, sms_enabled, phone_number, phone_verified')
      .eq('id', user.id)
      .single()
      .then(({ data }: { data: any }) => {
        setProfile(data)
        if (data?.phone_number) setPhoneInput(data.phone_number)
        setLoading(false)
      })

    // Check push subscriptions
    supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .then(({ data }: { data: any }) => {
        setHasPushSub(!!(data && data.length > 0))
      })
  }, [user])

  const handleToggle = async (field: string, currentValue: boolean) => {
    const newValue = !currentValue

    // Special handling for push toggle ON
    if (field === 'push_enabled' && newValue && !hasPushSub) {
      await handleEnablePush()
      return
    }

    // Special handling for SMS toggle ON without phone verified
    if (field === 'sms_enabled' && newValue && !profile?.phone_verified) {
      setShowPhoneInput(true)
      return
    }

    setSavingField(field)
    setProfile((prev: any) => ({ ...prev, [field]: newValue }))
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ [field]: newValue })
      .eq('id', user!.id)
    setSavingField(null)
  }

  // ── Push notification flow ──
  const handleEnablePush = async () => {
    setPushRequesting(true)
    setPushError('')
    try {
      if (!('Notification' in window)) {
        setPushError('Push notifications are not supported in this browser.')
        setPushRequesting(false)
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushError('Push notifications are blocked. Please enable them in your browser settings.')
        setPushRequesting(false)
        return
      }

      // Register service worker and subscribe
      const registration = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setPushError('Push notification configuration is missing.')
        setPushRequesting(false)
        return
      }

      // Convert VAPID key
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
        const rawData = window.atob(base64)
        return new Uint8Array(Array.from(rawData, c => c.charCodeAt(0)))
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const subJson = subscription.toJSON()
      const supabase = createClient()

      // Register token
      await supabase.functions.invoke('register-push-token', {
        body: {
          token: subJson.keys?.p256dh || JSON.stringify(subJson),
          platform: 'web',
          endpoint: subJson.endpoint,
        },
      })

      // Update profile
      await supabase
        .from('profiles')
        .update({ push_enabled: true })
        .eq('id', user!.id)

      setProfile((prev: any) => ({ ...prev, push_enabled: true }))
      setHasPushSub(true)
    } catch (err: any) {
      setPushError(err.message || 'Failed to enable push notifications.')
    } finally {
      setPushRequesting(false)
    }
  }

  // ── SMS/Phone verification flow ──
  const handleSendPhoneOtp = async () => {
    if (!phoneInput.trim()) return
    setPhoneSubmitting(true)
    setPhoneError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.functions.invoke('send-phone-otp', {
        body: { phoneNumber: phoneInput.trim() },
      })
      if (error) throw error
      setOtpSent(true)
    } catch (err: any) {
      setPhoneError(err.message || 'Failed to send verification code.')
    } finally {
      setPhoneSubmitting(false)
    }
  }

  const handleVerifyPhoneOtp = async () => {
    if (!otpCode.trim()) return
    setPhoneSubmitting(true)
    setPhoneError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.functions.invoke('verify-phone-otp', {
        body: { phoneNumber: phoneInput.trim(), code: otpCode.trim() },
      })
      if (error) throw error

      // Phone verified — enable SMS
      await supabase
        .from('profiles')
        .update({ sms_enabled: true })
        .eq('id', user!.id)

      setProfile((prev: any) => ({
        ...prev,
        sms_enabled: true,
        phone_verified: true,
        phone_number: phoneInput.trim(),
      }))
      setShowPhoneInput(false)
      setOtpSent(false)
      setOtpCode('')
    } catch (err: any) {
      setPhoneError(err.message || 'Invalid code. Please try again.')
    } finally {
      setPhoneSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 12, color: '#9ca3af', fontSize: 14 }}>Loading...</div>
  }

  const allOff = !profile?.email_notifications_enabled && !profile?.push_enabled && !profile?.sms_enabled

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
          🔔 Alert Preferences
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          How should we notify you when a conversation needs your attention?
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Email toggle */}
        <ToggleRow
          label="✉️ Email notifications"
          description="Get notified via email when GrowBot needs your attention"
          value={profile?.email_notifications_enabled ?? true}
          saving={savingField === 'email_notifications_enabled'}
          onToggle={() => handleToggle('email_notifications_enabled', profile?.email_notifications_enabled ?? true)}
        />

        {/* Push toggle */}
        <div>
          <ToggleRow
            label="🔔 Push notifications"
            description="Get instant browser/app push notifications"
            value={!!profile?.push_enabled}
            saving={savingField === 'push_enabled' || pushRequesting}
            onToggle={() => handleToggle('push_enabled', !!profile?.push_enabled)}
          />
          {pushError && (
            <div style={{
              marginTop: 6, marginLeft: 54, padding: '8px 12px', borderRadius: 8,
              background: '#fef2f2', color: '#dc2626', fontSize: 12,
              border: '1px solid #fecaca',
            }}>
              {pushError}
            </div>
          )}
        </div>

        {/* SMS toggle */}
        <div>
          <ToggleRow
            label="📱 SMS notifications"
            description={profile?.phone_verified
              ? `Text alerts to ${profile.phone_number}`
              : 'Get text message alerts for urgent items'}
            value={!!profile?.sms_enabled}
            saving={savingField === 'sms_enabled'}
            onToggle={() => handleToggle('sms_enabled', !!profile?.sms_enabled)}
          />

          {/* Phone verification inline flow */}
          {showPhoneInput && !profile?.phone_verified && (
            <div style={{
              marginTop: 8, marginLeft: 54, padding: '12px 14px', borderRadius: 10,
              background: '#f9fafb', border: '1px solid #e5e7eb',
            }}>
              {!otpSent ? (
                <>
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, fontWeight: 500 }}>
                    Enter your phone number to enable SMS alerts
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #d1d5db', fontSize: 13,
                      }}
                    />
                    <button
                      onClick={handleSendPhoneOtp}
                      disabled={phoneSubmitting || !phoneInput.trim()}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: '#059669', color: 'white', fontSize: 12,
                        fontWeight: 600, cursor: phoneSubmitting ? 'wait' : 'pointer',
                        opacity: phoneSubmitting || !phoneInput.trim() ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {phoneSubmitting ? 'Sending…' : 'Send Code'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, fontWeight: 500 }}>
                    Enter the 6-digit code sent to {phoneInput}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #d1d5db', fontSize: 16,
                        textAlign: 'center', letterSpacing: 4, fontWeight: 700,
                      }}
                    />
                    <button
                      onClick={handleVerifyPhoneOtp}
                      disabled={phoneSubmitting || otpCode.length < 6}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: '#059669', color: 'white', fontSize: 12,
                        fontWeight: 600, cursor: phoneSubmitting ? 'wait' : 'pointer',
                        opacity: phoneSubmitting || otpCode.length < 6 ? 0.6 : 1,
                      }}
                    >
                      {phoneSubmitting ? 'Verifying…' : 'Verify'}
                    </button>
                  </div>
                  <button
                    onClick={() => { setOtpSent(false); setOtpCode(''); setPhoneError('') }}
                    style={{
                      marginTop: 6, background: 'none', border: 'none',
                      color: '#6b7280', fontSize: 11, cursor: 'pointer', padding: 0,
                    }}
                  >
                    ← Change number
                  </button>
                </>
              )}
              {phoneError && (
                <div style={{
                  marginTop: 8, padding: '6px 10px', borderRadius: 6,
                  background: '#fef2f2', color: '#dc2626', fontSize: 11,
                  border: '1px solid #fecaca',
                }}>
                  {phoneError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Warning if all off */}
      {allOff && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 10,
          background: '#fffbeb', border: '1px solid #f59e0b',
          fontSize: 12, color: '#92400e', lineHeight: 1.5,
        }}>
          ⚠️ No notification channels selected. You won&apos;t be alerted when conversations need your attention.
        </div>
      )}
    </div>
  )
}

function ToggleRow({ label, description, value, saving, onToggle }: {
  label: string; description?: string; value: boolean; saving: boolean; onToggle: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={onToggle}
        style={{
          position: 'relative', width: 44, height: 24, borderRadius: 12,
          border: 'none', background: value ? '#22c55e' : '#d1d5db',
          cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
          padding: 0, marginTop: 1,
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
        }} />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
          {label}
          {saving && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af' }}>Saving…</span>}
        </div>
        {description && (
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{description}</div>
        )}
      </div>
    </div>
  )
}
