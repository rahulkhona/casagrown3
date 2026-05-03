'use client'

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('../app/components/QuillEditor'), { ssr: false })

export interface CampaignFormState {
  name: string
  channel: 'email' | 'sms'
  subject: string
  content_html: string
  content_text: string
  postmark_template_alias: string
  test_emails: string
  data_source_id?: string
  // Add other fields as needed, but we only mutate the message ones here
  [key: string]: any
}

interface CampaignMessageEditorProps {
  form: CampaignFormState
  setForm: React.Dispatch<React.SetStateAction<CampaignFormState>>
  templateMode: boolean
  setTemplateMode: (mode: boolean) => void
  dataSources: any[]
  supabase: any
  toast: (msg: string, ms?: number) => void
  showChannelSelector?: boolean
  showTestAndDataFields?: boolean
  showDesignModeSelector?: boolean
}

const formatHTML = (html: string) => {
  let formatted = '';
  let indent = 0;
  let temp = html.replace(/>\s+</g, '><');
  const tokens = temp.split(/(<[^>]+>)/g).filter(t => t.trim() !== '');
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.match(/^<\//)) {
      indent = Math.max(0, indent - 1);
      formatted += '\n' + '  '.repeat(indent) + token;
    } else if (token.match(/^<[^\/]/) && !token.match(/\/>$/) && !token.match(/^<(img|hr|br|meta|link|input)/i)) {
      if (i > 0) formatted += '\n' + '  '.repeat(indent);
      formatted += token;
      indent++;
    } else {
      if (token.startsWith('<')) {
         formatted += '\n' + '  '.repeat(indent) + token;
      } else {
         formatted += token;
      }
    }
  }
  return formatted.trim();
}

