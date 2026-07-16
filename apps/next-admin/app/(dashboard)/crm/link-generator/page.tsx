'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import TrackingUrlBuilder from '../../../../components/TrackingUrlBuilder'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
)

type ShortLink = {
  id: string
  token: string
  destination_url: string
  label: string | null
  campaign_id: string | null
  click_count: number | null
  created_at: string
}

const marketDomain =
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://casagrown.com'

export default function LinkGeneratorPage() {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchLinks = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_short_links')
      .select('*')
      .is('recipient_id', null)          // admin-created links only — excludes per-recipient campaign tracking links
      .order('created_at', { ascending: false })
      .limit(100)
    setLinks((data as ShortLink[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLinks()
    // Re-fetch after a short link is created (TrackingUrlBuilder fires and page should update)
    const interval = setInterval(fetchLinks, 15000)
    return () => clearInterval(interval)
  }, [])

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const deleteLink = async (id: string) => {
    if (!confirm('Delete this short link? Any existing posts using it will stop redirecting.')) return
    await supabase.from('crm_short_links').delete().eq('id', id)
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  const utmSource = (url: string) => {
    try { return new URL(url).searchParams.get('utm_source') || '' } catch { return '' }
  }
  const utmCampaign = (url: string) => {
    try { return new URL(url).searchParams.get('utm_campaign') || '' } catch { return '' }
  }
  const destPath = (url: string) => {
    try { const u = new URL(url); return u.pathname } catch { return url }
  }

  const sourceEmoji: Record<string, string> = {
    facebook: '📘', instagram: '📸', tiktok: '🎵', email: '📧',
    sms: '💬', newsletter: '📰', google: '🔍', nextdoor: '🏘️',
    reddit: '🤖', qr_code: '📱', organic: '🌱', drip: '💧',
  }

  const filtered = links.filter(l => {
    const q = search.toLowerCase()
    return (
      (l.label || '').toLowerCase().includes(q) ||
      (l.destination_url || '').toLowerCase().includes(q) ||
      l.token.includes(q)
    )
  })

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a2e1a', margin: 0 }}>
          🔗 Link Generator
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: 6 }}>
          Create UTM-tagged tracked links and short URLs for Facebook, Instagram, Nextdoor, email, and more.
          All created short links are saved below.
        </p>
      </div>

      {/* Builder */}
      <TrackingUrlBuilder />

      {/* Saved Links */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1a2e1a' }}>
            Saved Short Links
          </h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              placeholder="Search links…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8,
                fontSize: '0.85rem', outline: 'none', width: 220,
              }}
            />
            <button
              onClick={fetchLinks}
              style={{
                padding: '7px 14px', background: '#f3f4f6', border: '1px solid #d1d5db',
                borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#374151',
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={th}>Short URL</th>
                <th style={th}>Destination</th>
                <th style={th}>Source / Campaign</th>
                <th style={th}>Label</th>
                <th style={th}>Created</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#9ca3af', lineHeight: 2 }}>
                    {search ? 'No links match your search.' : 'No short links yet. Create one above — it will appear here.'}
                  </td>
                </tr>
              ) : filtered.map(link => {
                const shortUrl = `${marketDomain}/r/${link.token}`
                const src = utmSource(link.destination_url)
                const campaign = utmCampaign(link.destination_url)
                const path = destPath(link.destination_url)
                return (
                  <tr key={link.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    {/* Short URL */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code style={{
                          background: '#eef2ff', color: '#4338ca', padding: '3px 8px',
                          borderRadius: 5, fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>
                          /r/{link.token}
                        </code>
                        <button
                          onClick={() => copy(shortUrl, link.id)}
                          style={{
                            padding: '3px 8px', border: '1px solid #c7d2fe', borderRadius: 5,
                            background: copied === link.id ? '#6366f1' : 'white',
                            color: copied === link.id ? 'white' : '#4338ca',
                            cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
                          }}
                        >
                          {copied === link.id ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </td>
                    {/* Destination */}
                    <td style={td}>
                      <span style={{ color: '#166534', fontWeight: 600, fontSize: '0.82rem' }}>{path}</span>
                    </td>
                    {/* Source / Campaign */}
                    <td style={td}>
                      {src ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: '#f0fdf4', color: '#166534', borderRadius: 20,
                          padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600,
                        }}>
                          {sourceEmoji[src] || '🔗'} {src}
                          {campaign && <span style={{ color: '#9ca3af', fontWeight: 400 }}>· {campaign}</span>}
                        </span>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: '0.78rem' }}>—</span>
                      )}
                    </td>
                    {/* Label */}
                    <td style={{ ...td, color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.label || <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    {/* Created */}
                    <td style={{ ...td, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                      {new Date(link.created_at).toLocaleDateString()}
                    </td>
                    {/* Actions */}
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        onClick={() => deleteLink(link.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '1rem', opacity: 0.35, transition: 'opacity 0.15s', padding: 4,
                        }}
                        title="Delete short link"
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.35')}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 8, textAlign: 'right' }}>
            {filtered.length} link{filtered.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontWeight: 600,
  color: '#6b7280', fontSize: '0.78rem', textTransform: 'uppercase',
  borderBottom: '1px solid #e5e7eb',
}

const td: React.CSSProperties = {
  padding: '12px 14px', verticalAlign: 'middle',
}
