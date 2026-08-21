'use client'

import { useState, useCallback } from 'react'

/** All UTM + custom tracking params we support */
export interface TrackingParams {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  utm_term: string
}

interface DestinationOption {
  value: string
  label: string
}

interface TrackingUrlBuilderProps {
  /** Pre-fill the base URL (e.g. from the selected landing page) */
  defaultBaseUrl?: string
  /** Pre-fill utm_medium (e.g. 'email' when opened from campaign builder) */
  defaultMedium?: string
  /** Pre-fill utm_campaign (e.g. from campaign name) */
  defaultCampaign?: string
  /** If provided, short links will be tagged with this campaign ID */
  campaignId?: string
  /** Optional sequence ID for short links generated inside sequence flowcharts */
  sequenceId?: string
  /** Optional node ID for short links generated inside sequence flowcharts */
  nodeId?: string
  /** Compact mode: collapses into an accordion, suitable for sidebars */
  compact?: boolean
  /** Custom destination URLs — overrides the default BASE_URLS list. Hides Custom URL toggle. Hides Custom URL toggle. */
  destinations?: DestinationOption[]
  /** Optional callback when user clicks 'Use This Link in Campaign' */
  onInsertUrl?: (url: string) => void
}

const UTM_SOURCES = [
  { value: 'email', label: 'Email Campaign' },
  { value: 'sms', label: 'SMS Campaign' },
  { value: 'drip', label: 'Drip / Sequence' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google', label: 'Google Ads' },
  { value: 'nextdoor', label: 'Nextdoor' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'newsletter', label: 'Newsletter / Email Blast' },
  { value: 'affiliate', label: 'Affiliate' },
  { value: 'qr_code', label: 'QR Code / Print' },
  { value: 'casagrown_home', label: 'CasaGrown.com Home Page' },
  { value: 'organic', label: 'Organic / Other' },
]

const UTM_MEDIUMS = [
  { value: 'social', label: 'Social (Organic Post)' },
  { value: 'cpc', label: 'CPC / Paid Ad' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push Notification' },
  { value: 'qr', label: 'QR Code' },
  { value: 'organic', label: 'Organic Search' },
  { value: 'referral', label: 'Referral / Invite' },
]

const BASE_URLS = [
  { value: 'https://casagrown.com/list_bulk', label: '🧺 /list_bulk — Bulk Produce Lead Magnet' },
  { value: 'https://casagrown.com/games', label: '🎮 /games — Daily Garden Games Hub' },
  { value: 'https://casagrown.com/market', label: '🌱 /market — Produce Market Feed' },
  { value: 'https://casagrown.com/growbot', label: '/growbot — GrowBot AI Chat' },
  { value: 'https://casagrown.com/create-listing-multi-arm', label: '/create-listing-multi-arm — Bandit Listing Flow' },
  { value: 'https://casagrown.com/create-listing-simple', label: '/create-listing-simple — Quick Listing' },
  { value: 'https://casagrown.com/create-listing', label: '/create-listing — Create a Listing' },
  { value: 'https://casagrown.com/sell', label: '/sell — Seller Calculator' },
  { value: 'https://casagrown.com/check-nutrition-loss', label: '/check-nutrition-loss — Nutrition Loss Tool' },
  { value: 'https://casagrown.com/join', label: '/join — Buyer Sign Up' },
  { value: 'https://casagrown.com/sellers', label: '/sellers — Seller Landing Page' },
  { value: 'https://casagrown.com', label: 'casagrown.com — Home Page' },
]

function buildUtmUrl(base: string, params: TrackingParams): string {
  if (!base) return ''
  try {
    const url = new URL(base)
    if (params.utm_source) url.searchParams.set('utm_source', params.utm_source)
    if (params.utm_medium) url.searchParams.set('utm_medium', params.utm_medium)
    if (params.utm_campaign) url.searchParams.set('utm_campaign', params.utm_campaign)
    if (params.utm_content) url.searchParams.set('utm_content', params.utm_content)
    if (params.utm_term) url.searchParams.set('utm_term', params.utm_term)
    return url.toString()
  } catch {
    return base
  }
}

export default function TrackingUrlBuilder({
  defaultBaseUrl = '',
  defaultMedium = '',
  defaultCampaign = '',
  campaignId,
  sequenceId,
  nodeId,
  compact = false,
  destinations,
  onInsertUrl,
}: TrackingUrlBuilderProps) {
  const urlOptions = destinations && destinations.length > 0 ? destinations : BASE_URLS
  const [isOpen, setIsOpen] = useState(true)
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl || urlOptions[0]?.value || '')
  const [customBase, setCustomBase] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [params, setParams] = useState<TrackingParams>({
    utm_source: '',
    utm_medium: defaultMedium,
    utm_campaign: defaultCampaign,
    utm_content: '',
    utm_term: '',
  })
  const [label, setLabel] = useState('')
  const [shortUrl, setShortUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<'long' | 'short' | null>(null)
  const [error, setError] = useState('')

  const effectiveBase = useCustom ? customBase : baseUrl
  const fullUrl = buildUtmUrl(effectiveBase, params)

  const setParam = useCallback((key: keyof TrackingParams, value: string) => {
    setParams(p => ({ ...p, [key]: value }))
  }, [])

  const copyToClipboard = async (text: string, which: 'long' | 'short') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // fallback
    }
  }

  const createShortLink = async () => {
    if (!fullUrl) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/crm/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_url: fullUrl,
          campaign_id: campaignId || null,
          sequence_id: sequenceId || null,
          node_id: nodeId || null,
          label: label || `${params.utm_source || 'link'} — ${params.utm_campaign || 'general'}`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create short link')
      setShortUrl(data.short_url)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const reset = () => {
    setParams({ utm_source: '', utm_medium: defaultMedium, utm_campaign: defaultCampaign, utm_content: '', utm_term: '' })
    setShortUrl('')
    setLabel('')
    setError('')
    setCustomBase('')
  }

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* BASE URL ROW — hidden when parent pre-selects the URL */}
      {!defaultBaseUrl && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Destination Page</label>
            {useCustom ? (
              <input
                value={customBase}
                onChange={e => setCustomBase(e.target.value)}
                placeholder="https://casagrown.com/sell"
                style={inputStyle}
              />
            ) : (
              <select value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={inputStyle}>
                {urlOptions.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            )}
          </div>
          {/* Hide Custom URL toggle when destinations are provided from parent */}
          {!destinations && (
            <button
              type="button"
              onClick={() => setUseCustom(v => !v)}
              style={{ ...pill, background: useCustom ? '#e0e7ff' : '#f3f4f6', color: useCustom ? '#4338ca' : '#6b7280', padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap', alignSelf: 'flex-end', marginBottom: 1 }}
            >
              {useCustom ? '← Preset' : 'Custom URL'}
            </button>
          )}
        </div>
      )}

      {/* UTM PARAMS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Source <span style={required}>*</span></label>
          <select value={params.utm_source} onChange={e => setParam('utm_source', e.target.value)} style={inputStyle}>
            <option value="">— select —</option>
            {UTM_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <p style={fieldHint}>Where the traffic is coming from. Use <code style={code}>facebook</code>, <code style={code}>instagram</code>, <code style={code}>nextdoor</code>, <code style={code}>google</code>, or <code style={code}>newsletter</code>.</p>
        </div>
        <div>
          <label style={labelStyle}>Medium <span style={required}>*</span></label>
          <select value={params.utm_medium} onChange={e => setParam('utm_medium', e.target.value)} style={inputStyle}>
            <option value="">— select —</option>
            {UTM_MEDIUMS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <p style={fieldHint}>How you're reaching them. Organic post → <code style={code}>social</code>. Paid ad → <code style={code}>cpc</code>. Email blast → <code style={code}>email</code>.</p>
        </div>
        <div>
          <label style={labelStyle}>Campaign Name</label>
          <input
            value={params.utm_campaign}
            onChange={e => setParam('utm_campaign', e.target.value)}
            placeholder="e.g. spring-2026"
            style={inputStyle}
          />
          <p style={fieldHint}>Groups related posts/ads into one campaign. Use slugs: <code style={code}>spring-2026</code>, <code style={code}>may-seller-push</code>, <code style={code}>launch-week</code>.</p>
        </div>
        <div>
          <label style={labelStyle}>Content / Placement <span style={hint}>(group, post, or creative)</span></label>
          <input
            value={params.utm_content}
            onChange={e => setParam('utm_content', e.target.value)}
            placeholder="e.g. backyard-gardeners-fb-group"
            style={inputStyle}
          />
          <p style={fieldHint}>Use this to track <strong>which Facebook group</strong>, post variation, or ad creative drove the click. e.g. <code style={code}>fresno-gardeners-group</code>, <code style={code}>hero-image-v2</code>.</p>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Keyword / Group Tag <span style={hint}>(utm_term — optional)</span></label>
          <input
            value={params.utm_term}
            onChange={e => setParam('utm_term', e.target.value)}
            placeholder="e.g. sell-backyard-produce"
            style={inputStyle}
          />
          <p style={fieldHint}>Primarily for Google Ads paid keywords (e.g. <code style={code}>sell home produce fresno</code>). Can also be used as a secondary tag for social. For Facebook groups, prefer <strong>Content</strong> above.</p>
        </div>
      </div>

      {/* GENERATED URL PREVIEW */}
      {fullUrl && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Full Tracking URL
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {onInsertUrl && (
                <button
                  type="button"
                  onClick={() => onInsertUrl(fullUrl)}
                  style={{ ...pill, background: '#166534', color: 'white' }}
                >
                  ✨ Apply to Campaign
                </button>
              )}
              <button
                type="button"
                onClick={() => copyToClipboard(fullUrl, 'long')}
                style={{ ...pill, background: copied === 'long' ? '#22c55e' : 'white', color: copied === 'long' ? 'white' : '#166534', border: '1px solid #bbf7d0' }}
              >
                {copied === 'long' ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>
          <code style={{ fontSize: '0.78rem', color: '#166534', wordBreak: 'break-all', lineHeight: 1.5, display: 'block' }}>
            {fullUrl}
          </code>
        </div>
      )}

      {/* SHORT LINK SECTION */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Short Link Label <span style={hint}>(optional, for admin reference)</span></label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Facebook May Campaign"
              style={inputStyle}
            />
          </div>
          <div style={{ paddingTop: 20 }}>
            <button
              type="button"
              onClick={createShortLink}
              disabled={!fullUrl || creating}
              style={{
                padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none',
                borderRadius: 8, fontWeight: 600, cursor: !fullUrl || creating ? 'not-allowed' : 'pointer',
                opacity: !fullUrl || creating ? 0.6 : 1, fontSize: '0.9rem', whiteSpace: 'nowrap'
              }}
            >
              {creating ? 'Creating…' : '🔗 Create Short Link'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem', color: '#991b1b', marginTop: 8 }}>
            {error}
          </div>
        )}

        {shortUrl && (
          <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Short Link (self-hosted)
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {onInsertUrl && (
                  <button
                    type="button"
                    onClick={() => onInsertUrl(shortUrl)}
                    style={{ ...pill, background: '#4338ca', color: 'white' }}
                  >
                    ✨ Apply Short Link to Campaign
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyToClipboard(shortUrl, 'short')}
                  style={{ ...pill, background: copied === 'short' ? '#6366f1' : 'white', color: copied === 'short' ? 'white' : '#4338ca', border: '1px solid #c7d2fe' }}
                >
                  {copied === 'short' ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
            </div>
            <code style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4338ca', wordBreak: 'break-all', display: 'block' }}>
              {shortUrl}
            </code>
            <p style={{ fontSize: '0.75rem', color: '#6366f1', marginTop: 6, marginBottom: 0, lineHeight: 1.4 }}>
              ↳ Redirects to the full tracking URL above. Clicks are counted in the CRM dashboard.
            </p>
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={reset} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}>
          ↺ Reset
        </button>
      </div>
    </div>
  )

  if (!compact) {
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: '20px 24px', marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: '1.2rem' }}>🔗</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1a2e1a' }}>Tracking URL Builder</h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>
              Build UTM-tagged links for ads, email, SMS, and social posts. Generate a short link for use in campaigns.
            </p>
          </div>
        </div>
        {content}
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        style={{ width: '100%', background: isOpen ? '#f0fdf4' : '#f9fafb', border: 'none', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: '1rem' }}>🔗</span>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a2e1a', flex: 1 }}>Tracking URL Builder</span>
        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid #e5e7eb' }}>
          {content}
        </div>
      )}
    </div>
  )
}

// ─── Style tokens ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 7,
  fontSize: '0.88rem',
  outline: 'none',
  fontFamily: 'inherit',
  background: 'white',
  boxSizing: 'border-box',
}

const pill: React.CSSProperties = {
  border: 'none',
  borderRadius: 20,
  padding: '4px 10px',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s',
}

const hint: React.CSSProperties = {
  fontWeight: 400,
  color: '#9ca3af',
  fontSize: '0.75rem',
}

const required: React.CSSProperties = {
  color: '#ef4444',
}

const fieldHint: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#6b7280',
  margin: '4px 0 0 0',
  lineHeight: 1.5,
}

const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  background: '#f3f4f6',
  borderRadius: 3,
  padding: '1px 4px',
  fontSize: '0.72rem',
  color: '#374151',
}
