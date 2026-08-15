'use client'

import { useState, useEffect } from 'react'

export interface MetaSettings {
  fb_app_id: string
  fb_app_secret: string
  fb_access_token: string
  fb_ad_account_id: string
  fb_page_id: string
  fb_instagram_account_id: string
  environment: 'sandbox' | 'production'
  default_campaign_objective: string
  default_optimization_goal: string
}

export const DEFAULT_META_SETTINGS: MetaSettings = {
  fb_app_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '',
  fb_app_secret: '',
  fb_access_token: '',
  fb_ad_account_id: '',
  fb_page_id: '',
  fb_instagram_account_id: '',
  environment: 'sandbox',
  default_campaign_objective: 'OUTCOME_TRAFFIC',
  default_optimization_goal: 'LINK_CLICKS',
}

export default function MetaSettingsModal({
  isOpen,
  onClose,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  onSaved?: (settings: MetaSettings) => void
}) {
  const [settings, setSettings] = useState<MetaSettings>(DEFAULT_META_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Load settings on open
  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/meta-settings')
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }))
        }
      }
    } catch (err) {
      console.error('Failed to load Meta settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/crm/meta-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (res.ok) {
        setSaveSuccess(true)
        if (onSaved) onSaved(settings)
        setTimeout(() => {
          setSaveSuccess(false)
          onClose()
        }, 1200)
      }
    } catch (err) {
      console.error('Failed to save Meta settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/crm/meta-settings?action=test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Connection test failed: ${err.message || 'Network error'}`,
      })
    } finally {
      setTesting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>⚙️</span>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Meta &amp; Facebook Marketing API Settings
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                Configure credentials, Ad Account, and Facebook Page for automated Campaign and Ad Set creation.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '22px',
              cursor: 'pointer',
              color: '#64748B',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
              Loading Meta configurations...
            </div>
          ) : (
            <div>
              {/* Environment Mode */}
              <div style={{ marginBottom: '20px', background: '#F1F5F9', padding: '12px 16px', borderRadius: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', display: 'block', marginBottom: '6px' }}>
                  Target Environment
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, environment: 'sandbox' }))}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: settings.environment === 'sandbox' ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                      background: settings.environment === 'sandbox' ? '#FAF5FF' : '#FFFFFF',
                      color: settings.environment === 'sandbox' ? '#6D28D9' : '#475569',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🧪 Sandbox / Dev Mode ($0 Spend)
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, environment: 'production' }))}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: settings.environment === 'production' ? '2px solid #16A34A' : '1px solid #CBD5E1',
                      background: settings.environment === 'production' ? '#F0FDF4' : '#FFFFFF',
                      color: settings.environment === 'production' ? '#166534' : '#475569',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🚀 Live Production Ads
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#64748B', margin: '6px 0 0 0' }}>
                  Sandbox mode allows testing complete Campaign $\rightarrow$ Ad Set $\rightarrow$ Creative creation without running live charges.
                </p>
              </div>

              {/* Credentials Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Meta App ID:
                  </label>
                  <input
                    type="text"
                    value={settings.fb_app_id}
                    onChange={e => setSettings(s => ({ ...s, fb_app_id: e.target.value }))}
                    placeholder="e.g. 159283749102938"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Meta App Secret:
                  </label>
                  <input
                    type="password"
                    value={settings.fb_app_secret}
                    onChange={e => setSettings(s => ({ ...s, fb_app_secret: e.target.value }))}
                    placeholder="••••••••••••••••"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Access Token */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  System User / Access Token (with ads_management &amp; pages_manage_posts):
                </label>
                <input
                  type="password"
                  value={settings.fb_access_token}
                  onChange={e => setSettings(s => ({ ...s, fb_access_token: e.target.value }))}
                  placeholder="EAABsbCS1i8BA..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Account IDs Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Meta Ad Account ID (act_...):
                  </label>
                  <input
                    type="text"
                    value={settings.fb_ad_account_id}
                    onChange={e => setSettings(s => ({ ...s, fb_ad_account_id: e.target.value }))}
                    placeholder="e.g. act_1234567890"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Facebook Page ID:
                  </label>
                  <input
                    type="text"
                    value={settings.fb_page_id}
                    onChange={e => setSettings(s => ({ ...s, fb_page_id: e.target.value }))}
                    placeholder="e.g. 102938475619283"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Instagram & Campaign Defaults */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Instagram Account ID (Optional):
                  </label>
                  <input
                    type="text"
                    value={settings.fb_instagram_account_id}
                    onChange={e => setSettings(s => ({ ...s, fb_instagram_account_id: e.target.value }))}
                    placeholder="e.g. 178414001234567"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Campaign Objective:
                  </label>
                  <select
                    value={settings.default_campaign_objective}
                    onChange={e => setSettings(s => ({ ...s, default_campaign_objective: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', background: '#FFFFFF' }}
                  >
                    <option value="OUTCOME_TRAFFIC">Traffic (Link Clicks / Landing Views)</option>
                    <option value="OUTCOME_LEADS">Leads (Harvest Registrations)</option>
                    <option value="OUTCOME_AWARENESS">Brand Awareness</option>
                  </select>
                </div>
              </div>

              {/* Test Connection Banner */}
              {testResult && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    background: testResult.success ? '#F0FDF4' : '#FEF2F2',
                    border: testResult.success ? '1px solid #BBF7D0' : '1px solid #FECACA',
                    color: testResult.success ? '#166534' : '#991B1B',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                    {testResult.success ? '✓ Connection Verified Successfully' : '✕ Connection Test Failed'}
                  </div>
                  <div>{testResult.message}</div>
                  {testResult.details && (
                    <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>
                      Page: {testResult.details.page_name || 'N/A'} • Ad Account: {testResult.details.ad_account_name || 'N/A'} ({testResult.details.currency || 'USD'})
                    </div>
                  )}
                </div>
              )}

              {/* Test Button */}
              <button
                type="button"
                disabled={testing}
                onClick={handleTestConnection}
                style={{
                  width: '100%',
                  padding: '9px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>🔌</span>
                <span>{testing ? 'Testing Meta Graph API Connection...' : 'Test Meta Connection & Permissions'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            background: '#F8FAFC',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#16A34A',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
            }}
          >
            {saving ? 'Saving...' : (saveSuccess ? '✓ Saved!' : 'Save Meta Configuration')}
          </button>
        </div>
      </div>
    </div>
  )
}
