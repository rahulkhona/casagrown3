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
  const [linkSelectedUrl, setLinkSelectedUrl] = useState<string | null>(null)
  const [linkSelectedLabel, setLinkSelectedLabel] = useState('')
  const [linkUtmFields, setLinkUtmFields] = useState({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
  const [linkShortening, setLinkShortening] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')

  // AI Draft Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState('Friendly and Urgent')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [aiDraft, setAiDraft] = useState('')

  // Track Link Modal State
  const [trackModalOpen, setTrackModalOpen] = useState(false)
  const [trackLinkUrl, setTrackLinkUrl] = useState('')
  const [trackLinkRange, setTrackLinkRange] = useState<{ index: number; length: number } | null>(null)
  const [trackUtm, setTrackUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
  const [trackCreatingShort, setTrackCreatingShort] = useState(false)

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
      const [{ data: shortLinks }, { data: lps }, { data: promos }] = await Promise.all([
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

  // Intercept clicks on links in the Quill editor → open Track modal instead of Quill's tooltip
  useEffect(() => {
    const timer = setTimeout(() => {
      let quill: any
      try { quill = quillRef.current?.getEditor() } catch { return }
      if (!quill) return
    const root = quill.root
    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      e.preventDefault()
      e.stopPropagation()
      const href = anchor.getAttribute('href')
      if (!href) return

      // Find the blot range for this link
      const blot = quill.constructor.find(anchor)
      if (blot) {
        const idx = quill.getIndex(blot)
        const len = blot.length()
        setTrackLinkRange({ index: idx, length: len })
      }

      // Resolve short URLs
      let resolvedUrl = href
      const shortMatch = href.match(/\/r\/([a-zA-Z0-9_-]+)$/)
      if (shortMatch) {
        supabase.from('crm_short_links')
          .select('destination_url')
          .eq('token', shortMatch[1])
          .maybeSingle()
          .then(({ data: sl }) => {
            if (sl?.destination_url) resolvedUrl = sl.destination_url
            setTrackLinkUrl(resolvedUrl)
            try {
              const url = new URL(resolvedUrl)
              setTrackUtm({
                utm_source: url.searchParams.get('utm_source') || '',
                utm_medium: url.searchParams.get('utm_medium') || '',
                utm_campaign: url.searchParams.get('utm_campaign') || '',
                utm_content: url.searchParams.get('utm_content') || '',
                utm_term: url.searchParams.get('utm_term') || '',
              })
            } catch {
              setTrackUtm({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
            }
            setTrackModalOpen(true)
          })
      } else {
        setTrackLinkUrl(resolvedUrl)
        try {
          const url = new URL(resolvedUrl)
          setTrackUtm({
            utm_source: url.searchParams.get('utm_source') || '',
            utm_medium: url.searchParams.get('utm_medium') || '',
            utm_campaign: url.searchParams.get('utm_campaign') || '',
            utm_content: url.searchParams.get('utm_content') || '',
            utm_term: url.searchParams.get('utm_term') || '',
          })
        } catch {
          setTrackUtm({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
        }
        setTrackModalOpen(true)
      }
    }
    root.addEventListener('click', handleLinkClick)
    }, 500)
    return () => clearTimeout(timer)
  })

  const openAssetPicker = useCallback(async () => {
    try {
      const quill = quillRef.current?.getEditor()
      if (quill) {
        const sel = quill.getSelection()
        quillSelectionRef.current = sel ? { index: sel.index, length: sel.length } : { index: 0, length: 0 }
      }
    } catch {}
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

  const trackLinkHandler = useCallback(async () => {
    const quill = quillRef.current?.getEditor()
    if (!quill) return
    const sel = quill.getSelection()
    if (!sel) { toast('Place your cursor on a link first.'); return }

    // Check if cursor is on a link
    let linkUrl = ''
    const format = quill.getFormat(sel.index)
    if (!format.link) {
      const formatBefore = sel.index > 0 ? quill.getFormat(sel.index - 1) : {}
      if (!formatBefore.link) {
        toast('Place your cursor on a link first.')
        return
      }
      linkUrl = formatBefore.link
      const [leaf] = quill.getLeaf(sel.index - 1)
      if (leaf?.parent?.domNode?.tagName === 'A') {
        const linkIdx = quill.getIndex(leaf.parent)
        const linkLen = leaf.parent.length()
        setTrackLinkRange({ index: linkIdx, length: linkLen })
      }
    } else {
      linkUrl = format.link
      const [leaf] = quill.getLeaf(sel.index)
      if (leaf?.parent?.domNode?.tagName === 'A') {
        const linkIdx = quill.getIndex(leaf.parent)
        const linkLen = leaf.parent.length()
        setTrackLinkRange({ index: linkIdx, length: linkLen })
      } else {
        setTrackLinkRange({ index: sel.index, length: sel.length || 1 })
      }
    }

    // Resolve short URLs: if it's a /r/ link, look up the destination
    let resolvedUrl = linkUrl
    const shortMatch = linkUrl.match(/\/r\/([a-zA-Z0-9_-]+)$/)
    if (shortMatch) {
      const token = shortMatch[1]
      const { data: sl } = await supabase.from('crm_short_links')
        .select('destination_url')
        .eq('token', token)
        .maybeSingle()
      if (sl?.destination_url) {
        resolvedUrl = sl.destination_url
        toast('Resolved short link to original URL')
      }
    }

    setTrackLinkUrl(resolvedUrl)

    // Parse existing UTM params
    try {
      const url = new URL(resolvedUrl)
      setTrackUtm({
        utm_source: url.searchParams.get('utm_source') || '',
        utm_medium: url.searchParams.get('utm_medium') || '',
        utm_campaign: url.searchParams.get('utm_campaign') || '',
        utm_content: url.searchParams.get('utm_content') || '',
        utm_term: url.searchParams.get('utm_term') || '',
      })
    } catch {
      setTrackUtm({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
    }
    setTrackModalOpen(true)
  }, [toast, supabase])

  const applyTracking = useCallback(async (createShort: boolean) => {
    if (!trackLinkUrl || !trackLinkRange) return
    try {
      const url = new URL(trackLinkUrl)
      // Strip existing UTM params
      ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => url.searchParams.delete(k))
      // Add new ones
      if (trackUtm.utm_source) url.searchParams.set('utm_source', trackUtm.utm_source)
      if (trackUtm.utm_medium) url.searchParams.set('utm_medium', trackUtm.utm_medium)
      if (trackUtm.utm_campaign) url.searchParams.set('utm_campaign', trackUtm.utm_campaign)
      if (trackUtm.utm_content) url.searchParams.set('utm_content', trackUtm.utm_content)
      if (trackUtm.utm_term) url.searchParams.set('utm_term', trackUtm.utm_term)

      let finalUrl = url.toString()

      if (createShort) {
        setTrackCreatingShort(true)
        const res = await fetch('/api/crm/short-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination_url: finalUrl, label: `${trackUtm.utm_source || 'campaign'} — ${trackUtm.utm_campaign || 'link'}` }),
        })
        const data = await res.json()
        if (res.ok && data.short_url) {
          finalUrl = data.short_url
        }
        setTrackCreatingShort(false)
      }

      // Update link in editor
      const quill = quillRef.current?.getEditor()
      if (quill) {
        quill.formatText(trackLinkRange.index, trackLinkRange.length, 'link', finalUrl)
      }
      toast(createShort ? 'Link tracked & shortened!' : 'Tracking params added!')
      setTrackModalOpen(false)
    } catch (e: any) {
      toast(`Error: ${e.message}`)
      setTrackCreatingShort(false)
    }
  }, [trackLinkUrl, trackLinkRange, trackUtm, toast])

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
        ['link', 'image'],
        ['clean']
      ],
      handlers: {
        link: insertPromoHandler,
        image: imageHandler
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <label>Email Subject *</label>
            <span style={{
              fontSize: '0.78rem',
              fontWeight: 500,
              color: (form.subject || '').length > 80 ? '#dc2626' : (form.subject || '').length > 60 ? '#d97706' : '#6b7280'
            }}>
              {(form.subject || '').length}/80 chars
            </span>
          </div>
          <textarea 
            rows={2}
            style={{
              width: '100%', padding: '10px', borderRadius: '6px',
              border: `1px solid ${(form.subject || '').length > 80 ? '#fca5a5' : '#d1d5db'}`,
              fontFamily: 'inherit', fontSize: '1rem', resize: 'vertical', minHeight: '60px',
              outline: (form.subject || '').length > 80 ? '2px solid #fca5a5' : undefined
            }}
            placeholder="e.g. Fresh produce just dropped in your area 🌱" 
            value={form.subject || ''} 
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} 
          />
          {(form.subject || '').length > 80 && (
            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 3 }}>
              ⚠️ Subject exceeds 80 characters — many clients will truncate it.
            </div>
          )}
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
                🔗 Copy a Link...
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

      {form.channel === 'sms' && (() => {
        const text = form.content_text || ''
        // GSM-7 character set detection (common chars that fit in 1 byte)
        const isGSM7 = /^[\x00-\x7F\u00C0-\u00FF]*$/.test(text) && !/[\u0100-\uFFFF]/.test(text)
        const singleLimit = isGSM7 ? 160 : 70
        const multiLimit = isGSM7 ? 153 : 67
        const segments = text.length === 0 ? 1 : text.length <= singleLimit ? 1 : Math.ceil(text.length / multiLimit)
        const charsInLastSeg = text.length <= singleLimit
          ? singleLimit - text.length
          : multiLimit - (text.length % multiLimit || multiLimit)
        const isOver = text.length > 0 && segments > 3
        const counterColor = isOver ? '#dc2626' : segments > 1 ? '#d97706' : '#6b7280'
        return (
          <div className="crm-field full-width" style={{ marginTop: showChannelSelector ? 16 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
              <label>SMS Text Content *</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 500, color: counterColor }}>
                  {text.length} chars · {segments} segment{segments !== 1 ? 's' : ''} · {charsInLastSeg} left
                  {!isGSM7 && <span title="Unicode (emoji/special chars) — reduced limit"> 🌐</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setPromoModalDest('clipboard')}
                  style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  🔗 Copy a Link...
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
              style={{
                width: '100%', minHeight: '100px', padding: '10px',
                borderRadius: '6px',
                border: `1px solid ${isOver ? '#fca5a5' : segments > 1 ? '#fde68a' : '#d1d5db'}`,
                resize: 'vertical'
              }} 
            />
            {segments > 1 && (
              <div style={{ fontSize: '0.75rem', color: counterColor, marginTop: 3 }}>
                {isOver
                  ? `⚠️ ${segments} segments — consider shortening. Carriers may split or drop long SMS.`
                  : `ℹ️ ${segments} segments (${isGSM7 ? `GSM-7, ${multiLimit} chars/seg` : `Unicode, ${multiLimit} chars/seg`})`
                }
              </div>
            )}
          </div>
        )
      })()}

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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '620px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a2e1a' }}>📸 Select Image</h3>
              <button onClick={() => setAssetPickerOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => {
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
                  
                  if (htmlMode === 'wysiwyg') {
                    try {
                      const quill = quillRef.current?.getEditor()
                      if (quill) {
                        quill.insertEmbed(quillSelectionRef.current?.index || 0, 'image', publicUrlData.publicUrl)
                      }
                    } catch {}
                  } else {
                    navigator.clipboard.writeText(publicUrlData.publicUrl)
                  }
                  toast(htmlMode === 'wysiwyg' ? 'Image inserted!' : 'Image URL copied to clipboard!')
                }
              }} style={{ flex: 1, padding: '10px 16px', fontSize: '0.9rem', fontWeight: 600, background: '#166534', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>+ Upload from Computer</button>
            </div>

            <input 
              type="text" 
              placeholder="Search images..." 
              value={linkSearch} 
              onChange={e => setLinkSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12 }}
            />

            <div style={{ height: '350px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f9fafb' }}>
              {loadingAssets ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading assets...</div>
              ) : assets.filter(a => a.name.toLowerCase().includes(linkSearch.toLowerCase())).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>No images found. Upload one above!</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
                  {assets.filter(a => a.name.toLowerCase().includes(linkSearch.toLowerCase())).map(a => (
                    <div key={a.name} 
                         onClick={() => {
                           if (htmlMode === 'wysiwyg') {
                             try {
                               const quill = quillRef.current?.getEditor()
                               if (quill) {
                                 const idx = quillSelectionRef.current?.index || 0;
                                 quill.insertEmbed(idx, 'image', a.url)
                               }
                             } catch {}
                           } else {
                             navigator.clipboard.writeText(a.url)
                             toast('Image URL copied to clipboard!')
                           }
                           setAssetPickerOpen(false)
                           setLinkSearch('')
                         }}
                         style={{ border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'white' }}
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

      {promoModalDest !== null && (() => {
        const baseUrl = process.env.NEXT_PUBLIC_MARKET_URL || 'https://casagrown.com'

        // Helper: select a URL and parse existing UTM params into the form
        const selectUrl = (url: string, label: string) => {
          setLinkSelectedUrl(url)
          setLinkSelectedLabel(label)
          try {
            const u = new URL(url)
            setLinkUtmFields({
              utm_source: u.searchParams.get('utm_source') || '',
              utm_medium: u.searchParams.get('utm_medium') || '',
              utm_campaign: u.searchParams.get('utm_campaign') || '',
              utm_content: u.searchParams.get('utm_content') || '',
              utm_term: u.searchParams.get('utm_term') || '',
            })
          } catch {
            setLinkUtmFields({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
          }
        }

        const insertLink = async (url: string, label: string, shorten: boolean) => {
          let finalUrl = url
          try {
            const u = new URL(url)
            if (linkUtmFields.utm_source) u.searchParams.set('utm_source', linkUtmFields.utm_source)
            if (linkUtmFields.utm_medium) u.searchParams.set('utm_medium', linkUtmFields.utm_medium)
            if (linkUtmFields.utm_campaign) u.searchParams.set('utm_campaign', linkUtmFields.utm_campaign)
            if (linkUtmFields.utm_content) u.searchParams.set('utm_content', linkUtmFields.utm_content)
            if (linkUtmFields.utm_term) u.searchParams.set('utm_term', linkUtmFields.utm_term)
            finalUrl = u.toString()
          } catch {}

          if (shorten) {
            setLinkShortening(true)
            try {
              const res = await fetch('/api/crm/short-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destination_url: finalUrl, label: linkLabel || `${linkUtmFields.utm_source || 'link'} — ${linkUtmFields.utm_campaign || label}` }),
              })
              const data = await res.json()
              if (res.ok && data.short_url) finalUrl = data.short_url
            } catch {}
            setLinkShortening(false)
          }

          if (promoModalDest === 'quill') {
            const quill = quillRef.current?.getEditor()
            if (quill) {
              const sel = quillSelectionRef.current || { index: 0, length: 0 }
              if (sel.length > 0) {
                quill.formatText(sel.index, sel.length, 'link', finalUrl)
              } else {
                quill.insertText(sel.index, label, 'link', finalUrl)
              }
            }
          } else {
            navigator.clipboard.writeText(finalUrl)
            toast('Link copied to clipboard!')
          }
          setPromoModalDest(null)
          setLinkSearch('')
          setLinkSelectedUrl(null)
          setLinkUtmFields({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
          setLinkLabel('')
        }

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '560px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                  {linkSelectedUrl ? '📊 Add Tracking' : '🔗 Insert Tracked Link'}
                </h3>
                <button className="toast-close" onClick={() => { setPromoModalDest(null); setLinkSearch(''); setLinkSelectedUrl(null); setLinkUtmFields({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' }); setLinkLabel('') }}>×</button>
              </div>

              {!linkSelectedUrl ? (
                <>
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

                  <div style={{ height: '320px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#f9fafb' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {promotions.filter(p => (p.name || '').toLowerCase().includes(linkSearch.toLowerCase()) && landingPages.some(l => l.id === p.landing_page_id)).length > 0 && (
                        <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Promotions</div>
                      )}
                      {promotions.filter(p => (p.name || '').toLowerCase().includes(linkSearch.toLowerCase()) && landingPages.some(l => l.id === p.landing_page_id)).map(p => {
                        const lp = landingPages.find(l => l.id === p.landing_page_id)!
                        const url = `${baseUrl}/p/${lp.slug}?promo=${p.id}`
                        return (
                          <button key={p.id} type="button" onClick={() => selectUrl(url, p.name || lp.title || 'Promotion')}
                            style={{ textAlign: 'left', padding: '10px 12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
                            <div style={{ fontWeight: 600, color: '#111827' }}>🎯 {p.name || 'Unnamed Promo'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 3 }}>/p/{lp.slug}?promo=…</div>
                          </button>
                        )
                      })}

                      {landingPages.filter(lp => (lp.title || '').toLowerCase().includes(linkSearch.toLowerCase()) || (lp.slug || '').toLowerCase().includes(linkSearch.toLowerCase())).length > 0 && (
                        <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>Landing Pages</div>
                      )}
                      {landingPages.filter(lp => (lp.title || '').toLowerCase().includes(linkSearch.toLowerCase()) || (lp.slug || '').toLowerCase().includes(linkSearch.toLowerCase())).map(lp => {
                        const url = `${baseUrl}/p/${lp.slug}`
                        return (
                          <button key={lp.id} type="button" onClick={() => selectUrl(url, lp.title || lp.slug)}
                            style={{ textAlign: 'left', padding: '10px 12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
                            <div style={{ fontWeight: 600, color: '#111827' }}>📄 {lp.title || lp.slug}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 3 }}>/p/{lp.slug}</div>
                          </button>
                        )
                      })}

                      <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>Marketing Pages</div>
                      {[
                        { url: `${baseUrl}/sell`, label: 'Seller Calculator', slug: '/sell' },
                        { url: `${baseUrl}/check-nutrition-loss`, label: 'Nutrition Loss Checker', slug: '/check-nutrition-loss' },
                        { url: `${baseUrl}/join`, label: 'Buyer Sign Up', slug: '/join' },
                      ].filter(p => p.label.toLowerCase().includes(linkSearch.toLowerCase()) || p.slug.includes(linkSearch.toLowerCase())).map(p => (
                        <button key={p.slug} type="button" onClick={() => selectUrl(p.url, p.label)}
                          style={{ textAlign: 'left', padding: '10px 12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
                          <div style={{ fontWeight: 600, color: '#111827' }}>📄 {p.label}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 3 }}>{p.slug}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setLinkSelectedUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.82rem', marginBottom: 12, padding: 0 }}>
                    ← Back to URL list
                  </button>

                  <div style={{ padding: '10px 12px', background: '#dcfce7', borderRadius: 6, fontFamily: 'monospace', fontSize: '0.82rem', color: '#166534', wordBreak: 'break-all', marginBottom: 16, border: '1px solid #bbf7d0' }}>
                    {linkSelectedUrl}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div className="crm-field">
                      <label>Source</label>
                      <select value={linkUtmFields.utm_source} onChange={e => setLinkUtmFields(u => ({ ...u, utm_source: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}>
                        <option value="">None (skip tracking)</option>
                        <option value="email">Email Campaign</option>
                        <option value="sms">SMS Campaign</option>
                        <option value="drip">Drip / Sequence</option>
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="google">Google Ads</option>
                        <option value="nextdoor">Nextdoor</option>
                        <option value="newsletter">Newsletter</option>
                        <option value="qr_code">QR Code / Print</option>
                        <option value="organic">Organic / Other</option>
                      </select>
                    </div>
                    <div className="crm-field">
                      <label>Medium</label>
                      <select value={linkUtmFields.utm_medium} onChange={e => setLinkUtmFields(u => ({ ...u, utm_medium: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}>
                        <option value="">-- Select --</option>
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="social">Social</option>
                        <option value="cpc">CPC (Paid)</option>
                        <option value="referral">Referral</option>
                        <option value="print">Print</option>
                      </select>
                    </div>
                    <div className="crm-field">
                      <label>Campaign Name</label>
                      <input placeholder="e.g. summer-kickoff" value={linkUtmFields.utm_campaign} onChange={e => setLinkUtmFields(u => ({ ...u, utm_campaign: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
                    </div>
                    <div className="crm-field">
                      <label>Content / Placement</label>
                      <input placeholder="e.g. backyard-gardeners-fb-group" value={linkUtmFields.utm_content} onChange={e => setLinkUtmFields(u => ({ ...u, utm_content: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Keyword / Group Tag <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.8rem' }}>(utm_term — optional)</span></label>
                      <input placeholder="e.g. sell-backyard-produce" value={linkUtmFields.utm_term} onChange={e => setLinkUtmFields(u => ({ ...u, utm_term: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '4px 0 0' }}>For Google Ads keywords or secondary social tags.</p>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Short Link Label <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.8rem' }}>(optional, for admin reference)</span></label>
                      <input placeholder="e.g. Facebook May Campaign" value={linkLabel} onChange={e => setLinkLabel(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" onClick={() => insertLink(linkSelectedUrl, linkSelectedLabel, false)}
                      style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#374151' }}>
                      {linkUtmFields.utm_source ? 'Insert with UTM' : 'Insert Link'}
                    </button>
                    <button type="button" onClick={() => insertLink(linkSelectedUrl, linkSelectedLabel, true)} disabled={linkShortening}
                      style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#166534', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', opacity: linkShortening ? 0.6 : 1 }}>
                      {linkShortening ? 'Creating...' : 'Insert & Shorten'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

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

      {/* Toolbar button labels */}
      <style>{`
        .ql-snow .ql-tooltip { display: none !important; }
      `}</style>
    </div>
  )
}
