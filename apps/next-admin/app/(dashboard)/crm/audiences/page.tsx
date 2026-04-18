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
  estimated_size: number | null
  created_at: string
}

type AudienceFunction = {
  id: string
  name: string
  label: string
  description: string | null
  is_rpc: boolean
  is_active: boolean
}

// Always-available fallback sentinel for ad-hoc functions not yet in the registry
const CUSTOM_SENTINEL = '__custom__'

const defaultForm = {
  name:               '',
  description:        '',
  source:             'crm_audience_all',
  custom_fn:          '',
}

export default function CrmAudiencesPage() {
  const [audiences, setAudiences]       = useState<Audience[]>([])
  const [audienceFns, setAudienceFns]   = useState<AudienceFunction[]>([])
  const [fnsLoading, setFnsLoading]     = useState(true)
  const [loading, setLoading]           = useState(true)
  const [creating, setCreating]         = useState(false)
  const [saving, setSaving]             = useState(false)
  const [message, setMessage]           = useState('')
  const [form, setForm]                 = useState(defaultForm)

  const fetchAudiences = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_audiences')
      .select('*')
      .order('created_at', { ascending: false })
    setAudiences((data as Audience[]) ?? [])
    setLoading(false)
  }

  const fetchAudienceFunctions = async () => {
    setFnsLoading(true)
    const { data } = await supabase
      .from('crm_audience_functions')
      .select('*')
      .eq('is_active', true)
      .order('label')
    setAudienceFns((data as AudienceFunction[]) ?? [])
    setFnsLoading(false)
  }

  useEffect(() => {
    fetchAudiences()
    fetchAudienceFunctions()
  }, [])

  const toast = (msg: string, ms = 4000) => { setMessage(msg); setTimeout(() => setMessage(''), ms) }

  const estimateSize = async (rpcName: string): Promise<number | null> => {
    if (rpcName === CUSTOM_SENTINEL) return null
    const { data, error } = await supabase.rpc(rpcName)
    if (error || !data) return null
    return (data as unknown[]).length
  }

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)

    const rpcName = form.source === CUSTOM_SENTINEL
      ? (form.custom_fn.trim() || 'crm_audience_all')
      : form.source

    const size = await estimateSize(rpcName)

    const { error } = await supabase.from('crm_audiences').insert({
      name:              form.name,
      description:       form.description || null,
      audience_rpc_name: rpcName,
      estimated_size:    size,
    })

    if (!error) {
      setCreating(false)
      setForm(defaultForm)
      toast(`Audience created${size != null ? ` (est. ${size.toLocaleString()} recipients)` : ''}`)
      fetchAudiences()
    }
    setSaving(false)
  }

  const deleteAudience = async (id: string) => {
    await supabase.from('crm_audiences').delete().eq('id', id)
    setAudiences(prev => prev.filter(a => a.id !== id))
  }

  const sourceLabel = (rpcName: string) =>
    audienceFns.find(f => f.name === rpcName)?.label ?? rpcName

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Audiences</h1>
          <p className="crm-subtitle">
            Define reusable recipient segments for email/SMS campaigns.
            Each audience runs a Supabase edge function (RPC) that returns a recipient list.
          </p>
        </div>
        {!creating && (
          <button id="create-audience-btn" className="crm-btn-primary" onClick={() => setCreating(true)}>
            + New Audience
          </button>
        )}
      </div>

      {message && <div className="crm-toast">{message}</div>}

      {creating && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">Create Audience</h2>

          {/* Row 1 — Name + Description */}
          <div className="crm-form-grid col2">
            <div className="crm-field">
              <label>Audience Name *</label>
              <input
                placeholder="e.g. California Buyers"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="crm-field">
              <label>Description</label>
              <input
                placeholder="Internal notes…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Population source */}
          <div className="crm-section-label">Population Source</div>
          <div className="crm-form-grid col2">
            <div className="crm-field">
              <label>
                Base Population
                {fnsLoading && <span className="crm-hint"> — loading…</span>}
              </label>
              <select
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value, custom_fn: '' }))}
                disabled={fnsLoading}
              >
                {audienceFns.map(fn => (
                  <option key={fn.name} value={fn.name}>
                    {fn.label}
                  </option>
                ))}
                <option value={CUSTOM_SENTINEL}>⚡ Custom edge function…</option>
              </select>
              {form.source !== CUSTOM_SENTINEL && (
                <p className="crm-hint" style={{ marginTop: 4 }}>
                  {audienceFns.find(f => f.name === form.source)?.description ?? ''}
                </p>
              )}
            </div>
            {form.source === CUSTOM_SENTINEL && (
              <div className="crm-field">
                <label>
                  Edge Function Name
                  <span className="crm-hint"> — must be deployed to Supabase Functions</span>
                </label>
                <input
                  placeholder="e.g. crm_audience_high_value_buyers"
                  value={form.custom_fn}
                  onChange={e => setForm(f => ({ ...f, custom_fn: e.target.value }))}
                />
              </div>
            )}
          </div>
          {form.source === CUSTOM_SENTINEL && (
            <div className="crm-info-box">
              ⚡ Enter any deployed Supabase edge function name. It will receive the filter criteria as arguments and must return
              an array of <code>{'{ id, email, phone }'}</code> records.<br />
              Once deployed and tested, register it in the <strong>Audience Functions registry</strong> so it appears in this dropdown automatically.
            </div>
          )}

          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.name}>
              {saving ? 'Creating…' : 'Create Audience'}
            </button>
            <button className="crm-btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Audience Name</th>
              <th>Source Function</th>
              <th>Filters</th>
              <th>Est. Size</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="crm-empty">Loading…</td></tr>
            ) : audiences.length === 0 ? (
              <tr><td colSpan={6} className="crm-empty">No audiences yet. Create one to use in campaigns.</td></tr>
            ) : audiences.map(a => (
              <tr key={a.id} data-testid={`audience-row-${a.id}`}>
                <td>
                  <div className="crm-name">{a.name}</div>
                  {a.description && <div className="crm-muted">{a.description}</div>}
                </td>
                <td className="crm-muted">{sourceLabel(a.audience_rpc_name)}</td>
                <td>
                  <span className="crm-muted">Native RPC Filter</span>
                </td>
                <td>
                  {a.estimated_size != null
                    ? <span className="crm-badge size">{a.estimated_size.toLocaleString()}</span>
                    : '—'}
                </td>
                <td className="crm-muted">{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    className="crm-btn-danger-sm"
                    onClick={() => deleteAudience(a.id)}
                    data-testid={`audience-delete-${a.id}`}
                  >Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; max-width: 520px; }
        .crm-toast { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }

        .crm-section-label { font-size: 0.75rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin: 20px 0 10px; }
        .crm-form-grid { display: grid; gap: 16px; margin-bottom: 4px; }
        .crm-form-grid.col2 { grid-template-columns: 1fr 1fr; }
        .crm-form-grid.col3 { grid-template-columns: 1fr 1fr 1fr; }

        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.78rem; }
        .crm-field input, .crm-field select { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; }
        .crm-field input:focus, .crm-field select:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }

        .crm-info-box { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px 16px; font-size: 0.85rem; color: #6d28d9; margin-bottom: 8px; line-height: 1.5; }
        .crm-info-box code { background: #ede9fe; border-radius: 4px; padding: 1px 5px; font-family: monospace; }

        /* Toggle buttons for consent */
        .crm-toggles { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .crm-toggle { display: flex; align-items: center; gap: 10px; border: 2px solid #d1d5db; border-radius: 24px; padding: 8px 16px 8px 8px; background: #f9fafb; cursor: pointer; font-size: 0.9rem; color: #374151; font-weight: 500; transition: all 0.2s; }
        .crm-toggle:hover { border-color: #4ade80; background: #f0fdf4; }
        .crm-toggle.active { border-color: #22c55e; background: #dcfce7; color: #166534; }
        .toggle-dot { width: 20px; height: 20px; border-radius: 50%; background: #d1d5db; transition: background 0.2s; flex-shrink: 0; }
        .crm-toggle.active .toggle-dot { background: #22c55e; }
        .crm-hint-block { font-size: 0.8rem; color: #9ca3af; margin: 0; }
        .zip-lookup-wrap { margin-bottom: 12px; }
        .zip-search-row { display: flex; align-items: center; gap: 10px; }
        .zip-search-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; width: 220px; }
        .zip-search-input:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .zip-selected-chip { display: inline-flex; align-items: center; gap: 8px; background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; border-radius: 20px; padding: 4px 12px; font-size: 0.85rem; font-weight: 500; }
        .zip-selected-chip button { background: none; border: none; cursor: pointer; color: #16a34a; font-size: 1rem; line-height: 1; padding: 0; }
        .zip-results { border: 1px solid #e5e7eb; border-radius: 8px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.08); margin-top: 4px; overflow: hidden; max-width: 480px; }
        .zip-result-item { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 10px 14px; background: none; border: none; border-bottom: 1px solid #f3f4f6; cursor: pointer; text-align: left; font-size: 0.9rem; color: #374151; transition: background 0.1s; }
        .zip-result-item:last-child { border-bottom: none; }
        .zip-result-item:hover { background: #f0fdf4; }
        .zip-result-main { display: flex; align-items: center; gap: 12px; }
        .zip-result-main strong { font-family: monospace; color: #1a2e1a; min-width: 54px; }
        .zip-result-main span { color: #6b7280; }
        .zip-result-communities { display: flex; flex-wrap: wrap; gap: 4px; padding-left: 66px; }
        .community-chip { background: #e0f2fe; color: #0369a1; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; font-weight: 500; }

        .crm-form-actions { display: flex; gap: 12px; margin-top: 20px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-danger-sm { background: white; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }

        .crm-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; margin-top: 8px; }
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
