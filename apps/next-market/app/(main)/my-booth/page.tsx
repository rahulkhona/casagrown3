'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMarket, formatUsd, getNextMarketDate, type Booth } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { useMarketRestriction } from '../../../lib/useMarketRestriction'
import CameraCapture from '../../../components/CameraCapture'
import ImageCropper from '../../../components/ImageCropper'


import { geocodeAddress, toPostgisPoint } from '../../../lib/geocode'
import { NotificationBanner } from '../../components/NotificationBanner'
import styles from './page.module.css'

const THEMES: { id: Booth['decorativeTheme']; label: string; emoji: string }[] = [
  { id: 'rustic', label: 'Rustic', emoji: '🪵' },
  { id: 'tropical', label: 'Tropical', emoji: '🌴' },
  { id: 'minimal', label: 'Minimal', emoji: '✨' },
  { id: 'floral', label: 'Floral', emoji: '🌸' },
  { id: 'harvest', label: 'Harvest', emoji: '🌾' },
  { id: 'cottage', label: 'Cottage', emoji: '🏡' },
]

const THEME_COLORS: Record<string, { bg: string; border: string; accent: string; text: string }> = {
  rustic:   { bg: '#fef3c7', border: '#f59e0b', accent: '#92400e', text: '#78350f' },
  tropical: { bg: '#d1fae5', border: '#10b981', accent: '#065f46', text: '#064e3b' },
  minimal:  { bg: '#f3f4f6', border: '#6b7280', accent: '#374151', text: '#1f2937' },
  floral:   { bg: '#fce7f3', border: '#ec4899', accent: '#9d174d', text: '#831843' },
  harvest:  { bg: '#fef3c7', border: '#d97706', accent: '#92400e', text: '#78350f' },
  cottage:  { bg: '#e0f2fe', border: '#0ea5e9', accent: '#0369a1', text: '#0c4a6e' },
}

const MIN_SLOTS = 3
const SLOT_INCREMENT = 3

const TIME_WINDOWS = [
  { id: '8-10', label: '8–10a' },
  { id: '10-12', label: '10–12p' },
  { id: '12-14', label: '12–2p' },
  { id: '14-16', label: '2–4p' },
]

const DEFAULT_CHARITIES = [
  { id: '1', name: 'Feeding America', category: 'Hunger' },
  { id: '2', name: 'No Kid Hungry', category: 'Hunger' },
  { id: '3', name: 'World Food Programme', category: 'Hunger' },
  { id: '4', name: 'Local Food Bank', category: 'Community' },
  { id: '5', name: 'Habitat for Humanity', category: 'Housing' },
  { id: '6', name: 'American Red Cross', category: 'Disaster Relief' },
  { id: '7', name: 'St. Jude Children\'s Research Hospital', category: 'Health' },
  { id: '8', name: 'Doctors Without Borders', category: 'Health' },
  { id: '9', name: 'The Nature Conservancy', category: 'Environment' },
  { id: '10', name: 'Salvation Army', category: 'Community' },
]

