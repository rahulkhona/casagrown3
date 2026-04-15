'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Audience = {
  id: string
  name: string
  description: string | null
  audience_rpc_name: string
  filter_criteria: Record<string, unknown> | null
  estimated_size: number | null
  created_at: string
}

const AUDIENCE_RPCS = [
  { value: 'crm_audience_all', label: 'All (leads + users)' },
  { value: 'crm_audience_has_bought_before', label: 'Has Bought Before' },
  { value: 'crm_audience_has_sold_before', label: 'Has Sold Before' },
  { value: 'crm_audience_expressed_buying_interest', label: 'Expressed Buying Interest (watches)' },
]

export default function CrmAudiencesPage() {
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    name: '',
    description: '',
    audience_rpc_name: 'crm_audience_all',
    filter_state_code: '',
    filter_accepts_email: false,
    filter_accepts_sms: false,
    filter_joined_after: '',
    filter_joined_before: '',
  })

  const fetchAudiences = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_audiences')
      .select('*')
      .order('created_at', { ascending: false })
    setAudiences((data as Audience[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAudiences() }, [])

  const estimateSize = async (rpcName: string) => {
    const { data, error } = await supabase.rpc(rpcName)
    if (error || !data) return null
    return (data as unknown[]).length
  }

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)

    const filter_criteria: Record<string, unknown> = {}
    if (form.filter_state_code) filter_criteria.state_code = form.filter_state_code
    if (form.filter_accepts_email) filter_criteria.accepts_email = true
    if (form.filter_accepts_sms) filter_criteria.accepts_sms = true
    if (form.filter_joined_after) filter_criteria.joined_after = form.filter_joined_after
    if (form.filter_joined_before) filter_criteria.joined_before = form.filter_joined_before

    const size = await estimateSize(form.audience_rpc_name)

    const { error } = await supabase.from('crm_audiences').insert({
      name: form.name,
      description: form.description || null,
      audience_rpc_name: form.audience_rpc_name,
      filter_criteria: Object.keys(filter_criteria).length > 0 ? filter_criteria : null,
      estimated_size: size,
    })

    if (!error) {
      setCreating(false)
      setForm({ name: '', description: '', audience_rpc_name: 'crm_audience_all', filter_state_code: '', filter_accepts_email: false, filter_accepts_sms: false, filter_joined_after: '', filter_joined_before: '' })
      setMessage(`Audience created (est. ${size ?? '?'} recipients)`)
      setTimeout(() => setMessage(''), 4000)
      fetchAudiences()
    }
    setSaving(false)
  }

  const deleteAudience = async (id: string) => {
    await supabase.from('crm_audiences').delete().eq('id', id)
    setAudiences(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Audiences</h1>
          <p className="crm-subtitle">Define reusable recipient segments for email/SMS campaigns</p>
        </div>
        {!creating && (
          <button
            id="create-audience-btn"
            className="crm-btn-primary"
            onClick={() => setCreating(true)}
          >
            + New Audience
          </button>
        )}
      </div>

      {message && <div className="crm-toast">{message}</div>}

      {creating && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">Create Audience</h2>
          <div className="crm-form-grid">
            <div className="crm-field">
              <label>Audience Name *</label>
              <input placeholder="e.g. California Buyers" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="crm-field">
              <label>Description</label>
              <input placeholder="Description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="crm-field">
              <label>Base Query</label>
              <select value={form.audience_rpc_name} onChange={e => setForm(f => ({ ...f, audience_rpc_name: e.target.value }))}>
                {AUDIENCE_RPCS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="crm-field">
              <label>State Code Filter (optional)</label>
              <input placeholder="e.g. CA" maxLength={2} value={form.filter_state_code} onChange={e => setForm(f => ({ ...f, filter_state_code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="crm-field">
              <label>Joined After</label>
              <input type="date" value={form.filter_joined_after} onChange={e => setForm(f => ({ ...f, filter_joined_after: e.target.value }))} />
            </div>
            <div className="crm-field">
              <label>Joined Before</label>
              <input type="date" value={form.filter_joined_before} onChange={e => setForm(f => ({ ...f, filter_joined_before: e.target.value }))} />
            </div>
          </div>
          <div className="crm-checkboxes">
            <label><input type="checkbox" checked={form.filter_accepts_email} onChange={e => setForm(f => ({ ...f, filter_accepts_email: e.target.checked }))} /> Accepts Email only</label>
            <label><input type="checkbox" checked={form.filter_accepts_sms} onChange={e => setForm(f => ({ ...f, filter_accepts_sms: e.target.checked }))} /> Accepts SMS only</label>
          </div>
          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.name}>
              {saving ? 'Creating...' : 'Create Audience'}
            </button>
            <button className="crm-btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Audience Name</th>
              <th>Base Query</th>
              <th>Filters</th>
              <th>Est. Size</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="crm-empty">Loading...</td></tr>
            ) : audiences.length === 0 ? (
              <tr><td colSpan={6} className="crm-empty">No audiences yet. Create one to use in campaigns.</td></tr>
            ) : audiences.map(a => (
              <tr key={a.id} data-testid={`audience-row-${a.id}`}>
                <td>
                  <div className="crm-name">{a.name}</div>
                  {a.description && <div className="crm-muted">{a.description}</div>}
                </td>
                <td className="crm-muted">{AUDIENCE_RPCS.find(r => r.value === a.audience_rpc_name)?.label ?? a.audience_rpc_name}</td>
                <td>
                  {a.filter_criteria
                    ? Object.entries(a.filter_criteria).map(([k, v]) => (
                      <span key={k} className="crm-badge filter">{k}: {String(v)}</span>
                    ))
                    : <span className="crm-muted">No filters</span>}
                </td>
                <td>
                  {a.estimated_size != null
                    ? <span className="crm-badge size">{a.estimated_size.toLocaleString()}</span>
                    : '—'}
                </td>
                <td className="crm-muted">{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="crm-btn-danger-sm" onClick={() => deleteAudience(a.id)} data-testid={`audience-delete-${a.id}`}>Delete</button>
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
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field label { font-size: 0.85rem; font-weight: 500; color: #6b7280; }
        .crm-field input, .crm-field select { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; }
        .crm-field input:focus, .crm-field select:focus { border-color: #4ade80; }
        .crm-checkboxes { display: flex; gap: 24px; margin-bottom: 20px; font-size: 0.9rem; color: #374151; }
        .crm-checkboxes label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-danger-sm { background: white; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }
        .crm-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; }
        .crm-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .crm-table th { background: #f9fafb; padding: 10px 14px; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .crm-table td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        .crm-table tr:last-child td { border-bottom: none; }
        .crm-name { font-weight: 600; color: #1a2e1a; }
        .crm-muted { color: #9ca3af; font-size: 0.85rem; }
        .crm-badge { border-radius: 12px; padding: 2px 10px; font-size: 0.78rem; font-weight: 500; display: inline-block; margin: 2px; }
        .crm-badge.filter { background: #ede9fe; color: #7c3aed; }
        .crm-badge.size { background: #ecfdf5; color: #059669; }
        .crm-empty { text-align: center; color: #9ca3af; padding: 48px; }
      `}</style>
    </div>
  )
}