export default function CampaignMessageEditor({
  form,
  setForm,
  templateMode,
  setTemplateMode,
  dataSources,
  supabase,
  toast,
  showChannelSelector = true,
  showTestAndDataFields = true,
  showDesignModeSelector = true
}: CampaignMessageEditorProps) {
  const quillRef = useRef<any>(null)
  
  const [htmlMode, setHtmlMode] = useState<'wysiwyg' | 'raw'>('wysiwyg')
  const [previewEmail, setPreviewEmail] = useState<{ html: string, text: string } | null>(null)
  const [previewTab, setPreviewTab] = useState<'html' | 'text'>('html')

  // Modals state
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [assets, setAssets] = useState<{name: string, url: string}[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const quillSelectionRef = useRef<{ index: number, length: number } | null>(null)

  const [landingPages, setLandingPages] = useState<any[]>([])
  const [promotions, setPromotions] = useState<any[]>([])
  const [promoModalDest, setPromoModalDest] = useState<'quill' | 'clipboard' | null>(null)
  const [linkSearch, setLinkSearch] = useState('')

  // AI Draft Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState('Friendly and Urgent')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [aiDraft, setAiDraft] = useState('')

  const SUPPORTED_VARS = [
    { value: '', label: '➕ Add Variable' },
    { value: 'first_name', label: 'First Name' },
    { value: 'full_name', label: 'Full Name' },
    { value: 'email', label: 'Email Address' },
    { value: 'zip_code', label: 'Zip Code' },
    { value: 'total_purchases', label: 'Total Purchases' },
    { value: 'lifetime_spend', label: 'Lifetime Spend' },
    { value: 'abandoned_cart_count', label: 'Abandoned Carts' },
    { value: 'available_balance_usd', label: 'Wallet Balance ($)' }
  ];

  const appendVar = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (!v) return;
    if (form.channel === 'sms') {
      setForm(f => ({ ...f, content_text: (f.content_text || '') + ' {{' + v + '}}' }));
    } else {
      setForm(f => ({ ...f, content_html: (f.content_html || '') + ' {{' + v + '}}' }));
    }
    e.target.value = '';
    toast('Variable appended!');
  };

  useEffect(() => {
    // Fetch landing pages and promos for the link picker
    const fetchLinkData = async () => {
      const [{ data: lps }, { data: promos }, { data: shortLinks }] = await Promise.all([
        supabase.from('crm_short_links').select('token, destination_url').is('campaign_id', null),
        supabase.from('crm_landing_pages').select('id, slug, title').eq('is_active', true),
        supabase.from('crm_promotions').select('id, name, landing_page_id').order('created_at', { ascending: false })
      ])
      if (lps) setLandingPages(lps)
      if (promos) {
        // Attach shortlinks to promos if found
        const promosWithTokens = promos.map(p => {
          const lp = (lps || []).find(l => l.id === p.landing_page_id);
          if (lp) {
            const suffix = `/p/${lp.slug}?promo=${p.id}`;
            const sl = (shortLinks || []).find(s => s.destination_url?.endsWith(suffix));
            if (sl) p.short_token = sl.token;
          }
          return p;
        });
        setPromotions(promosWithTokens)
      }
    }
    fetchLinkData()
  }, [supabase])

  const openAssetPicker = useCallback(async () => {
    const quill = quillRef.current?.getEditor()
    if (quill) {
      const sel = quill.getSelection()
      quillSelectionRef.current = sel ? { index: sel.index, length: sel.length } : { index: 0, length: 0 }
    }
    setAssetPickerOpen(true)
    setLoadingAssets(true)
    const { data } = await supabase.storage.from('media').list('crm', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    if (data) {
      const formatted = data.filter((f:any) => f.name !== '.emptyFolderPlaceholder').map((f:any) => ({
        name: f.name,
        url: supabase.storage.from('media').getPublicUrl(`crm/${f.name}`).data.publicUrl
      }))
      setAssets(formatted)
    }
    setLoadingAssets(false)
  }, [supabase])

  const imageHandler = useCallback(() => {
    openAssetPicker()
  }, [openAssetPicker])

  const insertPromoHandler = useCallback(() => {
    const quill = quillRef.current?.getEditor()
    if (quill) {
      const sel = quill.getSelection()
      if (sel && sel.length > 0) {
        quillSelectionRef.current = { index: sel.index, length: sel.length }
      } else if (sel) {
        const [leaf] = quill.getLeaf(sel.index)
        if (leaf && leaf.parent && leaf.parent.domNode && leaf.parent.domNode.tagName === 'A') {
          const linkIndex = quill.getIndex(leaf.parent)
          const linkLength = leaf.parent.length()
          quillSelectionRef.current = { index: linkIndex, length: linkLength }
          quill.setSelection(linkIndex, linkLength)
        } else {
          quillSelectionRef.current = { index: sel.index, length: 0 }
        }
      } else {
        quillSelectionRef.current = { index: 0, length: 0 }
      }
    }
    setPromoModalDest('quill')
  }, [])

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        [{ 'font': ['sans-serif', 'serif', 'monospace', 'arial', 'courier', 'garamond', 'tahoma', 'times', 'verdana'] }],
        [{ 'size': ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px'] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'align': [] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link', 'image', 'promo'],
        ['clean']
      ],
      handlers: {
        image: imageHandler,
        promo: insertPromoHandler
      }
    }
  }), [imageHandler, insertPromoHandler])

  const handleGenerateAi = async () => {
    if (!aiPrompt) return;
    setIsGeneratingAi(true);
    setAiDraft('');
    try {
      const { data, error } = await supabase.functions.invoke('generate-campaign-content', {
        body: { prompt: aiPrompt, channel: form.channel, tone: aiTone }
      });
      if (error) throw error;
      console.log('[AI Response]', data);
      if (data.error) throw new Error(data.error);
      const content = data.content ?? data.text ?? data.result ?? '';
      if (!content) throw new Error(`AI returned empty content. Raw: ${JSON.stringify(data)}`);
      setAiDraft(content);
      toast('Draft generated successfully by AI! Review before applying.');
    } catch (err: any) {
      console.error(err);
      toast(`AI Generation Failed: ${err.message}`);
    } finally {
      setIsGeneratingAi(false);
    }
  }

  const applyAiDraft = (mode: 'replace' | 'append') => {
    if (!aiDraft) return;
    if (form.channel === 'sms') {
      const newContent = mode === 'replace' ? aiDraft : (form.content_text + '\n\n' + aiDraft);
      setForm(f => ({ ...f, content_text: newContent }));
    } else {
      const newContent = mode === 'replace' ? aiDraft : (form.content_html + '<br><br>' + aiDraft);
      setForm(f => ({ ...f, content_html: newContent }));
      setHtmlMode('wysiwyg');
    }
    setAiModalOpen(false);
    setAiPrompt('');
    setAiDraft('');
    toast('AI draft applied to editor!');
  }


  return (
    <div className="crm-message-editor">
      {showChannelSelector && (
        <div className="crm-field">
          <label>Channel</label>
          <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value as 'email' | 'sms' }))}>
            <option value="email">📧 Email</option>
            <option value="sms">💬 SMS</option>
          </select>
        </div>
      )}

      {form.channel === 'email' && showDesignModeSelector && (
        <div className="crm-field full-width" style={{ marginTop: showChannelSelector ? 16 : 0 }}>
          <label>Design Mode</label>
          <select value={templateMode ? 'template' : 'custom'} onChange={e => setTemplateMode(e.target.value === 'template')}>
            <option value="custom">✍️ Custom HTML / Subject</option>
            <option value="template">🧩 Postmark Template API</option>
          </select>
        </div>
      )}

      {form.channel === 'email' && !templateMode && (
        <div className="crm-field full-width" style={{ marginTop: 16 }}>
          <label>Email Subject *</label>
          <textarea 
            rows={2}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontFamily: 'inherit', fontSize: '1rem', resize: 'vertical', minHeight: '60px' }}
            placeholder="e.g. Fresh produce just dropped in your area 🌱" 
            value={form.subject || ''} 
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} 
          />
        </div>
      )}

      {form.channel === 'email' && !templateMode && (
        <div className="crm-field full-width" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
            <label>Email Content (HTML)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {htmlMode === 'raw' && (
                <>
                  <button
                    type="button"
                    onClick={() => setPromoModalDest('clipboard')}
                    style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    🔗 Copy a Link...
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, content_html: formatHTML(f.content_html) }))}
                    style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    ✨ Pretty Print
                  </button>
                </>
              )}
              <select value={htmlMode} onChange={e => setHtmlMode(e.target.value as 'wysiwyg' | 'raw')} style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
                <option value="wysiwyg">Inline Editor (WYSIWYG)</option>
                <option value="raw">Raw HTML (Paste Template)</option>
              </select>
              <select onChange={appendVar} style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                {SUPPORTED_VARS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
              <select onChange={appendVar} style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                {SUPPORTED_VARS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setAiModalOpen(true)}
                style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'linear-gradient(to right, #8b5cf6, #3b82f6)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ✨ Ask AI
              </button>
            </div>
          </div>
          {htmlMode === 'wysiwyg' ? (
            <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden' }}>
              <style>{`
                .crm-message-editor .ql-container {
                  resize: vertical;
                  overflow-y: auto;
                  min-height: 260px;
                }
              `}</style>
              <ReactQuill 
                ref={quillRef}
                theme="snow" 
                modules={quillModules}
                value={form.content_html || ''} 
                onChange={(val: string) => setForm(f => ({...f, content_html: val}))} 
                style={{ minHeight: '300px' }}
              />
            </div>
          ) : (
            <textarea 
              placeholder="<html><body>...</body></html>" 
              value={form.content_html || ''} 
              onChange={e => setForm(f => ({ ...f, content_html: e.target.value }))} 
              style={{ width: '100%', minHeight: '300px', fontFamily: 'monospace', fontSize: '0.85rem', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }} 
            />
          )}
          <div className="crm-hint" style={{ marginTop: 8 }}>
            💡 To insert images, use the Image button in the toolbar and paste the public URL of any image from your Assets tab.
          </div>
        </div>
      )}

      {form.channel === 'email' && !templateMode && (
        <div className="crm-field full-width" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
            <label>Plain Text Fallback (Optional) <span className="crm-hint">— used if the user's client strips HTML</span></label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setPromoModalDest('clipboard')}
                style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                🔗 Get Short Links
              </button>
              <button
                type="button"
                onClick={() => setAiModalOpen(true)}
                style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'linear-gradient(to right, #8b5cf6, #3b82f6)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ✨ Ask AI
              </button>
            </div>
          </div>
          <textarea 
            placeholder="Hello, ..." 
            value={form.content_text || ''} 
            onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))} 
            style={{ width: '100%', minHeight: '150px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }} 
          />
        </div>
      )}

      {form.channel === 'email' && !templateMode && (
        <div className="crm-field full-width" style={{ marginTop: 12 }}>
          <button 
            type="button" 
            className="crm-btn-secondary" 
            onClick={() => {
              setPreviewEmail({ html: form.content_html, text: form.content_text })
              setPreviewTab('html')
            }}
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ fontSize: '1.2rem' }}>👁️</span> Preview Email
          </button>
        </div>
      )}

      {form.channel === 'sms' && (
        <div className="crm-field full-width" style={{ marginTop: showChannelSelector ? 16 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
            <label>SMS Text Content *</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setPromoModalDest('clipboard')}
                style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                🔗 Get Short Links
              </button>
              <button
                type="button"
                onClick={() => setAiModalOpen(true)}
                style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'linear-gradient(to right, #8b5cf6, #3b82f6)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ✨ Ask AI
              </button>
            </div>
          </div>
          <textarea 
            placeholder="Hey, spring drop is live! 🍓 Reply STOP to unsub." 
            value={form.content_text || ''} 
            onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))} 
            style={{ width: '100%', minHeight: '100px', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }} 
          />
        </div>
      )}

      {form.channel === 'email' && templateMode && (
        <div className="crm-field full-width" style={{ marginTop: 16 }}>
          <label>Postmark Template Alias *</label>
          <input placeholder="e.g. market-welcome-1" value={form.postmark_template_alias || ''} onChange={e => setForm(f => ({ ...f, postmark_template_alias: e.target.value }))} />
        </div>
      )}
      
      {showTestAndDataFields && (
        <>
          <div className="crm-field full-width" style={{ marginTop: 16 }}>
            <label>Data Provider (Template Model Hydration)</label>
            <select value={form.data_source_id || ''} onChange={e => setForm(f => ({ ...f, data_source_id: e.target.value }))}>
              <option value="">None (Static Payload Only)</option>
              {dataSources.map(s => <option key={s.id} value={s.id}>{s.name} ({s.rpc_name})</option>)}
            </select>
          </div>

          {form.channel === 'email' && (
            <div className="crm-field full-width" style={{ marginTop: 16 }}>
              <label>Adhoc Test Emails <span className="crm-hint">— Comma separated, for testing this template</span></label>
              <input 
                placeholder="e.g. admin@casagrown.com, founder@casagrown.com" 
                value={form.test_emails || ''} 
                onChange={e => setForm(f => ({ ...f, test_emails: e.target.value }))} 
              />
            </div>
          )}
        </>
      )}

      {/* MODALS */}

      {assetPickerOpen && (
        <div className="modal-overlay">
          <div className="modal-content asset-picker-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a2e1a' }}>Select Image</h3>
              <button onClick={() => setAssetPickerOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>&times;</button>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <button className="crm-btn-primary" onClick={() => {
                const input = document.createElement('input')
                input.setAttribute('type', 'file')
                input.setAttribute('accept', 'image/*')
                input.click()

                input.onchange = async () => {
                  const file = input.files ? input.files[0] : null
                  if (!file) return
                  
                  toast('Uploading image to assets...', 10000)
                  setAssetPickerOpen(false)
                  const fileName = `crm/${Date.now()}-${file.name}`
                  
                  const { error } = await supabase.storage.from('media').upload(fileName, file)
                  if (error) {
                    toast(`Error: Upload failed - ${error.message}`)
                    return
                  }
                  
                  await supabase.from('crm_assets').insert({
                    name: `Campaign Upload: ${file.name}`,
                    type: 'image',
                    storage_path: fileName
                  })
                  
                  const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName)
                  
                  const quill = quillRef.current?.getEditor()
                  if (quill) {
                    quill.insertEmbed(quillSelectionRef.current?.index || 0, 'image', publicUrlData.publicUrl)
                  }
                  toast('Image inserted!')
                }
              }} style={{ width: '100%', padding: '12px' }}>+ Upload New Image from Computer</button>
            </div>

            <div style={{ height: '350px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb' }}>
              {loadingAssets ? (
                <div className="crm-muted" style={{ textAlign: 'center', padding: 40 }}>Loading assets...</div>
              ) : assets.length === 0 ? (
                <div className="crm-muted" style={{ textAlign: 'center', padding: 40 }}>No images found in your Assets library.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
                  {assets.map(a => (
                    <div key={a.name} 
                         onClick={() => {
                           const quill = quillRef.current?.getEditor()
                           if (quill) {
                             const idx = quillSelectionRef.current?.index || 0;
                             quill.insertEmbed(idx, 'image', a.url)
                           }
                           setAssetPickerOpen(false)
                         }}
                         style={{ border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'white' }}
                         className="asset-thumb-card"
                    >
                      <div style={{ height: 90, backgroundImage: `url(${a.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                      <div style={{ padding: '6px 8px', fontSize: '0.7rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>
                        {a.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {promoModalDest !== null && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Insert Link</h3>
              <button className="toast-close" onClick={() => setPromoModalDest(null)}>×</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input 
                type="text" 
                placeholder="Search promotions or landing pages..." 
                value={linkSearch} 
                onChange={e => setLinkSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
                autoFocus
              />
            </div>

            <div style={{ height: '350px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase', marginTop: 8 }}>Active Promotions</div>
                {promotions.filter(p => p.name.toLowerCase().includes(linkSearch.toLowerCase())).map(p => {
                  const lp = landingPages.find(l => l.id === p.landing_page_id);
                  if (!lp) return null;
                  const baseUrl = process.env.NEXT_PUBLIC_MARKET_URL || 'https://casagrown.com';
                  const url = p.short_token ? `${baseUrl}/r/${p.short_token}` : `${baseUrl}/p/${lp.slug}?promo=${p.id}`;
                  return (
                    <button key={p.id} type="button" onClick={() => {
                      if (promoModalDest === 'quill') {
                        const quill = quillRef.current?.getEditor();
                        if (quill) {
                          const sel = quillSelectionRef.current || { index: 0, length: 0 };
                          if (sel.length > 0) {
                            quill.formatText(sel.index, sel.length, 'link', url);
                          } else {
                            quill.insertText(sel.index, p.name, 'link', url);
                          }
                        }
                      } else {
                        navigator.clipboard.writeText(url);
                        toast('Link copied to clipboard!');
                      }
                      setPromoModalDest(null);
                      setLinkSearch('');
                    }} style={{ textAlign: 'left', padding: '10px 12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>🎁 {p.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>{url}</div>
                    </button>
                  )
                })}

                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase', marginTop: 16 }}>Landing Pages</div>
                {landingPages.filter(lp => lp.title.toLowerCase().includes(linkSearch.toLowerCase()) || lp.slug.toLowerCase().includes(linkSearch.toLowerCase())).map(lp => {
                  const baseUrl = process.env.NEXT_PUBLIC_MARKET_URL || 'https://casagrown.com';
                  const url = `${baseUrl}/p/${lp.slug}`;
                  return (
                    <button key={lp.id} type="button" onClick={() => {
                      if (promoModalDest === 'quill') {
                        const quill = quillRef.current?.getEditor();
                        if (quill) {
                          const sel = quillSelectionRef.current || { index: 0, length: 0 };
                          if (sel.length > 0) {
                            quill.formatText(sel.index, sel.length, 'link', url);
                          } else {
                            quill.insertText(sel.index, lp.title, 'link', url);
                          }
                        }
                      } else {
                        navigator.clipboard.writeText(url);
                        toast('Link copied to clipboard!');
                      }
                      setPromoModalDest(null);
                      setLinkSearch('');
                    }} style={{ textAlign: 'left', padding: '10px 12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>📄 {lp.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>{url}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewEmail && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', height: '85vh', display: 'flex', flexDirection: 'column', padding: '0', background: '#f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'white', borderBottom: '1px solid #e5e7eb', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#111827' }}>Email Preview</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', background: '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
                  <button 
                    type="button"
                    style={{ background: previewTab === 'html' ? 'white' : 'transparent', border: 'none', padding: '6px 16px', borderRadius: '6px', fontWeight: previewTab === 'html' ? 600 : 400, boxShadow: previewTab === 'html' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', color: '#374151' }} 
                    onClick={() => setPreviewTab('html')}
                  >HTML View</button>
                  <button 
                    type="button"
                    style={{ background: previewTab === 'text' ? 'white' : 'transparent', border: 'none', padding: '6px 16px', borderRadius: '6px', fontWeight: previewTab === 'text' ? 600 : 400, boxShadow: previewTab === 'text' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', color: '#374151' }} 
                    onClick={() => setPreviewTab('text')}
                  >Plain Text</button>
                </div>
                <button type="button" className="crm-btn-secondary" style={{ padding: '6px 14px' }} onClick={() => setPreviewEmail(null)}>✕ Close</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              {previewTab === 'html' ? (
                <div style={{ background: 'white', maxWidth: '600px', margin: '0 auto', height: '100%', minHeight: '600px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
                  <iframe 
                    srcDoc={previewEmail.html || ''}
                    style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
                    title="Email Preview"
                  />
                </div>
              ) : (
                <div style={{ background: 'white', maxWidth: '600px', margin: '0 auto', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', borderRadius: '8px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#333', fontSize: '0.9rem', lineHeight: '1.6', position: 'relative', isolation: 'isolate' }}>
                  {previewEmail.text || 'No plain text fallback provided.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* AI Draft Modal */}
      {aiModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '600px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>✨ AI Draft Assistant</h3>
            
            {!aiDraft ? (
              <>
                <div className="crm-field full-width" style={{ marginBottom: '16px' }}>
                  <label>What do you want to announce?</label>
                  <textarea 
                    rows={4}
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="e.g. We have fresh heirloom tomatoes and honey coming this weekend. Order before Friday."
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical' }}
                  />
                </div>
                
                <div className="crm-field full-width" style={{ marginBottom: '24px' }}>
                  <label>Tone</label>
                  <select value={aiTone} onChange={e => setAiTone(e.target.value)} style={{ width: '100%' }}>
                    <option value="Friendly and Urgent">Friendly & Urgent</option>
                    <option value="Professional and Welcoming">Professional & Welcoming</option>
                    <option value="Casual and Fun">Casual & Fun</option>
                    <option value="Short and Direct">Short & Direct</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  {isGeneratingAi && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #d1d5db', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Contacting AI, please wait…
                    </span>
                  )}
                  <button type="button" className="crm-btn-secondary" onClick={() => { setAiModalOpen(false); setAiPrompt(''); }} disabled={isGeneratingAi}>Cancel</button>
                  <button 
                    type="button" 
                    className="crm-btn" 
                    onClick={handleGenerateAi}
                    disabled={!aiPrompt || isGeneratingAi}
                    style={{ background: 'linear-gradient(to right, #8b5cf6, #3b82f6)', border: 'none', color: 'white', opacity: isGeneratingAi ? 0.7 : 1 }}
                  >
                    {isGeneratingAi ? '⏳ Generating…' : '✨ Generate Draft'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '24px', maxHeight: '400px', overflowY: 'auto' }}>
                  {form.channel === 'email' ? (
                    <div dangerouslySetInnerHTML={{ __html: aiDraft }} style={{ background: 'white', padding: '16px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                  ) : (
                    <div style={{ background: 'white', padding: '16px', borderRadius: '4px', border: '1px solid #d1d5db', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{aiDraft}</div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="crm-btn-secondary" onClick={() => setAiDraft('')}>✍️ Edit Prompt</button>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="button" className="crm-btn-secondary" onClick={() => applyAiDraft('append')}>➕ Append</button>
                    <button type="button" className="crm-btn" style={{ background: '#3b82f6', color: 'white', border: 'none' }} onClick={() => applyAiDraft('replace')}>🔄 Replace All</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

