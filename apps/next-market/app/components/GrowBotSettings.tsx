'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

interface GrowBotSettingsProps {
  userId: string
  isPro: boolean
}

interface ChannelConfig {
  enabled: boolean
  delayMinutes: number
}

const CHANNELS = [
  {
    key: 'messenger',
    icon: '💬',
    label: 'Facebook Messenger',
    desc: 'Auto-reply to buyers messaging your Facebook Page',
    note: 'Pauses when you reply to the conversation. Resumes if you stop replying.',
    hasDelay: true,
  },
  {
    key: 'dm',
    icon: '✉️',
    label: 'CasaGrown DMs',
    desc: 'Auto-reply to direct messages on CasaGrown',
    note: 'Suggested replies are always shown to you regardless of this setting.',
    hasDelay: true,
  },
] as const

type ChannelKey = 'messenger' | 'dm' | 'orders'

/**
 * GrowBot AI settings — per-channel auto-reply configuration.
 * Suggested replies (copilot) on DMs & Orders are always on — no config needed.
 * Messenger has no copilot since we don't control Facebook's UI.
 */
export function GrowBotSettings({ userId, isPro }: GrowBotSettingsProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [configs, setConfigs] = useState<Record<ChannelKey, ChannelConfig>>({
    messenger: { enabled: true, delayMinutes: 0 },
    dm: { enabled: true, delayMinutes: 5 },
    orders: { enabled: true, delayMinutes: 5 },
  })
  const [botInstructions, setBotInstructions] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('bot_instructions, bot_channels')
        .eq('id', userId)
        .single()

      if (data) {
        setBotInstructions(data.bot_instructions || '')
        if (data.bot_channels) {
          const bc = data.bot_channels as Record<string, any>
          setConfigs((prev) => ({
            messenger: { ...prev.messenger, ...bc.messenger },
            dm: { ...prev.dm, ...bc.dm },
            orders: { ...prev.orders, ...bc.orders },
          }))
        }
      }
      setLoading(false)
    }
    load()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        bot_instructions: botInstructions || null,
        bot_channels: configs,
      })
      .eq('id', userId)

    setSaving(false)
    if (error) {
      console.error('GrowBot save error:', error)
      setSaveError(error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Loading GrowBot settings...</div>
  }

  const update = (key: ChannelKey, patch: Partial<ChannelConfig>) => {
    setConfigs((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 20,
      border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/growbot-avatar-v3.png" alt="GrowBot" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
        GrowBot Auto-Reply
      </h3>

      {!isPro && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: '#fef9c3', color: '#92400e', fontSize: 13, border: '1px solid #fcd34d',
        }}>
          ⚡ GrowBot requires a Pro subscription. <a href="/pro-manage" style={{ fontWeight: 600 }}>Learn more</a>
        </div>
      )}

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        opacity: isPro ? 1 : 0.5,
        pointerEvents: isPro ? 'auto' : 'none',
      }}>
        {CHANNELS.map((ch) => {
          const cfg = configs[ch.key]
          const isAlwaysCopilot = 'isAlwaysCopilot' in ch && ch.isAlwaysCopilot
          const isEnabled = isAlwaysCopilot ? true : cfg.enabled

          return (
            <div
              key={ch.key}
              style={{
                borderRadius: 12, overflow: 'hidden',
                border: isEnabled ? '2px solid #059669' : '1px solid #e5e7eb',
                background: isEnabled ? '#f0fdf4' : '#fafafa',
                transition: 'all 0.2s',
              }}
            >
              {/* Header row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{ch.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isEnabled ? '#065f46' : '#6b7280' }}>
                    {ch.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{ch.desc}</div>
                </div>
                {/* Toggle or Co-pilot Badge */}
                {isAlwaysCopilot ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#047857',
                    background: '#d1fae5', padding: '4px 10px', borderRadius: 8,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    Co-pilot Active
                  </span>
                ) : (
                  <div
                    onClick={() => update(ch.key, { enabled: !cfg.enabled })}
                    style={{
                      width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                      background: cfg.enabled ? '#059669' : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fff', position: 'absolute', top: 2,
                      left: cfg.enabled ? 20 : 2,
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                )}
              </div>

              {/* Settings — shown when enabled */}
              {isEnabled && (
                <div style={{ padding: '0 14px 12px', borderTop: '1px solid rgba(5,150,105,0.15)' }}>
                  {/* Delay slider — only for DM and Orders, not Messenger */}
                  {ch.hasDelay && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                        Wait before auto-reply: <strong style={{ color: '#059669' }}>
                          {cfg.delayMinutes === 0 ? 'Instant' : `${cfg.delayMinutes} min`}
                        </strong>
                      </label>
                      <input
                        type="range"
                        min={0} max={15} step={1}
                        value={cfg.delayMinutes}
                        onChange={(e) => update(ch.key, { delayMinutes: parseInt(e.target.value) })}
                        style={{ width: '100%', accentColor: '#059669', marginTop: 4 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
                        <span>Instant</span>
                        <span>15 min</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                        {cfg.delayMinutes === 0
                          ? 'GrowBot replies instantly. Pauses when you step in, resumes if you stop replying.'
                          : `GrowBot waits ${cfg.delayMinutes} min for you to reply first. Once you step in, GrowBot pauses. If you stop replying, GrowBot resumes after ${cfg.delayMinutes} min.`
                        }
                      </p>
                    </div>
                  )}
                  {ch.note && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#059669', fontStyle: 'italic' }}>
                      💡 {ch.note}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Custom instructions */}
        <div style={{ marginTop: 4 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Custom Instructions for GrowBot
          </label>
          <textarea
            value={botInstructions}
            onChange={(e) => setBotInstructions(e.target.value)}
            placeholder="e.g., Always mention our Saturday pickup is at the farmers market. We don't deliver on Sundays."
            style={{
              width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 10,
              border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical',
              boxSizing: 'border-box', background: '#f9fafb',
            }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
            These instructions are added to GrowBot's context for all channels.
          </p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px', borderRadius: 10, border: 'none',
            background: saved ? '#059669' : 'linear-gradient(135deg, #065f46, #059669)',
            color: 'white', fontSize: 14, fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'all 0.3s',
            width: '100%',
          }}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save'}
        </button>
      </div>

      {/* Success toast */}
      {saved && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#065f46', color: 'white',
          padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'slideDown 0.3s ease',
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          GrowBot settings saved successfully!
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
