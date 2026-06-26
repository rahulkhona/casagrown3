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
  showVariablesSelector?: boolean
  showSubjectAndPreheader?: boolean
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
  showDesignModeSelector = true,
  showVariablesSelector = true,
  showSubjectAndPreheader = true
}: CampaignMessageEditorProps) {
  const quillRef = useRef<any>(null)
  
  const [aiTargetField, setAiTargetField] = useState<'content_html' | 'content_text'>('content_html')

  const currentContent = (form.channel === 'email' && aiTargetField === 'content_text')
    ? (form.content_html || '')
    : form.channel === 'sms'
    ? (form.content_text || '')
    : (form.content_html || '');
  const hasCurrentContent = useMemo(() => {
    return currentContent.replace(/<[^>]*>/g, '').trim().length > 0;
  }, [currentContent]);

  const [htmlMode, setHtmlMode] = useState<'wysiwyg' | 'raw' | 'preview'>(() => 
    form.content_html && form.content_html.replace(/<[^>]*>/g, '').trim().length > 0 ? 'preview' : 'wysiwyg'
  )
  const [previewEmail, setPreviewEmail] = useState<{ html: string; text?: string } | null>(null)
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
  const [customLinkUrl, setCustomLinkUrl] = useState('')
  const [customLinkLabel, setCustomLinkLabel] = useState('')

  // AI Draft Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState('Friendly and Urgent')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [aiDraft, setAiDraft] = useState('')
  const [aiRefTab, setAiRefTab] = useState<'links' | 'images'>('links')
  const [aiRefSearch, setAiRefSearch] = useState('')
  const [shortLinks, setShortLinks] = useState<any[]>([])

  // Track Link Modal State
  const [trackModalOpen, setTrackModalOpen] = useState(false)
  const [trackLinkUrl, setTrackLinkUrl] = useState('')
  const [trackLinkRange, setTrackLinkRange] = useState<{ index: number; length: number } | null>(null)
  const [trackUtm, setTrackUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' })
  const [trackCreatingShort, setTrackCreatingShort] = useState(false)
  const linkInterceptorRegisteredRef = useRef(false)

  // Image Sizing Popover State
  const [imgPopover, setImgPopover] = useState<{
    node: HTMLImageElement | null
    top: number
    left: number
    width: string
    alt: string
    align: 'left' | 'center' | 'right' | '' | 'wrap-left' | 'wrap-right' | 'break'
  } | null>(null)

  // Table Popover State
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false)
  const [tableHover, setTableHover] = useState<{ rows: number; cols: number }>({ rows: 0, cols: 0 })
  const [tableEditBar, setTableEditBar] = useState<{ top: number; left: number } | null>(null)

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
      const quill = quillRef.current?.getEditor();
      if (quill && htmlMode === 'wysiwyg') {
        const idx = quillSelectionRef.current?.index ?? quill.getLength();
        quill.insertText(idx, `{{${v}}}`);
        quill.setSelection(idx + `{{${v}}}`.length, 0);
      } else {
        setForm(f => ({ ...f, content_html: (f.content_html || '') + ' {{' + v + '}}' }));
      }
    }
    e.target.value = '';
    toast('Variable appended!');
  };

  // Fetch landing pages and promos for the link picker
  const fetchLinkData = useCallback(async () => {
    const [{ data: fetchedShortLinks }, { data: lps }, { data: promos }] = await Promise.all([
      supabase.from('crm_short_links').select('token, destination_url, label').is('campaign_id', null),
      supabase.from('crm_landing_pages').select('id, slug, title').eq('is_active', true),
      supabase.from('crm_promotions').select('id, name, landing_page_id').order('created_at', { ascending: false })
    ])
    if (lps) setLandingPages(lps)
    if (fetchedShortLinks) setShortLinks(fetchedShortLinks)
    if (promos) {
      // Attach shortlinks to promos if found
      const promosWithTokens = promos.map((p: any) => {
        const lp = (lps || []).find((l: any) => l.id === p.landing_page_id);
        if (lp) {
          const suffix = `/p/${lp.slug}?promo=${p.id}`;
          const sl = (fetchedShortLinks || []).find((s: any) => s.destination_url?.endsWith(suffix));
          if (sl) p.short_token = sl.token;
        }
        return p;
      });
      setPromotions(promosWithTokens)
    }
  }, [supabase])

  useEffect(() => {
    fetchLinkData()
  }, [fetchLinkData])

  // Load assets automatically when AI modal is opened
  useEffect(() => {
    if (aiModalOpen) {
      const loadAssets = async () => {
        setLoadingAssets(true)
        const { data } = await supabase.from('crm_assets').select('*').eq('type', 'image').order('created_at', { ascending: false })
        if (data) {
          const formatted = (data as any[]).map((a: { name: string, storage_path: string }) => {
            const url = a.storage_path 
              ? supabase.storage.from('marketing-assets').getPublicUrl(a.storage_path).data.publicUrl
              : ''
            return {
              name: a.name,
              url: url
            }
          })
          setAssets(formatted.filter(a => a.url))
        }
        setLoadingAssets(false)
      }
      loadAssets()
      fetchLinkData()
    }
  }, [aiModalOpen, supabase, fetchLinkData])

  // Intercept clicks on links in the Quill editor → open Track modal instead of Quill's tooltip
  useEffect(() => {
    if (linkInterceptorRegisteredRef.current) return
    let quill: any
    try { quill = quillRef.current?.getEditor() } catch { return }
    if (!quill) return
    const root = quill.root
    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) {
        const img = (e.target as HTMLElement).closest('img')
        if (img && !img.closest('a')) {
          quill.update()
          const blot = quill.constructor.find(img)
          if (blot) {
            const idx = quill.getIndex(blot)
            quill.setSelection(idx, 1)
            quillSelectionRef.current = { index: idx, length: 1 }
            setPromoModalDest('quill')
            e.preventDefault()
            e.stopPropagation()
          }
        }
        return
      }
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
          .then(({ data: sl }: { data: any }) => {
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
    linkInterceptorRegisteredRef.current = true
    return () => {
      root.removeEventListener('click', handleLinkClick)
      linkInterceptorRegisteredRef.current = false
    }
  })

  const openAssetPicker = useCallback(async () => {
    try {
      const quill = quillRef.current?.getEditor()
      if (quill) {
        const sel = quill.getSelection()
        if (sel) {
          quillSelectionRef.current = { index: sel.index, length: sel.length }
        }
      }
    } catch {}
    setAssetPickerOpen(true)
    setLoadingAssets(true)
    const { data } = await supabase.from('crm_assets').select('*').eq('type', 'image').order('created_at', { ascending: false })
    if (data) {
      const formatted = data.map((a: any) => {
        const url = a.storage_path 
          ? supabase.storage.from('marketing-assets').getPublicUrl(a.storage_path).data.publicUrl
          : ''
        return {
          name: a.name,
          url: url
        }
      })
      setAssets(formatted.filter((a: {name: string, url: string}) => a.url))
    }
    setLoadingAssets(false)
  }, [supabase])

  const imageHandler = useCallback(() => {
    openAssetPicker()
  }, [openAssetPicker])

  // ── Insert image at saved cursor position, with table-cell fallback ──
  // quill.insertEmbed() is blocked inside <td> by the table module.
  // When inside a table cell we fall back to direct DOM insertion.
  const insertImageAtCursor = useCallback((url: string) => {
    try {
      const quill = quillRef.current?.getEditor()
      if (!quill) return

      const idx = quillSelectionRef.current?.index ?? (quill.getLength() - 1)

      // Detect if saved cursor position is inside a table cell
      const [leaf] = quill.getLeaf(Math.max(0, idx))
      const domNode: HTMLElement | null = leaf?.domNode ?? null
      const cellNode = domNode?.closest?.('td, th') as HTMLElement | null

      if (cellNode) {
        // Direct DOM insertion for table cells
        const img = document.createElement('img')
        img.src = url
        img.style.maxWidth = '100%'
        img.style.height = 'auto'

        // Use the browser's live selection if available, otherwise append to cell
        const nativeSel = window.getSelection()
        if (nativeSel && nativeSel.rangeCount > 0) {
          const range = nativeSel.getRangeAt(0)
          // Only use if range is actually inside this cell
          if (cellNode.contains(range.commonAncestorContainer)) {
            range.deleteContents()
            range.insertNode(img)
            range.setStartAfter(img)
            range.setEndAfter(img)
            nativeSel.removeAllRanges()
            nativeSel.addRange(range)
          } else {
            cellNode.appendChild(img)
          }
        } else {
          cellNode.appendChild(img)
        }
        // Sync Quill's internal Delta after DOM mutation
        quill.update()
      } else {
        quill.insertEmbed(idx, 'image', url)
        quill.setSelection(idx + 1)
      }
    } catch (e) {
      console.warn('[insertImageAtCursor]', e)
    }
  }, [])


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

  // ── Image click handler: show sizing popover when clicking images in editor ──
  useEffect(() => {
    const timer = setTimeout(() => {
      let quill: any
      try { quill = quillRef.current?.getEditor() } catch { return }
      if (!quill) return
      const root = quill.root as HTMLElement

      const handleImageClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.tagName === 'IMG') {
          e.preventDefault()
          e.stopPropagation()
          const img = target as HTMLImageElement
          const rect = img.getBoundingClientRect()
          const editorRect = root.closest('.ql-container')?.getBoundingClientRect() || root.getBoundingClientRect()
          const currentWidth = img.style.width || img.getAttribute('width') || ''
          const currentWrap = img.style.float === 'left' ? 'wrap-left'
            : img.style.float === 'right' ? 'wrap-right'
            : img.style.display === 'block' && img.style.marginLeft === 'auto' ? 'center'
            : 'break'
          setImgPopover({
            node: img,
            top: rect.bottom - editorRect.top + 8,
            left: Math.max(0, rect.left - editorRect.left),
            width: currentWidth.replace('px', '').replace('%', ''),
            alt: img.getAttribute('alt') || '',
            align: currentWrap as any
          })
          setTableEditBar(null)
          return
        }
        // Close image popover on click outside
        if (imgPopover && !target.closest('[data-img-popover]')) {
          setImgPopover(null)
        }
      }

      // Table cell click handler
      const handleTableClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const cell = target.closest('td, th')
        if (cell) {
          const table = cell.closest('table')
          if (table) {
            const rect = table.getBoundingClientRect()
            const editorRect = root.closest('.ql-container')?.getBoundingClientRect() || root.getBoundingClientRect()
            setTableEditBar({
              top: rect.top - editorRect.top - 40,
              left: Math.max(0, rect.left - editorRect.left)
            })
            setImgPopover(null)
            return
          }
        }
        if (!target.closest('[data-table-toolbar]')) {
          setTableEditBar(null)
        }
      }

      root.addEventListener('click', handleImageClick)
      root.addEventListener('click', handleTableClick)
      return () => {
        root.removeEventListener('click', handleImageClick)
        root.removeEventListener('click', handleTableClick)
      }
    }, 600)
    return () => clearTimeout(timer)
  })

  // ── Table insert handler ──
  const tableInsertHandler = useCallback(() => {
    setTablePopoverOpen(prev => !prev)
    setTableHover({ rows: 0, cols: 0 })
  }, [])

  const insertTable = useCallback((rows: number, cols: number) => {
    try {
      const quill = quillRef.current?.getEditor()
      if (!quill) return
      const tableModule = quill.getModule('table')
      if (tableModule && typeof tableModule.insertTable === 'function') {
        // Ensure the editor has focus and a valid selection —
        // the native table module requires getSelection() to return non-null
        quill.focus()
        if (!quill.getSelection()) {
          quill.setSelection(quill.getLength() - 1, 0)
        }
        tableModule.insertTable(rows, cols)
        toast(`${rows}×${cols} table inserted!`)
      } else {
        console.error('[Table Insert] Table module not available')
        toast('Table module not loaded — try refreshing')
      }
    } catch (err: any) {
      console.error('[Table Insert]', err)
      toast('Table insert failed')
    }
    setTablePopoverOpen(false)
  }, [toast])

  // ── Image sizing helpers ──
  const applyImageSize = useCallback((widthValue: string, unit: 'px' | '%' = 'px') => {
    if (!imgPopover?.node) return
    const img = imgPopover.node
    const w = unit === '%' ? `${widthValue}%` : `${widthValue}px`
    img.style.width = w
    img.style.height = 'auto'
    img.setAttribute('width', w)
    setImgPopover(prev => prev ? { ...prev, width: widthValue } : null)
  }, [imgPopover])

  const applyImageAlign = useCallback((align: 'wrap-left' | 'wrap-right' | 'center' | 'break' | '') => {
    if (!imgPopover?.node) return
    const img = imgPopover.node
    // Reset all layout styles
    img.style.float = ''
    img.style.display = ''
    img.style.marginLeft = ''
    img.style.marginRight = ''
    img.style.marginBottom = ''
    img.style.clear = ''
    if (align === 'wrap-left') {
      img.style.float = 'left'
      img.style.marginRight = '16px'
      img.style.marginBottom = '12px'
    } else if (align === 'wrap-right') {
      img.style.float = 'right'
      img.style.marginLeft = '16px'
      img.style.marginBottom = '12px'
    } else if (align === 'center') {
      img.style.display = 'block'
      img.style.marginLeft = 'auto'
      img.style.marginRight = 'auto'
      img.style.float = 'none'
      img.style.marginBottom = '12px'
    } else {
      // 'break' — image on its own line, no float
      img.style.display = 'block'
      img.style.float = 'none'
      img.style.clear = 'both'
      img.style.marginBottom = '12px'
    }
    setImgPopover(prev => prev ? { ...prev, align } : null)
  }, [imgPopover])

  const applyImageAlt = useCallback((alt: string) => {
    if (!imgPopover?.node) return
    imgPopover.node.setAttribute('alt', alt)
    setImgPopover(prev => prev ? { ...prev, alt } : null)
  }, [imgPopover])

  const removeImage = useCallback(() => {
    if (!imgPopover?.node) return
    try {
      const quill = quillRef.current?.getEditor()
      if (quill) {
        const blot = (quill.constructor as any).find(imgPopover.node)
        if (blot) {
          const idx = quill.getIndex(blot)
          quill.deleteText(idx, 1)
        } else {
          imgPopover.node.remove()
        }
      } else {
        imgPopover.node.remove()
      }
    } catch { imgPopover.node.remove() }
    setImgPopover(null)
    toast('Image removed')
  }, [imgPopover, toast])

  // ── Table edit helpers ──
  const tableAction = useCallback((action: 'insertRowAbove' | 'insertRowBelow' | 'insertColumnLeft' | 'insertColumnRight' | 'deleteRow' | 'deleteColumn' | 'deleteTable') => {
    try {
      const quill = quillRef.current?.getEditor()
      if (!quill) return
      const tableModule = quill.getModule('table')
      if (tableModule && typeof tableModule[action] === 'function') {
        tableModule[action]()
        if (action === 'deleteTable') setTableEditBar(null)
      }
    } catch (err) {
      console.error('[Table Action]', err)
    }
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
        ['link', 'image', 'table'],
        ['clean']
      ],
      handlers: {
        link: insertPromoHandler,
        image: imageHandler,
        table: tableInsertHandler
      }
    },
    table: true
  }), [imageHandler, insertPromoHandler, tableInsertHandler])

  const handleGenerateAi = async () => {
    if (!aiPrompt) return;
    setIsGeneratingAi(true);
    setAiDraft('');
    try {
      const testMock = typeof window !== 'undefined' && !!(navigator.webdriver || (window as any).__playwright__);
      const { data, error } = await supabase.functions.invoke('generate-campaign-content', {
        body: {
          prompt: aiPrompt,
          channel: form.channel === 'email' && aiTargetField === 'content_text' ? 'email_text' : form.channel,
          tone: aiTone,
          currentContent,
          testMock
        }
      });
      if (error) throw error;
      console.log('[AI Response]', data);
      if (data.error) throw new Error(data.error);
      const content = (data.content ?? data.text ?? data.result ?? '').trim();
      if (!content) throw new Error(`AI returned empty content. Raw: ${JSON.stringify(data)}`);
      setAiDraft(content);
      toast('Draft generated successfully by AI! Review before applying.');
    } catch (err: any) {
      console.error(err);
      setAiDraft('');
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
    } else if (form.channel === 'email' && aiTargetField === 'content_text') {
      const newContent = mode === 'replace' ? aiDraft : (form.content_text + '\n\n' + aiDraft);
      setForm(f => ({ ...f, content_text: newContent }));
    } else {
      const newContent = mode === 'replace' ? aiDraft : (form.content_html + '<br><br>' + aiDraft);
      setForm(f => ({ ...f, content_html: newContent }));
      setHtmlMode('raw');
    }
    setAiModalOpen(false);
    setAiPrompt('');
    setAiDraft('');
    toast('AI draft applied to editor!');
  }

  const handleCloseAiModal = () => {
    setAiModalOpen(false);
    setAiPrompt('');
    setAiDraft('');
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

      {form.channel === 'email' && !templateMode && showSubjectAndPreheader && (
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
            <label>{showSubjectAndPreheader ? 'Email Content (HTML)' : 'Description (HTML) *'}</label>
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
              <select value={htmlMode} onChange={e => setHtmlMode(e.target.value as 'wysiwyg' | 'raw' | 'preview')} style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
                <option value="wysiwyg">Inline Editor (WYSIWYG)</option>
                <option value="raw">Raw HTML (Paste Template)</option>
                <option value="preview">👁 Preview</option>
              </select>
              {showVariablesSelector && (
                <select onChange={appendVar} style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                  {SUPPORTED_VARS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  setAiTargetField('content_html');
                  setAiModalOpen(true);
                }}
                style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'linear-gradient(to right, #8b5cf6, #3b82f6)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ✨ Ask AI
              </button>
            </div>
          </div>
          {htmlMode === 'preview' ? (
            <div style={{ background: '#f3f4f6', borderRadius: 8, padding: 0, border: '1px solid #d1d5db', minHeight: 300 }}>
              <div style={{ padding: '6px 12px', background: '#e5e7eb', borderRadius: '8px 8px 0 0', fontSize: '0.78rem', color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📧 Email Preview — rendered exactly as the recipient will see it</span>
                <button
                  type="button"
                  onClick={() => setHtmlMode('raw')}
                  style={{ padding: '2px 8px', fontSize: '0.75rem', background: 'white', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}
                >
                  ✏️ Edit HTML
                </button>
              </div>
              <iframe
                srcDoc={form.content_html || '<p style="padding:20px;color:#999;">No content yet — switch to Raw HTML to add your template.</p>'}
                sandbox=""
                style={{ width: '100%', minHeight: 400, border: 'none', borderRadius: '0 0 8px 8px', background: 'white' }}
                title="Email Preview"
              />
            </div>
          ) : htmlMode === 'wysiwyg' ? (
            <div style={{ background: 'white', borderRadius: 8, overflow: 'visible', position: 'relative' }}>
              <style>{`
                .crm-message-editor .ql-container {
                  resize: vertical;
                  overflow-y: auto;
                  min-height: 260px;
                }
                .crm-message-editor .ql-editor img {
                  cursor: pointer;
                  max-width: 100%;
                  transition: outline 0.15s ease;
                }
                .crm-message-editor .ql-editor img:hover {
                  outline: 2px solid #3b82f6;
                  outline-offset: 2px;
                }
                .crm-message-editor .ql-editor a {
                  color: #2563eb !important;
                  text-decoration: underline;
                }
                .crm-message-editor .ql-editor table {
                  border-collapse: collapse;
                  width: 100%;
                  max-width: 600px;
                  margin: 12px 0;
                }
                .crm-message-editor .ql-editor td,
                .crm-message-editor .ql-editor th {
                  border: 1px solid #d1d5db;
                  padding: 8px 12px;
                  min-width: 40px;
                }
                .crm-message-editor .ql-snow .ql-toolbar button.ql-table::after {
                  content: '⊞';
                  font-size: 16px;
                }
                .img-popover-btn {
                  padding: 4px 10px;
                  border: 1px solid #d1d5db;
                  background: white;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 0.78rem;
                  font-weight: 500;
                  color: #374151;
                  transition: all 0.15s;
                }
                .img-popover-btn:hover { background: #f3f4f6; }
                .img-popover-btn.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
                .table-grid-cell {
                  width: 24px;
                  height: 24px;
                  border: 1px solid #d1d5db;
                  border-radius: 2px;
                  cursor: pointer;
                  transition: all 0.1s;
                }
                .table-edit-btn {
                  padding: 3px 8px;
                  border: none;
                  background: transparent;
                  cursor: pointer;
                  font-size: 0.75rem;
                  color: white;
                  border-radius: 3px;
                  white-space: nowrap;
                  transition: background 0.15s;
                }
                .table-edit-btn:hover { background: rgba(255,255,255,0.2); }
                .table-edit-btn.danger:hover { background: #dc2626; }
              `}</style>
              <ReactQuill 
                ref={quillRef}
                theme="snow" 
                modules={quillModules}
                value={form.content_html || ''} 
                onChange={(val: string) => setForm(f => ({...f, content_html: val}))} 
                onChangeSelection={(selection: any) => {
                  if (selection) {
                    quillSelectionRef.current = { index: selection.index, length: selection.length }
                  }
                }}
                style={{ minHeight: '300px' }}
              />

              {/* ── Image Sizing Popover ── */}
              {imgPopover && (
                <div
                  data-img-popover="true"
                  data-testid="img-sizing-popover"
                  style={{
                    position: 'absolute',
                    top: imgPopover.top,
                    left: imgPopover.left,
                    zIndex: 100,
                    background: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    padding: '12px 14px',
                    minWidth: 320,
                    maxWidth: 400,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#111827' }}>📐 Image Size</span>
                    <button onClick={() => setImgPopover(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#6b7280' }}>×</button>
                  </div>

                  {/* Preset sizes */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    <button className="img-popover-btn" data-testid="img-size-small" onClick={() => applyImageSize('200')}>Small (200px)</button>
                    <button className="img-popover-btn" data-testid="img-size-medium" onClick={() => applyImageSize('400')}>Medium (400px)</button>
                    <button className="img-popover-btn" data-testid="img-size-full" onClick={() => applyImageSize('100', '%')}>Full Width</button>
                    <button className="img-popover-btn" data-testid="img-size-original" onClick={() => {
                      if (imgPopover.node) {
                        imgPopover.node.style.width = ''
                        imgPopover.node.style.height = ''
                        imgPopover.node.removeAttribute('width')
                        setImgPopover(prev => prev ? { ...prev, width: '' } : null)
                      }
                    }}>Original</button>
                  </div>

                  {/* Custom width */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ fontSize: '0.78rem', color: '#6b7280', minWidth: 50 }}>Width:</label>
                    <input
                      data-testid="img-custom-width"
                      type="number"
                      value={imgPopover.width}
                      onChange={e => setImgPopover(prev => prev ? { ...prev, width: e.target.value } : null)}
                      onBlur={e => { if (e.target.value) applyImageSize(e.target.value) }}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value) applyImageSize((e.target as HTMLInputElement).value) }}
                      style={{ width: 80, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.82rem' }}
                      placeholder="px"
                    />
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>px</span>
                  </div>

                  {/* Text Wrap */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.78rem', color: '#6b7280', minWidth: 50 }}>Wrap:</label>
                    <button
                      className={`img-popover-btn ${imgPopover.align === 'wrap-left' ? 'active' : ''}`}
                      data-testid="img-wrap-left"
                      onClick={() => applyImageAlign('wrap-left')}
                      title="Image left, text wraps right"
                    >
                      ◧ Wrap Left
                    </button>
                    <button
                      className={`img-popover-btn ${imgPopover.align === 'wrap-right' ? 'active' : ''}`}
                      data-testid="img-wrap-right"
                      onClick={() => applyImageAlign('wrap-right')}
                      title="Image right, text wraps left"
                    >
                      ◨ Wrap Right
                    </button>
                    <button
                      className={`img-popover-btn ${imgPopover.align === 'center' ? 'active' : ''}`}
                      data-testid="img-align-center"
                      onClick={() => applyImageAlign('center')}
                      title="Image centered, text above and below"
                    >
                      ▬ Center
                    </button>
                    <button
                      className={`img-popover-btn ${imgPopover.align === 'break' ? 'active' : ''}`}
                      data-testid="img-wrap-break"
                      onClick={() => applyImageAlign('break')}
                      title="Image on its own line, text below"
                    >
                      ☰ Break
                    </button>
                  </div>

                  {/* Alt text */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ fontSize: '0.78rem', color: '#6b7280', minWidth: 50 }}>Alt:</label>
                    <input
                      data-testid="img-alt-text"
                      type="text"
                      value={imgPopover.alt}
                      onChange={e => applyImageAlt(e.target.value)}
                      style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.82rem' }}
                      placeholder="Image description (for accessibility)"
                    />
                  </div>

                  {/* Remove */}
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                    <button
                      data-testid="img-remove"
                      onClick={removeImage}
                      style={{ padding: '4px 10px', border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500 }}
                    >
                      🗑 Remove Image
                    </button>
                  </div>
                </div>
              )}

              {/* ── Table Grid Popover ── */}
              {tablePopoverOpen && (
                <div
                  data-testid="table-grid-popover"
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: 10,
                    zIndex: 100,
                    background: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    padding: '12px 14px',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#111827' }}>⊞ Insert Table</span>
                    <button onClick={() => setTablePopoverOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#6b7280' }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 24px)', gap: 2, marginBottom: 8 }}>
                    {Array.from({ length: 6 }).map((_, r) =>
                      Array.from({ length: 6 }).map((_, c) => (
                        <div
                          key={`${r}-${c}`}
                          className="table-grid-cell"
                          data-testid={`table-cell-${r+1}-${c+1}`}
                          style={{
                            background: r < tableHover.rows && c < tableHover.cols ? '#3b82f6' : '#f3f4f6',
                          }}
                          onMouseEnter={() => setTableHover({ rows: r + 1, cols: c + 1 })}
                          onClick={() => insertTable(r + 1, c + 1)}
                        />
                      ))
                    )}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 500 }}>
                    {tableHover.rows > 0 ? `${tableHover.rows} × ${tableHover.cols}` : 'Hover to select size'}
                  </div>
                </div>
              )}

              {/* ── Table Edit Toolbar ── */}
              {tableEditBar && (
                <div
                  data-table-toolbar="true"
                  data-testid="table-edit-toolbar"
                  style={{
                    position: 'absolute',
                    top: Math.max(0, tableEditBar.top),
                    left: tableEditBar.left,
                    zIndex: 100,
                    background: '#1f2937',
                    borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    padding: '4px 6px',
                    display: 'flex',
                    gap: 2,
                    alignItems: 'center',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="table-edit-btn" data-testid="table-add-row-above" onClick={() => tableAction('insertRowAbove')} title="Add row above">↑ Row</button>
                  <button className="table-edit-btn" data-testid="table-add-row-below" onClick={() => tableAction('insertRowBelow')} title="Add row below">↓ Row</button>
                  <span style={{ width: 1, height: 16, background: '#4b5563', margin: '0 2px' }} />
                  <button className="table-edit-btn" data-testid="table-add-col-left" onClick={() => tableAction('insertColumnLeft')} title="Add column left">← Col</button>
                  <button className="table-edit-btn" data-testid="table-add-col-right" onClick={() => tableAction('insertColumnRight')} title="Add column right">→ Col</button>
                  <span style={{ width: 1, height: 16, background: '#4b5563', margin: '0 2px' }} />
                  <button className="table-edit-btn" data-testid="table-del-row" onClick={() => tableAction('deleteRow')} title="Delete row">⊖ Row</button>
                  <button className="table-edit-btn" data-testid="table-del-col" onClick={() => tableAction('deleteColumn')} title="Delete column">⊖ Col</button>
                  <span style={{ width: 1, height: 16, background: '#4b5563', margin: '0 2px' }} />
                  <button className="table-edit-btn danger" data-testid="table-delete" onClick={() => tableAction('deleteTable')} title="Delete table">🗑</button>
                  <button className="table-edit-btn" onClick={() => setTableEditBar(null)} title="Close">×</button>
                </div>
              )}
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
            💡 Click an image to resize/align it. Use ⊞ for tables. Use 🔗 for tracked links.
          </div>
        </div>
      )}

      {form.channel === 'email' && !templateMode && showSubjectAndPreheader && (
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
                onClick={() => {
                  setAiTargetField('content_text');
                  setAiPrompt('Convert the HTML campaign to a clean plain text version, ensuring all text, links, and details are preserved.');
                  setAiModalOpen(true);
                }}
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
                  onClick={() => {
                    setAiTargetField('content_text');
                    setAiModalOpen(true);
                  }}
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
                  
                  const { error } = await supabase.storage.from('marketing-assets').upload(fileName, file)
                  if (error) {
                    toast(`Error: Upload failed - ${error.message}`)
                    return
                  }
                  
                  await supabase.from('crm_assets').insert({
                    name: `Campaign Upload: ${file.name}`,
                    type: 'image',
                    storage_path: fileName
                  })
                  
                  const { data: publicUrlData } = supabase.storage.from('marketing-assets').getPublicUrl(fileName)
                  
                  if (htmlMode === 'wysiwyg') {
                    try {
                      insertImageAtCursor(publicUrlData.publicUrl)
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
                               insertImageAtCursor(a.url)
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
          setCustomLinkUrl('')
          setCustomLinkLabel('')
        }

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '560px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                  {linkSelectedUrl ? '📊 Add Tracking' : '🔗 Insert Tracked Link'}
                </h3>
                <button className="toast-close" onClick={() => { setPromoModalDest(null); setLinkSearch(''); setLinkSelectedUrl(null); setLinkUtmFields({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' }); setLinkLabel(''); setCustomLinkUrl(''); setCustomLinkLabel('') }}>×</button>
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
                        { url: `${baseUrl}/growbot`, label: 'GrowBot AI Chat', slug: '/growbot' },
                        { url: `${baseUrl}/sell`, label: 'Seller Calculator', slug: '/sell' },
                        { url: `${baseUrl}/create-listing`, label: 'Create a Listing', slug: '/create-listing' },
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

                  <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#374151', marginBottom: 8 }}>Or enter a custom / external URL:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input 
                        type="text" 
                        placeholder="https://youtube.com/watch?v=... or mailto:..." 
                        value={customLinkUrl} 
                        onChange={e => setCustomLinkUrl(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }}
                      />
                      <input 
                        type="text" 
                        placeholder="Link Text / Label (Optional)" 
                        value={customLinkLabel} 
                        onChange={e => setCustomLinkLabel(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }}
                      />
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button 
                          type="button"
                          onClick={() => {
                            if (customLinkUrl.trim()) {
                              insertLink(customLinkUrl.trim(), customLinkLabel.trim() || 'Link', false)
                            }
                          }}
                          disabled={!customLinkUrl.trim()}
                          style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#374151', opacity: customLinkUrl.trim() ? 1 : 0.6 }}
                        >
                          Insert Untracked
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            if (customLinkUrl.trim()) {
                              selectUrl(customLinkUrl.trim(), customLinkLabel.trim() || 'Link')
                            }
                          }}
                          disabled={!customLinkUrl.trim()}
                          style={{ padding: '8px 16px', background: '#166534', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: customLinkUrl.trim() ? 1 : 0.6 }}
                        >
                          Track & Shorten...
                        </button>
                      </div>
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

      {trackModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '560px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📊 Edit Link Tracking</h3>
              <button className="toast-close" onClick={() => setTrackModalOpen(false)}>×</button>
            </div>

            <div style={{ padding: '10px 12px', background: '#f3f4f6', borderRadius: 6, fontFamily: 'monospace', fontSize: '0.82rem', color: '#374151', wordBreak: 'break-all', marginBottom: 16, border: '1px solid #e5e7eb' }}>
              {trackLinkUrl}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="crm-field">
                <label>Source</label>
                <select value={trackUtm.utm_source} onChange={e => setTrackUtm(u => ({ ...u, utm_source: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}>
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
                <select value={trackUtm.utm_medium} onChange={e => setTrackUtm(u => ({ ...u, utm_medium: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}>
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
                <input placeholder="e.g. summer-kickoff" value={trackUtm.utm_campaign} onChange={e => setTrackUtm(u => ({ ...u, utm_campaign: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
              </div>
              <div className="crm-field">
                <label>Content / Placement</label>
                <input placeholder="e.g. backyard-gardeners-fb-group" value={trackUtm.utm_content} onChange={e => setTrackUtm(u => ({ ...u, utm_content: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Keyword / Group Tag <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.8rem' }}>(utm_term — optional)</span></label>
                <input placeholder="e.g. sell-backyard-produce" value={trackUtm.utm_term} onChange={e => setTrackUtm(u => ({ ...u, utm_term: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
              <button type="button" onClick={() => {
                const quill = quillRef.current?.getEditor()
                if (quill && trackLinkRange) {
                  const [leaf] = quill.getLeaf(trackLinkRange.index)
                  const domNode = leaf?.domNode
                  const element = domNode && domNode.nodeType === 3 ? domNode.parentElement : domNode as HTMLElement | null
                  const anchor = element?.closest?.('a')
                  if (anchor) {
                    const parent = anchor.parentNode
                    while (anchor.firstChild) {
                      parent?.insertBefore(anchor.firstChild, anchor)
                    }
                    parent?.removeChild(anchor)
                    quill.update()
                  } else {
                    quill.formatText(trackLinkRange.index, trackLinkRange.length, 'link', false)
                  }
                }
                setTrackModalOpen(false)
                toast('Link removed!')
              }}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#dc2626' }}>
                Remove Link
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => applyTracking(false)}
                  style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#374151' }}>
                  Save
                </button>
                <button type="button" onClick={() => applyTracking(true)} disabled={trackCreatingShort}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#166534', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', opacity: trackCreatingShort ? 0.6 : 1 }}>
                  {trackCreatingShort ? 'Saving...' : 'Save & Shorten'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {aiModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid rgba(241, 245, 249, 0.8)', width: '980px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(139, 92, 246, 0.05)', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(to right, #fbfbfe, #f5f3ff)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #a78bfa, #818cf8)', color: '#fff', fontSize: '1.1rem' }}>✨</span>
                AI Draft Assistant
              </h3>
              <button 
                type="button" 
                onClick={handleCloseAiModal}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s', outline: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '0px', overflow: 'hidden', flex: 1, minHeight: '400px', maxHeight: '72vh' }}>
              {/* Left Column - Prompt Input and Generation Actions */}
              <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px', borderRight: '1px solid #f1f5f9' }}>
                {!aiDraft ? (
                  <>
                    {hasCurrentContent && (
                      <div style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #e0f2fe', borderRadius: '10px', padding: '14px', fontSize: '0.875rem', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px', boxShadow: '0 2px 4px rgba(3, 105, 161, 0.02)' }}>
                        <span style={{ fontSize: '1.2rem', lineHeight: '1' }}>💡</span>
                        <div style={{ lineHeight: '1.5' }}>
                          {form.channel === 'email' && aiTargetField === 'content_text'
                            ? "The assistant will use your HTML editor content as context to generate a matching plain text version. Any URLs will be preserved inline!"
                            : "The assistant will use your current editor content as context. Suggest modifications or rewrites below!"}
                        </div>
                      </div>
                    )}
                    
                    <div className="crm-field full-width" style={{ marginBottom: '18px' }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>What do you want to announce?</label>
                      <textarea 
                        rows={6}
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="e.g. We have fresh heirloom tomatoes and honey coming this weekend. Order before Friday."
                        style={{ width: '100%', padding: '12px 14px', fontSize: '0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', transition: 'all 0.2s', resize: 'vertical', minHeight: '120px', lineHeight: '1.5', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)' }}
                        onFocus={e => {
                          e.target.style.borderColor = '#8b5cf6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.15), inset 0 1px 2px rgba(0,0,0,0.02)'
                        }}
                        onBlur={e => {
                          e.target.style.borderColor = '#cbd5e1'
                          e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.02)'
                        }}
                      />
                    </div>
                    
                    <div className="crm-field full-width" style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Tone</label>
                      <div style={{ position: 'relative' }}>
                        <select 
                          value={aiTone} 
                          onChange={e => setAiTone(e.target.value)} 
                          style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', appearance: 'none', background: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right 12px center/16px', backgroundColor: '#fff', transition: 'all 0.2s' }}
                          onFocus={e => {
                            e.target.style.borderColor = '#8b5cf6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.15)'
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = '#cbd5e1'
                            e.target.style.boxShadow = 'none'
                          }}
                        >
                          <option value="Friendly and Urgent">Friendly & Urgent</option>
                          <option value="Professional and Welcoming">Professional & Welcoming</option>
                          <option value="Casual and Fun">Casual & Fun</option>
                          <option value="Short and Direct">Short & Direct</option>
                        </select>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                      {isGeneratingAi && (
                        <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
                          <span style={{ display: 'inline-block', width: 16, height: 16, border: '2.5px solid #e2e8f0', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          Contacting AI, please wait…
                        </span>
                      )}
                      <button 
                        type="button" 
                        className="crm-btn-secondary" 
                        onClick={handleCloseAiModal} 
                        disabled={isGeneratingAi}
                        style={{ padding: '10px 18px', borderRadius: '10px', fontWeight: 600, border: '1px solid #cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        Cancel
                      </button>
                      <button 
                        type="button" 
                        onClick={handleGenerateAi}
                        disabled={!aiPrompt || isGeneratingAi}
                        style={{ 
                          padding: '10px 20px', 
                          borderRadius: '10px', 
                          fontWeight: 600, 
                          border: 'none', 
                          color: 'white', 
                          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', 
                          cursor: !aiPrompt || isGeneratingAi ? 'not-allowed' : 'pointer', 
                          boxShadow: !aiPrompt || isGeneratingAi ? 'none' : '0 4px 12px rgba(139, 92, 246, 0.2)',
                          opacity: !aiPrompt || isGeneratingAi ? 0.6 : 1, 
                          transition: 'all 0.2s' 
                        }}
                        onMouseEnter={e => {
                          if (aiPrompt && !isGeneratingAi) {
                            e.currentTarget.style.transform = 'translateY(-1px)'
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.3)'
                          }
                        }}
                        onMouseLeave={e => {
                          if (aiPrompt && !isGeneratingAi) {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.2)'
                          }
                        }}
                      >
                        {isGeneratingAi ? '⏳ Generating…' : '✨ Generate Draft'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', flex: 1, overflowY: 'auto', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)' }}>
                      {form.channel === 'email' ? (
                        <div dangerouslySetInnerHTML={{ __html: aiDraft }} style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', color: '#334155' }} />
                      ) : (
                        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', color: '#334155' }}>{aiDraft}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                          type="button" 
                          onClick={() => setAiDraft('')}
                          style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          ✍️ Edit Prompt
                        </button>
                        <button 
                          type="button" 
                          onClick={handleCloseAiModal}
                          style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          Cancel
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                          type="button" 
                          onClick={() => applyAiDraft('append')}
                          style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          ➕ Append
                        </button>
                        <button 
                          type="button" 
                          onClick={() => applyAiDraft('replace')}
                          style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)' }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-1px)'
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.3)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)'
                          }}
                        >
                          🔄 Replace All
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Right Column - Reference Manager */}
              <div style={{ flex: 0.9, padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fafafc' }}>
                <h4 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📋</span> Campaign References
                </h4>
                
                {/* Tabs selection */}
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', marginBottom: '16px' }}>
                  <button 
                    type="button"
                    onClick={() => { setAiRefTab('links'); setAiRefSearch(''); }}
                    style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', fontSize: '0.85rem', background: aiRefTab === 'links' ? '#ffffff' : 'transparent', fontWeight: aiRefTab === 'links' ? 600 : 500, color: aiRefTab === 'links' ? '#6366f1' : '#64748b', cursor: 'pointer', boxShadow: aiRefTab === 'links' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s' }}
                  >
                    🔗 Links
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setAiRefTab('images'); setAiRefSearch(''); }}
                    style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', fontSize: '0.85rem', background: aiRefTab === 'images' ? '#ffffff' : 'transparent', fontWeight: aiRefTab === 'images' ? 600 : 500, color: aiRefTab === 'images' ? '#6366f1' : '#64748b', cursor: 'pointer', boxShadow: aiRefTab === 'images' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s' }}
                  >
                    🖼️ Images
                  </button>
                </div>

                {/* Filter Search */}
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <input 
                    type="text"
                    placeholder={`Search ${aiRefTab === 'links' ? 'links...' : 'images...'}`}
                    value={aiRefSearch}
                    onChange={e => setAiRefSearch(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px 10px 34px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '10px', outline: 'none', backgroundColor: '#fff', transition: 'all 0.2s' }}
                    onFocus={e => {
                      e.target.style.borderColor = '#8b5cf6'
                      e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#cbd5e1'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                </div>

                {/* Scrollable list contents */}
                <style>{`
                  .ref-scroll::-webkit-scrollbar { width: 6px; }
                  .ref-scroll::-webkit-scrollbar-track { background: transparent; }
                  .ref-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                  .ref-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                  
                  .ref-card {
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 12px;
                    background-color: #ffffff;
                    transition: all 0.2s ease;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                  }
                  .ref-card:hover {
                    transform: translateY(-2px);
                    border-color: #a78bfa;
                    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.08);
                  }
                `}</style>
                <div className="ref-scroll" style={{ flex: 1, overflowY: 'auto', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                  {aiRefTab === 'links' ? (() => {
                    const baseUrl = process.env.NEXT_PUBLIC_MARKET_URL || 'https://casagrown.com'
                    
                    // Construct references
                    const referencesList: { label: string, type: string, url: string, destUrl?: string }[] = []
                    
                    landingPages.forEach(lp => {
                      referencesList.push({ label: lp.title, type: 'Landing Page', url: `${baseUrl}/p/${lp.slug}` })
                    })
                    
                    promotions.forEach(p => {
                      const lp = landingPages.find(l => l.id === p.landing_page_id)
                      const url = lp ? `${baseUrl}/p/${lp.slug}?promo=${p.id}` : ''
                      if (url) {
                        referencesList.push({ label: p.name, type: 'Promotion', url })
                      }
                      if (p.short_token) {
                        referencesList.push({ 
                          label: `${p.name} (Short)`, 
                          type: 'Promo Short Link', 
                          url: `${baseUrl}/r/${p.short_token}`,
                          destUrl: url
                        })
                      }
                    })

                    shortLinks.forEach(sl => {
                      // Avoid duplicates of promo short links
                      const exists = referencesList.some(r => r.url.endsWith(`/r/${sl.token}`))
                      if (!exists) {
                        referencesList.push({ 
                          label: sl.label || 'Tracked Short Link', 
                          type: 'Short Link', 
                          url: `${baseUrl}/r/${sl.token}`,
                          destUrl: sl.destination_url || ''
                        })
                      }
                    })

                    const filtered = referencesList.filter(r => 
                      r.label.toLowerCase().includes(aiRefSearch.toLowerCase()) || 
                      r.type.toLowerCase().includes(aiRefSearch.toLowerCase()) ||
                      r.url.toLowerCase().includes(aiRefSearch.toLowerCase()) ||
                      (r.destUrl || '').toLowerCase().includes(aiRefSearch.toLowerCase())
                    )

                    if (filtered.length === 0) {
                      return <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '24px', fontStyle: 'italic' }}>No matching links found</div>
                    }

                    return filtered.map((r, i) => (
                      <div key={i} className="ref-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#334155', lineHeight: '1.4' }}>{r.label}</span>
                          <span style={{ fontSize: '0.7rem', color: '#6366f1', backgroundColor: '#e0e7ff', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.type}</span>
                        </div>
                        <div style={{ color: '#4f46e5', wordBreak: 'break-all', fontSize: '0.75rem', marginBottom: '8px', fontFamily: 'monospace', background: '#f5f3ff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ede9fe' }}>{r.url}</div>
                        {r.destUrl && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ whiteSpace: 'nowrap' }}>↳ points to:</span>
                            <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.destUrl}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button 
                            type="button" 
                            style={{ padding: '5px 10px', fontSize: '0.75rem', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#475569', transition: 'all 0.2s' }}
                            onClick={() => {
                              navigator.clipboard.writeText(r.url)
                              toast('Link copied!')
                            }}
                          >
                            📋 Copy
                          </button>
                          <button 
                            type="button" 
                            style={{ padding: '5px 12px', fontSize: '0.75rem', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(139, 92, 246, 0.15)' }}
                            disabled={!!aiDraft}
                            onClick={() => setAiPrompt(p => p + (p ? ' ' : '') + r.url)}
                          >
                            ➕ Insert
                          </button>
                        </div>
                      </div>
                    ))
                  })() : (() => {
                    const filtered = assets.filter(a => a.name.toLowerCase().includes(aiRefSearch.toLowerCase()))

                    if (loadingAssets) {
                      return <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '24px' }}>Loading assets...</div>
                    }

                    if (filtered.length === 0) {
                      return <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '24px', fontStyle: 'italic' }}>No matching images found</div>
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filtered.map((a, i) => (
                          <div key={i} className="ref-card" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <div style={{ width: '54px', height: '54px', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f8fafc', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={a.url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>{a.name}</div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  type="button" 
                                  style={{ padding: '5px 10px', fontSize: '0.75rem', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#475569', transition: 'all 0.2s' }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(a.url)
                                    toast('Image URL copied!')
                                  }}
                                >
                                  📋 Copy URL
                                </button>
                                <button 
                                  type="button" 
                                  style={{ padding: '5px 12px', fontSize: '0.75rem', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(139, 92, 246, 0.15)' }}
                                  disabled={!!aiDraft}
                                  onClick={() => setAiPrompt(p => p + (p ? ' ' : '') + `[Use Image: ${a.name}]`)}
                                >
                                  ➕ Insert
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
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
