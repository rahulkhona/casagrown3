'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Campaign = {
  id: string
  system_alias: string | null
  name: string
  subject: string | null
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
  target_states: string[]
  target_cities: string[]
  target_counties: string[]
  target_zips: string[]
  target_h3s: string[]
  created_at: string
  created_at: string
  data_source_id?: string | null
  postmark_template_alias?: string | null
}

type Audience = { id: string; name: string }
type DataSource = { id: string; name: string; rpc_name: string }

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
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    name: '',
    channel: 'email' as 'email' | 'sms',
    subject: '',
    content_html: '',
    content_text: '',
    audience_id: '',
    scheduled_at: '',
    target_states: [] as string[],
    target_cities: [] as string[],
    target_counties: [] as string[],
    target_zips: [] as string[],
  })
  
  const [templateMode, setTemplateMode] = useState(false)
  const [addGeo, setAddGeo] = useState({ states: '', cities: '', counties: '', zips: '' })

  // ZIP community lookup
  type ZipResult = {
    zip_code: string
    city_name: string
    state_code: string
    communities: string[]
  }
  const [zipSearch, setZipSearch]       = useState('')
  const [zipResults, setZipResults]     = useState<ZipResult[]>([])
  const [zipLooking, setZipLooking]     = useState(false)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const [{ data: camps }, { data: auds }, { data: sources }] = await Promise.all([
        supabase.from('crm_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('crm_audiences').select('id, name').order('name'),
        supabase.from('crm_data_sources').select('id, name, rpc_name').order('name'),
      ])
      setCampaigns((camps as Campaign[]) ?? [])
      setAudiences((auds as Audience[]) ?? [])
      setDataSources((sources as DataSource[]) ?? [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  // ZIP → city + named communities lookup (debounced)
  useEffect(() => {
    if (zipSearch.length < 3) { setZipResults([]); return }
    const timer = setTimeout(async () => {
      setZipLooking(true)
      const { data: zipData } = await supabase
        .from('zip_codes')
        .select('zip_code, cities(name, states(code))')
        .ilike('zip_code', `${zipSearch}%`)
        .limit(8)

      if (!zipData) { setZipResults([]); setZipLooking(false); return }

      const zips = zipData.map((z: Record<string, unknown>) => z.zip_code as string)
      const { data: commData } = await supabase
        .from('communities')
        .select('zip_code, community_name')
        .in('zip_code', zips)

      const commMap: Record<string, string[]> = {}
      commData?.forEach((c: { zip_code: string; community_name: string }) => {
        if (!commMap[c.zip_code]) commMap[c.zip_code] = []
        commMap[c.zip_code].push(c.community_name)
      })

      const results: ZipResult[] = zipData.map((z: Record<string, unknown>) => {
        const city = z.cities as { name: string; states: { code: string } } | null
        return {
          zip_code:   z.zip_code as string,
          city_name:  city?.name ?? '',
          state_code: city?.states?.code ?? '',
          communities: commMap[z.zip_code as string] ?? [],
        }
      })

      setZipResults(results)
      setZipLooking(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [zipSearch])

  const selectZip = (row: ZipResult) => {
    setForm(f => {
      const target_zips = f.target_zips.includes(row.zip_code) ? f.target_zips : [...f.target_zips, row.zip_code]
      const target_cities = f.target_cities.includes(row.city_name) ? f.target_cities : [...f.target_cities, row.city_name]
      const target_states = f.target_states.includes(row.state_code) ? f.target_states : [...f.target_states, row.state_code]
      return { ...f, target_zips, target_cities, target_states }
    })
    setZipSearch('')
    setZipResults([])
  }

  const removeGeo = (type: 'zips' | 'cities' | 'counties' | 'states', value: string) => {
    const key = `target_${type}` as keyof typeof form
    setForm(f => ({
      ...f,
      [key]: (f[key] as string[]).filter(v => v !== value)
    }))
  }

  const handleAddGeo = (type: 'states' | 'cities' | 'counties' | 'zips') => {
    const val = addGeo[type].trim()
    if (!val) return
    const key = `target_${type}` as keyof typeof form
    setForm(f => ({
      ...f,
      [key]: (f[key] as string[]).includes(val) ? f[key] : [...(f[key] as string[]), val]
    }))
    setAddGeo(prev => ({ ...prev, [type]: '' }))
  }

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)

    const { data, error } = await supabase.from('crm_campaigns').insert({
      name: form.name,
      channel: form.channel,
      subject: templateMode ? null : (form.subject || null),
      content_html: templateMode ? null : (form.content_html || null),
      content_text: form.content_text || null,
      audience_id: form.audience_id || null,
      data_source_id: form.data_source_id || null,
      postmark_template_alias: templateMode ? (form.postmark_template_alias || null) : null,
      target_zips: form.target_zips,
      target_cities: form.target_cities,
      target_counties: form.target_counties,
      target_states: form.target_states,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      status: form.scheduled_at ? 'scheduled' : 'draft',
    }).select().single()

    if (!error && data) {
      setCampaigns(prev => [data as Campaign, ...prev])
      setCreating(false)
      setForm({ name: '', channel: 'email', subject: '', content_html: '', content_text: '', audience_id: '', scheduled_at: '', target_zips: [], target_cities: [], target_counties: [], target_states: [], data_source_id: '', postmark_template_alias: '' })
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
              <div className="crm-field full-width">
                <label>Design Mode</label>
                <select value={templateMode ? 'template' : 'custom'} onChange={e => setTemplateMode(e.target.value === 'template')}>
                  <option value="custom">✍️ Custom HTML / Subject</option>
                  <option value="template">🧩 Postmark Template API</option>
                </select>
              </div>
            )}
            {form.channel === 'email' && !templateMode && (
              <div className="crm-field full-width">
                <label>Email Subject *</label>
                <input placeholder="e.g. Fresh produce just dropped in your area 🌱" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
            )}
            {form.channel === 'email' && templateMode && (
              <div className="crm-field full-width">
                <label>Postmark Template Alias *</label>
                <input placeholder="e.g. market-welcome-1" value={form.postmark_template_alias} onChange={e => setForm(f => ({ ...f, postmark_template_alias: e.target.value }))} />
              </div>
            )}
            
            <div className="crm-field full-width">
              <label>Data Provider (Template Model Hydration)</label>
              <select value={form.data_source_id} onChange={e => setForm(f => ({ ...f, data_source_id: e.target.value }))}>
                <option value="">None (Static Payload Only)</option>
                {dataSources.map(s => <option key={s.id} value={s.id}>{s.name} ({s.rpc_name})</option>)}
              </select>
            </div>
            <div className="crm-field">
              <label>Audience / Behavioral Filter</label>
              <select value={form.audience_id} onChange={e => setForm(f => ({ ...f, audience_id: e.target.value }))}>
                <option value="">All (no filter)</option>
                {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Geographic Targets */}
            <div className="crm-field zip-lookup-wrap full-width" style={{ marginTop: 8 }}>
              <label>
                Geographic Targets
                <span className="crm-hint"> — type a ZIP to auto-map matching city and state, or type manually</span>
              </label>
              <div className="zip-search-row" style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Type a ZIP code, e.g. 93710"
                  value={zipSearch}
                  onChange={e => setZipSearch(e.target.value)}
                  className="zip-search-input"
                  style={{ flex: 1 }}
                />
                {zipLooking && <span className="crm-hint" style={{ alignSelf: 'center' }}>Looking up…</span>}
              </div>
              
              {/* Autocomplete Dropdown */}
              {zipResults.length > 0 && (
                <div className="zip-results">
                  {zipResults.map(r => (
                    <button
                      key={r.zip_code}
                      type="button"
                      className="zip-result-item"
                      onClick={() => selectZip(r)}
                    >
                      <div className="zip-result-main">
                        <strong>{r.zip_code}</strong>
                        <span>{r.city_name}{r.state_code ? `, ${r.state_code}` : ''}</span>
                      </div>
                      {r.communities.length > 0 && (
                        <div className="zip-result-communities">
                          {r.communities.map(c => (
                            <span key={c} className="community-chip">{c}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Arrays */}
              <div className="geo-arrays-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                
                {/* State Array */}
                <div className="geo-array-pane">
                  <div className="pane-header">States</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input style={{ flex: 1, padding: 6, fontSize: '0.8rem' }} placeholder="Add state (e.g. CA)" value={addGeo.states} onChange={e => setAddGeo(a => ({ ...a, states: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddGeo('states')} />
                    <button type="button" onClick={() => handleAddGeo('states')} style={{ padding: '6px 10px', background: '#e5e7eb', borderRadius: 4, border: 'none' }}>+</button>
                  </div>
                  <div className="pane-chips">
                    {form.target_states.map(st => (
                      <span key={st} className="geo-chip">📍 {st} <button type="button" onClick={() => removeGeo('states', st)}>×</button></span>
                    ))}
                    {form.target_states.length === 0 && <span className="crm-muted" style={{ fontSize: '0.8rem' }}>No constraints</span>}
                  </div>
                </div>

                {/* City Array */}
                <div className="geo-array-pane">
                  <div className="pane-header">Cities</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input style={{ flex: 1, padding: 6, fontSize: '0.8rem' }} placeholder="Add city (e.g. Fresno)" value={addGeo.cities} onChange={e => setAddGeo(a => ({ ...a, cities: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddGeo('cities')} />
                    <button type="button" onClick={() => handleAddGeo('cities')} style={{ padding: '6px 10px', background: '#e5e7eb', borderRadius: 4, border: 'none' }}>+</button>
                  </div>
                  <div className="pane-chips">
                    {form.target_cities.map(ct => (
                      <span key={ct} className="geo-chip">📍 {ct} <button type="button" onClick={() => removeGeo('cities', ct)}>×</button></span>
                    ))}
                    {form.target_cities.length === 0 && <span className="crm-muted" style={{ fontSize: '0.8rem' }}>No constraints</span>}
                  </div>
                </div>
                
                {/* County Array */}
                <div className="geo-array-pane">
                  <div className="pane-header">Counties</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input style={{ flex: 1, padding: 6, fontSize: '0.8rem' }} placeholder="Add county" value={addGeo.counties} onChange={e => setAddGeo(a => ({ ...a, counties: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddGeo('counties')} />
                    <button type="button" onClick={() => handleAddGeo('counties')} style={{ padding: '6px 10px', background: '#e5e7eb', borderRadius: 4, border: 'none' }}>+</button>
                  </div>
                  <div className="pane-chips">
                    {form.target_counties.map(ct => (
                      <span key={ct} className="geo-chip">📍 {ct} <button type="button" onClick={() => removeGeo('counties', ct)}>×</button></span>
                    ))}
                    {form.target_counties.length === 0 && <span className="crm-muted" style={{ fontSize: '0.8rem' }}>No constraints</span>}
                  </div>
                </div>

                {/* ZIP Array */}
                <div className="geo-array-pane">
                  <div className="pane-header">ZIP Codes</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input style={{ flex: 1, padding: 6, fontSize: '0.8rem' }} placeholder="Add ZIP" value={addGeo.zips} onChange={e => setAddGeo(a => ({ ...a, zips: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddGeo('zips')} />
                    <button type="button" onClick={() => handleAddGeo('zips')} style={{ padding: '6px 10px', background: '#e5e7eb', borderRadius: 4, border: 'none' }}>+</button>
                  </div>
                  <div className="pane-chips">
                    {form.target_zips.map(zp => (
                      <span key={zp} className="geo-chip">📍 {zp} <button type="button" onClick={() => removeGeo('zips', zp)}>×</button></span>
                    ))}
                    {form.target_zips.length === 0 && <span className="crm-muted" style={{ fontSize: '0.8rem' }}>No constraints</span>}
                  </div>
                </div>
              </div>
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
              <th>Target Geo</th>
              <th>Status</th>
              <th>Scheduled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="crm-empty">Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={6} className="crm-empty">No campaigns yet.</td></tr>
            ) : campaigns.map(c => (
              <tr key={c.id} data-testid={`campaign-row-${c.id}`}>
                <td>
                  <div className="crm-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.name}
                    {c.system_alias && <span style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.5px' }}>{c.system_alias}</span>}
                  </div>
                  {c.subject && <div className="crm-muted">{c.subject}</div>}
                </td>
                <td><span className="crm-badge channel">{c.channel === 'email' ? '📧 Email' : '💬 SMS'}</span></td>
                <td>
                  <div className="geo-table-stack">
                    {c.target_zips?.map(z => <span key={z} className="crm-badge filter">Zip: {z}</span>)}
                    {c.target_cities?.map(ct => <span key={ct} className="crm-badge filter">City: {ct}</span>)}
                    {c.target_states?.map(st => <span key={st} className="crm-badge filter">State: {st}</span>)}
                    {(!c.target_zips?.length && !c.target_cities?.length && !c.target_states?.length) && <span className="crm-muted">None</span>}
                  </div>
                </td>
                <td>
                  <span className="crm-status" style={{ color: STATUS_COLORS[c.status] }}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </td>
                <td className="crm-muted">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '—'}</td>
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
                  {c.status === 'active' && (
                     <span className="crm-muted">Automated</span>
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
        .crm-badge.filter { background: #eff6ff; color: #1d4ed8; font-size: 0.72rem; }
        .crm-status { font-weight: 600; font-size: 0.85rem; }
        .crm-rate { font-weight: 600; color: #059669; }
        .crm-empty { text-align: center; color: #9ca3af; padding: 48px; }

        /* Multi-Geo Styles */
        .zip-lookup-wrap { position: relative; }
        .zip-results { position: absolute; top: 72px; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 240px; overflow-y: auto; z-index: 10; padding: 4px; }
        .zip-result-item { width: 100%; text-align: left; background: none; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: background 0.1s; }
        .zip-result-item:hover { background: #f3f4f6; }
        .zip-result-main { display: flex; justify-content: space-between; align-items: center; color: #1f2937; }
        .zip-result-communities { display: flex; flex-wrap: wrap; gap: 4px; }
        .community-chip { background: #e0e7ff; color: #4338ca; border-radius: 12px; padding: 2px 8px; font-size: 0.72rem; font-weight: 500; }
        .geo-array-pane { background: #f9fafb; border: 1px dashed #d1d5db; border-radius: 8px; padding: 10px; }
        .pane-header { font-size: 0.75rem; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
        .pane-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .geo-chip { background: white; border: 1px solid #d1d5db; border-radius: 16px; padding: 4px 10px; font-size: 0.8rem; font-weight: 500; display: flex; align-items: center; gap: 6px; }
        .geo-chip button { background: none; border: none; font-size: 1rem; line-height: 0.5; font-weight: 700; color: #9ca3af; cursor: pointer; padding: 0 2px; }
        .geo-chip button:hover { color: #ef4444; }
        .geo-table-stack { display: flex; flex-wrap: wrap; gap: 4px; }
      `}</style>
    </div>
  )
}
