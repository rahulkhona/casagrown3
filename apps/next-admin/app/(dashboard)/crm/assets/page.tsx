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
  type: 'image' | 'video' | 'audio' | 'email_template' | 'sms_template' | 'document'
  storage_path: string | null
  content: string | null
  description: string | null
  tags: string[] | null
  created_at: string
}

const ASSET_TYPES = [
  { value: 'image',          label: '🖼️ Image',          uploadAccept: 'image/*' },
  { value: 'video',          label: '🎬 Video',          uploadAccept: 'video/*' },
  { value: 'audio',          label: '🎵 Audio',          uploadAccept: 'audio/*' },
  { value: 'email_template', label: '📧 Email Template', uploadAccept: null },
  { value: 'sms_template',   label: '💬 SMS Template',   uploadAccept: null },
  { value: 'document',       label: '📄 Document',       uploadAccept: '.pdf,.doc,.docx,.txt,.csv' },
]

const MEDIA_TYPES = ['image', 'video', 'audio', 'document']

const defaultForm = {
  name: '',
  description: '',
  type: 'image' as Asset['type'],
  content: '',
  tagInput: '',
  tags: [] as string[],
}

export default function CrmAssetsPage() {
  const [assets, setAssets]       = useState<Asset[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(defaultForm)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
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

  const toast = (msg: string, ms = 3000) => {
    setMessage(msg)
    if (!msg.startsWith('Error')) setTimeout(() => setMessage(''), ms)
  }

  // Merged into handleSaveTemplate

  /* ---------- Tag chip input ---------- */
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

  const removeTag = (tag: string) =>
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))

  /* ---------- Save template / content record ---------- */
  const handleSaveTemplate = async () => {
    if (!form.name.trim()) return
    const typeIsMedia = MEDIA_TYPES.includes(form.type)
    if (typeIsMedia && !uploadFile) {
      toast('Please select a file to upload')
      return
    }

    setUploading(true)
    let finalPath = null

    if (typeIsMedia && uploadFile) {
      const path = `crm/${Date.now()}-${uploadFile.name}`
      const { error: uploadErr } = await supabase.storage
        .from('marketing-assets')
        .upload(path, uploadFile, { upsert: true })

      if (uploadErr) {
        toast(`Upload failed: ${uploadErr.message}`)
        setUploading(false)
        return
      }
      finalPath = path
    }

    const { error } = await supabase.from('crm_assets').insert({
      name: form.name,
      description: form.description || null,
      type: form.type,
      storage_path: finalPath,
      content: !typeIsMedia ? form.content || null : null,
      tags: form.tags.length > 0 ? form.tags : null,
    })

    if (!error) {
      setShowForm(false)
      setForm(defaultForm)
      setUploadFile(null)
      toast('Asset saved!')
      fetchAssets()
    } else {
      toast(`Error saving asset: ${error.message}`)
    }
    setUploading(false)
  }

  const copyUrl = (asset: Asset) => {
    const url = asset.storage_path 
      ? supabase.storage.from('marketing-assets').getPublicUrl(asset.storage_path).data.publicUrl
      : ''
    if (url) { navigator.clipboard.writeText(url); toast('URL copied!', 2000) }
  }

  const deleteAsset = async (asset: Asset) => {
    if (asset.storage_path) {
      await supabase.storage.from('marketing-assets').remove([asset.storage_path])
    }
    await supabase.from('crm_assets').delete().eq('id', asset.id)
    setAssets(prev => prev.filter(a => a.id !== asset.id))
  }

  const typeIsMedia = MEDIA_TYPES.includes(form.type)
  const contentPlaceholder =
    form.type === 'email_template'
      ? 'Enter HTML content, a prompt for AI generation, or notes for the campaign...'
      : form.type === 'sms_template'
      ? 'Enter the message body, merge vars like {{first_name}}, or an AI prompt...'
      : 'Notes, description, or AI-generation prompt for this asset...'

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Marketing Assets</h1>
          <p className="crm-subtitle">Images, video, audio, templates, and documents for campaigns</p>
        </div>
        <div className="crm-header-actions">
          <button className="crm-btn-primary" onClick={() => { setShowForm(true); setForm(defaultForm); setUploadFile(null); }}>
            + New Asset
          </button>
        </div>
      </div>

      {message && (
        <div className={`crm-toast ${message.startsWith('Error') ? 'error' : 'success'}`}>
          <span style={{ flex: 1 }}>{message}</span>
          <button onClick={() => setMessage('')} className="toast-close">✕</button>
        </div>
      )}

      {showForm && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">New Asset</h2>
          <div className="crm-form-grid">

            {/* Name */}
            <div className="crm-field">
              <label>Name *</label>
              <input
                placeholder="e.g. Spring Promo Banner"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Type */}
            <div className="crm-field">
              <label>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Asset['type'] }))}>
                {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Description */}
            <div className="crm-field full-width">
              <label>Description</label>
              <input
                placeholder="Short description of this asset (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Tags */}
            <div className="crm-field full-width">
              <label>Tags <span className="crm-hint">— type and press Enter or comma</span></label>
              <div className="tag-input-wrap">
                {form.tags.map(tag => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>×</button>
                  </span>
                ))}
                <input
                  className="tag-text-input"
                  placeholder="e.g. spring, promo, email"
                  value={form.tagInput}
                  onChange={e => setForm(f => ({ ...f, tagInput: e.target.value }))}
                  onKeyDown={handleTagKeyDown}
                />
              </div>
            </div>

            {/* Select File (only if media) */}
            {typeIsMedia && (
              <div className="crm-field full-width">
                <label>Media File *</label>
                <input
                  type="file"
                  accept={ASSET_TYPES.find(t => t.value === form.type)?.uploadAccept || ''}
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  style={{ background: '#f9fafb', padding: '12px' }}
                />
              </div>
            )}

            {/* Content / AI Prompt — only for templates & documents */}
            {!typeIsMedia && (
              <div className="crm-field full-width">
                <label>
                  Content / AI Prompt
                  <span className="crm-hint"> — AI will use this as the prompt to generate final content for each send</span>
                </label>
                <textarea
                  rows={7}
                  placeholder={contentPlaceholder}
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                />
              </div>
            )}

          </div>
          <div className="crm-form-actions">
            <button className="crm-btn-primary" onClick={handleSaveTemplate} disabled={uploading || !form.name}>
              {uploading ? 'Saving…' : 'Save Asset'}
            </button>
            <button className="crm-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="assets-toolbar">
        {['all', ...ASSET_TYPES.map(t => t.value)].map(t => (
          <button
            key={t}
            className={`assets-filter-btn ${typeFilter === t ? 'active' : ''}`}
            onClick={() => setTypeFilter(t)}
          >
            {t === 'all' ? 'All' : ASSET_TYPES.find(a => a.value === t)?.label ?? t}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="assets-grid">
        {loading ? (
          <p className="crm-muted">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="crm-muted">No assets yet. Upload media or create a template.</p>
        ) : assets.map(asset => (
          <div key={asset.id} className="asset-card" data-testid={`asset-card-${asset.id}`}>
            <div className="asset-preview">
              {asset.type === 'image' && asset.storage_path ? (
                <img src={supabase.storage.from('marketing-assets').getPublicUrl(asset.storage_path).data.publicUrl} alt={asset.name} />
              ) : asset.type === 'video' && asset.storage_path ? (
                <video src={supabase.storage.from('marketing-assets').getPublicUrl(asset.storage_path).data.publicUrl} muted playsInline />
              ) : asset.type === 'audio' ? (
                <span className="asset-type-icon">🎵</span>
              ) : (
                <div className="asset-preview-template">
                  <span className="asset-type-icon">
                    {ASSET_TYPES.find(t => t.value === asset.type)?.label?.split(' ')[0] ?? '📄'}
                  </span>
                  {asset.content && (
                    <p className="template-preview">{asset.content.slice(0, 80)}…</p>
                  )}
                </div>
              )}
            </div>
            <div className="asset-info">
              <p className="asset-name">{asset.name}</p>
              {asset.description && <p className="asset-desc">{asset.description}</p>}
              <div className="asset-meta-row">
                <span className="crm-badge type">{asset.type.replace(/_/g, ' ')}</span>
                {asset.tags?.map(tag => (
                  <span key={tag} className="crm-badge tag">#{tag}</span>
                ))}
              </div>
            </div>
            <div className="asset-actions">
              {asset.storage_path && (
                <button className="crm-btn-sm" onClick={() => copyUrl(asset)}>Copy URL</button>
              )}
              <button
                className="crm-btn-danger-sm"
                onClick={() => deleteAsset(asset)}
                data-testid={`asset-delete-${asset.id}`}
              >Delete</button>
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
        .crm-upload-btn { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; font-size: 0.95rem; font-weight: 500; white-space: nowrap; }
        .crm-upload-btn:hover { background: #e5e7eb; }
        .crm-toast { display: flex; align-items: center; justify-content: space-between; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-weight: 500; font-size: 0.9rem; }
        .crm-toast.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
        .crm-toast.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .toast-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; opacity: 0.6; padding: 0 0 0 12px; }
        .toast-close:hover { opacity: 1; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; }
        .crm-form-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; color: #1a2e1a; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field.full-width { grid-column: 1/-1; }
        .crm-field label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.8rem; }
        .crm-field input, .crm-field select, .crm-field textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; }
        .crm-field input:focus, .crm-field select:focus, .crm-field textarea:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .crm-field textarea { resize: vertical; font-family: inherit; }

        /* Tag chips */
        .tag-input-wrap { display: flex; flex-wrap: wrap; gap: 6px; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; min-height: 44px; align-items: center; cursor: text; }
        .tag-input-wrap:focus-within { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .tag-chip { display: flex; align-items: center; gap: 4px; background: #ede9fe; color: #6d28d9; border-radius: 12px; padding: 2px 10px; font-size: 0.8rem; font-weight: 500; }
        .tag-chip button { background: none; border: none; cursor: pointer; color: #7c3aed; font-size: 1rem; line-height: 1; padding: 0; }
        .tag-text-input { border: none; outline: none; font-size: 0.9rem; flex: 1; min-width: 120px; }

        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; }
        .crm-btn-sm { background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }
        .crm-btn-danger-sm { background: white; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }

        /* Filter tabs */
        .assets-toolbar { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .assets-filter-btn { border: 1px solid #d1d5db; border-radius: 20px; padding: 6px 16px; font-size: 0.85rem; cursor: pointer; background: white; color: #374151; transition: all 0.2s; }
        .assets-filter-btn.active { background: #22c55e; color: white; border-color: #22c55e; }

        /* Grid */
        .assets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        .asset-card { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: white; transition: box-shadow 0.2s; display: flex; flex-direction: column; }
        .asset-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .asset-preview { height: 140px; background: #f9fafb; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .asset-preview img { width: 100%; height: 100%; object-fit: cover; }
        .asset-preview video { width: 100%; height: 100%; object-fit: cover; }
        .asset-preview-template { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; }
        .asset-type-icon { font-size: 2rem; }
        .template-preview { font-size: 0.72rem; color: #9ca3af; font-family: monospace; text-align: center; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .asset-info { padding: 12px; border-bottom: 1px solid #f3f4f6; flex: 1; }
        .asset-name { font-weight: 600; font-size: 0.9rem; color: #1a2e1a; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .asset-desc { font-size: 0.78rem; color: #6b7280; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .asset-meta-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
        .crm-badge { border-radius: 12px; padding: 2px 10px; font-size: 0.78rem; font-weight: 500; }
        .crm-badge.type { background: #f3f4f6; color: #6b7280; }
        .crm-badge.tag { background: #ede9fe; color: #6d28d9; }
        .asset-actions { padding: 10px 12px; display: flex; gap: 8px; }
        .crm-muted { color: #9ca3af; font-size: 0.9rem; }
      `}</style>
    </div>
  )
}
