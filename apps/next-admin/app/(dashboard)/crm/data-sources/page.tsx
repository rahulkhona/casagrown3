'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type DataSource = {
  id: string
  name: string
  description: string | null
  rpc_name: string
  return_schema: any
  created_at: string
}

export default function CrmDataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', rpc_name: '', return_schema: '{\n  "example": "data"\n}' })
  const [message, setMessage] = useState('')

  const fetchSources = async () => {
    setLoading(true)
    const { data } = await supabase.from('crm_data_sources').select('*').order('created_at', { ascending: false })
    setSources((data as DataSource[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchSources() }, [])

  const handleCreate = async () => {
    let schemaJson;
    try {
      schemaJson = JSON.parse(form.return_schema);
    } catch(e) {
      setMessage('Invalid JSON schema format. Please fix the return schema syntax.');
      return;
    }

    setSaving(true)
    const { error, data } = await supabase.from('crm_data_sources').insert({
      name: form.name,
      description: form.description,
      rpc_name: form.rpc_name,
      return_schema: schemaJson
    }).select().single()

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else if (data) {
      setSources(prev => [data as DataSource, ...prev])
      setCreating(false)
      setForm({ name: '', description: '', rpc_name: '', return_schema: '{\n  "example": "data"\n}' })
      setTimeout(() => setMessage('Data Source registered!'), 500)
    }
    setSaving(false)
    setTimeout(() => setMessage(''), 4000)
  }

  const deleteSource = async (id: string) => {
    if (!confirm('Remove this Data Source? Campaigns relying on it will fail to hydrate data.')) return
    await supabase.from('crm_data_sources').delete().eq('id', id)
    setSources(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Data Sources</h1>
          <p className="crm-subtitle">
            Register backend RPC queries so Campaign designers can merge dynamic JSON payloads into Postmark and SMS templates.
          </p>
        </div>
        {!creating && (
          <button className="crm-btn-primary" onClick={() => setCreating(true)}>
            + Register Data Source
          </button>
        )}
      </div>

      {message && <div className="crm-toast">{message}</div>}

      {creating && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">Register Data Source</h2>
          <div className="crm-form-grid">
            <div className="crm-field">
              <label>Friendly Name *</label>
              <input placeholder="e.g. Latest Market Products" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="crm-field">
              <label>Description</label>
              <input placeholder="What does this return?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="crm-field full-width">
              <label>PostgreSQL RPC Function Name *</label>
              <input placeholder="e.g. get_top_products" value={form.rpc_name} onChange={e => setForm(f => ({ ...f, rpc_name: e.target.value }))} />
              <p className="crm-hint">The database function that Edge will execute without arguments.</p>
            </div>
            <div className="crm-field full-width">
              <label>JSON Return Schema Reference *</label>
              <textarea 
                rows={8}
                style={{ fontFamily: 'monospace', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
                value={form.return_schema} 
                onChange={e => setForm(f => ({ ...f, return_schema: e.target.value }))} 
              />
              <p className="crm-hint">Show template designers exactly what properties they can loop over (e.g. {'{{data_source.items.0.price}}'}).</p>
            </div>
          </div>
          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.name || !form.rpc_name}>
              {saving ? 'Saving...' : 'Register Source'}
            </button>
            <button className="crm-btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Data Source</th>
              <th>RPC Name</th>
              <th>Return Schema Reference</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="crm-empty">Loading…</td></tr>
            ) : sources.length === 0 ? (
              <tr><td colSpan={4} className="crm-empty">No Data Sources registered yet.</td></tr>
            ) : sources.map(s => (
              <tr key={s.id}>
                <td>
                  <div className="crm-name">{s.name}</div>
                  <div className="crm-muted">{s.description}</div>
                </td>
                <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{s.rpc_name}</code></td>
                <td>
                  <pre style={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto', 
                    background: '#1e293b', 
                    color: '#a5b4fc',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    maxWidth: '400px'
                  }}>
                    {JSON.stringify(s.return_schema, null, 2)}
                  </pre>
                </td>
                <td>
                  <button className="crm-btn-danger-icon" onClick={() => deleteSource(s.id)}>🗑</button>
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
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; max-width: 560px; }
        .crm-toast { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field.full-width { grid-column: 1/-1; }
        .crm-field label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.78rem; }
        .crm-field input, .crm-field textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; }
        .crm-field input:focus, .crm-field textarea:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #16a34a; color: white; border: none; border-radius: 8px; padding: 10px 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .crm-btn-primary:hover { background: #15803d; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: #f3f4f6; color: #374151; border: none; border-radius: 8px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
        .crm-btn-secondary:hover { background: #e5e7eb; }
        .crm-btn-danger-icon { background: none; border: none; font-size: 1.2rem; cursor: pointer; opacity: 0.6; }
        .crm-btn-danger-icon:hover { opacity: 1; color: #dc2626; }
        .crm-table-wrap { background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
        .crm-table { width: 100%; border-collapse: collapse; text-align: left; }
        .crm-table th { background: #f9fafb; padding: 12px 16px; font-size: 0.8rem; font-weight: 600; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .crm-table td { padding: 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .crm-name { font-weight: 600; color: #111827; }
        .crm-muted { color: #6b7280; font-size: 0.85rem; }
        .crm-empty { text-align: center; color: #6b7280; padding: 32px !important; }
      `}</style>
    </div>
  )
}
