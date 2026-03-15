'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarket } from '../../../../../lib/store'
import { useAuth } from '../../../../../lib/useAuth'
import { createClient } from '../../../../../lib/supabase'
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

export default function NewProductPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const isEditMode = !!editId
  const { state, dispatch } = useMarket()
  const { isAuthenticated, loading: authLoading, user: authUser } = useAuth()
  const supabase = createClient()
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
        if (!category && cats.length > 0) setCategory(cats[0].name)
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
    if (!priceUsd || parseFloat(priceUsd) <= 0) newErrors.price = 'Set a price'
    if (!quantity || parseInt(quantity) <= 0) newErrors.quantity = 'How many do you have?'

    // $5 minimum product potential check
    const price = parseFloat(priceUsd) || 0
    const qty = parseInt(quantity) || 0
    if (price > 0 && qty > 0 && price * qty < 5.00) {
      newErrors.minimum = `At $${price.toFixed(2)} × ${qty} = $${(price * qty).toFixed(2)}, buyers can't reach the $5.00 minimum order. Increase price or quantity.`
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (!authUser) return

    setValidating(true)
    setAddedProductName(name.trim())

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

    // ── 2. Insert or update the product ──
    if (isEditMode) {
      // Edit mode: update existing product
      const { error } = await supabase
        .from('market_products')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          category,
          price_usd: parseFloat(priceUsd),
          unit,
          inventory: parseInt(quantity),
          photos,
          harvested_at: harvestedAt ? new Date(harvestedAt + 'T12:00:00').toISOString() : null,
        })
        .eq('id', editId)

      setValidating(false)
      if (error) {
        dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to update product — ' + error.message, type: 'error' } })
        return
      }
      router.push('/my-booth')
      return
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
        price_usd: parseFloat(priceUsd),
        unit,
        inventory: parseInt(quantity),
        photos,
        harvested_at: harvestedAt ? new Date(harvestedAt + 'T12:00:00').toISOString() : null,
      })

    setValidating(false)

    if (error) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to add product — ' + error.message, type: 'error' } })
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
        priceUsd: parseFloat(priceUsd),
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
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch { /* fallback */ }
  }

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Fresh ${addedProductName} at ${boothLabel}`, text: getShareMessage() })
      } catch { /* cancelled */ }
    } else {
      handleShareCopy()
    }
  }

  // Category display names
  const categoryEmoji: Record<string, string> = {
    fruits: '🍎', vegetables: '🥬', herbs: '🌿', flowers: '🌸',
    flower_arrangements: '💐', garden_equipment: '🧰', pots: '🪴', soil: '🪨',
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
              <strong>{nextMarket?.label || 'Next Market Day'}</strong>
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
                <select className={styles.input} value={category} onChange={e => setCategory(e.target.value)}>
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
          </div>

          {/* ===== Price & Quantity ===== */}
          <div className={styles.section}>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Price <span className={styles.required}>*</span></label>
                <div className={styles.priceInput}>
                  <span className={styles.priceCurrency}>$</span>
                  <input
                    className={`${styles.input} ${styles.priceField} ${errors.price ? styles.inputError : ''}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceUsd}
                    onChange={e => { setPriceUsd(e.target.value); setErrors(p => ({ ...p, price: '' })) }}
                    placeholder="4.50"
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
              {errors.minimum && <span className={styles.error}>{errors.minimum}</span>}
              {/* Live $5 minimum hint */}
              {!errors.minimum && priceUsd && quantity && parseFloat(priceUsd) > 0 && parseInt(quantity) > 0 && parseFloat(priceUsd) * parseInt(quantity) < 5.00 && (
                <span className={styles.hint} style={{ color: 'var(--amber-600)' }}>
                  ⚠️ Max order value is ${(parseFloat(priceUsd) * parseInt(quantity)).toFixed(2)} — below $5 minimum
                </span>
              )}
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
            onCapture={(file) => {
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
    </div>
  )
}
