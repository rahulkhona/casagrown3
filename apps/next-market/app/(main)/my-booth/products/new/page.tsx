'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarket } from '../../../../../lib/store'
import { useAuth } from '../../../../../lib/useAuth'
import { createClient } from '../../../../../lib/supabase'
import { useMarketRestriction } from '../../../../../lib/useMarketRestriction'
import { useNotificationPrompt } from '../../../../../lib/useNotificationPrompt'
import { trackFormSubmit, trackClick, trackError } from '../../../../../lib/analytics'
import { NotificationPromptModal } from '../../../../components/NotificationPromptModal'
import CameraCapture from '../../../../../components/CameraCapture'
import ImageCropper from '../../../../../components/ImageCropper'
import { checkTextForViolations } from '../../../../../lib/moderation'
import styles from './page.module.css'

// Compute the next upcoming market date from the schedule
function getNextMarketDate(schedule: { dayOfWeek: number; dayName: string; openTime: string; closeTime: string }[]): {
  date: string; label: string; iso: string; dayName: string; openTime: string; closeTime: string
} | null {
  if (!schedule.length) return null
  const now = new Date()
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now)
    d.setDate(now.getDate() + offset)
    const dow = d.getDay()
    const match = schedule.find(s => s.dayOfWeek === dow)
    if (match) {
      const iso = d.toISOString().split('T')[0]
      const month = d.toLocaleString('en-US', { month: 'long' })
      const day = d.getDate()
      const isToday = offset === 0
      const isTomorrow = offset === 1
      const prefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : match.dayName
      return {
        date: iso,
        label: `${prefix}, ${month} ${day}`,
        iso,
        dayName: match.dayName,
        openTime: match.openTime,
        closeTime: match.closeTime,
      }
    }
  }
  return null
}

// Format time string for display
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m ? `${hour}:${m.toString().padStart(2, '0')} ${ampm}` : `${hour} ${ampm}`
}

function NewProductPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const isEditMode = !!editId
  const { state, dispatch } = useMarket()
  const { isAuthenticated, loading: authLoading, user: authUser } = useAuth()
  const supabase = createClient()
  const restriction = useMarketRestriction()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Market day — computed, not selectable
  const nextMarket = getNextMarketDate(state.marketSchedule)
  const marketDate = nextMarket?.iso || new Date().toISOString().split('T')[0]

  // Photos with cropping
  const [photos, setPhotos] = useState<string[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // Product details
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priceUsd, setPriceUsd] = useState('')
  const [isFree, setIsFree] = useState(false)
  const [unit, setUnit] = useState('each')
  const [quantity, setQuantity] = useState('')
  const [category, setCategory] = useState('')
  const [harvestedAt, setHarvestedAt] = useState(() => {
    // Auto-fill harvest date to today for applicable categories
    return new Date().toISOString().split('T')[0]
  })
  // Smart listing expiry: max(next market day, category default days)
  const getExpiryDate = () => {
    const categoryDays: Record<string, number> = {
      produce: 3, flowers: 3, flower_arrangements: 3, eggs: 3,
      honey: 10, seeds: 10, soil: 10, pots: 10, garden_equipment: 10,
    }
    const defaultDays = categoryDays[category] || 7
    const fromDays = new Date(Date.now() + defaultDays * 86400000)
    // At least until the next market day
    const nextMarketMs = nextMarket ? new Date(nextMarket.iso + 'T23:59:59').getTime() : 0
    const expiryMs = Math.max(fromDays.getTime(), nextMarketMs)
    return new Date(expiryMs).toISOString()
  }

  // Categories from DB
  const [dbCategories, setDbCategories] = useState<Array<{ name: string; display_order: number }>>([])
  const [restrictedCategories, setRestrictedCategories] = useState<string[]>([])

  // Post-add share flow
  const [showShareModal, setShowShareModal] = useState(false)
  const [validating, setValidating] = useState(false)
  const [addedProductName, setAddedProductName] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [publishMissing, setPublishMissing] = useState<string[]>([])
  const [boothWasPublished, setBoothWasPublished] = useState(false)
  const [boothIdForShare, setBoothIdForShare] = useState<string | null>(null)
  const [addedProductId, setAddedProductId] = useState<string | null>(null)
  const [buzzPosted, setBuzzPosted] = useState(false)
  const [buzzPosting, setBuzzPosting] = useState(false)
  const [userH3Index, setUserH3Index] = useState<string | null>(null)

  // AI auto-fill
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiToast, setAiToast] = useState<string | null>(null)

  // Quarantine check
  const [quarantineWarning, setQuarantineWarning] = useState<{
    pest_name: string; county_name: string; source_url?: string; reason?: string
  } | null>(null)
  const [quarantineChecking, setQuarantineChecking] = useState(false)

  // Inline booth setup (for users without a booth)
  const [hasBooth, setHasBooth] = useState<boolean | null>(null) // null = loading
  const [inlineDelivery, setInlineDelivery] = useState(true)
  const [inlinePickup, setInlinePickup] = useState(true)
  const [inlinePickupAddress, setInlinePickupAddress] = useState('')
  const [inlineDeliveryRadius, setInlineDeliveryRadius] = useState(2)
  const [inlineProfileName, setInlineProfileName] = useState('')
  const [inlineDeliveryWindows, setInlineDeliveryWindows] = useState<string[]>(['8-10', '10-12'])
  const [inlinePickupWindows, setInlinePickupWindows] = useState<string[]>(['8-10', '10-12', '12-14', '14-16'])

  const INLINE_TIME_WINDOWS = [
    { id: '8-10', label: '8–10a' },
    { id: '10-12', label: '10–12p' },
    { id: '12-14', label: '12–2p' },
    { id: '14-16', label: '2–4p' },
    { id: '16-18', label: '4–6p' },
    { id: '18-20', label: '6–8p' },
  ]

  // Custom time windows (for non-standard slots)
  const [inlineCustomDeliverySlots, setInlineCustomDeliverySlots] = useState<Array<{ start: string; end: string }>>([])
  const [inlineCustomPickupSlots, setInlineCustomPickupSlots] = useState<Array<{ start: string; end: string }>>([])
  const [inlineCustomStart, setInlineCustomStart] = useState('17:00')
  const [inlineCustomEnd, setInlineCustomEnd] = useState('19:00')
  const [showInlineCustomDelivery, setShowInlineCustomDelivery] = useState(false)
  const [showInlineCustomPickup, setShowInlineCustomPickup] = useState(false)

  const mapInlineWindows = (ids: string[], customs: Array<{ start: string; end: string }> = []) => {
    const preset = ids.map(id => {
      const [start] = id.split('-')
      return { id, start: `${start}:00`, end: `${parseInt(start) + 2}:00` }
    })
    const custom = customs.map(s => ({ id: `custom-${s.start}`, start: s.start, end: s.end }))
    return [...preset, ...custom]
  }

  const formatTime12h = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const suffix = h >= 12 ? 'p' : 'a'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return m > 0 ? `${h12}:${m.toString().padStart(2, '0')}${suffix}` : `${h12}${suffix}`
  }

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { showPrompt, modalProps } = useNotificationPrompt(authUser?.id)

  // Auto-open camera when ?camera=true is present (photo-first flow from market FAB)
  useEffect(() => {
    if (searchParams.get('camera') === 'true' && !isEditMode && photos.length === 0) {
      setShowCamera(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check if user already has a booth
  useEffect(() => {
    if (!authUser) return
    supabase.from('market_booths').select('id').eq('owner_id', authUser.id).single()
      .then(({ data }) => {
        setHasBooth(!!data)
        // Pre-fill pickup address from profile if no booth
        if (!data) {
          supabase.from('profiles').select('full_name, street_address, city, state_code').eq('id', authUser.id).single()
            .then(({ data: profile }) => {
              if (profile?.full_name) setInlineProfileName(profile.full_name)
              if (profile?.street_address) {
                setInlinePickupAddress([profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', '))
              }
            })
        }
      })
  }, [authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing product in edit mode
  useEffect(() => {
    if (!editId) return
    const loadProduct = async () => {
      const { data } = await supabase
        .from('market_products')
        .select('*')
        .eq('id', editId)
        .single()
      if (!data) { router.push('/my-booth'); return }
      setName(data.name || '')
      setDescription(data.description || '')
      setPriceUsd(data.price_usd === 0 ? '0' : String(data.price_usd || ''))
      setIsFree(data.price_usd === 0)
      setUnit(data.unit || 'each')
      setQuantity(String(data.inventory || ''))
      setCategory(data.category || '')
      setPhotos(data.photos || [])
      if (data.harvested_at) {
        setHarvestedAt(new Date(data.harvested_at).toISOString().split('T')[0])
      }
    }
    loadProduct()
  }, [editId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load categories and restrictions from Supabase
  useEffect(() => {
    const loadCategories = async () => {
      const { data: cats } = await supabase
        .from('sales_categories')
        .select('name, display_order')
        .order('display_order')
      if (cats) {
        setDbCategories(cats)
        if (!category && cats.length > 0) {
          setCategory(cats[0].name)
        }
      }

      // Load restrictions for user's jurisdiction
      const { data: restrictions } = await supabase
        .from('category_restrictions')
        .select('category_name')
      if (restrictions) {
        setRestrictedCategories(restrictions.map(r => r.category_name))
      }
    }
    loadCategories()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check quarantine when category changes
  useEffect(() => {
    if (!category || !authUser?.id) {
      setQuarantineWarning(null)
      return
    }
    let cancelled = false
    const checkQuarantine = async () => {
      setQuarantineChecking(true)
      try {
        const { data, error } = await supabase.rpc('check_quarantine_for_seller', {
          p_seller_id: authUser.id,
          p_category: category,
        })
        if (cancelled) return
        if (data && data.length > 0) {
          const q = data[0]
          setQuarantineWarning({
            pest_name: q.pest_name,
            county_name: q.county_name || q.state_name || 'your area',
            source_url: q.source_url,
            reason: q.reason,
          })
        } else {
          setQuarantineWarning(null)
        }
      } catch {
        if (!cancelled) setQuarantineWarning(null)
      } finally {
        if (!cancelled) setQuarantineChecking(false)
      }
    }
    checkQuarantine()
    return () => { cancelled = true }
  }, [category, authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load user's community h3 index for Buzz posting
  useEffect(() => {
    if (!authUser?.id) return
    supabase.from('profiles').select('home_community_h3_index').eq('id', authUser.id).single()
      .then(({ data }) => { if (data?.home_community_h3_index) setUserH3Index(data.home_community_h3_index) })
  }, [authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth guards (AFTER all hooks) ──
  if (authLoading) return (
    <div className="container" style={{ padding: 80, textAlign: 'center' }}><p>Loading...</p></div>
  )

  if (!isAuthenticated) return (
    <div className="container" style={{ padding: 80, textAlign: 'center' }}>
      <h2>Sign in to add products</h2>
      <Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link>
    </div>
  )

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCropSrc(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Evaluate if form lacks requirements to cleanly Publish
    const effectivePrice = restriction.isFreeOnly ? '0' : priceUsd
    const parsedPrice = parseFloat(effectivePrice || '0')
    const isValidPrice = effectivePrice !== '' && effectivePrice !== null && !isNaN(parsedPrice) && parsedPrice >= 0 && (!restriction.isFreeOnly || parsedPrice === 0)
    const needsDraft = !name.trim() || photos.length === 0 || !isValidPrice || !quantity || parseInt(quantity) <= 0
    
    // Safety check first
    const newErrors: Record<string, string> = {}
    
    // Strict checks only enforced if trying to publish fully
    if (!needsDraft) {
      if (!name.trim()) newErrors.name = 'Name is required'
      if (!isValidPrice) {
        if (effectivePrice === '' || effectivePrice === null) newErrors.price = 'Set a price (or 0 for free)'
        else if (parsedPrice < 0) newErrors.price = 'Price cannot be negative'
        else newErrors.price = 'Your state requires free sharing — price must be $0'
      }
      if (!quantity || parseInt(quantity) <= 0) newErrors.quantity = 'How many do you have?'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // ── Inline content pre-check (profanity, drugs, weapons, adult content) ──
    const contentToCheck = `${name} ${description}`
    const violationCheck = checkTextForViolations(contentToCheck)
    if (!violationCheck.isClean) {
      // Show error under the field(s) that actually contain the blocked content
      const nameMatch = !checkTextForViolations(name).isClean
      const descMatch = !checkTextForViolations(description).isClean
      const fieldErrors: Record<string, string> = {}
      if (nameMatch) fieldErrors.name = violationCheck.error!
      if (descMatch) fieldErrors.description = violationCheck.error!
      if (!nameMatch && !descMatch) fieldErrors.name = violationCheck.error! // fallback
      setErrors(fieldErrors)
      dispatch({ type: 'ADD_TOAST', payload: { message: `⚠️ ${violationCheck.error}`, type: 'error' } })
      return
    }

    if (!authUser) return

    setValidating(true)
    setAddedProductName(name.trim())
    trackFormSubmit(isEditMode ? 'edit_product' : 'add_product', { category, name: name.trim() })

    try {

    // ── 1. Ensure a booth exists (auto-create if needed) ──
    let boothId: string | null = null
    const { data: existingBooth } = await supabase
      .from('market_booths')
      .select('id, status')
      .eq('owner_id', authUser.id)
      .single()

    if (existingBooth) {
      boothId = existingBooth.id
    } else {
      // Auto-create a booth using inline form values — publish immediately
      const boothName = inlineProfileName ? `${inlineProfileName}'s Booth` : 'My Booth'

      const { data: newBooth, error: boothErr } = await supabase
        .from('market_booths')
        .insert({
          owner_id: authUser.id,
          name: boothName,
          status: 'published',
          offers_delivery: inlineDelivery,
          offers_pickup: inlinePickup,
          delivery_radius_miles: inlineDeliveryRadius,
          pickup_address: inlinePickup ? inlinePickupAddress || null : null,
          delivery_windows: inlineDelivery ? mapInlineWindows(inlineDeliveryWindows, inlineCustomDeliverySlots) : [],
          pickup_windows: inlinePickup ? mapInlineWindows(inlinePickupWindows, inlineCustomPickupSlots) : [],
          payment_method: 'automatic',
          decorative_theme: 'floral',
        })
        .select()
        .single()

      if (boothErr || !newBooth) {
        setValidating(false)
        dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to create booth — ' + (boothErr?.message || 'unknown error'), type: 'error' } })
        return
      }
      boothId = newBooth.id
    }

    // ── 2. Check if product name contains blocked words ──
    const { data: allBlocked } = await supabase
      .from('blocked_products')
      .select('product_name')

    if (allBlocked && allBlocked.length > 0) {
      const productWords = name.trim().toLowerCase()

      // Context-aware allowlist: these words have legitimate product uses
      // If the product name contains BOTH a blocked word and a context word, it's allowed
      const allowedContexts: Record<string, string[]> = {
        'pot':     ['flower', 'plant', 'garden', 'cooking', 'clay', 'ceramic', 'terracotta', 'wooden', 'planter', 'soup', 'stew', 'crock', 'honey'],
        'ice':     ['cream', 'tea', 'coffee', 'cold', 'cooler', 'chest', 'pack', 'cube', 'bucket', 'water', 'popsicle', 'frozen'],
        'crystal': ['vase', 'glass', 'clear', 'bowl', 'decor', 'quartz', 'rock'],
        'snow':    ['pea', 'cone', 'globe', 'flake', 'white'],
        'rock':    ['garden', 'salt', 'candy', 'climbing'],
        'spice':   ['rack', 'mix', 'blend', 'seasoning', 'jar', 'kitchen', 'pumpkin', 'chai'],
        'coke':    ['cola', 'soda', 'diet'],
        'speed':   ['boat', 'bag', 'rack'],
        'hash':    ['brown', 'tag', 'potato'],
        'bars':    ['soap', 'granola', 'protein', 'energy', 'candy', 'chocolate', 'oat', 'snack'],
        'dip':     ['salsa', 'hummus', 'guacamole', 'cheese', 'bean', 'ranch', 'french', 'onion', 'chip'],
        'glass':   ['jar', 'bottle', 'vase', 'cup', 'bowl', 'stained', 'blown'],
        'blow':    ['dryer', 'dry', 'torch'],
        'acid':    ['reflux', 'wash'],
        'blues':   ['berry', 'blueberry'],
        'dragon':  ['fruit', 'fly'],
        'tabs':    ['let', 'tablet'],
        'x':       [],  // single letter - never match as standalone blocked word
        'mod':     ['ern', 'ular', 'ified', 'el'],
      }

      const matchedBlocked = allBlocked.find(bp => {
        const blockedTerm = bp.product_name.toLowerCase()

        // Skip single-character blocked words (too many false positives)
        if (blockedTerm.length <= 1) return false

        // Check if the blocked term appears as a word boundary match
        const regex = new RegExp(`\\b${blockedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        if (!regex.test(productWords)) return false

        // Check if there's an allowlisted context that makes this legitimate
        const contexts = allowedContexts[blockedTerm]
        if (contexts && contexts.length > 0) {
          const hasLegitContext = contexts.some(ctx => productWords.includes(ctx))
          if (hasLegitContext) return false // Legitimate use — don't block
        }

        return true // Blocked word found with no legitimate context
      })

      if (matchedBlocked) {
        setValidating(false)
        const msg = `"${matchedBlocked.product_name}" is not allowed. Please choose a different product name.`
        setErrors({ name: msg })
        dispatch({ type: 'ADD_TOAST', payload: { message: msg, type: 'error' } })
        return
      }
    }

    // ── 3. Insert or update the product ──
    if (isEditMode) {
      // Upload any new photos (base64) to storage
      const editPhotoUrls: string[] = []
      for (let i = 0; i < photos.length; i++) {
        if (photos[i].startsWith('http')) {
          editPhotoUrls.push(photos[i])
          continue
        }
        try {
          const res = await fetch(photos[i])
          const blob = await res.blob()
          const ext = blob.type.includes('png') ? 'png' : 'jpg'
          const path = `${authUser.id}/${Date.now()}_${i}.${ext}`
          const { error: uploadErr } = await supabase.storage.from('product-photos').upload(path, blob, { upsert: true })
          if (uploadErr) { setErrors({ submit: 'Photo upload failed: ' + uploadErr.message }); setValidating(false); return }
          const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
          if (urlData?.publicUrl) editPhotoUrls.push(urlData.publicUrl)
        } catch (err: any) { setErrors({ submit: 'Photo upload failed: ' + (err.message || 'Unknown') }); setValidating(false); return }
      }

      // Edit mode: update existing product
      const { error } = await supabase
        .from('market_products')
        .update({
          name: name.trim() || 'Untitled Draft',
          description: description.trim() || null,
          category,
          price_usd: parseFloat(priceUsd || '0'),
          unit,
          inventory: parseInt(quantity) || 0,
          photos: editPhotoUrls,
          harvested_at: harvestedAt ? new Date(harvestedAt + 'T12:00:00').toISOString() : null,
          expires_at: getExpiryDate(),
          market_date: marketDate,
          is_active: !needsDraft,
          is_draft: needsDraft,
        })
        .eq('id', editId)

      if (error) {
        setValidating(false)
        setErrors({ submit: 'Failed to update product: ' + error.message })
        return
      }

      // Clear any community flags (reactivates the product if it was flagged)
      try { await supabase.rpc('clear_product_flags', { p_product_id: editId }) } catch { /* ignore if no flags */ }

      // ── AI Moderation (edit) ──
      supabase.functions.invoke('moderate-listing', {
        body: {
          product_id: editId,
          seller_id: authUser.id,
          name: name.trim() || 'Untitled Draft',
          description: description.trim() || null,
          price_usd: parseFloat(priceUsd || '0'),
          category,
          photo_url: editPhotoUrls[0] || null,
        },
      }).then(modRes => {
        const modData = modRes.data as any
        if (modData?.status === 'flagged' && modData?.flags) {
          const messages = Object.values(modData.flags.issue_messages || {}) as string[]
          const reason = messages[0] || modData.flags.reason || 'Your listing was flagged for review.'
          dispatch({ type: 'ADD_TOAST', payload: { message: `⚠️ ${reason}`, type: 'error' } })
        }
      }).catch(modErr => {
        console.warn('Moderation check failed (non-blocking):', modErr)
      })

      setValidating(false)
      router.push('/my-booth')
      return
    }

    // ── Upload photos to storage first ──
    const uploadedPhotoUrls: string[] = []
    for (let i = 0; i < photos.length; i++) {
      const photoData = photos[i]
      // Skip if already a URL (edit mode)
      if (photoData.startsWith('http')) {
        uploadedPhotoUrls.push(photoData)
        continue
      }
      try {
        // Convert base64 to blob
        const res = await fetch(photoData)
        const blob = await res.blob()
        const ext = blob.type.includes('png') ? 'png' : 'jpg'
        const path = `${authUser.id}/${Date.now()}_${i}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('product-photos').upload(path, blob, { upsert: true })
        if (uploadErr) {
          console.warn('Photo upload failed:', uploadErr.message)
          setErrors({ submit: 'Photo upload failed: ' + uploadErr.message })
          setValidating(false)
          return
        }
        const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
        if (urlData?.publicUrl) uploadedPhotoUrls.push(urlData.publicUrl)
      } catch (err: any) {
        console.warn('Photo upload error:', err)
        setErrors({ submit: 'Photo upload failed: ' + (err.message || 'Unknown error') })
        setValidating(false)
        return
      }
    }

    // Add mode: insert new product
    const { data: insertedProduct, error } = await supabase
      .from('market_products')
      .insert({
        seller_id: authUser.id,
        market_date: marketDate,
        name: name.trim() || 'Untitled Draft',
        description: description.trim() || null,
        category,
        price_usd: parseFloat(priceUsd || '0'),
        unit,
        inventory: parseInt(quantity) || 0,
        photos: uploadedPhotoUrls,
        harvested_at: harvestedAt ? new Date(harvestedAt + 'T12:00:00').toISOString() : null,
        expires_at: getExpiryDate(),
        is_active: !needsDraft,
        is_draft: needsDraft,
      })
      .select('id')
      .single()

    setAddedProductId(insertedProduct?.id || null)

    if (error || !insertedProduct) {
      setValidating(false)
      setErrors({ submit: 'Failed to add product: ' + (error?.message || 'Unknown error') })
      return
    }

    // ── AI Moderation (new product) ──
    supabase.functions.invoke('moderate-listing', {
      body: {
        product_id: insertedProduct.id,
        seller_id: authUser.id,
        name: name.trim() || 'Untitled Draft',
        description: description.trim() || null,
        price_usd: parseFloat(priceUsd || '0'),
        category,
        photo_url: uploadedPhotoUrls[0] || null,
      },
    }).then(modRes => {
      const modData = modRes.data as any
      if (modData?.status === 'flagged' && modData?.flags) {
        const messages = Object.values(modData.flags.issue_messages || {}) as string[]
        const reason = messages[0] || modData.flags.reason || 'Your listing was flagged for review.'
        dispatch({ type: 'ADD_TOAST', payload: { message: `⚠️ ${reason}`, type: 'error' } })
      }
    }).catch(modErr => {
      console.warn('Moderation check failed (non-blocking):', modErr)
    })

    setValidating(false)

    // ── 3. Check if booth qualifies for publishing ──
    // Requirements: ≥1 product (we just added one) + delivery or pickup + payment configured
    const { data: booth } = await supabase
      .from('market_booths')
      .select('offers_delivery, offers_pickup, delivery_windows, pickup_windows, payment_method, venmo_handle, charity_name, status')
      .eq('id', boothId)
      .single()

    let boothPublished = false
    const missing: string[] = []
    if (booth) {
      const hasFulfillment = booth.offers_delivery || booth.offers_pickup
      const hasWindows = (booth.offers_delivery ? ((booth.delivery_windows as any[])?.length > 0) : true) &&
                         (booth.offers_pickup ? ((booth.pickup_windows as any[])?.length > 0) : true)
      const hasPayment = booth.payment_method === 'manual' ||
        booth.payment_method === 'automatic' ||
        (booth.payment_method === 'venmo' && booth.venmo_handle) ||
        (booth.payment_method === 'charity' && booth.charity_name)

      if (!hasFulfillment) missing.push('delivery or pickup option')
      if (hasFulfillment && !hasWindows) missing.push('delivery/pickup time windows')
      if (!hasPayment) missing.push('payment method')

      if (booth.status === 'draft' && hasFulfillment && hasWindows && hasPayment) {
        await supabase
          .from('market_booths')
          .update({ status: 'published' })
          .eq('id', boothId)
        boothPublished = true
      } else if (booth.status === 'published') {
        boothPublished = true
      }
    }
    setPublishMissing(missing)
    setBoothWasPublished(boothPublished)

    // Also update in-memory store
    dispatch({
      type: 'ADD_PRODUCT',
      payload: {
        boothId: boothId!,
        boothName: boothLabel,
        name: name.trim() || 'Untitled Draft',
        description: description.trim(),
        photos,
        priceUsd: parseFloat(priceUsd || '0'),
        unit,
        category,
        inventory: parseInt(quantity) || 0,
        marketDate,
        status: needsDraft ? 'draft' : 'active',
        harvestedAt: harvestedAt || undefined,
      },
    })

    // Store boothId for share URL
    setBoothIdForShare(boothId)
    setShowShareModal(true)
    showPrompt()
    } catch (err: any) {
      console.error('Product add error:', err)
      trackError('product_add_failed', { error: err?.message })
      setErrors({ submit: 'Failed to save product: ' + (err?.message || 'Unknown error. Please try again.') })
      setValidating(false)
    }
  }

  const boothLabel = state.booths.find(b => b.ownerId === authUser?.id)?.name || 'my booth'

  const getProductUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    if (addedProductId && boothIdForShare) return `${origin}/market/booth/${boothIdForShare}/product/${addedProductId}`
    if (boothIdForShare) return `${origin}/market/booth/${boothIdForShare}`
    return `${origin}/market`
  }

  const getShareMessage = () => {
    return `🌿 Fresh ${addedProductName} available this ${nextMarket?.label || 'Saturday'}!\n\nBrowse and order: ${getProductUrl()}`
  }

  const handleShareCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareMessage())
      trackClick('share_product_copy', { productName: addedProductName })
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch { /* fallback */ }
  }

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        trackClick('share_product_native', { productName: addedProductName })
        const cta = nextMarket
          ? `Fresh ${addedProductName} will be available at my booth this ${nextMarket.label}! 🌿`
          : `Fresh ${addedProductName} is available at my booth on CasaGrown! 🌿`
        await navigator.share({ title: `Fresh ${addedProductName} at ${boothLabel}`, text: cta, url: getProductUrl() })
      } catch { /* cancelled */ }
    } else {
      handleShareCopy()
    }
  }

  const handleShareFacebook = () => {
    trackClick('share_product_facebook', { productName: addedProductName })
    const url = encodeURIComponent(getProductUrl())
    const quote = encodeURIComponent(`🌿 Fresh ${addedProductName} available on CasaGrown Market!`)
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`, '_blank', 'width=600,height=400')
  }

  const handleShareNextdoor = async () => {
    trackClick('share_product_nextdoor', { productName: addedProductName })
    const msg = getShareMessage()
    try {
      await navigator.clipboard.writeText(msg)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 4000)
    } catch { /* ignore */ }
    // Open Nextdoor — user pastes the copied text
    window.open('https://nextdoor.com/news_feed/', '_blank')
  }

  const handleShareBuzz = async () => {
    if (!authUser?.id || !userH3Index) return
    setBuzzPosting(true)
    try {
      const msg = nextMarket
        ? `🌿 New listing! ${addedProductName} — $${priceUsd}/${unit}. Available this ${nextMarket.label}! Browse & order on CasaGrown Market.`
        : `🌿 New listing! ${addedProductName} — $${priceUsd}/${unit}. Browse & order on CasaGrown Market!`
      await supabase.from('community_chat_messages').insert({
        community_h3_index: userH3Index,
        author_id: authUser.id,
        content: msg,
        product_listing_id: addedProductId || undefined,
      })
      setBuzzPosted(true)
      trackClick('share_product_buzz', { productName: addedProductName })
    } catch {
      setBuzzPosted(false)
    }
    setBuzzPosting(false)
  }

  // AI auto-fill from photo — calls analyze-product-photo edge function
  const handleAiAutoFill = async () => {
    if (photos.length === 0) return
    setAiAnalyzing(true)
    setAiToast(null)

    const tryInvoke = async (): Promise<{ data: any; error: any }> => {
      return supabase.functions.invoke('analyze-product-photo', {
        body: { image: photos[0] },
      })
    }

    try {
      let res = await tryInvoke()

      // Auto-retry once on invocation error (cold start, transient 503, etc.)
      if (res.error) {
        console.warn('AI autofill first attempt failed, retrying:', res.error?.message || res.error)
        await new Promise(r => setTimeout(r, 1500))
        res = await tryInvoke()
      }

      // Check for invocation errors after retry
      if (res.error) {
        const errMsg = res.error?.message || res.error?.name || 'Unknown error'
        console.warn('AI autofill error after retry:', errMsg, res.error)
        setAiToast(`⚠️ AI analysis unavailable (${errMsg}) — please fill in manually.`)
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 6000)
        return
      }

      const data = res.data as any

      // Check for API-level errors returned in the response body
      if (data?.error) {
        console.warn('AI autofill API error:', data.error)
        setAiToast(`⚠️ ${data.error === 'AI not configured' ? 'AI service not configured' : 'AI analysis failed'} — please fill in manually.`)
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 5000)
        return
      }

      // Check if we got usable data
      if (!data?.name && !data?.description && !data?.category) {
        setAiToast('⚠️ AI could not identify the product — please fill in manually.')
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 5000)
        return
      }

      if (data.name) setName(data.name)
      if (data.category && dbCategories.some(c => c.name === data.category)) setCategory(data.category)
      if (data.description) setDescription(data.description)
      if (data.suggested_unit) setUnit(data.suggested_unit)
      setAiToast('✨ AI filled in product details — review and adjust!')
      trackClick('ai_autofill_product', { category: data?.category })
    } catch (err: any) {
      console.warn('AI autofill exception:', err)
      setAiToast(`⚠️ AI analysis failed (${err?.message || 'network error'}) — please fill in manually.`)
    }
    setAiAnalyzing(false)
    setTimeout(() => setAiToast(null), 6000)
  }

  // Category display names
  const categoryEmoji: Record<string, string> = {
    produce: '🥬', flowers: '🌸', flower_arrangements: '💐',
    garden_equipment: '🧰', pots: '🪴', soil: '🪨',
    seeds: '🌱', eggs: '🥚', honey: '🍯',
  }
  const formatCategoryName = (name: string) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  // Available categories (filtered by jurisdiction restrictions)
  const availableCategories = dbCategories.filter(c => !restrictedCategories.includes(c.name))

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>{isEditMode ? 'Edit Product' : 'Add Product'}</h1>

        {/* ===== Market Day — display only ===== */}
        <div className={styles.section}>
          <div className={styles.marketDayBanner}>
            <span className={styles.marketDayIcon}>📅</span>
            <div>
              <strong>Next Market Day: {nextMarket?.label || 'TBD'}</strong>
              {nextMarket && (
                <span className={styles.marketDayTime}>
                  {formatTime(nextMarket.openTime)} – {formatTime(nextMarket.closeTime)}
                </span>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ===== Photos with cropping ===== */}
          <div className={styles.section}>
            <label className={styles.label}>Photos <span className={styles.required}>*</span></label>
            {errors.photo && <span className={styles.error}>{errors.photo}</span>}
            {photos.length > 0 ? (
              <div className={styles.photoGallery}>
                {photos.map((p, i) => (
                  <div key={i} className={styles.photoThumb}>
                    <img src={p} alt={`Product ${i + 1}`} className={styles.photoThumbImg} />
                    <button type="button" className={styles.photoRemove} onClick={() => removePhoto(i)}>✕</button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <>
                    <button type="button" className={styles.addMoreBtn} onClick={() => setShowCamera(true)}>
                      <span className={styles.addMoreIcon}>📸</span>
                      <span className={styles.addMoreLabel}>Camera</span>
                    </button>
                    <button type="button" className={styles.addMoreBtn} onClick={() => fileInputRef.current?.click()}>
                      <span className={styles.addMoreIcon}>📁</span>
                      <span className={styles.addMoreLabel}>Upload</span>
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.photoBtns}>
                <button type="button" className={styles.photoBtn} onClick={() => setShowCamera(true)}>
                  <span className={styles.photoBtnIcon}>📸</span>
                  <span className={styles.photoBtnLabel}>Take Photo to List</span>
                </button>
                <button type="button" className={styles.photoBtn} onClick={() => fileInputRef.current?.click()}>
                  <span className={styles.photoBtnIcon}>🖼️</span>
                  <span className={styles.photoBtnLabel}>Upload</span>
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className={styles.hidden} onChange={handlePhoto} />
          </div>

          {/* ===== AI Auto-fill Button ===== */}
          {photos.length > 0 && !isEditMode && (
            <div style={{ marginBottom: 16 }}>
              <button
                type="button"
                onClick={handleAiAutoFill}
                disabled={aiAnalyzing}
                style={{
                  width: '100%', padding: '12px 20px',
                  borderRadius: 'var(--radius-md, 12px)',
                  border: '2px solid var(--green-300, #86efac)',
                  background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                  color: 'var(--green-800, #166534)',
                  fontSize: 15, fontWeight: 600,
                  cursor: aiAnalyzing ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                  opacity: aiAnalyzing ? 0.7 : 1,
                }}
              >
                {aiAnalyzing ? (
                  <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🤖</span> Analyzing photo...</>
                ) : (
                  <>✨ Auto-fill from Photo</>
                )}
              </button>
              {aiToast && (
                <p style={{
                  margin: '8px 0 0', fontSize: 13, textAlign: 'center',
                  color: aiToast.startsWith('⚠') ? '#b45309' : '#15803d',
                  fontWeight: 500,
                }}>
                  {aiToast}
                </p>
              )}
            </div>
          )}

          {/* ===== Name & Category ===== */}
          <div className={styles.section}>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Name <span className={styles.required}>*</span></label>
                <input className={`${styles.input} ${errors.name ? styles.inputError : ''}`} value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }} placeholder="e.g. Heritage Tomatoes" />
                {errors.name && <span className={styles.error}>{errors.name}</span>}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Category</label>
                <select className={styles.input} value={category} onChange={e => {
                  const newCat = e.target.value
                  setCategory(newCat)
                }}>
                  {availableCategories.map(c => (
                    <option key={c.name} value={c.name}>
                      {categoryEmoji[c.name] || '📦'} {formatCategoryName(c.name)}
                    </option>
                  ))}
                </select>
                {restrictedCategories.length > 0 && (
                  <span className={styles.hint}>Some categories are restricted in your area</span>
                )}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Description <span className={styles.optional}>(optional)</span></label>
              <textarea className={`${styles.input} ${errors.description ? styles.inputError : ''}`} value={description} onChange={e => { setDescription(e.target.value); setErrors(p => ({ ...p, description: '' })) }} placeholder="What makes these special?" rows={2} />
              {errors.description && <span className={styles.error}>{errors.description}</span>}
            </div>
            {['produce', 'flowers', 'flower_arrangements', 'eggs'].includes(category) && (
            <div className={styles.field}>
              <label className={styles.label}>🌾 Harvested <span className={styles.optional}>(optional)</span></label>
              <input
                type="date"
                className={styles.input}
                value={harvestedAt}
                onChange={e => setHarvestedAt(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
              {harvestedAt && (
                <span className={styles.harvestHint}>
                  {(() => {
                    const days = Math.round((Date.now() - new Date(harvestedAt + 'T12:00:00').getTime()) / 86400000)
                    if (days <= 0) return '🟢 Harvested today — ultra fresh!'
                    if (days === 1) return '🟢 Harvested yesterday — very fresh!'
                    if (days <= 3) return `🟢 Harvested ${days} days ago — fresh!`
                    return `🟡 Harvested ${days} days ago`
                  })()}
                </span>
              )}
            </div>
            )}
          </div>

          {/* Listing duration is auto-calculated — no user selection needed */}

          {/* ===== Price & Quantity ===== */}
          <div className={styles.section}>
            {restriction.isFreeOnly && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#1e40af' }}>
                🏛️ Free sharing mode — all products in {restriction.stateName} are listed at no cost.
              </div>
            )}
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Price {restriction.isFreeOnly ? <span style={{ color: '#16a34a', fontWeight: 600 }}>(Free)</span> : <span className={styles.required}>*</span>}</span>
                  {!restriction.isFreeOnly && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 'normal', cursor: 'pointer', color: '#15803d' }}>
                      <input 
                        type="checkbox" 
                        checked={isFree} 
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsFree(checked);
                          if (checked) {
                            setPriceUsd('0');
                            setErrors(p => ({ ...p, price: '' }));
                          } else {
                            setPriceUsd('');
                          }
                        }} 
                        style={{ margin: 0 }}
                      />
                      Give away for free
                    </label>
                  )}
                </label>
                <div className={styles.priceInput}>
                  <span className={styles.priceCurrency}>$</span>
                  <input
                    className={`${styles.input} ${styles.priceField} ${errors.price ? styles.inputError : ''}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={restriction.isFreeOnly || isFree ? '0' : priceUsd}
                    onChange={e => { if (!restriction.isFreeOnly && !isFree) { setPriceUsd(e.target.value); setErrors(p => ({ ...p, price: '' })) } }}
                    placeholder={restriction.isFreeOnly || isFree ? '0.00' : '4.50'}
                    disabled={restriction.isFreeOnly || isFree}
                    style={(restriction.isFreeOnly || isFree) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                  />
                </div>
                {errors.price && <span className={styles.error}>{errors.price}</span>}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Per</label>
                <select className={styles.input} value={unit} onChange={e => setUnit(e.target.value)}>
                  {['each', 'bunch', 'dozen', 'jar', 'loaf', 'bag', 'box', 'basket'].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Available Quantity <span className={styles.required}>*</span></label>
              <input className={`${styles.input} ${errors.quantity ? styles.inputError : ''}`} type="number" min="1" value={quantity} onChange={e => { setQuantity(e.target.value); setErrors(p => ({ ...p, quantity: '', minimum: '' })) }} placeholder="10" />
              {errors.quantity && <span className={styles.error}>{errors.quantity}</span>}
            </div>
          </div>

          {/* ===== Inline Booth Setup (first-time sellers only) ===== */}
          {hasBooth === false && !isEditMode && (
            <div className={styles.section}>
              <label className={styles.label}>🏪 How will buyers get your product?</label>
              <span className={styles.hint} style={{ marginBottom: 12, marginTop: 0 }}>
                We'll set up your booth automatically. You can customize it later.
              </span>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setInlineDelivery(!inlineDelivery)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 10,
                    border: inlineDelivery ? '2px solid #16a34a' : '2px solid #e5e7eb',
                    background: inlineDelivery ? '#f0fdf4' : '#fff',
                    cursor: 'pointer', textAlign: 'center', fontSize: 14, fontWeight: 500,
                    color: inlineDelivery ? '#15803d' : '#6b7280',
                    transition: 'all 0.2s',
                  }}
                >
                  🚗 I can deliver
                </button>
                <button
                  type="button"
                  onClick={() => setInlinePickup(!inlinePickup)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 10,
                    border: inlinePickup ? '2px solid #2563eb' : '2px solid #e5e7eb',
                    background: inlinePickup ? '#eff6ff' : '#fff',
                    cursor: 'pointer', textAlign: 'center', fontSize: 14, fontWeight: 500,
                    color: inlinePickup ? '#1d4ed8' : '#6b7280',
                    transition: 'all 0.2s',
                  }}
                >
                  📍 Pickup available
                </button>
              </div>
              {!inlineDelivery && !inlinePickup && (
                <span className={styles.error}>Please select at least one fulfillment option</span>
              )}
              {inlinePickup && (
                <div className={styles.field}>
                  <label className={styles.label}>Pickup Address <span className={styles.optional}>(optional)</span></label>
                  <input
                    className={styles.input}
                    value={inlinePickupAddress}
                    onChange={e => setInlinePickupAddress(e.target.value)}
                    placeholder="Where should buyers pick up?"
                  />
                </div>
              )}
              {inlinePickup && (
                <div className={styles.field}>
                  <label className={styles.label}>Pickup Windows</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {INLINE_TIME_WINDOWS.map(w => (
                      <button key={w.id} type="button" style={{
                        padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: inlinePickupWindows.includes(w.id) ? '2px solid #16a34a' : '1px solid #d1d5db',
                        background: inlinePickupWindows.includes(w.id) ? '#dcfce7' : '#fff',
                        color: inlinePickupWindows.includes(w.id) ? '#15803d' : '#6b7280',
                        transition: 'all 0.15s',
                      }} onClick={() => setInlinePickupWindows(prev =>
                        prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id]
                      )}>
                        {inlinePickupWindows.includes(w.id) ? '✅' : '⏰'} {w.label}
                      </button>
                    ))}
                  </div>
                  {inlineCustomPickupSlots.map((s, i) => (
                    <div key={`cp-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✅ {formatTime12h(s.start)}–{formatTime12h(s.end)}</span>
                      <button type="button" onClick={() => setInlineCustomPickupSlots(prev => prev.filter((_, j) => j !== i))}
                        style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                  {showInlineCustomPickup ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <input type="time" className={styles.input} value={inlineCustomStart}
                        onChange={e => setInlineCustomStart(e.target.value)} style={{ maxWidth: 140 }} />
                      <span style={{ color: '#9ca3af' }}>to</span>
                      <input type="time" className={styles.input} value={inlineCustomEnd}
                        onChange={e => setInlineCustomEnd(e.target.value)} style={{ maxWidth: 140 }} />
                      <button type="button" onClick={() => {
                        setInlineCustomPickupSlots(prev => [...prev, { start: inlineCustomStart, end: inlineCustomEnd }])
                        setShowInlineCustomPickup(false)
                      }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #16a34a', background: '#dcfce7', color: '#15803d', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                      <button type="button" onClick={() => setShowInlineCustomPickup(false)}
                        style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowInlineCustomPickup(true)}
                      style={{ marginTop: 8, border: 'none', background: 'none', color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      ➕ Custom time slot
                    </button>
                  )}
                </div>
              )}
              {inlineDelivery && (
                <div className={styles.field}>
                  <label className={styles.label}>Delivery Radius</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="range" min={1} max={10}
                      value={inlineDeliveryRadius}
                      onChange={e => setInlineDeliveryRadius(parseInt(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span style={{ minWidth: 50, fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                      {inlineDeliveryRadius} mi
                    </span>
                  </div>
                </div>
              )}
              {inlineDelivery && (
                <div className={styles.field}>
                  <label className={styles.label}>Delivery Windows</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {INLINE_TIME_WINDOWS.map(w => (
                      <button key={w.id} type="button" style={{
                        padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: inlineDeliveryWindows.includes(w.id) ? '2px solid #16a34a' : '1px solid #d1d5db',
                        background: inlineDeliveryWindows.includes(w.id) ? '#dcfce7' : '#fff',
                        color: inlineDeliveryWindows.includes(w.id) ? '#15803d' : '#6b7280',
                        transition: 'all 0.15s',
                      }} onClick={() => setInlineDeliveryWindows(prev =>
                        prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id]
                      )}>
                        {inlineDeliveryWindows.includes(w.id) ? '✅' : '⏰'} {w.label}
                      </button>
                    ))}
                  </div>
                  {inlineCustomDeliverySlots.map((s, i) => (
                    <div key={`cd-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✅ {formatTime12h(s.start)}–{formatTime12h(s.end)}</span>
                      <button type="button" onClick={() => setInlineCustomDeliverySlots(prev => prev.filter((_, j) => j !== i))}
                        style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                  {showInlineCustomDelivery ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <input type="time" className={styles.input} value={inlineCustomStart}
                        onChange={e => setInlineCustomStart(e.target.value)} style={{ maxWidth: 110 }} />
                      <span style={{ color: '#9ca3af' }}>to</span>
                      <input type="time" className={styles.input} value={inlineCustomEnd}
                        onChange={e => setInlineCustomEnd(e.target.value)} style={{ maxWidth: 110 }} />
                      <button type="button" onClick={() => {
                        setInlineCustomDeliverySlots(prev => [...prev, { start: inlineCustomStart, end: inlineCustomEnd }])
                        setShowInlineCustomDelivery(false)
                      }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #16a34a', background: '#dcfce7', color: '#15803d', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                      <button type="button" onClick={() => setShowInlineCustomDelivery(false)}
                        style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowInlineCustomDelivery(true)}
                      style={{ marginTop: 8, border: 'none', background: 'none', color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      ➕ Custom time slot
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== Quarantine Warning Banner ===== */}
          {quarantineWarning && (
            <div style={{
              backgroundColor: '#fef2f2', border: '2px solid #ef4444', borderRadius: 12,
              padding: '16px 20px', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>⚠️</span>
                <div>
                  <strong style={{ color: '#991b1b', fontSize: 15, display: 'block', marginBottom: 4 }}>
                    Agricultural Quarantine — Cannot List
                  </strong>
                  <p style={{ color: '#b91c1c', fontSize: 13, margin: '0 0 8px 0', lineHeight: 1.5 }}>
                    <strong>{category}</strong> is currently quarantined in <strong>{quarantineWarning.county_name}</strong> due
                    to <strong>{quarantineWarning.pest_name}</strong>.
                    You cannot list this product until the quarantine is lifted.
                  </p>
                  {quarantineWarning.reason && (
                    <p style={{ color: '#7f1d1d', fontSize: 12, margin: '0 0 4px 0', fontStyle: 'italic' }}>
                      {quarantineWarning.reason}
                    </p>
                  )}
                  {quarantineWarning.source_url && (
                    <a href={quarantineWarning.source_url} target="_blank" rel="noopener noreferrer"
                       style={{ color: '#1d4ed8', fontSize: 12, textDecoration: 'underline' }}>
                      View CDFA Notice →
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===== Submit ===== */}
          {errors.submit && (
            <div style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {errors.submit}
            </div>
          )}
          <button 
            type="submit" 
            className={styles.submitBtn} 
            disabled={validating || !!quarantineWarning}
            style={(photos.length === 0 || !priceUsd || !quantity) ? { background: '#f59e0b' } : undefined}
          >
            {validating
              ? '⏳ Saving...'
              : quarantineWarning
              ? '🚫 Quarantined — Cannot List'
              : (photos.length === 0 || !priceUsd || !quantity) 
                ? 'Save Draft' 
                : (isEditMode ? 'Save Changes' : 'Publish Product')
            }
          </button>
        </form>

        {/* Camera → sends to cropper */}
        {showCamera && (
          <CameraCapture
            facingMode="environment"
            closeLabel="✕ Cancel Listing"
            skipLabel="Skip Photo for Now"
            onSkip={() => setShowCamera(false)}
            onClose={() => router.back()}
            onCapture={({ file }) => {
              setShowCamera(false)
              const reader = new FileReader()
              reader.onload = (ev) => setCropSrc(ev.target?.result as string)
              reader.readAsDataURL(file)
            }}
          />
        )}

        {/* Image Cropper for product photos — square aspect ratio */}
        {cropSrc && (
          <ImageCropper
            src={cropSrc}
            aspectRatio={1}
            onCancel={() => setCropSrc(null)}
            onCrop={(file) => {
              setCropSrc(null)
              const reader = new FileReader()
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string
                setPhotos(prev => [...prev, dataUrl])
              }
              reader.readAsDataURL(file)
            }}
          />
        )}

        {/* ===== Post-Add Share Modal ===== */}
        {showShareModal && (
          <>
            <div className={styles.modalBackdrop} onClick={() => { setShowShareModal(false); window.location.href = '/my-booth' }} />
            <div className={styles.modal}>
              <div className={styles.modalEmoji}>✅</div>
              <h2 className={styles.modalTitle}>{addedProductName} added!</h2>
              <p className={styles.modalSubtitle}>
                Listed for {nextMarket?.label || 'this weekend'}.
              </p>

              {publishMissing.length > 0 ? (
                <div className={styles.draftHint}>
                  <strong>⚠️ Your booth is saved as a draft.</strong><br />
                  To publish and start accepting orders, go to My Booth and set up:
                  <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                    {publishMissing.map(m => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              ) : (
                <>
                  <p className={styles.modalSubtitle} style={{ marginTop: 0 }}>
                    🎉 Your booth is live! Invite your neighbors to check it out.
                  </p>
                  {/* Share actions — 2×2 grid */}
                  <div className={styles.modalActions}>
                    <button
                      className={styles.shareActionBtn}
                      style={{ background: '#1877f2' }}
                      onClick={handleShareFacebook}
                    >
                      📘 Share on Facebook
                    </button>
                    <button
                      className={styles.shareActionBtn}
                      style={{ background: '#8ed500' }}
                      onClick={handleShareNextdoor}
                    >
                      {shareCopied ? '✅ Copied! Paste on Nextdoor' : '🏡 Share on Nextdoor'}
                    </button>
                    {userH3Index && (
                      <button
                        className={styles.shareActionBtn}
                        style={{ background: buzzPosted ? '#16a34a' : '#f59e0b' }}
                        onClick={handleShareBuzz}
                        disabled={buzzPosted || buzzPosting}
                      >
                        {buzzPosting ? '⏳ Posting...' : buzzPosted ? '✅ Posted on Buzz!' : '🐝 Share on Buzz'}
                      </button>
                    )}
                    <button className={styles.shareActionBtn} onClick={handleShareNative}>
                      📤 Share Link
                    </button>
                  </div>
                </>
              )}

              <button className={styles.modalSkip} onClick={() => { setShowShareModal(false); window.location.href = '/my-booth' }}>
                {publishMissing.length > 0 ? 'Go to My Booth →' : 'Skip → Go to My Booth'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Notification Prompt Modal */}
      <NotificationPromptModal {...modalProps} />
    </div>
  )
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: 80, textAlign: 'center' }}><p>Loading...</p></div>}>
      <NewProductPageInner />
    </Suspense>
  )
}
