'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type AudienceFn = {
  id: string
  name: string
  label: string
  description: string | null
  tags: string[] | null
  is_rpc: boolean
  is_active: boolean
  created_at: string
}

const defaultForm = {
  name:        '',
  label:       '',
  description: '',
  tagInput:    '',
  tags:        [] as string[],
  is_rpc:      true,
}

export default function AudienceFunctionsPage() {
  const [fns, setFns]             = useState<AudienceFn[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [creating, setCreating]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [message, setMessage]     = useState('')
  const [form, setForm]           = useState(defaultForm)
  const [editingDesc, setEditingDesc] = useState<string | null>(null)
  const [descValue, setDescValue] = useState('')

  const fetchFns = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_audience_functions')
      .select('*')
      .order('label')
    setFns((data as AudienceFn[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchFns() }, [])

  const toast = (msg: string, ms = 3000) => { setMessage(msg); setTimeout(() => setMessage(''), ms) }

  // Keyword search across label + description + tags
  const filtered = fns.filter(fn => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      fn.label.toLowerCase().includes(q) ||
      (fn.description ?? '').toLowerCase().includes(q) ||
      (fn.name ?? '').toLowerCase().includes(q) ||
      (fn.tags ?? []).some(t => t.toLowerCase().includes(q))
    )
  })

  /* ---- Tag chips ---- */
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault()
      const tag = form.tagInput.trim().toLowerCase().replace(/\s+/g, '-')
      if (tag && !form.tags.includes(tag)) {
        setForm(f => ({ ...f, tags: [...f.tags, tag], tagInput: '' }))
      } else {
        setForm(f => ({ ...f, tagInput: '' }))
      }
    } else if (e.key === 'Backspace' && !form.tagInput && form.tags.length > 0) {
      setForm(f => ({ ...f, tags: f.tags.slice(0, -1) }))
    }
  }
  const removeTag = (tag: string) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))

  /* ---- Create ---- */
  const handleCreate = async () => {
    if (!form.name.trim() || !form.label.trim()) return
    setSaving(true)
    const { error } = await supabase.from('crm_audience_functions').insert({
      name:        form.name.trim(),
      label:       form.label.trim(),
      description: form.description.trim() || null,
      tags:        form.tags.length > 0 ? form.tags : null,
      is_rpc:      form.is_rpc,
      is_active:   true,
    })
    if (!error) {
      setCreating(false)
      setForm(defaultForm)
      toast('Function registered')
      fetchFns()
    } else {
      toast(`Error: ${error.message}`)
    }
    setSaving(false)
  }

  /* ---- Toggle active ---- */
  const toggleActive = async (fn: AudienceFn) => {
    await supabase.from('crm_audience_functions').update({ is_active: !fn.is_active }).eq('id', fn.id)
    setFns(prev => prev.map(f => f.id === fn.id ? { ...f, is_active: !fn.is_active } : f))
  }

  /* ---- Inline description edit ---- */
  const saveDesc = async (id: string) => {
    await supabase.from('crm_audience_functions').update({ description: descValue }).eq('id', id)
    setFns(prev => prev.map(f => f.id === id ? { ...f, description: descValue } : f))
    setEditingDesc(null)
    toast('Description updated')
  }

  /* ---- Delete ---- */
  const deleteFn = async (id: string) => {
    if (!confirm('Remove this function from the registry? (Does not delete the actual edge function.)')) return
    await supabase.from('crm_audience_functions').delete().eq('id', id)
    setFns(prev => prev.filter(f => f.id !== id))
    toast('Removed from registry')
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Audience Functions</h1>
          <p className="crm-subtitle">
            Registry of available audience edge functions. Functions listed here appear in the Audiences page dropdown.
            Name every function with the <code>crm_audience_</code> prefix and deploy it to Supabase before registering.
          </p>
        </div>
        {!creating && (
          <button className="crm-btn-primary" onClick={() => setCreating(true)}>
            + Register Function
          </button>
        )}
      </div>

      {message && <div className="crm-toast">{message}</div>}

      {creating && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">Register Audience Function</h2>
          <div className="crm-form-grid">

            <div className="crm-field">
              <label>
                Function Name *
                <span className="crm-hint"> — must match the deployed Supabase edge function or Postgres RPC name</span>
              </label>
              <input
                placeholder="e.g. crm_audience_high_value_buyers"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value.trim() }))}
              />
            </div>

            <div className="crm-field">
              <label>Display Label *</label>
              <input
                placeholder="e.g. High Value Buyers (>$200 lifetime)"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
            </div>

            <div className="crm-field full-width">
              <label>Description <span className="crm-hint">— describe what this function selects and why you'd use it</span></label>
              <textarea
                rows={3}
                placeholder="e.g. Selects all registered users who have placed at least 3 orders with total spend > $200. Good for upsell and loyalty campaigns."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="crm-field full-width">
              <label>Tags <span className="crm-hint">— type and press Enter or comma (used for search)</span></label>
              <div className="tag-input-wrap">
                {form.tags.map(tag => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>×</button>
                  </span>
                ))}
                <input
                  className="tag-text-input"
                  placeholder="e.g. buyers, high-value, upsell, loyalty"
                  value={form.tagInput}
                  onChange={e => setForm(f => ({ ...f, tagInput: e.target.value }))}
                  onKeyDown={handleTagKeyDown}
                />
              </div>
            </div>

            <div className="crm-field">
              <label>Type</label>
              <div className="crm-radio-group">
                <label className="crm-radio">
                  <input
                    type="radio"
                    checked={form.is_rpc}
                    onChange={() => setForm(f => ({ ...f, is_rpc: true }))}
                  />
                  <span>Postgres RPC</span>
                  <span className="crm-hint">(faster, runs in DB)</span>
                </label>
                <label className="crm-radio">
                  <input
                    type="radio"
                    checked={!form.is_rpc}
                    onChange={() => setForm(f => ({ ...f, is_rpc: false }))}
                  />
                  <span>Edge Function</span>
                  <span className="crm-hint">(can call external APIs)</span>
                </label>
              </div>
            </div>

          </div>

          <div className="crm-info-box">
            💡 The function will receive filter criteria (state, city, zip, date range, consent flags) as arguments
            and must return <code>{'{ id, email, phone }[]'}</code>.
            Required prefix: <code>crm_audience_</code>
          </div>

          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.name || !form.label}>
              {saving ? 'Registering…' : 'Register Function'}
            </button>
            <button className="crm-btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="crm-toolbar">
        <input
          className="crm-search"
          placeholder="Search by name, description, or tag…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="crm-result-count">
          {filtered.length} function{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cards */}
      {loading ? (
        <p className="crm-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="crm-muted">
          {search ? `No functions matching "${search}"` : 'No functions registered yet.'}
        </p>
      ) : (
        <div className="fn-grid">
          {filtered.map(fn => (
            <div key={fn.id} className={`fn-card ${!fn.is_active ? 'inactive' : ''}`} data-testid={`fn-card-${fn.id}`}>
              <div className="fn-card-top">
                <div className="fn-left">
                  <span className="fn-type-badge">{fn.is_rpc ? 'RPC' : 'Edge'}</span>
                  <code className="fn-name">{fn.name}</code>
                </div>
                <button
                  className={`crm-status-pill ${fn.is_active ? 'active' : 'inactive'}`}
                  onClick={() => toggleActive(fn)}
                  title="Click to toggle"
                >
                  {fn.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              <h3 className="fn-label">{fn.label}</h3>

              {editingDesc === fn.id ? (
                <div className="fn-desc-edit">
                  <textarea
                    rows={3}
                    value={descValue}
                    onChange={e => setDescValue(e.target.value)}
                    className="fn-desc-textarea"
                    autoFocus
                  />
                  <div className="fn-desc-actions">
                    <button className="crm-btn-sm" onClick={() => saveDesc(fn.id)}>Save</button>
                    <button className="crm-btn-sm secondary" onClick={() => setEditingDesc(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p
                  className="fn-desc"
                  onClick={() => { setEditingDesc(fn.id); setDescValue(fn.description ?? '') }}
                  title="Click to edit description"
                >
                  {fn.description || <span className="crm-muted">No description — click to add</span>}
                </p>
              )}

              {fn.tags && fn.tags.length > 0 && (
                <div className="fn-tags">
                  {fn.tags.map(tag => (
                    <span key={tag} className="crm-badge tag">#{tag}</span>
                  ))}
                </div>
              )}

              <div className="fn-footer">
                <span className="crm-muted">{new Date(fn.created_at).toLocaleDateString()}</span>
                <button
                  className="crm-btn-danger-icon"
                  onClick={() => deleteFn(fn.id)}
                  title="Remove from registry"
                >🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; max-width: 580px; line-height: 1.5; }
        .crm-subtitle code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 0.85em; }
        .crm-toast { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; }

        /* Form */
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field.full-width { grid-column: 1/-1; }
        .crm-field > label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.78rem; }
        .crm-field input, .crm-field textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; font-family: inherit; }
        .crm-field input:focus, .crm-field textarea:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .crm-field textarea { resize: vertical; }

        /* Radio group */
        .crm-radio-group { display: flex; gap: 20px; }
        .crm-radio { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; color: #374151; }
        .crm-radio input { accent-color: #22c55e; }

        /* Tag chips */
        .tag-input-wrap { display: flex; flex-wrap: wrap; gap: 6px; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; min-height: 44px; align-items: center; }
        .tag-input-wrap:focus-within { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .tag-chip { display: flex; align-items: center; gap: 4px; background: #ede9fe; color: #6d28d9; border-radius: 12px; padding: 2px 10px; font-size: 0.8rem; font-weight: 500; }
        .tag-chip button { background: none; border: none; cursor: pointer; color: #7c3aed; font-size: 1rem; line-height: 1; padding: 0; }
        .tag-text-input { border: none; outline: none; font-size: 0.9rem; flex: 1; min-width: 120px; }

        .crm-info-box { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px 16px; font-size: 0.85rem; color: #6d28d9; margin-bottom: 16px; line-height: 1.6; }
        .crm-info-box code { background: #ede9fe; border-radius: 4px; padding: 1px 5px; font-family: monospace; }
        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; }

        /* Search toolbar */
        .crm-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .crm-search { flex: 1; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 14px; font-size: 0.95rem; outline: none; }
        .crm-search:focus { border-color: #4ade80; }
        .crm-result-count { font-size: 0.85rem; color: #9ca3af; white-space: nowrap; }

        /* Function cards */
        .fn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
        .fn-card { background: white; border: 1px solid #e5e7eb; border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 10px; transition: box-shadow 0.2s; }
        .fn-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.07); }
        .fn-card.inactive { opacity: 0.55; }
        .fn-card-top { display: flex; justify-content: space-between; align-items: center; }
        .fn-left { display: flex; align-items: center; gap: 8px; }
        .fn-type-badge { background: #f3f4f6; color: #6b7280; border-radius: 6px; padding: 2px 8px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .fn-name { font-family: monospace; font-size: 0.82rem; color: #374151; background: #f9fafb; border-radius: 4px; padding: 2px 6px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fn-label { font-size: 1rem; font-weight: 700; color: #1a2e1a; margin: 0; }
        .fn-desc { font-size: 0.875rem; color: #4b5563; line-height: 1.5; cursor: pointer; border-radius: 6px; padding: 4px; transition: background 0.1s; margin: 0; }
        .fn-desc:hover { background: #f9fafb; }
        .fn-desc-edit { display: flex; flex-direction: column; gap: 6px; }
        .fn-desc-textarea { border: 1px solid #4ade80; border-radius: 8px; padding: 8px 10px; font-size: 0.875rem; outline: none; font-family: inherit; resize: vertical; }
        .fn-desc-actions { display: flex; gap: 8px; }
        .fn-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .fn-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid #f3f4f6; padding-top: 10px; }

        .crm-badge { border-radius: 12px; padding: 2px 10px; font-size: 0.78rem; font-weight: 500; }
        .crm-badge.tag { background: #ede9fe; color: #6d28d9; }
        .crm-status-pill { border: none; border-radius: 20px; padding: 4px 12px; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        .crm-status-pill.active { background: #dcfce7; color: #166534; }
        .crm-status-pill.inactive { background: #f3f4f6; color: #9ca3af; }
        .crm-btn-sm { border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; background: white; }
        .crm-btn-sm.secondary { color: #6b7280; }
        .crm-btn-danger-icon { background: none; border: none; cursor: pointer; font-size: 1rem; opacity: 0.3; transition: opacity 0.15s; padding: 2px; }
        .crm-btn-danger-icon:hover { opacity: 1; }
        .crm-muted { color: #9ca3af; font-size: 0.85rem; }
      `}</style>
    </div>
  )
}
