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
import { checkTextForViolations } from '../../../../../lib/moderation'
import { ShareIcon } from '../../../../components/icons'
import SocialShareModal from '../../../../components/SocialShareModal'
import { getBoothProductShareMessage } from '../../../../../lib/shareMessages'
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
  const prefillId = searchParams.get('prefill') // Re-list from daily digest
  const fromBuzz = searchParams.get('from') === 'buzz'
  const returnTo = searchParams.get('returnTo')
  const isRelist = searchParams.get('relist') === 'true'
  const boothParam = searchParams.get('booth') // Target booth from My Stands page
  const isEditMode = !!editId
  const [editingInactive, setEditingInactive] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
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

  // Product details
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isGeneratingRecipes, setIsGeneratingRecipes] = useState(false)
  const [generatedRecipesList, setGeneratedRecipesList] = useState<string[]>([])
  const [recipeIntro, setRecipeIntro] = useState('')
  const [priceUsd, setPriceUsd] = useState('')
  const [isFree, setIsFree] = useState(false)
  const [unit, setUnit] = useState('each')
  const [quantity, setQuantity] = useState('')
  const [category, setCategory] = useState('')
  const [harvestedAt, setHarvestedAt] = useState(() => {
    // Auto-fill harvest date to today (local timezone)
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })
  // Smart listing expiry: based on the latest selected fulfillment window
  const getExpiryDate = (selectedDates: string[], _dwIds: Record<string, string[]>, _pwIds: Record<string, string[]>) => {
    // With Today/Tomorrow windows, expiry is simply end-of-latest-selected-date.
    // Products auto-expire when their window dates pass — no complex calculation needed.
    if (selectedDates.length > 0) {
      // Sort dates and pick the latest one, expire at end of that day (23:59:59)
      const sorted = [...selectedDates].sort()
      const latest = sorted[sorted.length - 1]
      return new Date(latest + 'T23:59:59').toISOString()
    }
    // Fallback: expire end of tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(23, 59, 59, 0)
    return tomorrow.toISOString()
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
  const [forceDraft, setForceDraft] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)

  // AI auto-fill
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiToast, setAiToast] = useState<string | null>(null)

  // Price suggestion
  const [suggestedPrice, setSuggestedPrice] = useState<{ price_usd: number; unit: string; source: string } | null>(null)
  const [suggestingPrice, setSuggestingPrice] = useState(false)
  const lastPriceCheck = useRef('')

  // Quarantine check
  const [quarantineWarning, setQuarantineWarning] = useState<{
    pest_name: string; county_name: string; source_url?: string; reason?: string; keywords: string[];
  } | null>(null)
  const [quarantineChecking, setQuarantineChecking] = useState(false)

  // Inline booth setup (for users without a booth)
  const [hasBooth, setHasBooth] = useState<boolean | null>(null) // null = loading
  const [boothId, setBoothId] = useState<string | null>(null)
  const [allBooths, setAllBooths] = useState<{id: string, name: string, owner_id?: string, isHelper?: boolean}[]>([])
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

  // ── Product-level fulfillment windows ──
  const localToday = new Date()
  const todayStr = `${localToday.getFullYear()}-${String(localToday.getMonth()+1).padStart(2,'0')}-${String(localToday.getDate()).padStart(2,'0')}`
  const tomorrowDate = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + 1)
  const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth()+1).padStart(2,'0')}-${String(tomorrowDate.getDate()).padStart(2,'0')}`
  const todayDayKey = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][localToday.getDay()]
  const tomorrowDayKey = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][tomorrowDate.getDay()]
  const todayLabel = `Today (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][localToday.getDay()]})`
  const tomorrowLabel = `Tomorrow (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][tomorrowDate.getDay()]})`

  const [selectedDates, setSelectedDates] = useState<string[]>([todayStr, tomorrowStr])
  const [productDeliveryWindows, setProductDeliveryWindows] = useState<Record<string, string[]>>({ [todayStr]: [], [tomorrowStr]: [] })
  const [productPickupWindows, setProductPickupWindows] = useState<Record<string, string[]>>({ [todayStr]: [], [tomorrowStr]: [] })
  const [boothOffersDelivery, setBoothOffersDelivery] = useState(true)
  const [boothOffersPickup, setBoothOffersPickup] = useState(true)
  const [productOffersDelivery, setProductOffersDelivery] = useState(true)
  const [productOffersPickup, setProductOffersPickup] = useState(true)
  const [boothDefaultsLoaded, setBoothDefaultsLoaded] = useState(false)
  const [productCustomDelivery, setProductCustomDelivery] = useState<Record<string, Array<{ start: string; end: string }>>>({})
  const [productCustomPickup, setProductCustomPickup] = useState<Record<string, Array<{ start: string; end: string }>>>({})
  const [showProductCustomDel, setShowProductCustomDel] = useState<Record<string, boolean>>({})
  const [showProductCustomPick, setShowProductCustomPick] = useState<Record<string, boolean>>({})
  const [prodCustomStart, setProdCustomStart] = useState('17:00')
  const [prodCustomEnd, setProdCustomEnd] = useState('19:00')

  const PRODUCT_TIME_WINDOWS = [
    { id: '8-10', label: '8–10a' },
    { id: '10-12', label: '10–12p' },
    { id: '12-14', label: '12–2p' },
    { id: '14-16', label: '2–4p' },
    { id: '16-18', label: '4–6p' },
    { id: '18-20', label: '6–8p' },
  ]

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

  // Request location permission early — needed for quarantine zone checks
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => { /* permission granted */ },
        (err) => {
          if (err.code === 1) setLocationDenied(true)
        },
        { timeout: 5000 }
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Price suggestion: two-tier (local average → AI fallback)
  useEffect(() => {
    if (!name || name.trim().length < 3) {
      setSuggestedPrice(null)
      return
    }
    const timer = setTimeout(async () => {
      const trimmed = name.trim()
      // Extract last word as the base noun ("Heirloom Tomatoes" → "Tomatoes")
      const words = trimmed.split(/\s+/)
      const baseNoun = words[words.length - 1]
      if (baseNoun === lastPriceCheck.current) return
      lastPriceCheck.current = baseNoun

      if (!authUser) return
      setSuggestingPrice(true)

      try {
        // Tier 1: query local products in the same neighborhood
        const { data: profile } = await supabase
          .from('profiles').select('home_community_h3_index, city, state_code')
          .eq('id', authUser.id).single()
        const h3 = profile?.home_community_h3_index

        if (h3) {
          // Find active products from sellers in same neighborhood matching the base noun
          const { data: localProducts } = await supabase
            .from('market_products')
            .select('price_usd, unit, seller_id, name')
            .ilike('name', `%${baseNoun}%`)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(50)

          // Filter to same-neighborhood sellers
          if (localProducts && localProducts.length > 0) {
            const sellerIds = Array.from(new Set(localProducts.map((p: any) => p.seller_id)))
            const { data: neighborSellers } = await supabase
              .from('profiles').select('id')
              .eq('home_community_h3_index', h3)
              .in('id', sellerIds)

            if (neighborSellers && neighborSellers.length > 0) {
              const neighborIds = new Set(neighborSellers.map((s: any) => s.id))
              const matches = localProducts.filter((p: any) => neighborIds.has(p.seller_id))

              if (matches.length >= 3) {
                const avg = matches.reduce((sum: number, p: any) => sum + Number(p.price_usd), 0) / matches.length
                // Most common unit
                const unitCounts: Record<string, number> = {}
                matches.forEach((p: any) => { unitCounts[p.unit] = (unitCounts[p.unit] || 0) + 1 })
                const topUnit = Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0][0]
                setSuggestedPrice({ price_usd: Math.round(avg * 100) / 100, unit: topUnit, source: 'neighborhood_average' })
                setSuggestingPrice(false)
                return
              }
            }
          }
        }

        // Tier 2: AI fallback
        const res = await supabase.functions.invoke('suggest-product-price', {
          body: { name: trimmed, state: profile?.state_code, city: profile?.city }
        })
        if (res.data && typeof res.data.price_usd === 'number' && res.data.price_usd > 0 && !res.data.error) {
          setSuggestedPrice(res.data)
        } else {
          setSuggestedPrice(null)
        }
      } catch (err) {
        console.warn('Price suggestion failed:', err)
        setSuggestedPrice(null)
      } finally {
        setSuggestingPrice(false)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [name, authUser, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check if user already has a booth (including helper booths)
  useEffect(() => {
    if (!authUser) return
    if (boothParam) {
      setHasBooth(true)
      setBoothId(boothParam)
      Promise.all([
        supabase.from('market_booths').select('id, name, owner_id').eq('owner_id', authUser.id).order('created_at'),
        supabase.from('booth_helpers').select('booth_id').eq('helper_id', authUser.id).eq('status', 'accepted'),
      ]).then(async ([ownRes, helperRes]) => {
        const ownBooths = (ownRes.data || []).map((b: any) => ({ id: b.id, name: b.name || 'Unnamed Booth', owner_id: b.owner_id }))
        const helperBoothIds = (helperRes.data || []).map((h: any) => h.booth_id)
        if (helperBoothIds.length > 0) {
          const { data: hBooths } = await supabase.from('market_booths').select('id, name, owner_id').in('id', helperBoothIds)
          const helperBooths = (hBooths || []).map((b: any) => ({ id: b.id, name: `🤝 ${b.name || 'Unnamed Booth'}`, owner_id: b.owner_id, isHelper: true }))
          setAllBooths([...ownBooths, ...helperBooths])
        } else {
          setAllBooths(ownBooths)
        }
      })
      return
    }
    Promise.all([
      supabase.from('market_booths').select('id, name, owner_id').eq('owner_id', authUser.id).order('created_at'),
      supabase.from('booth_helpers').select('booth_id').eq('helper_id', authUser.id).eq('status', 'accepted'),
    ]).then(async ([ownRes, helperRes]) => {
      const ownBooths = (ownRes.data || []).map((b: any) => ({ id: b.id, name: b.name || 'Unnamed Booth', owner_id: b.owner_id }))
      const helperBoothIds = (helperRes.data || []).map((h: any) => h.booth_id)
      let helperBooths: {id: string, name: string, owner_id: string, isHelper: boolean}[] = []
      if (helperBoothIds.length > 0) {
        const { data: hBooths } = await supabase.from('market_booths').select('id, name, owner_id').in('id', helperBoothIds)
        helperBooths = (hBooths || []).map((b: any) => ({ id: b.id, name: `🤝 ${b.name || 'Unnamed Booth'}`, owner_id: b.owner_id, isHelper: true }))
      }
      const combined = [...ownBooths, ...helperBooths]
      if (combined.length > 0) {
        setHasBooth(true)
        setBoothId(combined[0].id)
        setAllBooths(combined)
      } else {
        setHasBooth(false)
        supabase.from('profiles').select('full_name, street_address, city, state_code').eq('id', authUser.id).single()
          .then(({ data: profile }: { data: any }) => {
            if (profile?.full_name) setInlineProfileName(profile.full_name)
            if (profile?.street_address) {
              setInlinePickupAddress([profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', '))
            }
          })
      }
    })
  }, [authUser?.id, boothParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load booth defaults for product windows
  useEffect(() => {
    if (!authUser?.id || boothDefaultsLoaded || !boothId) return
    const loadBoothDefaults = async () => {
      const { data: booth } = await supabase
        .from('market_booths')
        .select('offers_delivery, offers_pickup, weekly_delivery_windows, weekly_pickup_windows, delivery_windows, pickup_windows, delivery_radius_miles, pickup_address, delivery_zipcodes')
        .eq('id', boothId)
        .single()
      if (!booth) return
      // If booth has explicit settings, use them; if null (never configured), default to true
      const boothDel = booth.offers_delivery != null ? booth.offers_delivery : true
      const boothPick = booth.offers_pickup != null ? booth.offers_pickup : true
      setBoothOffersDelivery(boothDel)
      setBoothOffersPickup(boothPick)
      // Mirror booth settings to product-level toggles
      setProductOffersDelivery(boothDel)
      setProductOffersPickup(boothPick)
      // Pre-fill product-level overrides from booth defaults
      if (booth.delivery_radius_miles != null) setInlineDeliveryRadius(booth.delivery_radius_miles)
      if (booth.pickup_address) setInlinePickupAddress(booth.pickup_address)

      // Read from booth_fulfillment_windows table (source of truth), fall back to JSONB
      const { data: tableWindows, error: twError } = await supabase
        .from('booth_fulfillment_windows')
        .select('*')
        .eq('booth_id', boothId)

      console.log('[BOOTH DEFAULTS] boothId:', boothId)
      console.log('[BOOTH DEFAULTS] booth:', JSON.stringify({ offers_delivery: booth.offers_delivery, offers_pickup: booth.offers_pickup, radius: booth.delivery_radius_miles, zipcodes: booth.delivery_zipcodes }))
      console.log('[BOOTH DEFAULTS] tableWindows:', tableWindows?.length, 'error:', twError?.message, 'data:', JSON.stringify(tableWindows?.slice(0, 3)))

      let weeklyDw: Record<string, string[]> = {}
      let weeklyPw: Record<string, string[]> = {}

      if (tableWindows && tableWindows.length > 0) {
        // Build from table rows
        for (const w of tableWindows) {
          const startH = parseInt(w.start_time.split(':')[0])
          const endH = parseInt(w.end_time.split(':')[0])
          const slotId = `${startH}-${endH}`
          if (w.window_type === 'delivery') {
            if (!weeklyDw[w.day_of_week]) weeklyDw[w.day_of_week] = []
            weeklyDw[w.day_of_week].push(slotId)
          } else {
            if (!weeklyPw[w.day_of_week]) weeklyPw[w.day_of_week] = []
            weeklyPw[w.day_of_week].push(slotId)
          }
        }
      } else {
        // Fall back to JSONB columns
        const jsonDw = (booth.weekly_delivery_windows || {}) as Record<string, any[]>
        const jsonPw = (booth.weekly_pickup_windows || {}) as Record<string, any[]>
        for (const [day, slots] of Object.entries(jsonDw)) {
          weeklyDw[day] = (slots || []).map((w: any) => typeof w === 'string' ? w : w.id).filter((id: string) => id && !id.startsWith('custom-'))
        }
        for (const [day, slots] of Object.entries(jsonPw)) {
          weeklyPw[day] = (slots || []).map((w: any) => typeof w === 'string' ? w : w.id).filter((id: string) => id && !id.startsWith('custom-'))
        }
      }

      const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
      const hasWeeklyWindows = Object.keys(weeklyDw).length > 0 || Object.keys(weeklyPw).length > 0

      if (hasWeeklyWindows) {
        // Build dates for the next 7 days based on which days have booth windows
        const upcomingDates: string[] = []
        const dwMap: Record<string, string[]> = {}
        const pwMap: Record<string, string[]> = {}

        for (let offset = 0; offset < 7; offset++) {
          const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
          const dayKey = DAY_NAMES[d.getDay()]
          const dayDw = (weeklyDw[dayKey] || []).filter(id => !id.startsWith('custom-'))
          const dayPw = (weeklyPw[dayKey] || []).filter(id => !id.startsWith('custom-'))

          if (dayDw.length > 0 || dayPw.length > 0) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
            upcomingDates.push(dateStr)
            dwMap[dateStr] = dayDw
            pwMap[dateStr] = dayPw
          }
        }

        if (upcomingDates.length > 0) {
          setSelectedDates(upcomingDates)
          setProductDeliveryWindows(dwMap)
          setProductPickupWindows(pwMap)
        } else {
          // Booth has weekly windows but none for the next 7 days — default to today/tomorrow
          setSelectedDates([todayStr, tomorrowStr])
          setProductDeliveryWindows({ [todayStr]: [], [tomorrowStr]: [] })
          setProductPickupWindows({ [todayStr]: [], [tomorrowStr]: [] })
        }
      } else {
        // No weekly windows — fall back to flat windows for today/tomorrow
        const flatDw = (booth.delivery_windows || []) as Array<{id: string}>
        const flatPw = (booth.pickup_windows || []) as Array<{id: string}>
        const flatDwIds = flatDw.map(w => w.id).filter(id => !id.startsWith('custom-'))
        const flatPwIds = flatPw.map(w => w.id).filter(id => !id.startsWith('custom-'))
        setSelectedDates([todayStr, tomorrowStr])
        setProductDeliveryWindows({ [todayStr]: flatDwIds, [tomorrowStr]: flatDwIds })
        setProductPickupWindows({ [todayStr]: flatPwIds, [tomorrowStr]: flatPwIds })
      }
      setBoothDefaultsLoaded(true)
    }
    loadBoothDefaults()
  }, [authUser?.id, boothId, boothDefaultsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Load product-level window data
      if (data.window_dates && Array.isArray(data.window_dates) && data.window_dates.length > 0) {
        setSelectedDates(data.window_dates)
        const pdw = (data.product_delivery_windows || {}) as Record<string, Array<{id: string}>>
        const ppw = (data.product_pickup_windows || {}) as Record<string, Array<{id: string}>>
        const dwMap: Record<string, string[]> = {}
        const pwMap: Record<string, string[]> = {}
        for (const d of data.window_dates as string[]) {
          dwMap[d] = (pdw[d] || []).map(w => w.id)
          pwMap[d] = (ppw[d] || []).map(w => w.id)
        }
        setProductDeliveryWindows(dwMap)
        setProductPickupWindows(pwMap)
      }
      // Load per-product fulfillment overrides
      if (data.delivery_radius_miles != null) setInlineDeliveryRadius(data.delivery_radius_miles)
      if (data.pickup_address) setInlinePickupAddress(data.pickup_address)
      // Detect if product is inactive — trigger relist mode automatically
      if (!data.is_active && !data.is_draft) {
        setEditingInactive(true)
        setRelistBannerVisible(true)
        // Reset fulfillment windows to today/tomorrow
        setSelectedDates([todayStr, tomorrowStr])
        setProductDeliveryWindows({ [todayStr]: [], [tomorrowStr]: [] })
        setProductPickupWindows({ [todayStr]: [], [tomorrowStr]: [] })
      }
    }
    loadProduct()
  }, [editId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Relist mode: auto-reset fulfillment window dates to today/tomorrow
  const [relistBannerVisible, setRelistBannerVisible] = useState(false)
  useEffect(() => {
    if (!isRelist || !editId) return
    // Reset window dates to today + tomorrow so seller can review
    setSelectedDates([todayStr, tomorrowStr])
    setProductDeliveryWindows({ [todayStr]: [], [tomorrowStr]: [] })
    setProductPickupWindows({ [todayStr]: [], [tomorrowStr]: [] })
    setRelistBannerVisible(true)
  }, [isRelist, editId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from a past product (daily digest "Re-list" link)
  useEffect(() => {
    if (!prefillId || editId) return // don't prefill if already in edit mode
    const loadPrefill = async () => {
      const { data } = await supabase
        .from('market_products')
        .select('name, description, category, price_usd, unit, photos')
        .eq('id', prefillId)
        .single()
      if (!data) return
      setName(data.name || '')
      setDescription(data.description || '')
      if (data.category) setCategory(data.category)
      setPriceUsd(data.price_usd === 0 ? '0' : String(data.price_usd || ''))
      setIsFree(data.price_usd === 0)
      setUnit(data.unit || 'each')
      if (data.photos?.length) setPhotos(data.photos)
      setPrefilled(true)
    }
    loadPrefill()
  }, [prefillId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load categories and restrictions from Supabase
  useEffect(() => {
    const loadCategories = async () => {
      const { data: cats } = await supabase
        .from('sales_categories')
        .select('name, display_order')
        .order('display_order')
      if (cats) {
        setDbCategories(cats)
        if (!isEditMode && !category && cats.length > 0) {
          setCategory(cats[0].name)
        }
      }

      // Load restrictions for user's jurisdiction
      const { data: restrictions } = await supabase
        .from('category_restrictions')
        .select('category_name')
      if (restrictions) {
        setRestrictedCategories(restrictions.map((r: any) => r.category_name))
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
            keywords: q.keywords || [],
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
      .then(({ data }: { data: any }) => { if (data?.home_community_h3_index) setUserH3Index(data.home_community_h3_index) })
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
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setPhotos(prev => [...prev, dataUrl])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleGenerateRecipes = async () => {
    if (!name || isGeneratingRecipes) return
    setIsGeneratingRecipes(true)
    setGeneratedRecipesList([])

    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('casabot-recipe-suggestions', {
        body: { name, description, category }
      })
      if (error) throw error
      if (data?.recipes && Array.isArray(data.recipes)) {
        setGeneratedRecipesList(data.recipes)
        if (data.intro) setRecipeIntro(data.intro)
      } else if (data?.recipes_markdown) {
        // Fallback just in case edge function is caching older deployments
        let rawMarkdown = data.recipes_markdown
        const splitMatches = rawMarkdown.split(/(?=\\*\\*\\d+\\.)/)
        const filtered = splitMatches.map((m: string) => m.trim()).filter((m: string) => m.length > 0)
        setGeneratedRecipesList(filtered.length > 0 ? filtered : [rawMarkdown])
      }
    } catch(e) {
      console.error('Failed to generate recipes', e)
      alert("GrowBot is resting right now. Try again later!")
    } finally {
      setIsGeneratingRecipes(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Evaluate if form lacks requirements to cleanly Publish
    const effectivePrice = restriction.isFreeOnly ? '0' : priceUsd
    const parsedPrice = parseFloat(effectivePrice || '0')
    const isValidPrice = effectivePrice !== '' && effectivePrice !== null && !isNaN(parsedPrice) && parsedPrice >= 0 && (!restriction.isFreeOnly || parsedPrice === 0)
    const needsDraft = forceDraft || !name.trim() || photos.length === 0 || !isValidPrice || !quantity || parseInt(quantity) <= 0
    
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

      // Fulfillment window validation
      if (!productOffersDelivery && !productOffersPickup) {
        newErrors.fulfillment = 'Select at least delivery or pickup'
      } else if (selectedDates.length === 0) {
        newErrors.fulfillment = 'Select at least one day (Today or Tomorrow)'
      } else {
        const hasAnyWindow = selectedDates.some(d => {
          const dw = productOffersDelivery ? (productDeliveryWindows[d] || []).length + (productCustomDelivery[d] || []).length : 0
          const pw = productOffersPickup ? (productPickupWindows[d] || []).length + (productCustomPickup[d] || []).length : 0
          return dw > 0 || pw > 0
        })
        if (!hasAnyWindow) {
          newErrors.fulfillment = 'Set at least one delivery or pickup window'
        }
      }
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
    let boothId: string | null = boothParam || null
    if (!boothId) {
    const { data: existingBooth } = await supabase
      .from('market_booths')
      .select('id, status')
      .eq('owner_id', authUser.id)
      .single()

    if (existingBooth) {
      boothId = existingBooth.id
    } else {
      // Auto-create a booth using inline form values — publish immediately
      const boothName = inlineProfileName ? `${inlineProfileName}'s Produce Stand` : 'My Produce Stand'

      // Build weekly windows from product's selected windows so the booth is fully configured
      const autoWeeklyDw: Record<string, any[]> = {}
      const autoWeeklyPw: Record<string, any[]> = {}
      const flatDw = inlineDelivery ? mapInlineWindows(inlineDeliveryWindows, inlineCustomDeliverySlots) : []
      const flatPw = inlinePickup ? mapInlineWindows(inlinePickupWindows, inlineCustomPickupSlots) : []
      // Apply the product's windows to today and tomorrow's day-of-week
      if (flatDw.length > 0) {
        autoWeeklyDw[todayDayKey] = flatDw
        autoWeeklyDw[tomorrowDayKey] = flatDw
      }
      if (flatPw.length > 0) {
        autoWeeklyPw[todayDayKey] = flatPw
        autoWeeklyPw[tomorrowDayKey] = flatPw
      }

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
          delivery_windows: flatDw,
          pickup_windows: flatPw,
          weekly_delivery_windows: autoWeeklyDw,
          weekly_pickup_windows: autoWeeklyPw,
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
    } // end if (!boothId)

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

      const matchedBlocked = allBlocked.find((bp: any) => {
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
      const { error, count } = await supabase
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
          expires_at: getExpiryDate(selectedDates, productDeliveryWindows, productPickupWindows),
          market_date: marketDate,
          is_active: !needsDraft,
          is_draft: needsDraft,
          delivery_radius_miles: inlineDeliveryRadius,
          pickup_address: productOffersPickup ? inlinePickupAddress || null : null,
          product_delivery_windows: !productOffersDelivery ? null : (() => {
            const obj: Record<string, any[]> = {}
            for (const d of selectedDates) {
              const ids = productDeliveryWindows[d] || []
              if (ids.length > 0) obj[d] = ids.map(id => { const [s] = id.split('-'); return { id, start: `${s}:00`, end: `${parseInt(s)+2}:00` } })
            }
            return Object.keys(obj).length > 0 ? obj : null
          })(),
          product_pickup_windows: !productOffersPickup ? null : (() => {
            const obj: Record<string, any[]> = {}
            for (const d of selectedDates) {
              const ids = productPickupWindows[d] || []
              if (ids.length > 0) obj[d] = ids.map(id => { const [s] = id.split('-'); return { id, start: `${s}:00`, end: `${parseInt(s)+2}:00` } })
            }
            return Object.keys(obj).length > 0 ? obj : null
          })(),
          window_dates: selectedDates,
        }, { count: 'exact' })
        .eq('id', editId)

      if (error) {
        setValidating(false)
        setErrors({ submit: 'Failed to update product: ' + error.message })
        return
      }
      if (count === 0) {
        console.error('Product update matched 0 rows — editId:', editId)
        setValidating(false)
        setErrors({ submit: 'Could not find the product to update. It may have been deleted.' })
        return
      }

      // Clear any community flags (reactivates the product if it was flagged)
      try { await supabase.rpc('clear_product_flags', { p_product_id: editId }) } catch { /* ignore if no flags */ }

      // ── AI Moderation (edit) — skip for drafts ──
      if (!needsDraft) {
        supabase.functions.invoke('moderate-listing', {
          body: {
            product_id: editId,
            seller_id: (() => { const s = allBooths.find(b => b.id === boothId); return (s?.isHelper && s?.owner_id) ? s.owner_id : authUser.id })(),
            name: name.trim() || 'Untitled Draft',
            description: description.trim() || null,
            price_usd: parseFloat(priceUsd || '0'),
            category,
            photo_url: editPhotoUrls[0] || null,
          },
        }).then((modRes: any) => {
          const modData = modRes.data as any
          if (modData?.status === 'flagged' && modData?.flags) {
            const messages = Object.values(modData.flags.issue_messages || {}) as string[]
            const reason = messages[0] || modData.flags.reason || 'Your listing was flagged for review.'
            dispatch({ type: 'ADD_TOAST', payload: { message: `⚠️ ${reason}`, type: 'error' } })
          }
        }).catch((modErr: any) => {
          console.warn('Moderation check failed (non-blocking):', modErr)
        })
      }

      setValidating(false)
      if (needsDraft) {
        // Draft edits: stay on the page (no toast — user can see the save button reset)
      } else {
        // Formally published from draft state
        setAddedProductId(editId)
        setAddedProductName(name.trim() || 'Untitled')
        setBoothIdForShare(authUser.id)
        setShowShareModal(true)
        showPrompt()
      }
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
        seller_id: await (async () => {
          const selected = allBooths.find(b => b.id === boothId)
          if (selected?.isHelper && selected?.owner_id) return selected.owner_id
          // If booth not in allBooths yet (race condition), look up owner directly
          if (boothId && boothId !== allBooths.find(b => !b.isHelper)?.id) {
            const { data: boothRow } = await supabase
              .from('market_booths')
              .select('owner_id')
              .eq('id', boothId)
              .single()
            if (boothRow && boothRow.owner_id !== authUser.id) return boothRow.owner_id
          }
          return authUser.id
        })(),
        market_date: marketDate,
        name: name.trim() || 'Untitled Draft',
        description: description.trim() || null,
        category,
        price_usd: parseFloat(priceUsd || '0'),
        unit,
        inventory: parseInt(quantity) || 0,
        photos: uploadedPhotoUrls,
        harvested_at: harvestedAt ? new Date(harvestedAt + 'T12:00:00').toISOString() : null,
        expires_at: getExpiryDate(selectedDates, productDeliveryWindows, productPickupWindows),
        is_active: !needsDraft,
        is_draft: needsDraft,
        delivery_radius_miles: inlineDeliveryRadius,
        pickup_address: (hasBooth ? productOffersPickup : inlinePickup) ? inlinePickupAddress || null : null,
        product_delivery_windows: !productOffersDelivery ? null : (() => {
          const obj: Record<string, any[]> = {}
          for (const d of selectedDates) {
            const ids = productDeliveryWindows[d] || []
            if (ids.length > 0) obj[d] = ids.map(id => { const [s] = id.split('-'); return { id, start: `${s}:00`, end: `${parseInt(s)+2}:00` } })
          }
          return Object.keys(obj).length > 0 ? obj : null
        })(),
        product_pickup_windows: !productOffersPickup ? null : (() => {
          const obj: Record<string, any[]> = {}
          for (const d of selectedDates) {
            const ids = productPickupWindows[d] || []
            if (ids.length > 0) obj[d] = ids.map(id => { const [s] = id.split('-'); return { id, start: `${s}:00`, end: `${parseInt(s)+2}:00` } })
          }
          return Object.keys(obj).length > 0 ? obj : null
        })(),
        window_dates: selectedDates,
      })
      .select('id')
      .single()

    setAddedProductId(insertedProduct?.id || null)

    if (error || !insertedProduct) {
      setValidating(false)
      setErrors({ submit: 'Failed to add product: ' + (error?.message || 'Unknown error') })
      return
    }

    // ── AI Moderation (new product) — skip for drafts ──
    if (!needsDraft) {
      supabase.functions.invoke('moderate-listing', {
        body: {
          product_id: insertedProduct.id,
          seller_id: (() => { const s = allBooths.find(b => b.id === boothId); return (s?.isHelper && s?.owner_id) ? s.owner_id : authUser.id })(),
          name: name.trim() || 'Untitled Draft',
          description: description.trim() || null,
          price_usd: parseFloat(priceUsd || '0'),
          category,
          photo_url: uploadedPhotoUrls[0] || null,
        },
      }).then((modRes: any) => {
        const modData = modRes.data as any
        if (modData?.status === 'flagged' && modData?.flags) {
          const messages = Object.values(modData.flags.issue_messages || {}) as string[]
          const reason = messages[0] || modData.flags.reason || 'Your listing was flagged for review.'
          dispatch({ type: 'ADD_TOAST', payload: { message: `⚠️ ${reason}`, type: 'error' } })
        }
      }).catch((modErr: any) => {
        console.warn('Moderation check failed (non-blocking):', modErr)
      })
    }

    setValidating(false)

    // ── 3. Check if booth qualifies for publishing ──
    // Requirements: ≥1 product (we just added one) + delivery or pickup + payment configured
    const { data: booth } = await supabase
      .from('market_booths')
      .select('offers_delivery, offers_pickup, delivery_windows, pickup_windows, weekly_delivery_windows, weekly_pickup_windows, payment_method, venmo_handle, charity_name, status')
      .eq('id', boothId)
      .single()

    let boothPublished = false
    const missing: string[] = []
    if (booth) {
      const hasFulfillment = booth.offers_delivery || booth.offers_pickup
      // Check both flat and weekly windows for completeness
      const weeklyDw = booth.weekly_delivery_windows as Record<string, any[]> | null
      const weeklyPw = booth.weekly_pickup_windows as Record<string, any[]> | null
      const hasFlatDw = (booth.delivery_windows as any[])?.length > 0
      const hasFlatPw = (booth.pickup_windows as any[])?.length > 0
      const hasWeeklyDw = weeklyDw && Object.values(weeklyDw).some(arr => arr?.length > 0)
      const hasWeeklyPw = weeklyPw && Object.values(weeklyPw).some(arr => arr?.length > 0)
      const hasWindows = (booth.offers_delivery ? (hasFlatDw || hasWeeklyDw) : true) &&
                         (booth.offers_pickup ? (hasFlatPw || hasWeeklyPw) : true)

      // ── Backfill booth defaults from first listing's windows if booth has none ──
      const { data: existingTableWindows } = await supabase
        .from('booth_fulfillment_windows')
        .select('id')
        .eq('booth_id', boothId)
        .limit(1)
      const boothHasNoWindows = !hasWindows && (!existingTableWindows || existingTableWindows.length === 0)

      if (boothHasNoWindows && selectedDates.length > 0) {
        const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
        const newWeeklyDw: Record<string, string[]> = {}
        const newWeeklyPw: Record<string, string[]> = {}
        const tableRows: Array<{booth_id: string; day_of_week: string; window_type: string; start_time: string; end_time: string}> = []

        for (const dateStr of selectedDates) {
          const d = new Date(dateStr + 'T12:00:00')
          const dayKey = DAY_NAMES[d.getDay()]
          const dwIds = productDeliveryWindows[dateStr] || []
          const pwIds = productPickupWindows[dateStr] || []

          if (dwIds.length > 0) {
            if (!newWeeklyDw[dayKey]) newWeeklyDw[dayKey] = []
            for (const slotId of dwIds) {
              if (!newWeeklyDw[dayKey].includes(slotId)) newWeeklyDw[dayKey].push(slotId)
              const [startH] = slotId.split('-').map(Number)
              const endH = startH + 2
              tableRows.push({
                booth_id: boothId!,
                day_of_week: dayKey,
                window_type: 'delivery',
                start_time: `${String(startH).padStart(2,'0')}:00`,
                end_time: `${String(endH).padStart(2,'0')}:00`,
              })
            }
          }
          if (pwIds.length > 0) {
            if (!newWeeklyPw[dayKey]) newWeeklyPw[dayKey] = []
            for (const slotId of pwIds) {
              if (!newWeeklyPw[dayKey].includes(slotId)) newWeeklyPw[dayKey].push(slotId)
              const [startH] = slotId.split('-').map(Number)
              const endH = startH + 2
              tableRows.push({
                booth_id: boothId!,
                day_of_week: dayKey,
                window_type: 'pickup',
                start_time: `${String(startH).padStart(2,'0')}:00`,
                end_time: `${String(endH).padStart(2,'0')}:00`,
              })
            }
          }
        }

        // Write to both table and JSONB
        if (tableRows.length > 0) {
          await supabase.from('booth_fulfillment_windows').insert(tableRows)
        }
        const boothUpdate: Record<string, any> = {}
        if (Object.keys(newWeeklyDw).length > 0) boothUpdate.weekly_delivery_windows = newWeeklyDw
        if (Object.keys(newWeeklyPw).length > 0) boothUpdate.weekly_pickup_windows = newWeeklyPw
        if (Object.keys(boothUpdate).length > 0) {
          await supabase.from('market_booths').update(boothUpdate).eq('id', boothId)
        }
      }

      const hasPayment = booth.payment_method === 'manual' ||
        booth.payment_method === 'automatic' ||
        (booth.payment_method === 'venmo' && booth.venmo_handle) ||
        (booth.payment_method === 'charity' && booth.charity_name)

      if (!hasFulfillment) missing.push('delivery or pickup option')
      // Re-check windows after potential backfill
      const hasWindowsNow = boothHasNoWindows ? (selectedDates.length > 0) : hasWindows
      if (hasFulfillment && !hasWindowsNow) missing.push('delivery/pickup time windows')
      if (!hasPayment) missing.push('payment method')

      if (booth.status === 'draft' && hasFulfillment && hasWindowsNow && hasPayment) {
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

    if (needsDraft) {
      // Drafts: stay on the page so user can continue editing (no toast — user can see the save button reset)
      // Update the URL to edit mode so future saves are updates, not inserts
      window.history.replaceState({}, '', `/my-booth/products/new?edit=${insertedProduct.id}`)
    } else {
      // Published: show share modal
      setShowShareModal(true)
      showPrompt()
    }
    } catch (err: any) {
      console.error('Product add error:', err)
      trackError('product_add_failed', { error: err?.message })
      setErrors({ submit: 'Failed to save product: ' + (err?.message || 'Unknown error. Please try again.') })
      setValidating(false)
    }
  }

  const boothLabel = state.booths.find(b => b.ownerId === authUser?.id)?.name || 'my produce stand'

  const getProductUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    if (addedProductId && boothIdForShare) return `${origin}/market/booth/${boothIdForShare}/product/${addedProductId}`
    if (boothIdForShare) return `${origin}/market/booth/${boothIdForShare}`
    return `${origin}/market`
  }

  const getShareMessage = () => {
    return getBoothProductShareMessage(addedProductName, nextMarket?.label) + getProductUrl()
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
          ? `Fresh ${addedProductName} will be available at my produce stand this ${nextMarket.label}! 🌿`
          : `Fresh ${addedProductName} is available at my produce stand on CasaGrown! 🌿`
        await navigator.share({ title: `Fresh ${addedProductName} at ${boothLabel}`, text: cta, url: getProductUrl() })
      } catch { /* cancelled */ }
    } else {
      handleShareCopy()
    }
  }

  const handleShareFacebook = () => {
    trackClick('share_product_facebook', { productName: addedProductName })
    const url = encodeURIComponent(getProductUrl())
    const msg = `🌿 Fresh ${addedProductName} available on CasaGrown Market!\n\nBrowse & order: ${getProductUrl()}`
    
    // Do not await to avoid popup blocker
    navigator.clipboard.writeText(msg).catch(() => {})
    
    // Use dispatch toast native to this panel instead of an alert
    dispatch({ type: 'ADD_TOAST', payload: { message: "✅ Copied! Click 'Paste' in the Facebook text box.", type: 'success' } })
    
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
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
      // 45s timeout to prevent hanging on slow/unreachable edge functions
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      try {
        const res = await supabase.functions.invoke('analyze-product-photo', {
          body: { image: photos[0] },
        })
        clearTimeout(timeout)
        return res
      } catch (err: any) {
        clearTimeout(timeout)
        if (err?.name === 'AbortError') {
          return { data: null, error: { message: 'Request timed out (15s)' } }
        }
        throw err
      }
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
        setTimeout(() => setAiToast(null), 15000)
        return
      }

      const data = res.data as any

      // Check for API-level errors returned in the response body
      if (data?.error) {
        console.warn('AI autofill API error:', data.error)
        const errorDetail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        setAiToast(`⚠️ ${data.error === 'AI not configured' ? 'AI service not configured' : `AI analysis failed: ${errorDetail.slice(0, 120)}`} — please fill in manually.`)
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 15000)
        return
      }

      // Check if we got usable data
      if (!data?.name && !data?.description && !data?.category) {
        setAiToast('⚠️ AI could not identify the product — please fill in manually.')
        setAiAnalyzing(false)
        setTimeout(() => setAiToast(null), 15000)
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
    setTimeout(() => setAiToast(null), 15000)
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
        <h1 className={styles.title}>{(isRelist || editingInactive) ? 'Re-list Product' : isEditMode ? 'Edit Product' : 'Add Product'}</h1>

        {prefilled && (
          <div style={{
            background: 'linear-gradient(135deg, #e8f5e9, #f1f8e9)',
            border: '1px solid #a5d6a7',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
          }}>
            <span style={{ fontSize: 20 }}>🔄</span>
            <span>Pre-filled from your previous listing. Review and publish as a <strong>new listing</strong>.</span>
          </div>
        )}

        {/* ===== Market Day — display only ===== */}
        {!state.marketNeverCloses && (
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
        )}

        <form onSubmit={handleSubmit}>

          {/* ===== Booth Selector (multi-booth users) ===== */}
          {allBooths.length > 1 && (
            <div className={styles.section}>
              <label className={styles.label}>🏪 Booth</label>
              {boothParam ? (
                <>
                  <div style={{
                    width: '100%', padding: '10px 14px', fontSize: 15, borderRadius: 10,
                    border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151',
                  }}>
                    {allBooths.find(b => b.id === boothId)?.name || 'Loading...'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    Adding to this booth. <a href="/my-booth/products/new" style={{ color: 'var(--green-600)' }}>Switch booth?</a>
                  </div>
                </>
              ) : (
                <>
                  <select
                    value={boothId || ''}
                    onChange={e => setBoothId(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', fontSize: 15, borderRadius: 10,
                      border: '1px solid #d1d5db', background: '#fff', outline: 'none',
                      appearance: 'auto',
                    }}
                  >
                    {allBooths.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    This product will be listed at the selected booth
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== Photos with cropping ===== */}
          <div className={styles.section}>
            <label className={styles.label}>Photos {photos.length > 0 ? <span style={{ color: 'var(--green-600)' }}>✓</span> : <span className={styles.required}>*</span>}</label>
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
                  border: aiAnalyzing ? '2px solid #a78bfa' : '2px solid var(--green-300, #86efac)',
                  background: aiAnalyzing
                    ? 'linear-gradient(135deg, #ede9fe, #ddd6fe)'
                    : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                  color: aiAnalyzing ? '#5b21b6' : 'var(--green-800, #166534)',
                  fontSize: 15, fontWeight: 600,
                  cursor: aiAnalyzing ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.3s',
                  opacity: aiAnalyzing ? 1 : 1,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {aiAnalyzing ? (
                  <>
                    <span style={{ fontSize: 20 }}>🤖</span>
                    <span>Analyzing your photo</span>
                    <span className="ai-dots" style={{ letterSpacing: 2 }}>
                      <style>{`@keyframes aiDots { 0%,20% { content: '.'; } 40% { content: '..'; } 60%,100% { content: '...'; } }
                        .ai-dots::after { content: '...'; animation: aiDots 1.5s infinite steps(1); }
                        @keyframes aiPulse { 0%,100% { opacity: 0.15; } 50% { opacity: 0.3; } }
                      `}</style>
                    </span>
                    {/* Animated shimmer bar */}
                    <span style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
                      background: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)',
                      animation: 'aiShimmer 1.5s ease-in-out infinite',
                    }} />
                    <style>{`@keyframes aiShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
                  </>
                ) : (
                  <>✨ Auto-fill from Photo</>
                )}
              </button>
              {aiAnalyzing && (
                <p style={{
                  margin: '10px 0 0', fontSize: 13, textAlign: 'center',
                  color: '#6d28d9', fontWeight: 500, fontStyle: 'italic',
                }}>
                  ⏳ This may take a few seconds — hang tight!
                </p>
              )}
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
                <label className={styles.label}>Name {name.trim() ? <span style={{ color: 'var(--green-600)' }}>✓</span> : <span className={styles.required}>*</span>}</label>
                <input className={`${styles.input} ${errors.name ? styles.inputError : name.trim() ? styles.inputFilled : styles.inputRequired}`} value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }} placeholder="e.g. Heritage Tomatoes" />
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
              <textarea className={`${styles.input} ${errors.description ? styles.inputError : ''}`} value={description} onChange={e => { setDescription(e.target.value); setErrors(p => ({ ...p, description: '' })) }} placeholder="What makes these special?" rows={4} />
              
              {/* CasaBot Recipe Assistant */}
              {name.trim().length > 2 && (
                <div style={{ marginTop: 8 }}>
                  <button 
                    onClick={(e) => { e.preventDefault(); handleGenerateRecipes() }}
                    disabled={isGeneratingRecipes}
                    style={{ background: 'linear-gradient(135deg, #f0fdf4, #fffbeb)', border: '1px solid #86efac', borderRadius: 8, padding: '4px 12px', fontSize: 13, color: '#166534', cursor: isGeneratingRecipes ? 'wait' : 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <img src="/growbot-avatar-v3.png" alt="GrowBot" style={{ width: 14, height: 14, borderRadius: '50%' }} /> {isGeneratingRecipes ? 'Thinking...' : 'Ask GrowBot for Recipes ✨'}
                  </button>
                  
                  {generatedRecipesList.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {generatedRecipesList.map((recipeMarkdown, i) => (
                        <div 
                          key={i} 
                          onClick={() => {
                            const recipeText = recipeMarkdown.replace(/^[🍳🥘🍞🍯🫖🥗💐🏡📸🫙]+\s*/, '')
                            const introLine = recipeIntro || 'Not sure what to make? Try this:'
                            const newDesc = description.trim() + `\n\n✨ ${introLine}\n` + recipeText
                            setDescription(newDesc)
                            setGeneratedRecipesList([]) // close after selecting
                          }}
                          style={{ cursor: 'pointer', padding: 12, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                          title="Click to insert recipe into description"
                        >
                          <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap' }}>
                             {/* Strip bold asterisks for quick preview since we don't have SimpleMarkdown here natively */}
                             {recipeMarkdown.replace(/\\*\\*/g, '')}
                          </div>
                          <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginTop: 4 }}>+ Click to add recipe to description</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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

          {/* ===== Price & Quantity ===== */}
          <div className={styles.section}>
            {restriction.isFreeOnly && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#1e40af' }}>
                🏡️ Free sharing mode — all products in {restriction.stateName} are listed at no cost.
              </div>
            )}
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Price {restriction.isFreeOnly ? <span style={{ color: '#16a34a', fontWeight: 600 }}>(Free)</span> : (priceUsd || isFree) ? <span style={{ color: 'var(--green-600)' }}>✓</span> : <span className={styles.required}>*</span>}</span>
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
                    className={`${styles.input} ${styles.priceField} ${errors.price ? styles.inputError : (priceUsd || isFree) ? styles.inputFilled : styles.inputRequired}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={restriction.isFreeOnly || isFree ? '0' : priceUsd}
                    onChange={e => { if (!restriction.isFreeOnly && !isFree) { setPriceUsd(e.target.value); setErrors(p => ({ ...p, price: '' })) } }}
                    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                    placeholder={restriction.isFreeOnly || isFree ? '0.00' : '4.50'}
                    disabled={restriction.isFreeOnly || isFree}
                    style={(restriction.isFreeOnly || isFree) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                  />
                </div>
                {errors.price && <span className={styles.error}>{errors.price}</span>}
                {suggestingPrice && !restriction.isFreeOnly && !isFree && (
                  <div className={styles.fieldHint} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--green-300)', borderTopColor: 'var(--green-600)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    Looking up prices in your neighborhood…
                  </div>
                )}
                {suggestedPrice && !restriction.isFreeOnly && !isFree && (
                  <button
                    type="button"
                    onClick={() => {
                      setPriceUsd(suggestedPrice.price_usd.toString());
                      setUnit(suggestedPrice.unit);
                      setErrors(p => ({ ...p, price: '' }));
                    }}
                    style={{
                      marginTop: 6, padding: '6px 12px', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius, 6px)',
                      fontSize: 12, color: 'var(--green-800)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    💡 {suggestedPrice.source === 'neighborhood_average' ? 'Avg nearby' : 'Suggested'}: ${suggestedPrice.price_usd.toFixed(2)}/{suggestedPrice.unit} — tap to use
                  </button>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Per</label>
                <select className={styles.input} value={unit} onChange={e => setUnit(e.target.value)}>
                  {['each', 'bunch', 'dozen', 'lb', 'oz', 'bag', 'basket', 'box', 'pint', 'quart', 'jar', 'loaf'].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Available Quantity {quantity && parseInt(quantity) > 0 ? <span style={{ color: 'var(--green-600)' }}>✓</span> : <span className={styles.required}>*</span>}</label>
              <div className={styles.fieldHint}>Enter your estimated minimum available quantity so we can prevent orders when you&apos;re sold out.</div>
              <input className={`${styles.input} ${errors.quantity ? styles.inputError : (quantity && parseInt(quantity) > 0) ? styles.inputFilled : styles.inputRequired}`} type="number" min="1" value={quantity} onChange={e => { setQuantity(e.target.value); setErrors(p => ({ ...p, quantity: '', minimum: '' })) }} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }} placeholder="10" />
              {errors.quantity && <span className={styles.error}>{errors.quantity}</span>}
            </div>
          </div>

          {/* ===== Fulfillment Windows ===== */}
          <div className={styles.section}>
            <label className={styles.label}>📅 Available For</label>
            {relistBannerVisible && (
              <div style={{
                background: 'var(--amber-50, #fffbeb)', border: '2px solid var(--amber-400, #fbbf24)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13,
                color: 'var(--amber-800, #92400e)', lineHeight: 1.6,
              }}>
                <strong>⚠️ Re-listing this product</strong> — Fulfillment windows have been reset to Today &amp; Tomorrow.
                Please <strong>select your available time slots</strong> below before publishing.
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '0 0 10px' }}>
              Booth defaults are pre-selected — override as needed.
            </p>
            {errors.fulfillment && <span className={styles.error}>{errors.fulfillment}</span>}

            {/* Fulfillment type toggles — unified for all users */}
            <div className={styles.fulfillmentGrid}>
              <button
                type="button"
                className={`${styles.fulfillmentCard} ${(hasBooth ? productOffersDelivery : inlineDelivery) ? styles.fulfillmentCardActive : ''}`}
                onClick={() => {
                  if (hasBooth) {
                    setProductOffersDelivery(prev => !prev)
                  } else {
                    setInlineDelivery(prev => !prev)
                  }
                }}
              >
                <span className={styles.fulfillmentCardIcon}>🚗</span>
                <span className={styles.fulfillmentCardLabel}>I&apos;ll Deliver</span>
                <span className={styles.fulfillmentCardSub}>Drop off at buyer&apos;s door</span>
              </button>
              <button
                type="button"
                className={`${styles.fulfillmentCard} ${(hasBooth ? productOffersPickup : inlinePickup) ? styles.fulfillmentCardActive : ''}`}
                onClick={() => {
                  if (hasBooth) {
                    setProductOffersPickup(prev => !prev)
                  } else {
                    setInlinePickup(prev => !prev)
                  }
                }}
              >
                <span className={styles.fulfillmentCardIcon}>📍</span>
                <span className={styles.fulfillmentCardLabel}>Pickup Available</span>
                <span className={styles.fulfillmentCardSub}>Buyers pick up from you</span>
              </button>
            </div>

            {/* Pickup address + delivery radius — always shown, pre-filled from booth defaults */}
            {(hasBooth ? productOffersPickup : inlinePickup) && (
              <div className={styles.field} style={{ marginTop: 12, marginBottom: 12 }}>
                <label className={styles.label}>📍 Pickup Address <span className={styles.optional}>(optional)</span></label>
                <input
                  className={styles.input}
                  value={inlinePickupAddress}
                  onChange={e => setInlinePickupAddress(e.target.value)}
                  placeholder="Where should buyers pick up?"
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
                      dispatch({ type: 'ADD_TOAST', payload: { message: 'Geolocation not supported', type: 'error' } })
                      return
                    }
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
                            const st = a.state || ''
                            const zip = a.postcode || ''
                            setInlinePickupAddress([street, city, `${st} ${zip}`.trim()].filter(Boolean).join(', '))
                          }
                        } catch {
                          dispatch({ type: 'ADD_TOAST', payload: { message: 'Could not determine address automatically', type: 'error' } })
                        }
                      },
                      (err) => {
                        if (err.code === 1) {
                          setLocationDenied(true)
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
                    {typeof window !== 'undefined' && (window as any).IS_NATIVE_APP ? (
                      <>
                        🔒 Location is blocked. To enable: open your iOS/Android device <strong>Settings</strong> → <strong>Privacy &amp; Security</strong> → <strong>Location Services</strong> → find <strong>{typeof window !== 'undefined' && (window as any).NATIVE_APP_NAME ? (window as any).NATIVE_APP_NAME : 'CasaGrown'}</strong> → allow <strong>Location</strong> permissions, then restart.
                        <button
                          type="button"
                          onClick={async () => {
                            const { NativeBridge } = await import('../../../../../lib/nativeBridge')
                            NativeBridge.openAppSettings()
                          }}
                          style={{
                            background: 'none', border: 'none', padding: 0, margin: '4px 0 0',
                            color: '#ea580c', textDecoration: 'underline', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, display: 'block', textAlign: 'left'
                          }}
                        >
                          ⚙️ Open Settings
                        </button>
                      </>
                    ) : (
                      <>🔒 Location is blocked. To enable: tap the <strong>lock icon</strong> (or ⋮) in your browser’s address bar → <strong>Site settings</strong> → set <strong>Location</strong> to Allow, then reload.</>
                    )}
                  </p>
                )}
              </div>
            )}
            {(hasBooth ? productOffersDelivery : inlineDelivery) && (
              <div className={styles.field} style={{ marginTop: 12, marginBottom: 12 }}>
                <label className={styles.label}>🚗 Delivery Radius</label>
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

            {/* Day selectors — all 7 upcoming days; booth-window days pre-selected */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {(() => {
                const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                const dayOptions: { date: string; label: string }[] = []
                for (let offset = 0; offset < 7; offset++) {
                  const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                  const label = offset === 0 ? todayLabel : offset === 1 ? tomorrowLabel : `${DAY_SHORT[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`
                  dayOptions.push({ date: dateStr, label })
                }
                return dayOptions.map(opt => {
                  const isActive = selectedDates.includes(opt.date)
                  return (
                    <button
                      key={opt.date}
                      type="button"
                      className={`${styles.windowPill} ${isActive ? styles.windowPillActive : ''}`}
                      style={{ padding: '8px 14px', fontSize: 13 }}
                      onClick={() => {
                        setSelectedDates(prev =>
                          prev.includes(opt.date)
                            ? prev.filter(d => d !== opt.date)
                            : [...prev, opt.date]
                        )
                      }}
                    >
                      {isActive ? '✅' : '📅'} {opt.label}
                    </button>
                  )
                })
              })()}
            </div>

            {/* Window cards for each selected date */}
            {selectedDates.map(dateStr => {
              const dateObj = new Date(dateStr + 'T12:00:00')
              const isToday = dateStr === todayStr
              const isTomorrow = dateStr === tomorrowStr
              const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
              const dateLabel = isToday ? todayLabel : isTomorrow ? tomorrowLabel : `${DAY_SHORT[dateObj.getDay()]} ${dateObj.getMonth()+1}/${dateObj.getDate()}`
              const dwIds = productDeliveryWindows[dateStr] || []
              const pwIds = productPickupWindows[dateStr] || []
              const now = new Date()
              const currentHour = now.getHours()

              return (
                <div key={dateStr} className={styles.dayWindowCard}>
                  <div className={styles.dayWindowHeader}>{dateLabel}</div>

                  {/* Delivery windows */}
                  {productOffersDelivery && boothOffersDelivery && (
                    <div className={styles.windowGroup}>
                      <span className={styles.windowLabel}>🚗 Delivery</span>
                      <div className={styles.windowPills}>
                        {PRODUCT_TIME_WINDOWS.map(w => {
                          const [startH] = w.id.split('-').map(Number)
                          const isPast = isToday && startH < currentHour
                          const isSelected = dwIds.includes(w.id)
                          return (
                            <button
                              key={`d-${dateStr}-${w.id}`}
                              type="button"
                              className={`${styles.windowPill} ${isSelected ? styles.windowPillActive : ''}`}
                              style={isPast ? { opacity: 0.5, fontStyle: 'italic' } : undefined}
                              onClick={() => {
                                setProductDeliveryWindows(prev => ({
                                  ...prev,
                                  [dateStr]: isSelected
                                    ? (prev[dateStr] || []).filter(id => id !== w.id)
                                    : [...(prev[dateStr] || []), w.id]
                                }))
                              }}
                            >
                              {isSelected ? '✅' : '⏰'} {w.label}{isPast ? ' ⌛' : ''}
                            </button>
                          )
                        })}
                      </div>
                      {/* Custom delivery slots */}
                      {(productCustomDelivery[dateStr] || []).map((s, i) => (
                        <div key={`cd-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 12 }}>
                          <span style={{ color: 'var(--gray-600)' }}>{s.start} – {s.end}</span>
                          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--red-500)', cursor: 'pointer', fontSize: 14, padding: 0 }}
                            onClick={() => setProductCustomDelivery(prev => ({ ...prev, [dateStr]: (prev[dateStr] || []).filter((_, j) => j !== i) }))}>×</button>
                        </div>
                      ))}
                      {showProductCustomDel[dateStr] ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                          <input type="time" className="input" value={prodCustomStart} onChange={e => setProdCustomStart(e.target.value)} style={{ maxWidth: 100, fontSize: 14, padding: '6px 8px' }} />
                          <span style={{ fontSize: 13 }}>to</span>
                          <input type="time" className="input" value={prodCustomEnd} onChange={e => setProdCustomEnd(e.target.value)} style={{ maxWidth: 100, fontSize: 14, padding: '6px 8px' }} />
                          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => {
                            setProductCustomDelivery(prev => ({ ...prev, [dateStr]: [...(prev[dateStr] || []), { start: prodCustomStart, end: prodCustomEnd }] }))
                            setShowProductCustomDel(prev => ({ ...prev, [dateStr]: false }))
                          }}>Add</button>
                          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: 14 }}
                            onClick={() => setShowProductCustomDel(prev => ({ ...prev, [dateStr]: false }))}>×</button>
                        </div>
                      ) : (
                        <button type="button" style={{ fontSize: 13, color: 'var(--green-600)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}
                          onClick={() => setShowProductCustomDel(prev => ({ ...prev, [dateStr]: true }))}>+ Custom slot</button>
                      )}
                    </div>
                  )}

                  {/* Pickup windows */}
                  {productOffersPickup && boothOffersPickup && (
                    <div className={styles.windowGroup}>
                      <span className={styles.windowLabel}>📍 Pickup</span>
                      <div className={styles.windowPills}>
                        {PRODUCT_TIME_WINDOWS.map(w => {
                          const [startH] = w.id.split('-').map(Number)
                          const isPast = isToday && startH < currentHour
                          const isSelected = pwIds.includes(w.id)
                          return (
                            <button
                              key={`p-${dateStr}-${w.id}`}
                              type="button"
                              className={`${styles.windowPill} ${isSelected ? styles.windowPillActive : ''}`}
                              style={isPast ? { opacity: 0.5, fontStyle: 'italic' } : undefined}
                              onClick={() => {
                                setProductPickupWindows(prev => ({
                                  ...prev,
                                  [dateStr]: isSelected
                                    ? (prev[dateStr] || []).filter(id => id !== w.id)
                                    : [...(prev[dateStr] || []), w.id]
                                }))
                              }}
                            >
                              {isSelected ? '✅' : '⏰'} {w.label}{isPast ? ' ⌛' : ''}
                            </button>
                          )
                        })}
                      </div>
                      {/* Custom pickup slots */}
                      {(productCustomPickup[dateStr] || []).map((s, i) => (
                        <div key={`cp-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 12 }}>
                          <span style={{ color: 'var(--gray-600)' }}>{s.start} – {s.end}</span>
                          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--red-500)', cursor: 'pointer', fontSize: 14, padding: 0 }}
                            onClick={() => setProductCustomPickup(prev => ({ ...prev, [dateStr]: (prev[dateStr] || []).filter((_, j) => j !== i) }))}>×</button>
                        </div>
                      ))}
                      {showProductCustomPick[dateStr] ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                          <input type="time" className="input" value={prodCustomStart} onChange={e => setProdCustomStart(e.target.value)} style={{ maxWidth: 100, fontSize: 14, padding: '6px 8px' }} />
                          <span style={{ fontSize: 13 }}>to</span>
                          <input type="time" className="input" value={prodCustomEnd} onChange={e => setProdCustomEnd(e.target.value)} style={{ maxWidth: 100, fontSize: 14, padding: '6px 8px' }} />
                          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => {
                            setProductCustomPickup(prev => ({ ...prev, [dateStr]: [...(prev[dateStr] || []), { start: prodCustomStart, end: prodCustomEnd }] }))
                            setShowProductCustomPick(prev => ({ ...prev, [dateStr]: false }))
                          }}>Add</button>
                          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: 14 }}
                            onClick={() => setShowProductCustomPick(prev => ({ ...prev, [dateStr]: false }))}>×</button>
                        </div>
                      ) : (
                        <button type="button" style={{ fontSize: 13, color: 'var(--green-600)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}
                          onClick={() => setShowProductCustomPick(prev => ({ ...prev, [dateStr]: true }))}>+ Custom slot</button>
                      )}
                    </div>
                  )}

                  {!productOffersDelivery && !productOffersPickup && (
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic', margin: 0 }}>
                      Enable delivery or pickup above to set windows.
                    </p>
                  )}

                  {/* Day action buttons */}
                  {(productOffersDelivery || productOffersPickup) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <button
                        type="button"
                        className={styles.windowPill}
                        style={{ fontSize: 13, padding: '4px 10px', color: 'var(--red-600, #dc2626)' }}
                        onClick={() => {
                          setProductDeliveryWindows(prev => ({ ...prev, [dateStr]: [] }))
                          setProductPickupWindows(prev => ({ ...prev, [dateStr]: [] }))
                          setProductCustomDelivery(prev => ({ ...prev, [dateStr]: [] }))
                          setProductCustomPickup(prev => ({ ...prev, [dateStr]: [] }))
                        }}
                      >
                        🗑️ Clear
                      </button>
                      {(() => {
                        const otherDate = dateStr === todayStr ? tomorrowStr : todayStr
                        const otherLabel = dateStr === todayStr ? 'Tomorrow' : 'Today'
                        return (
                          <button
                            type="button"
                            className={styles.windowPill}
                            style={{ fontSize: 13, padding: '4px 10px' }}
                            onClick={() => {
                              // Auto-select the other day if not already selected
                              if (!selectedDates.includes(otherDate)) {
                                setSelectedDates(prev => [...prev, otherDate])
                              }
                              setProductDeliveryWindows(prev => ({ ...prev, [otherDate]: [...(prev[dateStr] || [])] }))
                              setProductPickupWindows(prev => ({ ...prev, [otherDate]: [...(prev[dateStr] || [])] }))
                              setProductCustomDelivery(prev => ({ ...prev, [otherDate]: [...(prev[dateStr] || [])] }))
                              setProductCustomPickup(prev => ({ ...prev, [otherDate]: [...(prev[dateStr] || [])] }))
                            }}
                          >
                            📋 Copy to {otherLabel}
                          </button>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}

            {selectedDates.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13, fontStyle: 'italic' }}>
                Select at least one day to set availability windows.
              </div>
            )}
          </div>

          {/* Inline booth setup removed — fulfillment is unified in "Available For" section above */}

          {/* ===== Quarantine Warning Banner ===== */}
          {quarantineWarning && (
            <div style={{
              backgroundColor: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 12,
              padding: '16px 20px', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>⚠️</span>
                <div>
                  <strong style={{ color: '#b45309', fontSize: 15, display: 'block', marginBottom: 4 }}>
                    Potential Agricultural Quarantine
                  </strong>
                  <p style={{ color: '#92400e', fontSize: 13, margin: '0 0 8px 0', lineHeight: 1.5 }}>
                    <strong>{category}</strong> may be quarantined in <strong>{quarantineWarning.county_name}</strong> due
                    to <strong>{quarantineWarning.pest_name}</strong>.
                    Please double check local regulations. You may proceed if you are certain this item complies.
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
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.4, textAlign: 'center' }}>
            <strong>Notice:</strong> Always check your local Department of Agriculture for active plant quarantines before listing agricultural products. You are responsible for ensuring your listings comply with all local regulations.
          </p>
          {errors.submit && (
            <div style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {errors.submit}
            </div>
          )}
          {(() => {
            const isMissingInfo = photos.length === 0 || !priceUsd || !quantity || (!productOffersDelivery && !productOffersPickup)
            return (
              <>
                <button 
                  type="submit" 
                  className={styles.submitBtn} 
                  disabled={validating}
                  style={isMissingInfo ? { background: '#f59e0b' } : undefined}
                  onClick={() => setForceDraft(false)}
                >
                  {validating
                    ? '⏳ Saving...'
                    : isMissingInfo
                      ? 'Save Draft' 
                      : (isRelist || editingInactive) ? '🌱 Re-list & Publish'
                      : (isEditMode ? 'Save Changes' : '🌱 Publish Product')
                  }
                </button>
                {/* Secondary draft button — only when form is complete enough to publish */}
                {!isEditMode && !isMissingInfo && (
                  <button
                    type="submit"
                    className={`${styles.submitBtn} ${styles.submitBtnDraft}`}
                    disabled={validating}
                    onClick={() => setForceDraft(true)}
                    style={{ marginTop: 8 }}
                  >
                    📝 Save as Draft Instead
                  </button>
                )}
              </>
            )
          })()}

          {/* Preview link for sellers in edit mode */}
          {isEditMode && editId && boothId && (
            <button
              type="button"
              onClick={() => router.push(`/market/booth/${boothId}/product/${editId}`)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginTop: 12, padding: '10px 20px', borderRadius: 12, width: '100%',
                background: 'transparent', color: 'var(--green-700, #15803d)',
                border: '1.5px solid var(--green-200, #bbf7d0)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.borderColor = '#86efac' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#bbf7d0' }}
            >
              👁️ Preview Product Page
            </button>
          )}
        </form>

        {/* Camera */}
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
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string
                setPhotos(prev => [...prev, dataUrl])
              }
              reader.readAsDataURL(file)
            }}
          />
        )}

        {showShareModal && publishMissing.length > 0 && (
          <>
            <div className={styles.modalBackdrop} onClick={() => { setShowShareModal(false); router.back() }} />
            <div className={styles.modal}>
              <div className={styles.modalEmoji}>✅</div>
              <h2 className={styles.modalTitle}>{addedProductName} saved!</h2>
              <p className={styles.modalSubtitle}>
                Listed for {nextMarket?.label || 'this weekend'}.
              </p>

              <div className={styles.draftHint}>
                <strong>⚠️ Your booth is saved as a draft.</strong><br />
                To publish and start accepting orders, go to My Produce Stand and set up:
                <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                  {publishMissing.map(m => <li key={m}>{m}</li>)}
                </ul>
              </div>

              <button className={styles.modalSkip} onClick={() => { setShowShareModal(false); router.back() }}>
                Go to My Produce Stand
              </button>
            </div>
          </>
        )}

        {showShareModal && publishMissing.length === 0 && (
          <SocialShareModal
            isOpen={showShareModal}
            onClose={() => { setShowShareModal(false); router.back() }}
            title={`${addedProductName} added!`}
            subtitle={`🎉 Your listing is live! Invite your neighbors to check it out.`}
            entityName={addedProductName || 'Product'}
            shareUrl={getProductUrl() || ''}
            shareMessage={getShareMessage()}
            shareContext="new_product_share"
          />
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
