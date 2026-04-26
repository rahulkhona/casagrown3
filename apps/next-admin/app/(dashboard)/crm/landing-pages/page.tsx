'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type LandingPage = {
  id: string
  title: string
  slug: string           // matches the URL path segment, e.g. "spring-sale"
  description: string | null
  campaign_id: string | null
  is_active: boolean
  created_at: string
}

const marketUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : 'https://casagrown.com'


const defaultForm = {
  title:       '',
  slug:        '',
  description: '',
  is_active:   true,
}

export default function CrmLandingPagesPage() {
  const [pages, setPages]       = useState<LandingPage[]>([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [message, setMessage]   = useState('')
  const [form, setForm]         = useState(defaultForm)

  const fetchPages = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_landing_pages')
      .select('*')
      .order('created_at', { ascending: false })
    setPages((data as LandingPage[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchPages() }, [])

  const toast = (msg: string, ms = 3000) => { setMessage(msg); setTimeout(() => setMessage(''), ms) }

  // Auto-derive slug from title
  const handleTitleChange = (title: string) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setForm(f => ({ ...f, title, slug }))
  }

  const handleCreate = async () => {
    if (!form.title.trim() || !form.slug.trim()) return
    setSaving(true)

    const { error } = await supabase.from('crm_landing_pages').insert({
      title:       form.title,
      slug:        form.slug,
      description: form.description || null,
      is_active:   form.is_active,
    })

    if (!error) {
      setCreating(false)
      setForm(defaultForm)
      toast('Landing page registered — add useMarketingAnalytics() to the page file to enable tracking.')
      fetchPages()
    } else {
      toast(`Error: ${error.message}`)
    }
    setSaving(false)
  }

  const toggleActive = async (page: LandingPage) => {
    await supabase.from('crm_landing_pages').update({ is_active: !page.is_active }).eq('id', page.id)
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_active: !page.is_active } : p))
  }

  const deletePage = async (id: string) => {
    if (!confirm('WARNING: Deleting this canonical landing page registry will break the URL /p/... and visitors will see a 404 error! \n\nAny active promotions tied to this page will be safely preserved in the database, but they will become "homeless" until you assign them a new URL in the Promo Builder. \n\nAre you sure you want to proceed?')) return
    await supabase.from('crm_landing_pages').delete().eq('id', id)
    setPages(prev => prev.filter(p => p.id !== id))
    toast('Landing page removed')
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Landing Pages</h1>
          <p className="crm-subtitle">
            Register landing pages here to catalog their availability. Analytics and conversion pipelines are managed in the Metrics app.
          </p>
        </div>
        {!creating && (
          <button className="crm-btn-primary" onClick={() => setCreating(true)}>
            + Register Page
          </button>
        )}
      </div>

      {message && <div className="crm-toast">{message}</div>}

      {creating && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">Register Landing Page</h2>

          <div className="crm-form-grid">
            <div className="crm-field">
              <label>Page Title *</label>
              <input
                placeholder="e.g. Spring Growers Campaign"
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
              />
            </div>
            <div className="crm-field">
              <label>
                Slug * <span className="crm-hint">— auto-generated from name, must match the URL path</span>
              </label>
              <input
                placeholder="e.g. spring-growers"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              />
            </div>
            <div className="crm-field full-width">
              <label>Description</label>
              <input
                placeholder="What this page is for…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="crm-field" style={{ justifyContent: 'flex-end' }}>
              <label style={{ marginBottom: 10 }}>Active</label>
              <button
                type="button"
                className={`crm-toggle ${form.is_active ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              >
                <span className="toggle-dot" />
                <span>{form.is_active ? 'Active — tracking enabled' : 'Inactive — tracking paused'}</span>
              </button>
            </div>
          </div>

          <div className="crm-info-box">
            💡 After registering, add <code>{'useMarketingAnalytics()'}</code> to the page component.
            The beacon automatically reads the slug from the URL and writes to{' '}
            <code>crm_page_visits</code> / <code>crm_page_events</code> using this record's <code>id</code>.
          </div>

          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.title || !form.slug}>
              {saving ? 'Registering…' : 'Register Page'}
            </button>
            <button className="crm-btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>Slug / URL</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="crm-empty">Loading…</td></tr>
            ) : pages.length === 0 ? (
              <tr>
                <td colSpan={6} className="crm-empty">
                  No landing pages registered yet.<br />
                  <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                    Register a page above so visits and leads are attributed correctly.
                  </span>
                </td>
              </tr>
            ) : pages.map(page => (
              <tr key={page.id} data-testid={`lp-row-${page.id}`}>
                <td>
                  <div className="crm-name">{page.title}</div>
                  {page.description && <div className="crm-muted">{page.description}</div>}
                </td>
                <td>
                  <code className="slug-code">/p/{page.slug}</code>
                  <div>
                    <a href={`${marketUrl}/p/${page.slug}`} target="_blank" rel="noreferrer" className="page-url">
                      {marketUrl.replace('https://', '')}/p/{page.slug}
                    </a>
                  </div>
                </td>
                <td>
                  <button
                    className={`crm-status-pill ${page.is_active ? 'active' : 'inactive'}`}
                    onClick={() => toggleActive(page)}
                    title="Click to toggle"
                  >
                    {page.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="crm-muted">{new Date(page.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    className="crm-btn-danger-icon"
                    onClick={() => deletePage(page.id)}
                    title="Remove registration"
                  >🗑</button>
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
        .crm-subtitle code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
        .crm-toast { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field.full-width { grid-column: 1/-1; }
        .crm-field label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.78rem; }
        .crm-field input { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; }
        .crm-field input:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .crm-toggle { display: flex; align-items: center; gap: 10px; border: 2px solid #d1d5db; border-radius: 24px; padding: 8px 16px 8px 8px; background: #f9fafb; cursor: pointer; font-size: 0.9rem; color: #374151; font-weight: 500; transition: all 0.2s; width: fit-content; }
        .crm-toggle.active { border-color: #22c55e; background: #dcfce7; color: #166534; }
        .toggle-dot { width: 20px; height: 20px; border-radius: 50%; background: #d1d5db; transition: background 0.2s; flex-shrink: 0; }
        .crm-toggle.active .toggle-dot { background: #22c55e; }
        .crm-info-box { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px 16px; font-size: 0.85rem; color: #6d28d9; margin-bottom: 16px; line-height: 1.6; }
        .crm-info-box code { background: #ede9fe; border-radius: 4px; padding: 1px 5px; font-family: monospace; }
        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; }
        .crm-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; margin-top: 8px; }
        .crm-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .crm-table th { background: #f9fafb; padding: 10px 14px; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .crm-table td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        .crm-table tr:last-child td { border-bottom: none; }
        .crm-name { font-weight: 600; color: #1a2e1a; }
        .crm-muted { color: #9ca3af; font-size: 0.85rem; }
        .slug-code { background: #f3f4f6; border-radius: 4px; padding: 2px 6px; font-family: monospace; font-size: 0.85rem; color: #374151; }
        .page-url { font-size: 0.78rem; color: #6b7280; text-decoration: none; }
        .page-url:hover { color: #22c55e; text-decoration: underline; }
        .crm-badge { border-radius: 12px; padding: 2px 10px; font-size: 0.82rem; font-weight: 600; display: inline-block; }
        .crm-badge.stat-badge { background: #f3f4f6; color: #374151; }
        .crm-badge.stat-badge.green { background: #dcfce7; color: #166534; }
        .crm-status-pill { border: none; border-radius: 20px; padding: 4px 12px; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        .crm-status-pill.active { background: #dcfce7; color: #166534; }
        .crm-status-pill.inactive { background: #f3f4f6; color: #9ca3af; }
        .crm-btn-danger-icon { background: none; border: none; cursor: pointer; font-size: 1rem; opacity: 0.35; transition: opacity 0.15s; padding: 4px; }
        .crm-btn-danger-icon:hover { opacity: 1; }
        .crm-empty { text-align: center; color: #9ca3af; padding: 48px; line-height: 2; }
      `}</style>
    </div>
  )
}
