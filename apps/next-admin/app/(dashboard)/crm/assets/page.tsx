'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Asset = {
  id: string
  name: string
  type: 'image' | 'email_template' | 'sms_template' | 'document'
  storage_path: string | null
  content: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const ASSET_TYPES = [
  { value: 'image', label: '🖼️ Image' },
  { value: 'email_template', label: '📧 Email Template' },
  { value: 'sms_template', label: '💬 SMS Template' },
  { value: 'document', label: '📄 Document' },
]

export default function CrmAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'image' as Asset['type'], content: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchAssets = async () => {
    setLoading(true)
    let q = supabase.from('crm_assets').select('*').order('created_at', { ascending: false })
    if (typeFilter !== 'all') q = q.eq('type', typeFilter)
    const { data } = await q
    setAssets((data as Asset[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAssets() }, [typeFilter])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const path = `campaign-media/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('marketing-assets')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      setMessage(`Upload failed: ${uploadErr.message}`)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('marketing-assets').getPublicUrl(path)

    const { error: insertErr } = await supabase.from('crm_assets').insert({
      name: file.name,
      type: 'image',
      storage_path: path,
      metadata: {
        public_url: urlData.publicUrl,
        mime_type: file.type,
        size_bytes: file.size,
      },
    })

    if (insertErr) {
      setMessage(`DB insert failed: ${insertErr.message}`)
    } else {
      setMessage('Image uploaded!')
      setTimeout(() => setMessage(''), 3000)
      fetchAssets()
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSaveTemplate = async () => {
    if (!form.name.trim()) return
    setUploading(true)

    const { error } = await supabase.from('crm_assets').insert({
      name: form.name,
      type: form.type,
      content: form.content || null,
    })

    if (!error) {
      setShowForm(false)
      setForm({ name: '', type: 'image', content: '' })
      setMessage('Template saved!')
      setTimeout(() => setMessage(''), 3000)
      fetchAssets()
    }
    setUploading(false)
  }

  const copyUrl = (asset: Asset) => {
    const url = asset.metadata?.public_url as string
    if (url) {
      navigator.clipboard.writeText(url)
      setMessage('URL copied!')
      setTimeout(() => setMessage(''), 2000)
    }
  }

  const deleteAsset = async (asset: Asset) => {
    if (asset.storage_path) {
      await supabase.storage.from('marketing-assets').remove([asset.storage_path])
    }
    await supabase.from('crm_assets').delete().eq('id', asset.id)
    setAssets(prev => prev.filter(a => a.id !== asset.id))
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Marketing Assets</h1>
          <p className="crm-subtitle">Images, email templates, and SMS templates for campaigns</p>
        </div>
        <div className="crm-header-actions">
          <label className="crm-upload-btn">
            {uploading ? 'Uploading...' : '⬆ Upload Image'}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} hidden />
          </label>
          <button className="crm-btn-primary" onClick={() => setShowForm(true)}>+ New Template</button>
        </div>
      </div>

      {message && <div className="crm-toast">{message}</div>}

      {showForm && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">New Template</h2>
          <div className="crm-form-grid">
            <div className="crm-field">
              <label>Name</label>
              <input placeholder="Template name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="crm-field">
              <label>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Asset['type'] }))}>
                {ASSET_TYPES.filter(t => t.value !== 'image').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="crm-field full-width">
              <label>Content</label>
              <textarea rows={8} placeholder={form.type === 'email_template' ? '<h1>Hello!</h1>\n<p>Your message here...</p>' : 'SMS text (max 160 chars)'} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>
          </div>
          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleSaveTemplate} disabled={uploading || !form.name}>Save Template</button>
            <button className="crm-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="assets-toolbar">
        {['all', 'image', 'email_template', 'sms_template', 'document'].map(t => (
          <button key={t} className={`assets-filter-btn ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
            {t === 'all' ? 'All' : ASSET_TYPES.find(a => a.value === t)?.label ?? t}
          </button>
        ))}
      </div>

      <div className="assets-grid">
        {loading ? (
          <p className="crm-muted">Loading...</p>
        ) : assets.length === 0 ? (
          <p className="crm-muted">No assets yet. Upload images or create templates.</p>
        ) : assets.map(asset => (
          <div key={asset.id} className="asset-card" data-testid={`asset-card-${asset.id}`}>
            {asset.type === 'image' && asset.metadata?.public_url ? (
              <div className="asset-preview">
                <img src={asset.metadata.public_url as string} alt={asset.name} />
              </div>
            ) : (
              <div className="asset-preview template">
                <span>{ASSET_TYPES.find(t => t.value === asset.type)?.label?.split(' ')[0] ?? '📄'}</span>
                {asset.content && <p className="template-preview">{asset.content.slice(0, 80)}...</p>}
              </div>
            )}
            <div className="asset-info">
              <p className="asset-name">{asset.name}</p>
              <span className="crm-badge type">{asset.type.replace('_', ' ')}</span>
            </div>
            <div className="asset-actions">
              {asset.metadata?.public_url && (
                <button className="crm-btn-sm" onClick={() => copyUrl(asset)}>Copy URL</button>
              )}
              <button className="crm-btn-danger-sm" onClick={() => deleteAsset(asset)} data-testid={`asset-delete-${asset.id}`}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; }
        .crm-header-actions { display: flex; gap: 12px; align-items: center; }
        .crm-upload-btn { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; font-size: 0.95rem; font-weight: 500; }
        .crm-upload-btn:hover { background: #e5e7eb; }
        .crm-toast { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field.full-width { grid-column: 1/-1; }
        .crm-field label { font-size: 0.85rem; font-weight: 500; color: #6b7280; }
        .crm-field input, .crm-field select, .crm-field textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; font-family: monospace; }
        .crm-field textarea { resize: vertical; }
        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; }
        .crm-btn-sm { background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }
        .crm-btn-danger-sm { background: white; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }
        .assets-toolbar { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .assets-filter-btn { border: 1px solid #d1d5db; border-radius: 20px; padding: 6px 16px; font-size: 0.85rem; cursor: pointer; background: white; color: #374151; transition: all 0.2s; }
        .assets-filter-btn.active { background: #22c55e; color: white; border-color: #22c55e; }
        .assets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        .asset-card { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: white; transition: box-shadow 0.2s; }
        .asset-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .asset-preview { height: 140px; background: #f9fafb; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .asset-preview img { width: 100%; height: 100%; object-fit: cover; }
        .asset-preview.template { flex-direction: column; gap: 8px; padding: 16px; font-size: 2rem; }
        .template-preview { font-size: 0.75rem; color: #9ca3af; font-family: monospace; text-align: center; overflow: hidden; }
        .asset-info { padding: 12px; border-bottom: 1px solid #f3f4f6; }
        .asset-name { font-weight: 600; font-size: 0.9rem; color: #1a2e1a; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .crm-badge { border-radius: 12px; padding: 2px 10px; font-size: 0.78rem; font-weight: 500; }
        .crm-badge.type { background: #f3f4f6; color: #6b7280; }
        .asset-actions { padding: 10px 12px; display: flex; gap: 8px; }
        .crm-muted { color: #9ca3af; font-size: 0.9rem; }
      `}</style>
    </div>
  )
}
