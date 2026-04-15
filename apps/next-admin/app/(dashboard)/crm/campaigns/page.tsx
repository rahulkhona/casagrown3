'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Campaign = {
  id: string
  name: string
  subject: string | null
  preheader: string | null
  channel: 'email' | 'sms'
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused'
  scheduled_at: string | null
  sent_at: string | null
  stats: {
    total_sent?: number
    opened?: number
    clicked?: number
    bounced?: number
    failed?: number
    unsubscribed?: number
  } | null
  created_at: string
}

type Audience = { id: string; name: string }

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  scheduled: '#3b82f6',
  sending: '#f59e0b',
  sent: '#22c55e',
  paused: '#ef4444',
}

export default function CrmCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    name: '',
    channel: 'email' as 'email' | 'sms',
    subject: '',
    preheader: '',
    content_html: '',
    content_text: '',
    audience_id: '',
    scheduled_at: '',
  })

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const [{ data: camps }, { data: auds }] = await Promise.all([
        supabase.from('crm_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('crm_audiences').select('id, name').order('name'),
      ])
      setCampaigns((camps as Campaign[]) ?? [])
      setAudiences((auds as Audience[]) ?? [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)

    const { data, error } = await supabase.from('crm_campaigns').insert({
      name: form.name,
      channel: form.channel,
      subject: form.subject || null,
      preheader: form.preheader || null,
      content_html: form.content_html || null,
      content_text: form.content_text || null,
      audience_id: form.audience_id || null,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      status: form.scheduled_at ? 'scheduled' : 'draft',
    }).select().single()

    if (!error && data) {
      setCampaigns(prev => [data as Campaign, ...prev])
      setCreating(false)
      setForm({ name: '', channel: 'email', subject: '', preheader: '', content_html: '', content_text: '', audience_id: '', scheduled_at: '' })
      setMessage('Campaign created')
      setTimeout(() => setMessage(''), 3000)
    }
    setSaving(false)
  }

  const sendNow = async (campaignId: string) => {
    setSending(campaignId)
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-crm-campaign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ campaign_id: campaignId }),
      }
    )
    const result = await res.json()
    setSending(null)
    setMessage(res.ok ? `Sent! ${result.message ?? ''}` : `Error: ${result.error}`)
    setTimeout(() => setMessage(''), 5000)
    // Refresh campaign list
    const { data } = await supabase.from('crm_campaigns').select('*').order('created_at', { ascending: false })
    if (data) setCampaigns(data as Campaign[])
  }

  const openRate = (c: Campaign) => {
    const sent = c.stats?.total_sent
    const opened = c.stats?.opened
    if (!sent || !opened) return null
    return Math.round((opened / sent) * 100)
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Email / SMS Campaigns</h1>
          <p className="crm-subtitle">Create, schedule and send marketing campaigns to your audience</p>
        </div>
        {!creating && (
          <button id="create-campaign-btn" className="crm-btn-primary" onClick={() => setCreating(true)}>
            + New Campaign
          </button>
        )}
      </div>

      {message && <div className="crm-toast">{message}</div>}

      {creating && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">Create Campaign</h2>
          <div className="crm-form-grid">
            <div className="crm-field">
              <label>Campaign Name *</label>
              <input placeholder="e.g. Spring Launch Email" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="crm-field">
              <label>Channel</label>
              <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value as 'email' | 'sms' }))}>
                <option value="email">📧 Email</option>
                <option value="sms">💬 SMS</option>
              </select>
            </div>
            {form.channel === 'email' && (
              <>
                <div className="crm-field full-width">
                  <label>Email Subject *</label>
                  <input placeholder="e.g. Fresh produce just dropped in your area 🌱" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div className="crm-field full-width">
                  <label>
                    Preheader
                    <span className="crm-hint"> — 60–90 chars shown as preview text in inboxes before the email is opened</span>
                  </label>
                  <input
                    placeholder="e.g. 3 new sellers just joined your zip code — avocados, citrus, and eggs..."
                    maxLength={150}
                    value={form.preheader}
                    onChange={e => setForm(f => ({ ...f, preheader: e.target.value }))}
                  />
                  <p className="crm-char-count">{form.preheader.length}/90 chars</p>
                </div>
              </>
            )}
            <div className="crm-field">
              <label>Audience</label>
              <select value={form.audience_id} onChange={e => setForm(f => ({ ...f, audience_id: e.target.value }))}>
                <option value="">All (no filter)</option>
                {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="crm-field">
              <label>Schedule Send (optional)</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div className="crm-field full-width">
              <label>{form.channel === 'email' ? 'HTML Content' : 'SMS Text'}</label>
              <textarea
                rows={6}
                placeholder={form.channel === 'email' ? '<h1>Hello {{name}}!</h1>\n<p>Message here...</p>' : 'Your SMS message here. Max 160 chars.'}
                value={form.channel === 'email' ? form.content_html : form.content_text}
                onChange={e => setForm(f => ({
                  ...f,
                  ...(form.channel === 'email' ? { content_html: e.target.value } : { content_text: e.target.value })
                }))}
              />
            </div>
          </div>
          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.name}>
              {saving ? 'Saving...' : 'Save Campaign'}
            </button>
            <button className="crm-btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Scheduled</th>
              <th>Sent</th>
              <th>Open Rate</th>
              <th>Clicked</th>
              <th>Bounced</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="crm-empty">Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={9} className="crm-empty">No campaigns yet.</td></tr>
            ) : campaigns.map(c => (
              <tr key={c.id} data-testid={`campaign-row-${c.id}`}>
                <td>
                  <div className="crm-name">{c.name}</div>
                  {c.subject && <div className="crm-muted">{c.subject}</div>}
                </td>
                <td><span className="crm-badge channel">{c.channel === 'email' ? '📧 Email' : '💬 SMS'}</span></td>
                <td>
                  <span className="crm-status" style={{ color: STATUS_COLORS[c.status] }}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </td>
                <td className="crm-muted">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '—'}</td>
                <td className="crm-muted">{c.stats?.total_sent?.toLocaleString() ?? '—'}</td>
                <td>
                  {openRate(c) != null
                    ? <span className="crm-rate">{openRate(c)}%</span>
                    : <span className="crm-muted">—</span>}
                </td>
                <td className="crm-muted">{c.stats?.clicked?.toLocaleString() ?? '—'}</td>
                <td className="crm-muted">{c.stats?.bounced?.toLocaleString() ?? '—'}</td>
                <td>
                  {(c.status === 'draft' || c.status === 'scheduled') && (
                    <button
                      className="crm-btn-send"
                      disabled={sending === c.id}
                      onClick={() => sendNow(c.id)}
                      data-testid={`campaign-send-${c.id}`}
                    >
                      {sending === c.id ? 'Sending...' : '▶ Send Now'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; }
        .crm-toast { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field.full-width { grid-column: 1 / -1; }
        .crm-field label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.78rem; }
        .crm-char-count { font-size: 0.78rem; color: #9ca3af; margin: 2px 0 0; text-align: right; }
        .crm-field input, .crm-field select, .crm-field textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; font-family: inherit; }
        .crm-field input:focus, .crm-field select:focus, .crm-field textarea:focus { border-color: #4ade80; }
        .crm-field textarea { resize: vertical; }
        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; }
        .crm-btn-send { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; border-radius: 8px; padding: 6px 14px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
        .crm-btn-send:hover:not(:disabled) { background: #dbeafe; }
        .crm-btn-send:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; }
        .crm-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .crm-table th { background: #f9fafb; padding: 10px 14px; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .crm-table td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        .crm-table tr:last-child td { border-bottom: none; }
        .crm-name { font-weight: 600; color: #1a2e1a; }
        .crm-muted { color: #9ca3af; font-size: 0.85rem; }
        .crm-badge { border-radius: 12px; padding: 3px 10px; font-size: 0.8rem; font-weight: 500; }
        .crm-badge.channel { background: #f3f4f6; color: #374151; }
        .crm-status { font-weight: 600; font-size: 0.85rem; }
        .crm-rate { font-weight: 600; color: #059669; }
        .crm-empty { text-align: center; color: #9ca3af; padding: 48px; }
      `}</style>
    </div>
  )
}
