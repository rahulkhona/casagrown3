'use client'

/**
 * Auto-Redemption Settings
 *
 * Configure automatic redemption: method (cashout/gift card/charity),
 * threshold, and method-specific parameters.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../../lib/useAuth'
import { formatUsd } from '../../../../lib/store'
import { createClient } from '../../../../lib/supabase'
import styles from './page.module.css'

interface AutoRedeemConfig {
  enabled: boolean
  method: string
  threshold_usd: number
  cashout_payout_id: string | null
  gift_card_brand: string | null
  gift_card_amount_usd: number | null
  charity_project_id: string | null
  charity_project_name: string | null
}

const THRESHOLD_PRESETS = [25, 50, 100, 250]

export default function AutoRedeemPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const userId = user?.id
  const supabase = useMemo(() => createClient(), [])

  const [config, setConfig] = useState<AutoRedeemConfig>({
    enabled: false, method: 'cashout', threshold_usd: 50,
    cashout_payout_id: null, gift_card_brand: null, gift_card_amount_usd: null,
    charity_project_id: null, charity_project_name: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customThreshold, setCustomThreshold] = useState('')

  // ── Load config ──
  useEffect(() => {
    if (!userId) return
    supabase.rpc('get_auto_redemption_config').then(({ data, error }) => {
      if (!error && data) setConfig(data)
      setLoading(false)
    })
  }, [userId, supabase])

  // ── Save config ──
  const handleSave = useCallback(async () => {
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      const { data, error } = await supabase.rpc('save_auto_redemption_config', {
        p_enabled: config.enabled,
        p_method: config.method,
        p_threshold_usd: config.threshold_usd,
        p_cashout_payout_id: config.cashout_payout_id,
        p_gift_card_brand: config.gift_card_brand,
        p_gift_card_amount_usd: config.gift_card_amount_usd,
        p_charity_project_id: config.charity_project_id,
        p_charity_project_name: config.charity_project_name,
      })
      if (data?.error) { setError(data.error); return }
      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }, [config, supabase])

  const updateConfig = (partial: Partial<AutoRedeemConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }))
    setSaved(false)
  }

  if (authLoading || loading) return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  if (!isAuthenticated) return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Sign in to configure</h2><Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link></div>

  return (
    <div className="container-sm">
      <Link href="/earnings" className={styles.backLink}>← Back to Earnings</Link>

      <div className={styles.header}>
        <span className={styles.headerIcon}>⚡</span>
        <div>
          <h1 className={styles.headerTitle}>Auto-Redemption</h1>
          <p className={styles.headerDesc}>Automatically convert your earnings when your balance reaches a threshold</p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className={styles.card}>
        <div className={styles.toggleRow}>
          <div>
            <strong>Enable Auto-Redemption</strong>
            <p className={styles.hint}>When enabled, your earnings will be automatically redeemed after each settlement</p>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={config.enabled} onChange={e => updateConfig({ enabled: e.target.checked })} />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>

      {config.enabled && (
        <>
          {/* Method selection */}
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Redemption Method</h3>
            <div className={styles.methodGrid}>
              {[
                { key: 'cashout', icon: '💸', label: 'Cash Out', desc: 'PayPal or Venmo' },
                { key: 'giftcards', icon: '🎁', label: 'Gift Card', desc: 'Preferred brand' },
                { key: 'charity', icon: '❤️', label: 'Donate', desc: 'Favorite charity' },
              ].map(m => (
                <button key={m.key}
                  className={`${styles.methodBtn} ${config.method === m.key ? styles.methodBtnActive : ''}`}
                  onClick={() => updateConfig({ method: m.key })}
                >
                  <span className={styles.methodIcon}>{m.icon}</span>
                  <span className={styles.methodLabel}>{m.label}</span>
                  <span className={styles.methodDesc}>{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Threshold */}
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Trigger Threshold</h3>
            <p className={styles.hint}>Auto-redeem when your available balance reaches this amount</p>
            <div className={styles.thresholdGrid}>
              {THRESHOLD_PRESETS.map(t => (
                <button key={t}
                  className={`${styles.thresholdBtn} ${config.threshold_usd === t ? styles.thresholdBtnActive : ''}`}
                  onClick={() => updateConfig({ threshold_usd: t })}
                >
                  {formatUsd(t)}
                </button>
              ))}
              <div className={styles.customThreshold}>
                <input type="number" placeholder="Custom" min="5" step="5"
                  className={styles.thresholdInput}
                  value={customThreshold}
                  onChange={e => { setCustomThreshold(e.target.value); if (e.target.value) updateConfig({ threshold_usd: parseFloat(e.target.value) }) }}
                />
              </div>
            </div>
          </div>

          {/* Method-specific config */}
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>
              {config.method === 'cashout' ? '💸 Cashout Details' :
               config.method === 'giftcards' ? '🎁 Gift Card Preference' :
               '❤️ Charity Selection'}
            </h3>

            {config.method === 'cashout' && (
              <div className="form-group">
                <label className="label">PayPal Email or Venmo Phone</label>
                <input className="input" value={config.cashout_payout_id || ''} placeholder="email@example.com or +15555551234"
                  onChange={e => updateConfig({ cashout_payout_id: e.target.value })}
                />
                <p className={styles.hint} style={{ marginTop: 4 }}>Same account used for manual cashouts</p>
              </div>
            )}

            {config.method === 'giftcards' && (
              <>
                <div className="form-group">
                  <label className="label">Preferred Brand</label>
                  <input className="input" value={config.gift_card_brand || ''} placeholder="e.g. Amazon, Target, Walmart"
                    onChange={e => updateConfig({ gift_card_brand: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Default Amount (USD)</label>
                  <input className="input" type="number" min="5" step="5" value={config.gift_card_amount_usd || ''} placeholder="e.g. 25"
                    onChange={e => updateConfig({ gift_card_amount_usd: parseFloat(e.target.value) || null })}
                  />
                  <p className={styles.hint} style={{ marginTop: 4 }}>Multiple cards may be purchased if balance exceeds this amount</p>
                </div>
              </>
            )}

            {config.method === 'charity' && (
              <>
                <div className="form-group">
                  <label className="label">Charity Project ID</label>
                  <input className="input" value={config.charity_project_id || ''} placeholder="GlobalGiving project ID"
                    onChange={e => updateConfig({ charity_project_id: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Charity Name</label>
                  <input className="input" value={config.charity_project_name || ''} placeholder="Organization name"
                    onChange={e => updateConfig({ charity_project_name: e.target.value })}
                  />
                  <p className={styles.hint} style={{ marginTop: 4 }}>Browse charities in the <Link href="/earnings/redeem" style={{ color: 'var(--green-600)' }}>Redeem page</Link> to find project IDs</p>
                </div>
              </>
            )}
          </div>

          {/* How it works */}
          <div className={styles.infoCard}>
            <strong>💡 How It Works</strong>
            <ol>
              <li>After each market settlement, your earnings are credited</li>
              <li>If your available balance ≥ {formatUsd(config.threshold_usd)}, auto-redemption triggers</li>
              <li>Your full available balance is redeemed via {config.method === 'cashout' ? 'PayPal/Venmo' : config.method === 'giftcards' ? 'gift card purchase' : 'charity donation'}</li>
              <li>You&apos;ll receive a notification with the details</li>
            </ol>
          </div>
        </>
      )}

      {/* Save / Error */}
      {error && <div className={styles.alertError}>❌ {error}</div>}
      {saved && <div className={styles.alertSuccess}>✅ Settings saved!</div>}

      <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 20 }}
        onClick={handleSave} disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      <div style={{ height: 40 }} />
    </div>
  )
}