export default function MyBoothPage() {
  const { state, dispatch } = useMarket()
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const supabase = createClient()
  const restriction = useMarketRestriction()
  const router = useRouter()
  const bannerRef = useRef<HTMLInputElement>(null)
  const myBooth = state.booths.find(b => b.ownerId === state.user?.id)
  const [dbProducts, setDbProducts] = useState<typeof state.products>([])
  const myProducts = dbProducts
  const myOrders = state.orders.filter(o => o.sellerId === state.user?.id)

  const [name, setName] = useState(myBooth?.name || '')
  const [theme, setTheme] = useState<Booth['decorativeTheme']>(myBooth?.decorativeTheme || 'floral')
  const [bannerUrl, setBannerUrl] = useState(myBooth?.headerImageUrl || '')
  const [bannerPreview, setBannerPreview] = useState(myBooth?.headerImageUrl || '')
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [saved, setSaved] = useState(!!myBooth)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showPhotoMenu, setShowPhotoMenu] = useState(false)

  // Delivery options
  const [offersDelivery, setOffersDelivery] = useState(myBooth?.offersDelivery ?? true)
  const [offersPickup, setOffersPickup] = useState(myBooth?.offersPickup ?? true)
  const [deliveryRadius, setDeliveryRadius] = useState(String(myBooth?.deliveryRadiusMiles ?? 2))

  // Payment options
  const [paymentMethod, setPaymentMethod] = useState<Booth['paymentMethod']>(myBooth?.paymentMethod || 'automatic')
  const [payoutDestination, setPayoutDestination] = useState<'venmo' | 'charity'>(
    myBooth?.charityName ? 'charity' : 'venmo'
  )
  const [venmoHandle, setVenmoHandle] = useState(myBooth?.venmoHandle || '')
  const [charityName, setCharityName] = useState(myBooth?.charityName || '')
  const [charitySearch, setCharitySearch] = useState('')
  const [showCharityDropdown, setShowCharityDropdown] = useState(false)

  // Camera & Cropper
  const [showCamera, setShowCamera] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // Share modal (shown after save)
  const [showBoothShareModal, setShowBoothShareModal] = useState(false)
  const [boothShareCopied, setBoothShareCopied] = useState(false)
  const [boothShareMsg, setBoothShareMsg] = useState('')
  const [savedBoothId, setSavedBoothId] = useState<string | null>(null)

  // Drag-and-drop reordering
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Platform fee rate (loaded from DB)
  const [platformFeePct, setPlatformFeePct] = useState(10)
  useEffect(() => {
    supabase.from('platform_fees').select('fees').eq('country_code', 'USA').single()
      .then(({ data }) => { if (data?.fees) setPlatformFeePct(Math.round(data.fees * 100)) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Time windows (pre-defined 2-hour slots)
  const [deliveryWindows, setDeliveryWindows] = useState<string[]>(
    myBooth?.deliveryWindows?.map(w => `${w.start.replace(':00', '')}-${parseInt(w.start) + 2}`) || []
  )
  const [pickupWindows, setPickupWindows] = useState<string[]>(
    myBooth?.pickupWindows?.map(w => `${w.start.replace(':00', '')}-${parseInt(w.start) + 2}`) || []
  )
  const [pickupAddress, setPickupAddress] = useState(myBooth?.pickupAddress || '')

  // ── Persist booth draft to localStorage so navigating to add-product and back preserves it ──
  const BOOTH_DRAFT_KEY = 'casagrown_booth_draft'

  // Restore draft on mount (only if booth hasn't been loaded from DB yet)
  useEffect(() => {
    if (saved) return // already have DB data
    try {
      const raw = localStorage.getItem(BOOTH_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.name) setName(draft.name)
      if (draft.theme) setTheme(draft.theme)
      if (draft.offersDelivery !== undefined) setOffersDelivery(draft.offersDelivery)
      if (draft.offersPickup !== undefined) setOffersPickup(draft.offersPickup)
      if (draft.deliveryRadius) setDeliveryRadius(draft.deliveryRadius)
      if (draft.pickupAddress) setPickupAddress(draft.pickupAddress)
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod)
      if (draft.venmoHandle) setVenmoHandle(draft.venmoHandle)
      if (draft.charityName) { setCharityName(draft.charityName); setPayoutDestination('charity') }
      if (draft.deliveryWindows) setDeliveryWindows(draft.deliveryWindows)
      if (draft.pickupWindows) setPickupWindows(draft.pickupWindows)
      if (draft.bannerPreview) { setBannerPreview(draft.bannerPreview); setBannerUrl(draft.bannerPreview) }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft on change (debounced)
  useEffect(() => {
    if (saved) return // don't overwrite draft if loaded from DB
    const t = setTimeout(() => {
      try {
        localStorage.setItem(BOOTH_DRAFT_KEY, JSON.stringify({
          name, theme, offersDelivery, offersPickup, deliveryRadius,
          pickupAddress, paymentMethod, venmoHandle, charityName,
          deliveryWindows, pickupWindows, bannerPreview,
        }))
      } catch { /* quota */ }
    }, 500)
    return () => clearTimeout(t)
  }, [name, theme, offersDelivery, offersPickup, deliveryRadius, pickupAddress, paymentMethod, venmoHandle, charityName, deliveryWindows, pickupWindows, bannerPreview, saved])

  // Fetch profile address from DB for pickup default
  useEffect(() => {
    if (pickupAddress) return // already set
    const fetchAddr = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('street_address, city, state_code')
        .eq('id', authUser.id)
        .single()
      if (profile?.street_address) {
        const addr = [profile.street_address, profile.city].filter(Boolean).join(', ')
        setPickupAddress(addr)
      }
    }
    fetchAddr()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load booth from Supabase on mount
  useEffect(() => {
    const loadBooth = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: booth } = await supabase
        .from('market_booths')
        .select('*')
        .eq('owner_id', authUser.id)
        .single()
      if (!booth) return

      // Populate state from DB
      setName(booth.name || '')
      setTheme(booth.decorative_theme || 'floral')
      if (booth.header_image_url) { setBannerUrl(booth.header_image_url); setBannerPreview(booth.header_image_url) }
      setOffersDelivery(booth.offers_delivery ?? true)
      setOffersPickup(booth.offers_pickup ?? true)
      setDeliveryRadius(String(booth.delivery_radius_miles ?? 2))
      if (booth.pickup_address) setPickupAddress(booth.pickup_address)
      setPaymentMethod(booth.payment_method || 'automatic')
      if (booth.venmo_handle) { setVenmoHandle(booth.venmo_handle); setPayoutDestination('venmo') }
      if (booth.charity_name) { setCharityName(booth.charity_name); setPayoutDestination('charity') }
      if (booth.helper_passcode) setHelperPasscodeState(booth.helper_passcode)

      // Parse windows from DB
      const dwArr = (booth.delivery_windows || []) as Array<{ id: string; start: string; end: string }>
      const pwArr = (booth.pickup_windows || []) as Array<{ id: string; start: string; end: string }>
      setDeliveryWindows(dwArr.filter(w => !w.id.startsWith('custom-')).map(w => w.id))
      setPickupWindows(pwArr.filter(w => !w.id.startsWith('custom-')).map(w => w.id))
      setCustomDeliverySlots(dwArr.filter(w => w.id.startsWith('custom-')).map(w => ({ start: w.start, end: w.end })))
      setCustomPickupSlots(pwArr.filter(w => w.id.startsWith('custom-')).map(w => ({ start: w.start, end: w.end })))

      setSaved(true)
      setSavedBoothId(booth.id)

      // Populate in-memory store so myBooth is non-null (enables product links)
      if (!state.booths.find(b => b.ownerId === authUser.id)) {
        dispatch({
          type: 'CREATE_BOOTH',
          payload: {
            id: booth.id,
            ownerId: authUser.id,
            ownerName: state.user?.name || '',
            name: booth.name,
            description: booth.description || '',
            decorativeTheme: booth.decorative_theme || 'floral',
            aboutHtml: booth.about_html || '<p>Welcome to my booth!</p>',
            inviteCode: booth.invite_code || '',
            offersDelivery: booth.offers_delivery ?? true,
            offersPickup: booth.offers_pickup ?? true,
            deliveryRadiusMiles: booth.delivery_radius_miles ?? 2,
            headerImageUrl: booth.header_image_url || undefined,
            pickupAddress: booth.pickup_address || undefined,
          },
        })
      }

      // Load helpers
      const { data: dbHelpers } = await supabase
        .from('booth_helpers')
        .select('helper_id, status, profiles!booth_helpers_helper_id_fkey(full_name)')
        .eq('booth_id', booth.id)
      if (dbHelpers) {
        setHelpers(dbHelpers.map((h: any) => ({
          helperId: h.helper_id,
          name: h.profiles?.full_name || 'Unknown',
          status: h.status as 'pending' | 'accepted' | 'revoked',
        })))
      }
      // Load seller's products from DB
      const { data: products } = await supabase
        .from('market_products')
        .select('*')
        .eq('seller_id', authUser.id)
        .order('created_at', { ascending: false })
      if (products && products.length > 0) {
        setDbProducts(products.map((p: any) => ({
          id: p.id,
          boothId: p.seller_id,
          boothName: booth?.name || name || '',
          name: p.name,
          description: p.description || '',
          photos: p.photos || [],
          priceUsd: p.price_usd,
          unit: p.unit || 'each',
          category: p.category || 'other',
          inventory: p.inventory,
          offersDelivery: false,
          deliveryRadiusMiles: 0,
          offersPickup: false,
          pickupAddress: '',
          deliveryWindows: [],
          pickupWindows: [],
          isActive: p.is_active,
          status: (!p.is_active ? 'inactive' : (!state.productsNeverExpire && p.market_date < new Date().toISOString().split('T')[0]) ? 'expired' : 'active') as any,
          marketDate: p.market_date,
          harvestedAt: p.harvested_at,
        })))
      }
    }
    loadBooth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Custom time slots
  const [customDeliverySlots, setCustomDeliverySlots] = useState<Array<{ start: string; end: string }>>([])
  const [customPickupSlots, setCustomPickupSlots] = useState<Array<{ start: string; end: string }>>([])
  const [showCustomDelivery, setShowCustomDelivery] = useState(false)
  const [showCustomPickup, setShowCustomPickup] = useState(false)
  const [customStart, setCustomStart] = useState('09:00')
  const [customEnd, setCustomEnd] = useState('11:00')

  // Helpers
  const [helpers, setHelpers] = useState<Array<{ helperId: string; name: string; status: 'pending' | 'accepted' | 'revoked' }>>([])
  const genPasscode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }
  const [helperPasscode, setHelperPasscodeState] = useState(genPasscode)
  const [inviteCopied, setInviteCopied] = useState(false)

  // Product slots
  const totalSlots = Math.max(MIN_SLOTS, myProducts.length + SLOT_INCREMENT)
  const [slotCount, setSlotCount] = useState(totalSlots)

  const tc = THEME_COLORS[theme] || THEME_COLORS.minimal
  const themeInfo = THEMES.find(t => t.id === theme)!

  if (authLoading) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  }

  if (!isAuthenticated) {
    router.replace('/login?redirect=/my-booth')
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <p>Redirecting to sign in...</p>
      </div>
    )
  }

  const handleSaveBooth = async () => {
    if (!name.trim() || !user) return

    // Map time window IDs to structured objects for DB
    const mapWindows = (ids: string[], customs: Array<{ start: string; end: string }>) => {
      const preset = ids.map(id => {
        const [start] = id.split('-')
        return { id, start: `${start}:00`, end: `${parseInt(start) + 2}:00` }
      })
      const custom = customs.map(s => ({ id: `custom-${s.start}`, start: s.start, end: s.end }))
      return [...preset, ...custom]
    }

    const dbRow: Record<string, any> = {
      owner_id: user.id,
      name: name.trim(),
      decorative_theme: theme,
      header_image_url: bannerUrl || null,
      offers_delivery: offersDelivery,
      offers_pickup: offersPickup,
      delivery_radius_miles: parseInt(deliveryRadius) || 2,
      pickup_address: pickupAddress.trim() || null,
      delivery_windows: mapWindows(deliveryWindows, customDeliverySlots),
      pickup_windows: mapWindows(pickupWindows, customPickupSlots),
      payment_method: paymentMethod,
      venmo_handle: payoutDestination === 'venmo' ? venmoHandle.trim() || null : null,
      charity_name: payoutDestination === 'charity' ? charityName.trim() || null : null,
      helper_passcode: helperPasscode,
    }

    // Geocode pickup address for spatial search
    if (pickupAddress.trim()) {
      const geo = await geocodeAddress(pickupAddress.trim())
      if (geo) {
        dbRow.pickup_location = toPostgisPoint(geo.lat, geo.lng)
      }
    }

    const { data, error } = await supabase
      .from('market_booths')
      .upsert(dbRow, { onConflict: 'owner_id' })
      .select()
      .single()

    if (error) {
      console.warn('Save failed:', error.message)
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Save failed — ' + error.message, type: 'error' } })
      return
    }

    // Also update in-memory store for immediate UI
    const boothData = {
      name: name.trim(), decorativeTheme: theme,
      headerImageUrl: bannerUrl || undefined,
      offersDelivery, offersPickup,
      deliveryRadiusMiles: parseInt(deliveryRadius) || 2,
      paymentMethod, helpers,
      venmoHandle: payoutDestination === 'venmo' ? venmoHandle.trim() || undefined : undefined,
      charityName: payoutDestination === 'charity' ? charityName.trim() || undefined : undefined,
      deliveryWindows: mapWindows(deliveryWindows, customDeliverySlots),
      pickupWindows: mapWindows(pickupWindows, customPickupSlots),
      pickupAddress: pickupAddress.trim() || undefined,
    }
    if (myBooth) {
      dispatch({ type: 'UPDATE_BOOTH', payload: { id: myBooth.id, ...boothData } })
    } else {
      dispatch({
        type: 'CREATE_BOOTH',
        payload: {
          id: data.id,
          ownerId: state.user!.id, ownerName: state.user!.name,
          description: '',
          aboutHtml: '<p>Welcome to my booth!</p>',
          inviteCode: name.replace(/\s/g, '').toUpperCase().slice(0, 8) + '2026',
          ...boothData,
        },
      })
    }
    if (data) setSavedBoothId(data.id)
    setSaved(true)
    try { localStorage.removeItem(BOOTH_DRAFT_KEY) } catch { /* ignore */ }
    setBoothShareMsg(getBoothShareText(data?.id))
    setShowBoothShareModal(true)
  }

  // Remove a product (optimistic — remove from UI first, restore on failure)
  const handleRemoveProduct = async (productId: string) => {
    const prev = dbProducts
    setDbProducts(p => p.filter(x => x.id !== productId))
    const { error } = await supabase.from('market_products').delete().eq('id', productId)
    if (error) {
      setDbProducts(prev) // restore
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to remove — ' + error.message, type: 'error' } })
      return
    }
  }

  // Drag-and-drop handlers
  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx) }
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return }
    setDbProducts(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(idx, 0, moved)
      return next
    })
    setDragIdx(null)
    setDragOverIdx(null)
  }
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null) }

  // Booth share helpers (accept optional id to bypass stale state during save)
  const getBoothShareUrl = (boothId?: string | null) => {
    const bid = boothId ?? savedBoothId
    return typeof window !== 'undefined' ? `${window.location.origin}/market${bid ? '/booth/' + bid : ''}` : '/market'
  }
  const getBoothShareText = (boothId?: string | null) => {
    const productNames = myProducts.slice(0, 3).map(p => p.name).join(', ')
    return `Hey! 🌱 Check out my booth "${name}" on CasaGrown Market!\n\n${productNames ? `Fresh ${productNames} and more. ` : ''}Browse and order from my booth:\n\n🛒 ${getBoothShareUrl(boothId)}\n\nFresh. Local. Trusted.`
  }

  // Build product slot data
  const slots: Array<{ type: 'product' | 'empty'; product?: typeof myProducts[0]; index: number }> = []
  for (let i = 0; i < slotCount; i++) {
    if (i < myProducts.length) {
      slots.push({ type: 'product', product: myProducts[i], index: i })
    } else {
      slots.push({ type: 'empty', index: i })
    }
  }
  const allFilled = myProducts.length >= slotCount
  const pendingOrders = myOrders.filter(o => o.status === 'pending').length

  return (
    <div className={styles.boothPreviewPage}>

      <NotificationBanner context="new order alerts and buyer messages" />
      {/* ── Compact Booth Header ── */}
      <div className={styles.boothHeader}>
        {/* Banner — always shows something (gradient default or uploaded image) */}
        <div className={styles.bannerWrap}>
          <div
            className={styles.bannerArea}
            style={bannerPreview
              ? { backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: `linear-gradient(135deg, ${tc.bg} 0%, ${tc.border}44 50%, ${tc.bg} 100%)` }
            }
          />

          {/* Change banner — menu with Take Photo + Gallery */}
          <div className={styles.photoCorner}>
            <button
              className={styles.bannerCornerBtn}
              onClick={(e) => { e.stopPropagation(); setShowPhotoMenu(!showPhotoMenu) }}
              title="Change Banner"
            >📷</button>
            {showPhotoMenu && (
              <div className={styles.photoMenu}>
                <button className={styles.photoMenuItem} onClick={() => {
                  setShowPhotoMenu(false)
                  setShowCamera(true)
                }}>
                  📸 Take Photo
                </button>
                <button className={styles.photoMenuItem} onClick={() => { bannerRef.current?.click(); setShowPhotoMenu(false) }}>
                  🖼️ Choose from Gallery
                </button>
              </div>
            )}
          </div>

          {/* Change theme — small icon top-right */}
          <div className={styles.themeCorner}>
            <button
              className={styles.bannerCornerBtn}
              onClick={(e) => { e.stopPropagation(); setShowThemePicker(!showThemePicker) }}
              title="Change Theme"
            >🎨</button>
            {showThemePicker && (
              <div className={styles.themePicker}>
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    className={`${styles.themePickerItem} ${theme === t.id ? styles.themePickerActive : ''}`}
                    onClick={() => { setTheme(t.id); setSaved(false); setShowThemePicker(false) }}
                  >
                    <span>{t.emoji}</span> {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Gallery file input */}
          <input
            ref={bannerRef}
            type="file" accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = (ev) => setCropSrc(ev.target?.result as string)
              reader.readAsDataURL(file)
            }}
          />
        </div>

        {/* Editable name bar below banner */}
        <div className={styles.nameBar} style={{ background: tc.bg, borderBottom: `2px solid ${tc.border}` }}>
          <input
            className={styles.nameBarInput}
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false) }}
            placeholder="Name your booth..."
            style={{ color: tc.text }}
          />
          <div className={styles.nameBarOwner}>
            <span>by</span>
            {state.user?.avatarUrl ? (
              <img src={state.user.avatarUrl} alt="" className={styles.ownerAvatar} />
            ) : (
              <span className={styles.ownerAvatarFallback}>
                {(state.user?.name || user?.email || '?')[0].toUpperCase()}
              </span>
            )}
            <span>{state.user?.name || user?.email?.split('@')[0] || 'You'}</span>
          </div>
        </div>
      </div>

      {/* ── Delivery & Pickup ── */}
      <div className={styles.boothSection}>
        <h2 className={styles.sectionTitle}>🚗 Delivery & Pickup</h2>
        <div className={styles.toggleGrid}>
          <button
            className={`${styles.toggleCard} ${offersDelivery ? styles.toggleActive : ''}`}
            onClick={() => { setOffersDelivery(!offersDelivery); setSaved(false) }}
          >
            <span style={{ fontSize: 28 }}>🚗</span>
            <strong>I&apos;ll Deliver</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Drop off at buyer&apos;s door</span>
          </button>
          <button
            className={`${styles.toggleCard} ${offersPickup ? styles.toggleActive : ''}`}
            onClick={() => { setOffersPickup(!offersPickup); setSaved(false) }}
          >
            <span style={{ fontSize: 28 }}>📍</span>
            <strong>Pickup Available</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Buyers pick up from you</span>
          </button>
        </div>
        {offersDelivery && (
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="label" htmlFor="delivery-radius">Delivery Radius (miles)</label>
            <input
              id="delivery-radius" type="number" className="input"
              value={deliveryRadius}
              onChange={e => { setDeliveryRadius(e.target.value); setSaved(false) }}
              min="1" max="25" style={{ maxWidth: 120 }}
            />
          </div>
        )}
        {offersDelivery && (
          <div style={{ marginTop: 16 }}>
            <label className="label">Delivery Windows</label>
            <div className={styles.windowGrid}>
              {TIME_WINDOWS.map(w => (
                <button
                  key={w.id}
                  className={`${styles.windowChip} ${deliveryWindows.includes(w.id) ? styles.windowChipActive : ''}`}
                  onClick={() => {
                    setDeliveryWindows(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])
                    setSaved(false)
                  }}
                >
                  {deliveryWindows.includes(w.id) ? '✅' : '⏰'} {w.label}
                </button>
              ))}
            </div>
            {customDeliverySlots.map((s, i) => (
              <div key={`cd-${i}`} className={styles.customSlotRow}>
                <span className={styles.customSlotLabel}>{s.start} – {s.end}</span>
                <button className={styles.helperRemove} onClick={() => {
                  setCustomDeliverySlots(prev => prev.filter((_, j) => j !== i)); setSaved(false)
                }}>×</button>
              </div>
            ))}
            {showCustomDelivery ? (
              <div className={styles.customSlotRow} style={{ marginTop: 8 }}>
                <input type="time" className="input" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ maxWidth: 110 }} />
                <span>to</span>
                <input type="time" className="input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ maxWidth: 110 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  setCustomDeliverySlots(prev => [...prev, { start: customStart, end: customEnd }])
                  setShowCustomDelivery(false); setSaved(false)
                }}>Add</button>
                <button className={styles.helperRemove} onClick={() => setShowCustomDelivery(false)}>×</button>
              </div>
            ) : (
              <button className={styles.addCustomBtn} onClick={() => setShowCustomDelivery(true)}>+ Custom slot</button>
            )}
          </div>
        )}
        {offersPickup && (
          <div style={{ marginTop: 16 }}>
            <label className="label">Pickup Windows</label>
            <div className={styles.windowGrid}>
              {TIME_WINDOWS.map(w => (
                <button
                  key={w.id}
                  className={`${styles.windowChip} ${pickupWindows.includes(w.id) ? styles.windowChipActive : ''}`}
                  onClick={() => {
                    setPickupWindows(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])
                    setSaved(false)
                  }}
                >
                  {pickupWindows.includes(w.id) ? '✅' : '⏰'} {w.label}
                </button>
              ))}
            </div>
            {customPickupSlots.map((s, i) => (
              <div key={`cp-${i}`} className={styles.customSlotRow}>
                <span className={styles.customSlotLabel}>{s.start} – {s.end}</span>
                <button className={styles.helperRemove} onClick={() => {
                  setCustomPickupSlots(prev => prev.filter((_, j) => j !== i)); setSaved(false)
                }}>×</button>
              </div>
            ))}
            {showCustomPickup ? (
              <div className={styles.customSlotRow} style={{ marginTop: 8 }}>
                <input type="time" className="input" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ maxWidth: 110 }} />
                <span>to</span>
                <input type="time" className="input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ maxWidth: 110 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  setCustomPickupSlots(prev => [...prev, { start: customStart, end: customEnd }])
                  setShowCustomPickup(false); setSaved(false)
                }}>Add</button>
                <button className={styles.helperRemove} onClick={() => setShowCustomPickup(false)}>×</button>
              </div>
            ) : (
              <button className={styles.addCustomBtn} onClick={() => setShowCustomPickup(true)}>+ Custom slot</button>
            )}
          </div>
        )}
        {offersPickup && (
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="label" htmlFor="pickup-address">📍 Pickup Location</label>
            <input
              id="pickup-address" className="input"
              value={pickupAddress}
              onChange={e => { setPickupAddress(e.target.value); setSaved(false) }}
              placeholder="e.g. 123 Oak Street, front porch"
            />
          </div>
        )}
      </div>

      {/* ── Payment ── */}
      {restriction.isFreeOnly ? (
        <div className={styles.boothSection}>
          <h2 className={styles.sectionTitle}>🏛️ Free Sharing Mode</h2>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 20px', fontSize: 14, color: '#1e40af', lineHeight: 1.6 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Your state ({restriction.stateName}) requires produce to be shared at no cost.</p>
            <p style={{ margin: '8px 0 0', color: '#3b82f6' }}>All your products will be listed as <strong>Free</strong>. Buyers can claim produce without payment. We&apos;re actively working on enabling paid transactions in your area.</p>
          </div>
        </div>
      ) : (
      <div className={styles.boothSection}>
        <h2 className={styles.sectionTitle}>💳 Payout Method</h2>
        <div className={styles.toggleGrid}>
          <button
            className={`${styles.toggleCard} ${paymentMethod === 'automatic' ? styles.toggleActive : ''}`}
            onClick={() => { setPaymentMethod('automatic'); setSaved(false) }}
          >
            <span style={{ fontSize: 28 }}>⚡</span>
            <strong>Auto Payout</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Paid after end-of-day settlement</span>
          </button>
          <button
            className={`${styles.toggleCard} ${paymentMethod === 'manual' ? styles.toggleActive : ''}`}
            onClick={() => { setPaymentMethod('manual'); setSaved(false) }}
          >
            <span style={{ fontSize: 28 }}>🖐️</span>
            <strong>Manual</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Request payout after settlement</span>
          </button>
        </div>
        {paymentMethod === 'automatic' && (
          <div style={{ marginTop: 16 }}>
            <p className="label" style={{ marginBottom: 10 }}>Where should earnings go?</p>
            <div className={styles.toggleGrid}>
              <button
                className={`${styles.toggleCard} ${styles.toggleCardSmall} ${payoutDestination === 'venmo' ? styles.toggleActive : ''}`}
                onClick={() => { setPayoutDestination('venmo'); setSaved(false) }}
              >
                <span style={{ fontSize: 22 }}>💸</span>
                <strong>Venmo</strong>
              </button>
              <button
                className={`${styles.toggleCard} ${styles.toggleCardSmall} ${payoutDestination === 'charity' ? styles.toggleActive : ''}`}
                onClick={() => { setPayoutDestination('charity'); setSaved(false) }}
              >
                <span style={{ fontSize: 22 }}>❤️</span>
                <strong>Charity</strong>
              </button>
            </div>
            {payoutDestination === 'venmo' && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="label" htmlFor="venmo-handle">Venmo Username, Email or Phone</label>
                <input
                  id="venmo-handle" className="input" value={venmoHandle}
                  onChange={e => { setVenmoHandle(e.target.value); setSaved(false) }}
                  placeholder="@username, email, or phone" style={{ maxWidth: 320 }}
                />
              </div>
            )}
            {payoutDestination === 'charity' && (
              <div className="form-group" style={{ marginTop: 12, position: 'relative' }}>
                <label className="label" htmlFor="charity-search">Search Charities</label>
                <input
                  id="charity-search" className="input"
                  value={charityName || charitySearch}
                  onChange={e => {
                    const val = e.target.value
                    setCharitySearch(val)
                    setCharityName('')
                    setShowCharityDropdown(true)
                    setSaved(false)
                  }}
                  onFocus={() => setShowCharityDropdown(true)}
                  placeholder="Search for a charity..."
                />
                {showCharityDropdown && (
                  <div className={styles.charityDropdown}>
                    {DEFAULT_CHARITIES
                      .filter(c => !charitySearch || c.name.toLowerCase().includes(charitySearch.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.id}
                          className={styles.charityItem}
                          onClick={() => {
                            setCharityName(c.name)
                            setCharitySearch('')
                            setShowCharityDropdown(false)
                            setSaved(false)
                          }}
                        >
                          <span className={styles.charityItemName}>{c.name}</span>
                          <span className={styles.charityItemCategory}>{c.category}</span>
                        </button>
                      ))}
                    {charitySearch && !DEFAULT_CHARITIES.some(c => c.name.toLowerCase().includes(charitySearch.toLowerCase())) && (
                      <button
                        className={styles.charityItem}
                        onClick={() => {
                          setCharityName(charitySearch)
                          setCharitySearch('')
                          setShowCharityDropdown(false)
                          setSaved(false)
                        }}
                      >
                        <span className={styles.charityItemName}>Use &quot;{charitySearch}&quot;</span>
                        <span className={styles.charityItemCategory}>Custom</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Product Slots ── */}
      <div className={styles.boothSection}>
        <h2 className={styles.sectionTitle}>📦 Your Products</h2>
        <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 16 }}>
          Drag to reorder. First product is your hero item. Tap + to add.
        </p>
        <div style={{ background: 'var(--blue-50, #eff6ff)', border: '1px solid var(--blue-200, #bfdbfe)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--blue-700, #1d4ed8)' }}>
          💡 <strong>Platform fee:</strong> {platformFeePct}% of each sale is retained as a platform fee. This is shown to buyers at checkout.
        </div>
        <div className={styles.productGrid}>
          {slots.map(slot => (
            slot.type === 'product' && slot.product ? (
              <div
                key={slot.product.id}
                className={`${styles.productSlot} ${dragOverIdx === slot.index ? styles.productSlotDragOver : ''}`}
                draggable
                onDragStart={() => handleDragStart(slot.index)}
                onDragOver={(e) => handleDragOver(e, slot.index)}
                onDrop={() => handleDrop(slot.index)}
                onDragEnd={handleDragEnd}
                style={{ opacity: dragIdx === slot.index ? 0.4 : 1, cursor: 'grab' }}
              >
                <button
                  className={styles.productRemoveBtn}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveProduct(slot.product!.id) }}
                  title="Remove product"
                >✕</button>
              <div onClick={() => router.push(`/my-booth/products/${slot.product!.id}`)} style={{ cursor: 'pointer' }}>
                  <div className={styles.productSlotImage}>
                    {slot.product.photos[0] ? (
                      <img src={slot.product.photos[0]} alt={slot.product.name} />
                    ) : (
                      <span className={styles.productSlotEmoji}>🥬</span>
                    )}
                    {/* Expired / Flagged overlay */}
                    {(slot.product.status === 'expired' || !slot.product.isActive) && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'var(--radius-md)', color: '#fff', fontWeight: 700, fontSize: 12,
                      }}>
                        {slot.product.status === 'expired' ? '⏰ Expired' : '⚠️ Inactive'}
                      </div>
                    )}
                  </div>
                  <div className={styles.productSlotInfo}>
                    <strong>{slot.product.name}</strong>
                    <span className="price">{formatUsd(slot.product.priceUsd)}/{slot.product.unit}</span>
                    <span className={styles.productSlotStock}>
                      {slot.product.inventory > 0 ? `${slot.product.inventory} in stock` : 'Sold out'}
                    </span>
                    {slot.product.status === 'expired' && (
                      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                        Listed for {slot.product.marketDate}
                      </span>
                    )}
                  </div>
                </div>
                {/* Re-list button for expired products */}
                {slot.product.status === 'expired' && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ margin: '8px 8px 4px', fontSize: 12 }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={async (e) => {
                      e.preventDefault(); e.stopPropagation()
                      const nextMarket = getNextMarketDate(state.marketSchedule)
                      const newDate = nextMarket?.date.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
                      const { error } = await supabase.from('market_products')
                        .update({ market_date: newDate, is_active: true, updated_at: new Date().toISOString() })
                        .eq('id', slot.product!.id)
                      if (!error) {
                        setDbProducts(prev => prev.map(p =>
                          p.id === slot.product!.id
                            ? { ...p, marketDate: newDate, isActive: true, status: 'active' as const }
                            : p
                        ))
                      }
                    }}
                  >
                    🔄 Re-list for Next Market
                  </button>
                )}
              </div>
            ) : (
              <Link
                key={`empty-${slot.index}`}
                href="/my-booth/products/new"
                className={`${styles.productSlot} ${styles.productSlotEmpty}`}
              >
                <div className={styles.addSlotContent}>
                  <span className={styles.addSlotIcon}>+</span>
                  <span className={styles.addSlotLabel}>Add Product</span>
                </div>
              </Link>
            )
          ))}
        </div>
        {allFilled && (
          <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setSlotCount(prev => prev + SLOT_INCREMENT)}>
            + Show More Slots
          </button>
        )}
      </div>

      {/* ── Helpers ── */}
      {<div className={styles.boothSection}>
        <h2 className={styles.sectionTitle}>🤝 Helpers</h2>
        <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 16 }}>
          Share the link and passcode so others can help manage your booth.
        </p>

        {/* Passcode display */}
        <div className={styles.passcodeCard}>
          <div className={styles.passcodeLabel}>Passcode for helpers</div>
          <div className={styles.passcodeDigits}>
            {helperPasscode.split('').map((ch, i) => (
              <span key={i} className={styles.passcodeDigit}>{ch}</span>
            ))}
          </div>
        </div>

        {/* Share actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join-booth/${encodeURIComponent(helperPasscode)}` : ''
              const text = [
                `Hey! 🤝 I'm selling on CasaGrown Market and could use a hand with my booth "${name}".`,
                '',
                'As a helper you can:',
                '• See and fulfill pending orders',
                '• Chat with buyers on my behalf',
                '• Help with delivery and pickup handoffs',
                '',
                `Join here: ${joinUrl}`,
                `Passcode: ${helperPasscode}`,
              ].join('\n')
              navigator.clipboard?.writeText(text)
              setInviteCopied(true)
              setTimeout(() => setInviteCopied(false), 2000)
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Copied! 📋', type: 'success' } })
            }}
          >
            {inviteCopied ? '✅ Copied!' : '📋 Copy Link + Passcode'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join-booth/${encodeURIComponent(helperPasscode)}` : ''
              const text = [
                `Hey! 🤝 I'm selling on CasaGrown Market and could use a hand with my booth "${name}".`,
                '',
                'As a helper you can:',
                '• See and fulfill pending orders',
                '• Chat with buyers on my behalf',
                '• Help with delivery and pickup handoffs',
                '',
                `Join here: ${joinUrl}`,
                `Passcode: ${helperPasscode}`,
              ].join('\n')
              if (navigator.share) {
                navigator.share({ title: `Help with ${name} on CasaGrown`, text })
              } else {
                navigator.clipboard?.writeText(text)
                dispatch({ type: 'ADD_TOAST', payload: { message: 'Copied! 📋', type: 'success' } })
              }
            }}
          >
            📤 Share
          </button>
        </div>

        {/* Current helpers */}
        {helpers.length > 0 && (
          <div className={styles.helperList} style={{ marginTop: 16 }}>
            {helpers.map((h) => (
              <div key={h.helperId} className={styles.helperRow}>
                <span className={styles.helperEmail}>{h.name}</span>
                <span className={`badge ${h.status === 'accepted' ? 'badge-green' : h.status === 'revoked' ? 'badge-red' : 'badge-amber'} badge-sm`}>
                  {h.status}
                </span>
                {h.status !== 'revoked' && (
                  <button
                    className={styles.helperRemove}
                    title="Revoke helper access"
                    onClick={async () => {
                      if (!savedBoothId) return
                      const { error } = await supabase
                        .from('booth_helpers')
                        .update({ status: 'revoked', updated_at: new Date().toISOString() })
                        .eq('booth_id', savedBoothId)
                        .eq('helper_id', h.helperId)
                      if (error) {
                        dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to revoke — ' + error.message, type: 'error' } })
                        return
                      }
                      setHelpers(prev => prev.map(x => x.helperId === h.helperId ? { ...x, status: 'revoked' } : x))
                      dispatch({ type: 'ADD_TOAST', payload: { message: 'Helper access revoked', type: 'success' } })
                    }}
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* ── Quick Actions (only if booth exists) ── */}
      {myBooth && (
        <div className={styles.boothSection}>
          <h2 className={styles.sectionTitle}>⚡ Quick Actions</h2>
          <div className={styles.actions}>
            <Link href="/my-booth/orders" className={styles.actionCard}>
              <span>📋</span><strong>View Orders</strong>
              {pendingOrders > 0 && <span className="badge badge-red">{pendingOrders}</span>}
            </Link>
            <Link href="/my-booth/coupons" className={styles.actionCard}>
              <span>🏷️</span><strong>Coupons</strong>
            </Link>
            <Link href="/my-booth/invitations" className={styles.actionCard}>
              <span>✉️</span><strong>Invite Neighbors</strong>
            </Link>
          </div>
        </div>
      )}

      {/* ── Save / Share Button ── */}
      {saved ? (
        <button
          className={styles.saveBtn}
          onClick={() => { setBoothShareMsg(getBoothShareText()); setShowBoothShareModal(true) }}
        >
          📤 Share Booth
        </button>
      ) : (
        <button
          className={styles.saveBtn}
          onClick={handleSaveBooth}
          disabled={!name.trim()}
        >
          Save Booth
        </button>
      )}

      {/* ── Share Booth Modal (after save) ── */}
      {showBoothShareModal && (
        <>
          <div className={styles.shareBackdrop} onClick={() => setShowBoothShareModal(false)} />
          <div className={styles.shareModal}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{name} Saved!</h2>
            <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 16 }}>
              Edit the message below, then share with your neighbors.
            </p>
            <textarea
              style={{ width: '100%', minHeight: 120, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--gray-700)', textAlign: 'left', lineHeight: 1.5, border: '1px solid var(--gray-300)', resize: 'vertical', fontFamily: 'inherit' }}
              value={boothShareMsg}
              onChange={e => setBoothShareMsg(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(boothShareMsg); setBoothShareCopied(true); setTimeout(() => setBoothShareCopied(false), 2000) } catch {}
                }}
              >
                {boothShareCopied ? '✅ Copied!' : '📋 Copy Message'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  if (navigator.share) {
                    try { await navigator.share({ title: `${name} on CasaGrown`, text: boothShareMsg }) } catch {}
                  } else {
                    try { await navigator.clipboard.writeText(boothShareMsg); setBoothShareCopied(true); setTimeout(() => setBoothShareCopied(false), 2000) } catch {}
                  }
                }}
              >
                📤 Share
              </button>
            </div>
            <button
              style={{ marginTop: 12, padding: 8, fontSize: 13, color: 'var(--gray-500)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setShowBoothShareModal(false)}
            >
              Skip →
            </button>
          </div>
        </>
      )}

      {/* ── Camera → sends to cropper ── */}
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

      {/* ── Image Cropper → uploads result ── */}
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspectRatio={3.5}
          onCancel={() => setCropSrc(null)}
          onCrop={async (file) => {
            setCropSrc(null)
            setUploadingBanner(true)
            const reader = new FileReader()
            reader.onload = (ev) => setBannerPreview(ev.target?.result as string)
            reader.readAsDataURL(file)
            const userId = state.user?.id || 'anon'
            const path = `booth-banners/${userId}.jpg`
            const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
            if (!error) {
              const { data } = supabase.storage.from('media').getPublicUrl(path)
              if (data?.publicUrl) { setBannerUrl(data.publicUrl); setSaved(false) }
            }
            setUploadingBanner(false)
          }}
        />
      )}
    </div>
  )
}
