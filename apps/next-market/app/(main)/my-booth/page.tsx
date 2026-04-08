'use client'

import { LoadingSpinner } from '../../components/LoadingSpinner'
import SocialShareModal from '../../components/SocialShareModal'

import { useState, useRef, useEffect, MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMarket, formatUsd, getNextMarketDate, isMarketOpen, type Booth } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { useMarketRestriction } from '../../../lib/useMarketRestriction'
import { useNotificationPrompt } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../components/NotificationPromptModal'
import { NotificationBanner } from '../../components/NotificationBanner'
import { HelperDMModal } from './components/HelperDMModal'
import CameraCapture from '../../../components/CameraCapture'
import ImageCropper from '../../../components/ImageCropper'
import { useErrorToast } from '../../components/ErrorToast'
import { ShareIcon, PersonPlusIcon } from '../../components/icons'


import { geocodeAddress, toPostgisPoint } from '../../../lib/geocode'
import { trackClick, trackError } from '../../../lib/analytics'

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

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type DayKey = typeof DAY_KEYS[number]
const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}
type WeeklyWindows = Record<DayKey, string[]>
type WeeklyCustomSlots = Record<DayKey, Array<{ start: string; end: string }>>
const EMPTY_WEEKLY: WeeklyWindows = Object.fromEntries(DAY_KEYS.map(d => [d, []])) as unknown as WeeklyWindows
const EMPTY_WEEKLY_CUSTOM: WeeklyCustomSlots = Object.fromEntries(DAY_KEYS.map(d => [d, []])) as unknown as WeeklyCustomSlots

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
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)
  const nextMarket = getNextMarketDate(state.marketSchedule)
  const marketOpen = isMarketOpen(state.marketSchedule, state.marketNeverCloses)
  const bannerRef = useRef<HTMLInputElement>(null)
  const myBooth = state.booths.find(b => b.ownerId === state.user?.id)
  const [dbProducts, setDbProducts] = useState<typeof state.products>([])
  const myProducts = dbProducts
  const [productShareId, setProductShareId] = useState<string | null>(null)
  const myOrders = state.orders.filter(o => o.sellerId === state.user?.id)

  const [name, setName] = useState(myBooth?.name || '')
  const [theme, setTheme] = useState<Booth['decorativeTheme']>(myBooth?.decorativeTheme || 'floral')
  const [bannerUrl, setBannerUrl] = useState(myBooth?.headerImageUrl || '')
  const [bannerPreview, setBannerPreview] = useState(myBooth?.headerImageUrl || '')
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [saved, setSaved] = useState(!!myBooth)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showPhotoMenu, setShowPhotoMenu] = useState(false)
  // Day-of-week selected for editing (weekly windows)
  const [selectedDay, setSelectedDay] = useState<DayKey>('saturday')

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
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfProductId, setDeleteConfProductId] = useState<string | null>(null)
  const { showError } = useErrorToast()
  const [locationDenied, setLocationDenied] = useState(false)

  // Drag-and-drop reordering
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Platform fee rate (loaded from DB)
  const [platformFeePct, setPlatformFeePct] = useState(10)
  const [profileName, setProfileName] = useState<string | null>(null)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('platform_fees').select('fees').eq('country_code', 'USA').single()
      .then(({ data }) => { if (data?.fees) setPlatformFeePct(Math.round(data.fees * 100)) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.full_name) setProfileName(data.full_name)
        if (data?.avatar_url) setProfileAvatarUrl(data.avatar_url)
      })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger notification prompt on mount
  useEffect(() => { showPrompt() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Weekly time windows (day-keyed)
  const [weeklyDeliveryWindows, setWeeklyDeliveryWindows] = useState<WeeklyWindows>({ ...EMPTY_WEEKLY })
  const [weeklyPickupWindows, setWeeklyPickupWindows] = useState<WeeklyWindows>({ ...EMPTY_WEEKLY })
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
      if (draft.weeklyDeliveryWindows) setWeeklyDeliveryWindows(draft.weeklyDeliveryWindows)
      if (draft.weeklyPickupWindows) setWeeklyPickupWindows(draft.weeklyPickupWindows)
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
          weeklyDeliveryWindows, weeklyPickupWindows, bannerPreview,
        }))
      } catch { /* quota */ }
    }, 500)
    return () => clearTimeout(t)
  }, [name, theme, offersDelivery, offersPickup, deliveryRadius, pickupAddress, paymentMethod, venmoHandle, charityName, weeklyDeliveryWindows, weeklyPickupWindows, bannerPreview, saved])

  // Load booth + profile data from Supabase on mount (progressive — render booth first)
  const [boothLoaded, setBoothLoaded] = useState(false)
  const [productsLoading, setProductsLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user) return
    const loadData = async () => {
      const authUserId = user.id

      // Phase 1: Fetch profile + booth in parallel
      // Try with booth_helpers join first; fall back to plain query if it fails
      const [profileRes, boothRes] = await Promise.all([
        supabase.from('profiles').select('street_address, city, state_code').eq('id', authUserId).single(),
        supabase.from('market_booths')
          .select('*, booth_helpers(helper_id, status, profiles!booth_helpers_helper_id_fkey(full_name))')
          .eq('owner_id', authUserId)
          .single(),
      ])

      // Fallback: if joined query failed, try without the join
      let boothData = boothRes.data
      if (!boothData && boothRes.error) {
        console.warn('Booth query with helpers failed, trying without join:', boothRes.error.message)
        const { data: plainBooth } = await supabase
          .from('market_booths')
          .select('*')
          .eq('owner_id', authUserId)
          .single()
        boothData = plainBooth
      }

      // Set pickup address from profile
      if (!pickupAddress && profileRes.data?.street_address) {
        const addr = [profileRes.data.street_address, profileRes.data.city].filter(Boolean).join(', ')
        setPickupAddress(addr)
      }

      const booth = boothData
      if (!booth) { setBoothLoaded(true); setProductsLoading(false); return }

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

      // Parse weekly windows from DB (new format) — fall back to flat format
      const weeklyDw = booth.weekly_delivery_windows as Record<string, Array<{id: string; start: string; end: string}>> | null
      const weeklyPw = booth.weekly_pickup_windows as Record<string, Array<{id: string; start: string; end: string}>> | null
      if (weeklyDw && Object.keys(weeklyDw).length > 0) {
        // New weekly format
        const dwResult: WeeklyWindows = { ...EMPTY_WEEKLY }
        const pwResult: WeeklyWindows = { ...EMPTY_WEEKLY }
        const cdResult: WeeklyCustomSlots = { ...EMPTY_WEEKLY_CUSTOM }
        const cpResult: WeeklyCustomSlots = { ...EMPTY_WEEKLY_CUSTOM }
        for (const day of DAY_KEYS) {
          const dayDw = weeklyDw[day] || []
          const dayPw = ((weeklyPw || {} as any)[day] || []) as Array<{id: string; start: string; end: string}>
          dwResult[day] = dayDw.filter(w => !w.id.startsWith('custom-')).map(w => w.id)
          pwResult[day] = dayPw.filter(w => !w.id.startsWith('custom-')).map(w => w.id)
          cdResult[day] = dayDw.filter(w => w.id.startsWith('custom-')).map(w => ({ start: w.start, end: w.end }))
          cpResult[day] = dayPw.filter(w => w.id.startsWith('custom-')).map(w => ({ start: w.start, end: w.end }))
        }
        setWeeklyDeliveryWindows(dwResult)
        setWeeklyPickupWindows(pwResult)
        setCustomDeliverySlots(cdResult)
        setCustomPickupSlots(cpResult)
        // Select the first day that has windows configured
        const firstActive = DAY_KEYS.find(d => dwResult[d].length > 0 || pwResult[d].length > 0 || cdResult[d].length > 0 || cpResult[d].length > 0)
        if (firstActive) setSelectedDay(firstActive)
      } else {
        // Legacy flat format → assign all to saturday (default market day)
        const dwArr = (booth.delivery_windows || []) as Array<{ id: string; start: string; end: string }>
        const pwArr = (booth.pickup_windows || []) as Array<{ id: string; start: string; end: string }>
        const dwResult: WeeklyWindows = { ...EMPTY_WEEKLY }
        const pwResult: WeeklyWindows = { ...EMPTY_WEEKLY }
        const cdResult: WeeklyCustomSlots = { ...EMPTY_WEEKLY_CUSTOM }
        const cpResult: WeeklyCustomSlots = { ...EMPTY_WEEKLY_CUSTOM }
        dwResult.saturday = dwArr.filter(w => !w.id.startsWith('custom-')).map(w => w.id)
        pwResult.saturday = pwArr.filter(w => !w.id.startsWith('custom-')).map(w => w.id)
        cdResult.saturday = dwArr.filter(w => w.id.startsWith('custom-')).map(w => ({ start: w.start, end: w.end }))
        cpResult.saturday = pwArr.filter(w => w.id.startsWith('custom-')).map(w => ({ start: w.start, end: w.end }))
        setWeeklyDeliveryWindows(dwResult)
        setWeeklyPickupWindows(pwResult)
        setCustomDeliverySlots(cdResult)
        setCustomPickupSlots(cpResult)
      }

      setSaved(true)
      setSavedBoothId(booth.id)

      // Extract helpers from joined query
      const dbHelpers = (booth as any).booth_helpers || []
      if (dbHelpers.length > 0) {
        setHelpers(dbHelpers.map((h: any) => ({
          helperId: h.helper_id,
          name: h.profiles?.full_name || 'Unknown',
          status: h.status as 'pending' | 'accepted' | 'revoked',
        })))
      }

      // Populate in-memory store so myBooth is non-null (enables product links)
      if (!state.booths.find(b => b.ownerId === authUserId)) {
        dispatch({
          type: 'CREATE_BOOTH',
          payload: {
            id: booth.id,
            ownerId: authUserId,
            ownerName: profileName || user?.email?.split('@')[0] || '',
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

      // ★ BOOTH IS READY — render it now while products load
      setBoothLoaded(true)

      // Phase 2: Load products in background (UI already visible)
      const { data: products } = await supabase
        .from('market_products')
        .select('*')
        .eq('seller_id', authUserId)
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
          isDraft: p.is_draft,
          status: (p.is_draft ? 'draft' : (!p.is_active ? 'inactive' : (p.expires_at && new Date(p.expires_at) < new Date()) ? 'expired' : 'active')) as any,
          marketDate: p.market_date,
          harvestedAt: p.harvested_at,
        })))
      }
      setProductsLoading(false)
    }
    loadData()
  }, [user?.id, authLoading]) // re-run when auth resolves

  // Custom time slots (weekly)
  const [customDeliverySlots, setCustomDeliverySlots] = useState<WeeklyCustomSlots>({ ...EMPTY_WEEKLY_CUSTOM })
  const [customPickupSlots, setCustomPickupSlots] = useState<WeeklyCustomSlots>({ ...EMPTY_WEEKLY_CUSTOM })
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
  const [showHelperDM, setShowHelperDM] = useState(false)
  const [dmSending, setDmSending] = useState(false)

  // Product slots
  const totalSlots = Math.max(MIN_SLOTS, myProducts.length + SLOT_INCREMENT)
  const [slotCount, setSlotCount] = useState(totalSlots)

  const tc = THEME_COLORS[theme] || THEME_COLORS.minimal
  const themeInfo = THEMES.find(t => t.id === theme)!

  // Redirect to login if not authenticated (layout gate also handles this,
  // but this is a safety net for direct navigation)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/my-booth')
    }
  }, [authLoading, isAuthenticated, router])

  if (authLoading || !isAuthenticated) {
    return <LoadingSpinner />
  }

  const handleSaveBooth = async () => {
    if (!name.trim() || !user) return
    trackClick('save_booth_config', { theme, offersDelivery, offersPickup })

    // ── Validate fulfillment time windows ──
    const issues: string[] = []
    if (!offersDelivery && !offersPickup) {
      issues.push('Enable at least one fulfillment option (delivery or pickup)')
    }
    // Check that at least one day has windows configured
    const hasAnyDeliveryWindow = offersDelivery && DAY_KEYS.some(d => weeklyDeliveryWindows[d].length > 0 || customDeliverySlots[d].length > 0)
    const hasAnyPickupWindow = offersPickup && DAY_KEYS.some(d => weeklyPickupWindows[d].length > 0 || customPickupSlots[d].length > 0)
    if (offersDelivery && !hasAnyDeliveryWindow) {
      issues.push('Select at least one delivery time window on at least one day')
    }
    if (offersPickup && !hasAnyPickupWindow) {
      issues.push('Select at least one pickup time window on at least one day')
    }
    if (offersPickup && !pickupAddress.trim()) {
      issues.push('Enter a pickup address')
    } else if (offersPickup && pickupAddress.trim()) {
      const addr = pickupAddress.trim()
      const hasState = /\b[A-Z]{2}\b/.test(addr)
      const hasZip = /\b\d{5}\b/.test(addr)
      if (!hasState && !hasZip) {
        issues.push('Please include your city, state, and zip code in the pickup address (e.g. "123 Main St, San Jose, CA 95120")')
      }
    }
    if (issues.length > 0) {
      setFormError('⚠️ Please fix before saving:\n\n• ' + issues.join('\n• '))
      return
    }
    setFormError(null)

    try {
    // Map time window IDs to structured objects for DB
    const mapWindows = (ids: string[], customs: Array<{ start: string; end: string }>) => {
      const preset = ids.map(id => {
        const [start] = id.split('-')
        return { id, start: `${start}:00`, end: `${parseInt(start) + 2}:00` }
      })
      const custom = customs.map(s => ({ id: `custom-${s.start}`, start: s.start, end: s.end }))
      return [...preset, ...custom]
    }

    // Build weekly windows for DB
    const weeklyDwDb: Record<string, any[]> = {}
    const weeklyPwDb: Record<string, any[]> = {}
    // Also build flat windows for backward compatibility
    let flatDw: any[] = []
    let flatPw: any[] = []
    for (const day of DAY_KEYS) {
      const dwMapped = mapWindows(weeklyDeliveryWindows[day], customDeliverySlots[day])
      const pwMapped = mapWindows(weeklyPickupWindows[day], customPickupSlots[day])
      if (dwMapped.length > 0) weeklyDwDb[day] = dwMapped
      if (pwMapped.length > 0) weeklyPwDb[day] = pwMapped
      // Flat = union of all days (backward compat)
      flatDw = [...flatDw, ...dwMapped.filter(w => !flatDw.some(f => f.id === w.id))]
      flatPw = [...flatPw, ...pwMapped.filter(w => !flatPw.some(f => f.id === w.id))]
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
      delivery_windows: flatDw,
      pickup_windows: flatPw,
      weekly_delivery_windows: weeklyDwDb,
      weekly_pickup_windows: weeklyPwDb,
      payment_method: paymentMethod,
      venmo_handle: payoutDestination === 'venmo' ? venmoHandle.trim() || null : null,
      charity_name: payoutDestination === 'charity' ? charityName.trim() || null : null,
      helper_passcode: helperPasscode,
    }

    // Geocode pickup address for spatial search
    // If address matches profile, reuse home_location (already geocoded) to avoid Nominatim rate limits
    if (pickupAddress.trim()) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('street_address, city, home_location')
        .eq('id', user.id)
        .single()
      const profileAddr = profile ? [profile.street_address, profile.city].filter(Boolean).join(', ') : ''
      
      if (profile?.home_location?.coordinates && pickupAddress.trim().toLowerCase() === profileAddr.toLowerCase()) {
        // Pickup address matches profile — reuse existing coordinates
        const [lng, lat] = profile.home_location.coordinates
        dbRow.pickup_location = toPostgisPoint(lat, lng)
      } else {
        // Custom address — geocode via Nominatim with retry
        let geo = await geocodeAddress(pickupAddress.trim())
        if (!geo) {
          console.warn('Geocoding failed, retrying after 2s...')
          await new Promise(r => setTimeout(r, 2000))
          geo = await geocodeAddress(pickupAddress.trim())
        }
        if (geo) {
          dbRow.pickup_location = toPostgisPoint(geo.lat, geo.lng)
        } else {
          setFormError('⚠️ We couldn\'t verify your booth address. Please check the pickup address and try saving again.')
          return
        }
      }
    }

    const { data, error } = await supabase
      .from('market_booths')
      .upsert(dbRow, { onConflict: 'owner_id' })
      .select()
      .single()

    if (error) {
      console.warn('Save failed:', error.message)
      setFormError('Booth save failed: ' + error.message)
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
      deliveryWindows: flatDw,
      pickupWindows: flatPw,
      pickupAddress: pickupAddress.trim() || undefined,
    }
    if (myBooth) {
      dispatch({ type: 'UPDATE_BOOTH', payload: { id: myBooth.id, ...boothData } })
    } else {
      dispatch({
        type: 'CREATE_BOOTH',
        payload: {
          id: data.id,
          ownerId: user.id, ownerName: user.email?.split('@')[0] || '',
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
    } catch (err: any) {
      console.error('Booth save error:', err)
      trackError('booth_save_failed', { error: err.message })
      setFormError('Booth save failed: ' + (err.message || 'Unknown error'))
    }
  }

  // Remove a product (optimistic — remove from UI first, restore on failure)
  const handleRemoveProduct = async (productId: string) => {
    const prev = dbProducts
    setDbProducts(p => p.filter(x => x.id !== productId))
    const { error } = await supabase.from('market_products').update({ is_deleted: true }).eq('id', productId)
    if (error) {
      setDbProducts(prev) // restore
      showError('Failed to remove — ' + error.message)
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
    const sellerName = profileName?.split(' ')[0] || 'your neighbor'
    const productNames = myProducts.slice(0, 3).map(p => p.name).join(', ')
    const nextDay = nextMarket ? nextMarket.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : ''
    return `Hey! 🌱 I'm ${sellerName} and I just set up my booth "${name}" on CasaGrown Market!\n\n${productNames ? `I'm growing ${productNames} and more — ` : ''}come check out what's fresh from my backyard.${nextDay ? `\n\n📅 Next market day: ${nextDay}` : ''}\n\n🛒 ${getBoothShareUrl(boothId)}\n\nFresh produce, straight from your neighbor! 🏡`
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

      <NotificationPromptModal {...modalProps} />
      <NotificationBanner context="new order alerts and buyer messages" onEnableClick={showPrompt} />

      {/* ── Booth Status Badge ── */}
      <div style={{
        background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
        border: '1px solid var(--green-300)',
        borderRadius: 'var(--radius)', padding: '10px 16px', margin: '0 0 12px',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 14,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 18 }}>🏪</span>
          <span style={{ color: 'var(--green-700)', flex: 1 }}>
            <strong>Your booth is live</strong> — shoppers can browse anytime
          </span>
        {/* Invite button */}
        <button
          onClick={() => { setBoothShareMsg(getBoothShareText()); setShowBoothShareModal(true) }}
          style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: 'var(--green-600, #16a34a)',
            color: '#fff',
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            transition: 'all 0.15s',
          }}
        >
          📣 Invite Neighbors
        </button>
      </div>



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
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt="" className={styles.ownerAvatar} />
            ) : (
              <span className={styles.ownerAvatarFallback}>
                {(profileName || user?.email || '?')[0].toUpperCase()}
              </span>
            )}
            <span>{profileName || user?.email?.split('@')[0] || 'You'}</span>
          </div>
        </div>
      </div>

      {/* Trigger notification prompt after page loads */}
      {/* eslint-disable-next-line react-hooks/exhaustive-deps */}

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
        {(offersDelivery || offersPickup) && (
          <div style={{ marginTop: 16 }}>
            <label className="label">📅 Default Fulfillment Windows</label>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
              Set your default delivery &amp; pickup hours for each day. These become the defaults for new product listings.
            </p>

            {/* Day-of-week tab row */}
            <div className={styles.dayTabsRow}>
              {DAY_KEYS.map(day => {
                const hasDwWindows = weeklyDeliveryWindows[day].length > 0 || customDeliverySlots[day].length > 0
                const hasPwWindows = weeklyPickupWindows[day].length > 0 || customPickupSlots[day].length > 0
                const hasWindows = hasDwWindows || hasPwWindows
                const isSelected = selectedDay === day
                return (
                  <button
                    key={day}
                    className={`${styles.dayTab} ${isSelected ? styles.dayTabActive : hasWindows ? styles.dayTabSelected : ''}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    {DAY_LABELS[day]}
                    {hasWindows && !isSelected && <span style={{ marginLeft: 2 }}>✓</span>}
                  </button>
                )
              })}
            </div>

            {/* Windows for the selected day */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', padding: 16, border: '1px solid var(--border)' }}>
              <div className={styles.dayWindowsLabel}>
                {DAY_LABELS[selectedDay]} — {selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)}
              </div>

              {/* Delivery windows for selected day */}
              {offersDelivery && (
                <div style={{ marginBottom: offersPickup ? 16 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>🚗 Delivery</div>
                  <div className={styles.windowGrid}>
                    {TIME_WINDOWS.map(w => (
                      <button
                        key={`d-${w.id}`}
                        className={`${styles.windowChip} ${weeklyDeliveryWindows[selectedDay].includes(w.id) ? styles.windowChipActive : ''}`}
                        onClick={() => {
                          setWeeklyDeliveryWindows(prev => ({
                            ...prev,
                            [selectedDay]: prev[selectedDay].includes(w.id)
                              ? prev[selectedDay].filter(id => id !== w.id)
                              : [...prev[selectedDay], w.id]
                          }))
                          setSaved(false)
                        }}
                      >
                        {weeklyDeliveryWindows[selectedDay].includes(w.id) ? '✅' : '⏰'} {w.label}
                      </button>
                    ))}
                  </div>
                  {customDeliverySlots[selectedDay].map((s, i) => (
                    <div key={`cd-${i}`} className={styles.customSlotRow}>
                      <span className={styles.customSlotLabel}>{s.start} – {s.end}</span>
                      <button className={styles.helperRemove} onClick={() => {
                        setCustomDeliverySlots(prev => ({
                          ...prev,
                          [selectedDay]: prev[selectedDay].filter((_, j) => j !== i)
                        }))
                        setSaved(false)
                      }}>×</button>
                    </div>
                  ))}
                  {showCustomDelivery ? (
                    <div className={styles.customSlotRow} style={{ marginTop: 8 }}>
                      <input type="time" className="input" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ maxWidth: 110 }} />
                      <span>to</span>
                      <input type="time" className="input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ maxWidth: 110 }} />
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        setCustomDeliverySlots(prev => ({
                          ...prev,
                          [selectedDay]: [...prev[selectedDay], { start: customStart, end: customEnd }]
                        }))
                        setShowCustomDelivery(false); setSaved(false)
                      }}>Add</button>
                      <button className={styles.helperRemove} onClick={() => setShowCustomDelivery(false)}>×</button>
                    </div>
                  ) : (
                    <button className={styles.addCustomBtn} onClick={() => setShowCustomDelivery(true)}>+ Custom slot</button>
                  )}
                </div>
              )}

              {/* Pickup windows for selected day */}
              {offersPickup && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>📍 Pickup</div>
                  <div className={styles.windowGrid}>
                    {TIME_WINDOWS.map(w => (
                      <button
                        key={`p-${w.id}`}
                        className={`${styles.windowChip} ${weeklyPickupWindows[selectedDay].includes(w.id) ? styles.windowChipActive : ''}`}
                        onClick={() => {
                          setWeeklyPickupWindows(prev => ({
                            ...prev,
                            [selectedDay]: prev[selectedDay].includes(w.id)
                              ? prev[selectedDay].filter(id => id !== w.id)
                              : [...prev[selectedDay], w.id]
                          }))
                          setSaved(false)
                        }}
                      >
                        {weeklyPickupWindows[selectedDay].includes(w.id) ? '✅' : '⏰'} {w.label}
                      </button>
                    ))}
                  </div>
                  {customPickupSlots[selectedDay].map((s, i) => (
                    <div key={`cp-${i}`} className={styles.customSlotRow}>
                      <span className={styles.customSlotLabel}>{s.start} – {s.end}</span>
                      <button className={styles.helperRemove} onClick={() => {
                        setCustomPickupSlots(prev => ({
                          ...prev,
                          [selectedDay]: prev[selectedDay].filter((_, j) => j !== i)
                        }))
                        setSaved(false)
                      }}>×</button>
                    </div>
                  ))}
                  {showCustomPickup ? (
                    <div className={styles.customSlotRow} style={{ marginTop: 8 }}>
                      <input type="time" className="input" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ maxWidth: 110 }} />
                      <span>to</span>
                      <input type="time" className="input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ maxWidth: 110 }} />
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        setCustomPickupSlots(prev => ({
                          ...prev,
                          [selectedDay]: [...prev[selectedDay], { start: customStart, end: customEnd }]
                        }))
                        setShowCustomPickup(false); setSaved(false)
                      }}>Add</button>
                      <button className={styles.helperRemove} onClick={() => setShowCustomPickup(false)}>×</button>
                    </div>
                  ) : (
                    <button className={styles.addCustomBtn} onClick={() => setShowCustomPickup(true)}>+ Custom slot</button>
                  )}
                </div>
              )}
            </div>

            {/* Day action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {/* Clear day — only when this day has windows */}
              {(weeklyDeliveryWindows[selectedDay].length > 0 || weeklyPickupWindows[selectedDay].length > 0 || customDeliverySlots[selectedDay].length > 0 || customPickupSlots[selectedDay].length > 0) && (
                <button
                  className={styles.addCustomBtn}
                  style={{ fontSize: 13, color: 'var(--red-600, #dc2626)' }}
                  onClick={() => {
                    setWeeklyDeliveryWindows(prev => ({ ...prev, [selectedDay]: [] }))
                    setWeeklyPickupWindows(prev => ({ ...prev, [selectedDay]: [] }))
                    setCustomDeliverySlots(prev => ({ ...prev, [selectedDay]: [] }))
                    setCustomPickupSlots(prev => ({ ...prev, [selectedDay]: [] }))
                    setSaved(false)
                  }}
                >
                  🗑️ Clear {DAY_LABELS[selectedDay]}
                </button>
              )}

              {/* Copy to all days — only when this day has windows */}
              {(weeklyDeliveryWindows[selectedDay].length > 0 || weeklyPickupWindows[selectedDay].length > 0 || customDeliverySlots[selectedDay].length > 0 || customPickupSlots[selectedDay].length > 0) && (
                <button
                  className={styles.addCustomBtn}
                  style={{ fontSize: 13 }}
                  onClick={() => {
                    setWeeklyDeliveryWindows(prev => {
                      const updated = { ...prev }
                      DAY_KEYS.forEach(d => { if (d !== selectedDay) updated[d] = [...prev[selectedDay]] })
                      return updated
                    })
                    setWeeklyPickupWindows(prev => {
                      const updated = { ...prev }
                      DAY_KEYS.forEach(d => { if (d !== selectedDay) updated[d] = [...prev[selectedDay]] })
                      return updated
                    })
                    setCustomDeliverySlots(prev => {
                      const updated = { ...prev }
                      DAY_KEYS.forEach(d => { if (d !== selectedDay) updated[d] = [...prev[selectedDay]] })
                      return updated
                    })
                    setCustomPickupSlots(prev => {
                      const updated = { ...prev }
                      DAY_KEYS.forEach(d => { if (d !== selectedDay) updated[d] = [...prev[selectedDay]] })
                      return updated
                    })
                    setSaved(false)
                  }}
                >
                  📋 Copy {DAY_LABELS[selectedDay]}&apos;s windows to all days
                </button>
              )}
            </div>

            <div className={styles.dayWindowsHint}>
              💡 Days with no windows selected mean no delivery/pickup that day. You can set delivery-only, pickup-only, or both per day. Each day is independent.
            </div>
          </div>
        )}
        {offersPickup && (
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="label" htmlFor="pickup-address">📍 Pickup Location</label>
            <input
              id="pickup-address" className="input"
              value={pickupAddress}
              onChange={e => { setPickupAddress(e.target.value); setSaved(false) }}
              placeholder="e.g. 123 Oak Street, San Jose, CA 95125"
            />
            <button
              type="button"
              style={{
                marginTop: 6, padding: '6px 14px', borderRadius: 20,
                border: '1px solid var(--green-300)', background: 'var(--green-50)',
                color: 'var(--green-700)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
              onClick={async () => {
                if (!navigator.geolocation) {
                  dispatch({ type: 'ADD_TOAST', payload: { message: 'Geolocation is not supported by your browser', type: 'error' } })
                  return
                }
                dispatch({ type: 'ADD_TOAST', payload: { message: '📍 Getting your location...', type: 'info' } })
                navigator.geolocation.getCurrentPosition(
                  async (pos) => {
                    try {
                      const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
                        { headers: { 'User-Agent': 'CasaGrown/1.0' } }
                      )
                      const data = await res.json()
                      if (data?.address) {
                        const a = data.address
                        const street = [a.house_number, a.road].filter(Boolean).join(' ')
                        const city = a.city || a.town || a.village || ''
                        const state = a.state || ''
                        const zip = a.postcode || ''
                        const formatted = [street, city, `${state} ${zip}`.trim()].filter(Boolean).join(', ')
                        setPickupAddress(formatted)
                        setSaved(false)
                        dispatch({ type: 'ADD_TOAST', payload: { message: '✅ Address updated from your location', type: 'success' } })
                      }
                    } catch {
                      dispatch({ type: 'ADD_TOAST', payload: { message: 'Could not determine address from location', type: 'error' } })
                    }
                  },
                  (err) => {
                    if (err.code === 1) {
                      setLocationDenied(true)
                      dispatch({ type: 'ADD_TOAST', payload: { message: 'Location access denied — see instructions below', type: 'error' } })
                    } else {
                      dispatch({ type: 'ADD_TOAST', payload: { message: 'Could not get location — please enter address manually', type: 'error' } })
                    }
                  },
                  { enableHighAccuracy: true, timeout: 10000 }
                )
              }}
            >
              📍 Use my current location
            </button>
            {locationDenied && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--amber-700, #b45309)', lineHeight: 1.4 }}>
                🔒 Location is blocked. To enable: tap the <strong>lock icon</strong> (or ⋮) in your browser's address bar → <strong>Site settings</strong> → set <strong>Location</strong> to Allow, then reload.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Free sharing notice ── */}
      {restriction.isFreeOnly && (
        <div className={styles.boothSection}>
          <h2 className={styles.sectionTitle}>🏛️ Free Sharing Mode</h2>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 20px', fontSize: 14, color: '#1e40af', lineHeight: 1.6 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Your state ({restriction.stateName}) requires produce to be shared at no cost.</p>
            <p style={{ margin: '8px 0 0', color: '#3b82f6' }}>All your products will be listed as <strong>Free</strong>. Buyers can claim produce without payment. We&apos;re actively working on enabling paid transactions in your area.</p>
          </div>
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
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfProductId(slot.product!.id) }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfProductId(slot.product!.id) }}
                  title="Remove product"
                >✕</button>
              <div onClick={() => router.push(`/my-booth/products/${slot.product!.id}`)} style={{ cursor: 'pointer' }}>
                  <div className={styles.productSlotImage}>
                    {slot.product.photos[0] ? (
                      <img src={slot.product.photos[0]} alt={slot.product.name} />
                    ) : (
                      <span className={styles.productSlotEmoji}>🥬</span>
                    )}
                    {/* Expired / Flagged / Draft overlay */}
                    {(slot.product.status === 'expired' || slot.product.status === 'draft' || !slot.product.isActive) && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'var(--radius-md)', color: '#fff', fontWeight: 700, fontSize: 13,
                      }}>
                        {slot.product.status === 'draft' ? '📝 Draft' : slot.product.status === 'expired' ? '⏰ Expired' : '⚠️ Inactive'}
                      </div>
                    )}
                  </div>
                  <div className={styles.productSlotInfo}>
                    <strong>{slot.product.name}</strong>
                    <span className="price">{slot.product.priceUsd === 0 ? 'Free' : `${formatUsd(slot.product.priceUsd)}/${slot.product.unit}`}</span>
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
                {slot.product.status === 'expired' && !['produce', 'eggs', 'flowers', 'flower_arrangements'].includes(slot.product.category) && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ margin: '8px 8px 4px', fontSize: 12 }}
                    onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                    onClick={async (e: MouseEvent<HTMLButtonElement>) => {
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
                {/* ── explicitly Share a Product directly from layout ── */}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ margin: '4px 8px 8px', fontSize: 13, background: 'var(--gray-50)', color: 'var(--gray-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid var(--gray-200)' }}
                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.preventDefault(); e.stopPropagation()
                    setProductShareId(slot.product!.id)
                  }}
                  onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                >
                  <ShareIcon size={14} /> Share
                </button>
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

      {<div className={styles.boothSection}>
        <h2 className={styles.sectionTitle}>🤝 Helpers</h2>
        <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 8 }}>
          Invite someone you trust to help manage your booth — they can view orders, chat with buyers, and handle handoffs.
        </p>
        <div style={{
          background: 'var(--amber-50, #fffbeb)', border: '1px solid var(--amber-200, #fde68a)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, lineHeight: 1.6,
          color: 'var(--amber-800, #92400e)',
        }}>
          <strong>💡 Who makes a great helper?</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            <li>Your teenager — a great way for them to earn &amp; learn!</li>
            <li>A neighborhood teen looking for a side gig</li>
            <li>Your gardener or landscaper</li>
            <li>A spouse, family member, or trusted neighbor</li>
          </ul>
        </div>

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
              const boothLabel = name?.trim() ? `my booth "${name}"` : 'my CasaGrown booth'
              const text = [
                `Hey! 👋`,
                '',
                `I need some help managing my excess produce on CasaGrown and was wondering if you'd be able to help me out?`,
                '',
                `It's pretty straightforward — just keep an eye on orders, hand things off to buyers when they come by, and maybe reply to a message or two.`,
                '',
                `If you can, here's the link to get access to ${boothLabel}:`,
                joinUrl,
                '',
                `Passcode: ${helperPasscode}`,
                '',
                `Let me know! 🌱`,
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
            onClick={async () => {
              const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join-booth/${encodeURIComponent(helperPasscode)}` : ''
              const boothLabel = name?.trim() ? `my booth "${name}"` : 'my CasaGrown booth'
              const text = [
                `Hey! 👋`,
                '',
                `I need some help managing my excess produce on CasaGrown and was wondering if you'd be able to help me out?`,
                '',
                `It's pretty straightforward — just keep an eye on orders, hand things off to buyers when they come by, and maybe reply to a message or two.`,
                '',
                `If you can, here's the link to get access to ${boothLabel}:`,
                joinUrl,
                '',
                `Passcode: ${helperPasscode}`,
                '',
                `Let me know! 🌱`,
              ].join('\n')
              if (navigator.share) {
                try { await navigator.share({ title: `Help with ${boothLabel} on CasaGrown`, text, url: joinUrl }) } catch { /* user cancelled */ }
              } else {
                navigator.clipboard?.writeText(text)
                dispatch({ type: 'ADD_TOAST', payload: { message: 'Copied! 📋', type: 'success' } })
              }
            }}
          >
            <PersonPlusIcon size={14} /> Share
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowHelperDM(true)}
          >
            💬 DM a Neighbor
          </button>
        </div>

        {/* Helper DM Search Modal */}
        {showHelperDM && user && (
          <HelperDMModal
            boothName={name}
            passcode={helperPasscode}
            userId={user.id}
            onClose={() => setShowHelperDM(false)}
            onSent={(recipientName: string, conversationId: string) => {
              setShowHelperDM(false)
              router.push(`/messages/${conversationId}`)
            }}
          />
        )}

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

      {/* ── Save + Share Buttons ── */}
      {formError && (
        <div style={{ padding: 12, background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 13, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {formError}
        </div>
      )}
      <button
        className={styles.saveBtn}
        onClick={handleSaveBooth}
        disabled={!name.trim()}
      >
        {saved ? '✓ Saved' : 'Save Booth'}
      </button>

      <button
        className={styles.saveBtn}
        style={{ marginTop: 8, background: 'var(--white)', color: 'var(--green-700)', border: '2px solid var(--green-200)' }}
        onClick={() => { setBoothShareMsg(getBoothShareText()); setShowBoothShareModal(true) }}
      >
        <ShareIcon size={14} /> Share My Booth
      </button>

      {/* ── Share Booth Modal (after save) ── */}
      {showBoothShareModal && (
        <SocialShareModal
          isOpen={showBoothShareModal}
          onClose={() => setShowBoothShareModal(false)}
          title={`${name} Saved!`}
          subtitle={`Invite your neighbors to check out your booth.`}
          entityName={name}
          shareUrl={getBoothShareUrl() || ''}
          shareMessage={boothShareMsg}
        />
      )}

      {/* ── Share Individual Product Modal ── */}
      {productShareId && myProducts.find(p => p.id === productShareId) && (
        <SocialShareModal
          isOpen={!!productShareId}
          onClose={() => setProductShareId(null)}
          title={`Share ${myProducts.find(p => p.id === productShareId)!.name}`}
          subtitle={`Spread the word to your neighbors!`}
          entityName={myProducts.find(p => p.id === productShareId)!.name}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/market/booth/${savedBoothId || user?.id || 'id'}/product/${productShareId}`}
          shareMessage={`Hey! Check out my fresh ${myProducts.find(p => p.id === productShareId)!.name} on CasaGrown 🌱\n\n${myProducts.find(p => p.id === productShareId)!.priceUsd === 0 ? 'Free' : `${formatUsd(myProducts.find(p => p.id === productShareId)!.priceUsd)} / ${myProducts.find(p => p.id === productShareId)!.unit}`}\n\n🛒 ${typeof window !== 'undefined' ? window.location.origin : ''}/market/booth/${savedBoothId || user?.id || 'id'}/product/${productShareId}`}
        />
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
            const { error } = await supabase.storage.from('product-photos').upload(path, file, { upsert: true })
            if (!error) {
              const { data } = supabase.storage.from('product-photos').getPublicUrl(path)
              if (data?.publicUrl) { setBannerUrl(data.publicUrl); setSaved(false) }
            }
            setUploadingBanner(false)
          }}
        />
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfProductId && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} onClick={() => setDeleteConfProductId(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: '#fff', width: '90%', maxWidth: 320, borderRadius: 16, padding: 24,
            textAlign: 'center', zIndex: 1001, boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 8px' }}>Remove Product?</h2>
            <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 24px', lineHeight: 1.5 }}>
              Are you sure you want to remove this product from your booth? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                style={{ flex: 1, padding: 10, borderRadius: 8, background: '#f3f4f6', color: '#4b5563', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                onClick={() => setDeleteConfProductId(null)}
              >
                Cancel
              </button>
              <button 
                style={{ flex: 1, padding: 10, borderRadius: 8, background: '#dc2626', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  handleRemoveProduct(deleteConfProductId)
                  setDeleteConfProductId(null)
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
