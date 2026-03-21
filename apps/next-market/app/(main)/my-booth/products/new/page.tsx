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
  const [unit, setUnit] = useState('each')
  const [quantity, setQuantity] = useState('')
  const [category, setCategory] = useState('')
  const [harvestedAt, setHarvestedAt] = useState('')
  const [listingDays, setListingDays] = useState(30)

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

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { showPrompt, modalProps } = useNotificationPrompt(authUser?.id)

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
      setPriceUsd(String(data.price_usd || ''))
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
          // Auto-select listing duration based on default category
          const perishable = ['produce', 'eggs', 'flowers', 'flower_arrangements']
          setListingDays(perishable.includes(cats[0].name) ? 3 : 30)
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
    const newErrors: Record<string, string> = {}
    if (photos.length === 0) newErrors.photo = 'Please add at least one photo'
    if (!name.trim()) newErrors.name = 'Name is required'
    const effectivePrice = restriction.isFreeOnly ? '0' : priceUsd
    const parsedPrice = parseFloat(effectivePrice)
    if (effectivePrice === '' || effectivePrice === null || effectivePrice === undefined || isNaN(parsedPrice)) {
      newErrors.price = 'Set a price (or 0 for free)'
    } else if (parsedPrice < 0) {
      newErrors.price = 'Price cannot be negative'
    } else if (restriction.isFreeOnly && parsedPrice !== 0) {
      newErrors.price = 'Your state requires free sharing — price must be $0'
    }
    if (!quantity || parseInt(quantity) <= 0) newErrors.quantity = 'How many do you have?'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (!authUser) return

    setValidating(true)
    setAddedProductName(name.trim())
    trackFormSubmit(isEditMode ? 'edit_product' : 'add_product', { category, name: name.trim() })

    try {

    // ── 1. Ensure a booth exists (auto-create draft if needed) ──
    let boothId: string | null = null
    const { data: existingBooth } = await supabase
      .from('market_booths')
      .select('id, status')
      .eq('owner_id', authUser.id)
      .single()

    if (existingBooth) {
      boothId = existingBooth.id
    } else {
      // Auto-create a draft booth, pulling saved draft from localStorage if available
      let draftName = 'My Booth'
      let draftData: Record<string, any> = {}
      try {
        const raw = localStorage.getItem('casagrown_booth_draft')
        if (raw) {
          const d = JSON.parse(raw)
          if (d.name) draftName = d.name
          draftData = {
            offers_delivery: d.offersDelivery ?? true,
            offers_pickup: d.offersPickup ?? true,
            delivery_radius_miles: d.deliveryRadius ? parseInt(d.deliveryRadius) : 2,
            pickup_address: d.pickupAddress || null,
            payment_method: d.paymentMethod || 'automatic',
            venmo_handle: d.venmoHandle || null,
            charity_name: d.charityName || null,
            decorative_theme: d.theme || 'floral',
          }
        }
      } catch { /* ignore */ }

      const { data: newBooth, error: boothErr } = await supabase
        .from('market_booths')
        .insert({
          owner_id: authUser.id,
          name: draftName,
          status: 'draft',
          ...draftData,
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
        setErrors({ name: `"${matchedBlocked.product_name}" is not allowed. Please choose a different product name.` })
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
          if (uploadErr) { alert('Photo upload failed: ' + uploadErr.message); setValidating(false); return }
          const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
          if (urlData?.publicUrl) editPhotoUrls.push(urlData.publicUrl)
        } catch (err: any) { alert('Photo upload failed: ' + (err.message || 'Unknown')); setValidating(false); return }
      }

      // Edit mode: update existing product
      const { error } = await supabase
        .from('market_products')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          category,
          price_usd: parseFloat(priceUsd || '0'),
          unit,
          inventory: parseInt(quantity),
          photos: editPhotoUrls,
          harvested_at: harvestedAt ? new Date(harvestedAt + 'T12:00:00').toISOString() : null,
          expires_at: new Date(Date.now() + listingDays * 86400000).toISOString(),
        })
        .eq('id', editId)

      setValidating(false)
      if (error) {
        alert('Failed to update product: ' + error.message)
        return
      }

      // Clear any community flags (reactivates the product if it was flagged)
      try { await supabase.rpc('clear_product_flags', { p_product_id: editId }) } catch { /* ignore if no flags */ }

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
          alert('Photo upload failed: ' + uploadErr.message)
          setValidating(false)
          return
        }
        const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
        if (urlData?.publicUrl) uploadedPhotoUrls.push(urlData.publicUrl)
      } catch (err: any) {
        console.warn('Photo upload error:', err)
        alert('Photo upload failed: ' + (err.message || 'Unknown error'))
        setValidating(false)
        return
      }
    }

    // Add mode: insert new product
    const { error } = await supabase
      .from('market_products')
      .insert({
        seller_id: authUser.id,
        market_date: marketDate,
        name: name.trim(),
        description: description.trim() || null,
        category,
        price_usd: parseFloat(priceUsd || '0'),
        unit,
        inventory: parseInt(quantity),
        photos: uploadedPhotoUrls,
        harvested_at: harvestedAt ? new Date(harvestedAt + 'T12:00:00').toISOString() : null,
        expires_at: new Date(Date.now() + listingDays * 86400000).toISOString(),
      })

    setValidating(false)

    if (error) {
      alert('Failed to add product: ' + error.message)
      return
    }

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
        boothId: authUser.id,
        boothName: boothLabel,
        name: name.trim(),
        description: description.trim(),
        photos,
        priceUsd: parseFloat(priceUsd || '0'),
        unit,
        category,
        inventory: parseInt(quantity),
        marketDate,
        status: 'active',
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
      alert('Failed to save product: ' + (err?.message || 'Unknown error. Please try again.'))
      setValidating(false)
    }
  }

  const boothLabel = state.booths.find(b => b.ownerId === authUser?.id)?.name || 'my booth'

  const getShareMessage = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const boothUrl = boothIdForShare ? `${origin}/market/booth/${boothIdForShare}` : `${origin}/market`
    return `🌿 Fresh ${addedProductName} available this ${nextMarket?.label || 'Saturday'}!\n\nBrowse and order: ${boothUrl}`
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
        const boothUrl = boothIdForShare ? `${window.location.origin}/market/booth/${boothIdForShare}` : `${window.location.origin}/market`
        const cta = nextMarket
          ? `Be sure to visit my booth this ${nextMarket.label}! 🌿`
          : 'Be sure to visit my booth on CasaGrown! 🌿'
        await navigator.share({ title: `Fresh ${addedProductName} at ${boothLabel}`, text: cta, url: boothUrl })
      } catch { /* cancelled */ }
    } else {
      handleShareCopy()
    }
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
                  <span className={styles.photoBtnLabel}>Take Photo</span>
                </button>
                <button type="button" className={styles.photoBtn} onClick={() => fileInputRef.current?.click()}>
                  <span className={styles.photoBtnIcon}>🖼️</span>
                  <span className={styles.photoBtnLabel}>Upload</span>
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className={styles.hidden} onChange={handlePhoto} />
          </div>

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
                  // Auto-switch listing duration based on category
                  const perishable = ['produce', 'eggs', 'flowers', 'flower_arrangements']
                  setListingDays(perishable.includes(newCat) ? 3 : 30)
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
              <textarea className={styles.input} value={description} onChange={e => setDescription(e.target.value)} placeholder="What makes these special?" rows={2} />
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

          {/* ===== Listing Duration ===== */}
          <div className={styles.section}>
            <label className={styles.label}>📆 How long to show this listing?</label>
            <span className={styles.hint} style={{ marginBottom: 8, marginTop: 0 }}>
              Your product will be visible to buyers for this many days, then automatically removed.
            </span>
            <div className={styles.durationPicker}>
              {[3, 7, 14, 30].map(d => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.durationBtn} ${listingDays === d ? styles.durationBtnActive : ''}`}
                  onClick={() => setListingDays(d)}
                >
                  {d} days
                </button>
              ))}
            </div>
            <span className={styles.hint}>
              {(() => {
                const exp = new Date(Date.now() + listingDays * 86400000)
                return `Auto-removes on ${exp.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
              })()}
            </span>
          </div>

          {/* ===== Price & Quantity ===== */}
          <div className={styles.section}>
            {restriction.isFreeOnly && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#1e40af' }}>
                🏛️ Free sharing mode — all products in {restriction.stateName} are listed at no cost.
              </div>
            )}
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>
                  Price {restriction.isFreeOnly ? <span style={{ color: '#16a34a', fontWeight: 600 }}>(Free)</span> : <span className={styles.required}>*</span>}
                </label>
                <div className={styles.priceInput}>
                  <span className={styles.priceCurrency}>$</span>
                  <input
                    className={`${styles.input} ${styles.priceField} ${errors.price ? styles.inputError : ''}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={restriction.isFreeOnly ? '0' : priceUsd}
                    onChange={e => { if (!restriction.isFreeOnly) { setPriceUsd(e.target.value); setErrors(p => ({ ...p, price: '' })) } }}
                    placeholder={restriction.isFreeOnly ? '0.00' : '4.50'}
                    disabled={restriction.isFreeOnly}
                    style={restriction.isFreeOnly ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
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

          {/* ===== Submit ===== */}
          <button type="submit" className={styles.submitBtn} disabled={validating}>
            {validating
              ? '⏳ Checking product...'
              : isEditMode ? 'Save Changes' : 'Add Product'
            }
          </button>
        </form>

        {/* Camera → sends to cropper */}
        {showCamera && (
          <CameraCapture
            facingMode="environment"
            onClose={() => setShowCamera(false)}
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
            <div className={styles.modalBackdrop} onClick={() => { setShowShareModal(false); router.push('/my-booth') }} />
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
                  {/* Share actions */}
                  <div className={styles.modalActions}>
                    <button className={styles.shareActionBtn} onClick={handleShareCopy}>
                      {shareCopied ? '✅ Copied!' : '📋 Copy Invite'}
                    </button>
                    <button className={styles.shareActionBtn} onClick={handleShareNative}>
                      📤 Share with Neighbors
                    </button>
                  </div>
                </>
              )}

              <button className={styles.modalSkip} onClick={() => { setShowShareModal(false); router.push('/my-booth') }}>
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
