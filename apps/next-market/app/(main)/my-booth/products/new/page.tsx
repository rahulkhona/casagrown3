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
import { trackEvent, trackFieldInteract, trackStepTiming, resetSessionId } from '../../../../../lib/crm-analytics'
import { ShareIcon } from '../../../../components/icons'
import SocialShareModal from '../../../../components/SocialShareModal'
import { getBoothProductShareMessage } from '../../../../../lib/shareMessages'
import styles from './page.module.css'
import AddressInput from '../../../../components/AddressInput'
import { AddressFields, EMPTY_ADDRESS, formatFullAddress, hasAddress, isAddressComplete, buildAddress } from '../../../../../lib/address'
import { geocodeAddress, toPostgisPoint } from '../../../../../lib/geocode'

// Compute the next upcoming market date from the schedule
function getNextMarketDate(schedule: { dayOfWeek: number; dayName: string; openTime: string; closeTime: string }[]): {
  date: string; label: string; iso: string; dayName: string; openTime: string; closeTime: string
} | null {
  if (!schedule || !schedule.length) return null
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

function parseLegacyAddress(addrStr: string | null | undefined): AddressFields {
  if (!addrStr) return { street: '', city: '', state: '', zip: '' }
  const parts = addrStr.split(',').map(s => s.trim())
  if (parts.length >= 3) {
    const street = parts.slice(0, -2).join(', ').trim()
    const city = parts[parts.length - 2].trim()
    const stateZip = parts[parts.length - 1].trim().split(/\s+/)
    const state = stateZip[0] || ''
    const zip = stateZip.slice(1).join(' ').trim()
    return { street, city, state, zip }
  } else if (parts.length === 2) {
    return { street: parts[0], city: parts[1], state: '', zip: '' }
  } else {
    return { street: addrStr, city: '', state: '', zip: '' }
  }
}

function NewProductPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const prefillId = searchParams.get('prefill') // Re-list from daily digest
  const fromBuzz = searchParams.get('from') === 'buzz'
  const fromSimpleWizard = searchParams.get('from') === 'simple-wizard'
  const returnTo = searchParams.get('returnTo')
  const isRelist = searchParams.get('relist') === 'true'
  const boothParam = searchParams.get('booth') // Target booth from My Stands page
  const isEditMode = !!editId
  const [editingInactive, setEditingInactive] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [simpleWizardOriginalText, setSimpleWizardOriginalText] = useState('')
  const [simpleWizardAiSuccess, setSimpleWizardAiSuccess] = useState(false)
  const [autoPhotoFill, setAutoPhotoFill] = useState(false)
  const [showOriginalText, setShowOriginalText] = useState(false)
  const { state, dispatch } = useMarket()
  const { isAuthenticated, loading: authLoading, user: authUser } = useAuth()
  const supabase = createClient()
  const restriction = useMarketRestriction()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const PAGE_SLUG = '/add-product'
  const isSubmitted = useRef(false)

  useEffect(() => {
    resetSessionId(PAGE_SLUG)
    trackEvent('wizard_step', PAGE_SLUG, { step_index: 1, step_name: 'add_product' })
    return () => {
      if (!isSubmitted.current) {
        trackEvent('wizard_abandon', PAGE_SLUG)
      }
    }
  }, [])

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
  const [aiProgressText, setAiProgressText] = useState('Analyzing product details')
  const [aiToast, setAiToast] = useState<string | null>(null)

  // Price suggestion
  const [suggestedPrice, setSuggestedPrice] = useState<{ price_usd: number; unit: string; source: string } | null>(null)
  const [suggestingPrice, setSuggestingPrice] = useState(false)
  const lastPriceCheck = useRef('')

  // Quarantine check
  const [quarantineWarning, setQuarantineWarning] = useState<{
    pest_name: string; county_name: string; source_url?: string; reason?: string; keywords: string[];
  } | null>(null)
  const showQuarantineWarning = false
  const [quarantineChecking, setQuarantineChecking] = useState(false)

  // Inline booth setup (for users without a booth)
  const [hasBooth, setHasBooth] = useState<boolean | null>(null) // null = loading
  const [boothId, setBoothId] = useState<string | null>(null)
  const [allBooths, setAllBooths] = useState<{id: string, name: string, owner_id?: string, isHelper?: boolean}[]>([])
  const [inlineDelivery, setInlineDelivery] = useState(true)
  const [inlinePickup, setInlinePickup] = useState(true)
  const [inlinePickupAddress, setInlinePickupAddress] = useState('')
  const [boothBaseAddr, setBoothBaseAddr] = useState<AddressFields>(EMPTY_ADDRESS)
  const [productPickupAddr, setProductPickupAddr] = useState<AddressFields>(EMPTY_ADDRESS)
  const [profileHomeAddr, setProfileHomeAddr] = useState<AddressFields>(EMPTY_ADDRESS)
  const [profileAddressLoaded, setProfileAddressLoaded] = useState(false)
  const [inlineDeliveryRadius, setInlineDeliveryRadius] = useState(2)
  const [inlineDeliveryZipcodes, setInlineDeliveryZipcodes] = useState<string[]>([])
  const [inlineProfileName, setInlineProfileName] = useState('')
  const [inlineDeliveryWindows, setInlineDeliveryWindows] = useState<string[]>(['8-10', '10-12'])
  const [inlinePickupWindows, setInlinePickupWindows] = useState<string[]>(['8-10', '10-12', '12-14', '14-16'])
  const [geolocatingDelivery, setGeolocatingDelivery] = useState(false)
  const [geolocatingPickup, setGeolocatingPickup] = useState(false)

  const handleGeolocate = async (type: 'delivery' | 'pickup') => {
    if (!navigator.geolocation) return
    const setGeolocating = type === 'delivery' ? setGeolocatingDelivery : setGeolocatingPickup
    const setAddr = type === 'delivery' ? setBoothBaseAddr : setProductPickupAddr
    setGeolocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`
          )
          if (res.ok) {
            const data = await res.json()
            const addr = data.address || {}
            const houseNumber = addr.house_number || ''
            const road = addr.road || ''
            const stateVal = addr.state || ''
            let mappedState = ''
            if (stateVal) {
              const cleanState = stateVal.trim()
              if (cleanState.length === 2) {
                mappedState = cleanState.toUpperCase()
              } else {
                const stateMap: Record<string, string> = {
                  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
                  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
                  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
                  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
                  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
                  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
                  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
                  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
                  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
                  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY'
                }
                mappedState = stateMap[cleanState.toLowerCase()] || 
                  addr['ISO3166-2-lvl4']?.split('-')[1]?.toUpperCase() || 
                  cleanState.slice(0, 2).toUpperCase()
              }
            }
            const newAddress = {
              street: [houseNumber, road].filter(Boolean).join(' '),
              city: addr.city || addr.town || addr.village || addr.hamlet || '',
              state: mappedState,
              zip: addr.postcode?.split('-')[0] || '',
            }
            setAddr(newAddress)
            if (type === 'delivery') {
              if (!productPickupAddr.street || formatFullAddress(productPickupAddr) === formatFullAddress(boothBaseAddr)) {
                setProductPickupAddr(newAddress)
              }
            }
          }
        } catch (e) {
          console.warn('Geolocation failed', e)
        }
        setGeolocating(false)
      },
      () => setGeolocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

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

  // Derive selectedDates from union of delivery + pickup window dates so save logic stays intact
  useEffect(() => {
    const deliveryDates = Object.keys(productDeliveryWindows).filter(d => (productDeliveryWindows[d] || []).length > 0)
    const pickupDates = Object.keys(productPickupWindows).filter(d => (productPickupWindows[d] || []).length > 0)
    const union = Array.from(new Set([...deliveryDates, ...pickupDates])).sort()
    setSelectedDates(union)
  }, [productDeliveryWindows, productPickupWindows])

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

  // Load profile address on mount
  useEffect(() => {
    if (!authUser?.id) return
    supabase.from('profiles')
      .select('full_name, street_address, city, state_code, zip_code')
      .eq('id', authUser.id)
      .single()
      .then(({ data: profile }: { data: any }) => {
        if (profile) {
          const profileAddr = {
            street: profile.street_address || '',
            city: profile.city || '',
            state: profile.state_code || '',
            zip: profile.zip_code || '',
          }
          setProfileHomeAddr(profileAddr)
          if (profile.full_name) setInlineProfileName(profile.full_name)
        }
      })
  }, [authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
        setProfileAddressLoaded(true)
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
        setProfileAddressLoaded(true)
      } else {
        setHasBooth(false)
        supabase.from('profiles').select('full_name, street_address, city, state_code, zip_code').eq('id', authUser.id).single()
          .then(({ data: profile }: { data: any }) => {
            if (profile?.full_name) setInlineProfileName(profile.full_name)
            const profileAddr = {
              street: profile?.street_address || '',
              city: profile?.city || '',
              state: profile?.state_code || '',
              zip: profile?.zip_code || '',
            }
            setBoothBaseAddr(profileAddr)
            setProductPickupAddr(profileAddr)
            if (profile?.street_address) {
              setInlinePickupAddress([profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', '))
            }
            setProfileAddressLoaded(true)
          })
      }
    })
  }, [authUser?.id, boothParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load booth defaults for product windows
  useEffect(() => {
    if (!authUser?.id || boothDefaultsLoaded || !boothId) return
    const loadBoothDefaults = async () => {
      const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat']
      const ALL_SLOT_IDS = PRODUCT_TIME_WINDOWS.map(w => w.id)

      // 1. Load booth settings
      const { data: booth } = await supabase
        .from('market_booths')
        .select('offers_delivery, offers_pickup, delivery_radius_miles, pickup_address, delivery_zipcodes, booth_address, booth_street, booth_city, booth_state, booth_zip, pickup_street, pickup_city, pickup_state, pickup_zip')
        .eq('id', boothId)
        .single()

      // Fetch profile address as fallback
      const { data: profile } = await supabase
        .from('profiles')
        .select('street_address, city, state_code, zip_code')
        .eq('id', authUser.id)
        .single()

      const profileAddr = profile ? {
        street: profile.street_address || '',
        city: profile.city || '',
        state: profile.state_code || '',
        zip: profile.zip_code || '',
      } : EMPTY_ADDRESS

      if (booth) {
        let baseAddr = buildAddress(booth.booth_street, booth.booth_city, booth.booth_state, booth.booth_zip)
        if (!hasAddress(baseAddr) && booth.booth_address) {
          baseAddr = parseLegacyAddress(booth.booth_address)
        }
        // Fallback to home address if not provided
        if (!hasAddress(baseAddr)) {
          baseAddr = profileAddr
        }
        setBoothBaseAddr(baseAddr)

        let pickAddr = buildAddress(booth.pickup_street, booth.pickup_city, booth.pickup_state, booth.pickup_zip)
        if (!hasAddress(pickAddr) && booth.pickup_address) {
          pickAddr = parseLegacyAddress(booth.pickup_address)
        }
        // Fallback to booth base address if not provided
        if (!hasAddress(pickAddr)) {
          pickAddr = baseAddr
        }
        setProductPickupAddr(pickAddr)
      } else {
        setBoothBaseAddr(profileAddr)
        setProductPickupAddr(profileAddr)
      }

      // 2. Load fulfillment windows from table (same source as booth page)
      const { data: windows } = await supabase
        .from('booth_fulfillment_windows')
        .select('*')
        .eq('booth_id', boothId)

      const hasBoothWindows = windows && windows.length > 0

      if (hasBoothWindows && !editId) {
        // ── Booth HAS fulfillment defaults → use them (create mode only) ──
        const del = booth?.offers_delivery ?? false
        const pick = booth?.offers_pickup ?? false
        setBoothOffersDelivery(del)
        setBoothOffersPickup(pick)
        setProductOffersDelivery(del)
        setProductOffersPickup(pick)
        if (booth?.delivery_radius_miles != null) setInlineDeliveryRadius(booth.delivery_radius_miles)
        if (booth?.pickup_address) setInlinePickupAddress(booth.pickup_address)
        if (booth?.delivery_zipcodes) setInlineDeliveryZipcodes(booth.delivery_zipcodes)

        // Build weekly schedule from table rows (same logic as booth page)
        const weeklyDw: Record<string, string[]> = {}
        const weeklyPw: Record<string, string[]> = {}
        for (const w of windows) {
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

        // Map weekly schedule → next 7 calendar days
        const dates: string[] = []
        const dwMap: Record<string, string[]> = {}
        const pwMap: Record<string, string[]> = {}
        for (let i = 0; i < 7; i++) {
          const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + i)
          const dayKey = DAY_NAMES[d.getDay()]
          const dw = weeklyDw[dayKey] || []
          const pw = weeklyPw[dayKey] || []
          if (dw.length > 0 || pw.length > 0) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
            dates.push(dateStr)
            dwMap[dateStr] = dw
            pwMap[dateStr] = pw
          }
        }
        if (dates.length > 0) {
          setSelectedDates(dates)
          setProductDeliveryWindows(dwMap)
          setProductPickupWindows(pwMap)
        }
      } else if (!editId) {
        // ── Booth has NO fulfillment defaults → sensible defaults (create mode only) ──
        setBoothOffersDelivery(true)
        setBoothOffersPickup(true)
        setProductOffersDelivery(true)
        setProductOffersPickup(true)
        if (booth?.delivery_radius_miles != null) setInlineDeliveryRadius(booth.delivery_radius_miles)
        if (booth?.delivery_zipcodes) setInlineDeliveryZipcodes(booth.delivery_zipcodes)

        // Default to today + tomorrow with all time slots selected
        setSelectedDates([todayStr, tomorrowStr])
        setProductDeliveryWindows({ [todayStr]: [...ALL_SLOT_IDS], [tomorrowStr]: [...ALL_SLOT_IDS] })
        setProductPickupWindows({ [todayStr]: [...ALL_SLOT_IDS], [tomorrowStr]: [...ALL_SLOT_IDS] })

        // Use profile address as pickup address fallback
        const { data: profile } = await supabase
          .from('profiles')
          .select('street_address, city, state_code, zip_code')
          .eq('id', authUser.id)
          .single()
        if (profile?.street_address) {
          const profileAddr = {
            street: profile.street_address || '',
            city: profile.city || '',
            state: profile.state_code || '',
            zip: profile.zip_code || '',
          }
          setProductPickupAddr(profileAddr)
        }
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
      const hasProductWindows = data.window_dates && Array.isArray(data.window_dates) && data.window_dates.length > 0
      if (hasProductWindows) {
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
        // Restore fulfillment mode toggles from saved product data
        setProductOffersDelivery(data.product_delivery_windows != null)
        setProductOffersPickup(data.product_pickup_windows != null)
      } else {
        // Product has no saved fulfillment windows — fall back to booth defaults
        // This handles legacy products created before product-level windows were stored
        // Booth defaults will be applied by loadBoothDefaults effect (which has already run or will run)
        // If booth defaults are also missing, sensible defaults are set so the form is submittable
        setProductOffersDelivery(true)
        setProductOffersPickup(true)
        setSelectedDates([todayStr, tomorrowStr])
        const allSlots = PRODUCT_TIME_WINDOWS.map(w => w.id)
        setProductDeliveryWindows({ [todayStr]: [...allSlots], [tomorrowStr]: [...allSlots] })
        setProductPickupWindows({ [todayStr]: [...allSlots], [tomorrowStr]: [...allSlots] })
      }
      // Load per-product fulfillment overrides
      if (data.delivery_radius_miles != null) setInlineDeliveryRadius(data.delivery_radius_miles)
      if (data.pickup_address) {
        setProductPickupAddr(parseLegacyAddress(data.pickup_address))
        setInlinePickupAddress(data.pickup_address)
      } else {
        setProductPickupAddr(EMPTY_ADDRESS)
      }
      if (data.delivery_zipcodes) setInlineDeliveryZipcodes(data.delivery_zipcodes)
      // Detect if product is inactive — trigger relist mode automatically
      if (!data.is_active && !data.is_draft) {
        setEditingInactive(true)
        setRelistBannerVisible(true)
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

  // Pre-fill from simple wizard (sessionStorage)
  useEffect(() => {
    if (editId) return
    try {
      if (fromSimpleWizard) {
        const raw = sessionStorage.getItem('simple_listing_prefill')
        if (raw) {
          const data = JSON.parse(raw)
          sessionStorage.removeItem('simple_listing_prefill')

          // Store original text for reference note
          if (data.originalText) {
            setSimpleWizardOriginalText(data.originalText)
            setShowOriginalText(true)
          }

          // Pre-fill description with user's text
          if (data.description) setDescription(data.description)

          // Pre-fill photos
          if (data.photos?.length) setPhotos(data.photos)

          // Mark booth defaults loaded to prevent booth defaults from overwriting
          setBoothDefaultsLoaded(true)

          // Auto-trigger AI fill (the enhanced analyze-product-photo with text context)
          setAutoPhotoFill(true)
        }
      } else {
        // Clear prefill to prevent leaks to subsequent listings
        sessionStorage.removeItem('simple_listing_prefill')
      }
    } catch (err) {
      console.warn('Failed to read simple wizard prefill:', err)
    }
  }, [fromSimpleWizard]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-trigger AI photo analysis after photos/text state settles
  useEffect(() => {
    if (autoPhotoFill && (photos.length > 0 || simpleWizardOriginalText)) {
      if (!profileAddressLoaded) return // Wait for profile/booth loader to complete
      setAutoPhotoFill(false)
      handleAiAutoFill()
    }
  }, [autoPhotoFill, photos, simpleWizardOriginalText, profileAddressLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

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

    // Fetch booth defaults to resolve any missing values and for validation
    let boothDefaults: any = null
    if (boothId) {
      const { data: b } = await supabase
        .from('market_booths')
        .select('delivery_radius_miles, pickup_address, delivery_zipcodes, booth_address, offers_delivery, offers_pickup, delivery_windows, pickup_windows')
        .eq('id', boothId)
        .single()
      boothDefaults = b
    }
    
    // Evaluate if form lacks requirements to cleanly Publish
    const effectivePrice = restriction.isFreeOnly ? '0' : priceUsd
    const parsedPrice = parseFloat(effectivePrice || '0')
    const isValidPrice = effectivePrice !== '' && effectivePrice !== null && !isNaN(parsedPrice) && parsedPrice >= 0 && (!restriction.isFreeOnly || parsedPrice === 0)
    let needsDraft = forceDraft || !name.trim() || photos.length === 0 || !isValidPrice || !quantity || parseInt(quantity) <= 0
    
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

      // Fulfillment window validation — if missing, save as draft instead of blocking
      const hasFulfillmentMode = productOffersDelivery || productOffersPickup
      const hasDates = selectedDates.length > 0
      const hasAnyWindow = hasDates && selectedDates.some(d => {
        const dw = productOffersDelivery ? (productDeliveryWindows[d] || []).length + (productCustomDelivery[d] || []).length : 0
        const pw = productOffersPickup ? (productPickupWindows[d] || []).length + (productCustomPickup[d] || []).length : 0
        return dw > 0 || pw > 0
      })
      if (!hasFulfillmentMode || !hasDates || !hasAnyWindow) {
        // Force draft save — don't block the save entirely
        needsDraft = true
      }

      // Address validation
      if (!hasBooth) {
        // Base address is required to initialize the booth
        if (!hasAddress(boothBaseAddr)) {
          newErrors.boothAddress = 'Home/Farm address is required'
        } else if (!isAddressComplete(boothBaseAddr)) {
          newErrors.boothAddress = 'Please enter street, city, state, and ZIP code for your home/farm address.'
        }

        // If pickup is enabled, we check if they specified an alternate pickup address
        if (inlinePickup && hasAddress(productPickupAddr)) {
          if (!isAddressComplete(productPickupAddr)) {
            newErrors.pickupAddress = 'Please complete all fields of the pickup address or leave it empty to use home address.'
          }
        }
      } else {
        // If hasBooth is true, pickup address is an optional override
        if (productOffersPickup && hasAddress(productPickupAddr)) {
          if (!isAddressComplete(productPickupAddr)) {
            newErrors.pickupAddress = 'Please complete all fields of the pickup address or leave it empty to use booth default.'
          }
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

    isSubmitted.current = true
    setValidating(true)
    setAddedProductName(name.trim())
    trackFormSubmit(isEditMode ? 'edit_product' : 'add_product', { category, name: name.trim() })

    try {
      let boothLocation: any = null
      let pickupLocation: any = null

      if (!hasBooth) {
        try {
          const boothStr = formatFullAddress(boothBaseAddr)
          if (boothStr) {
            const geo = await geocodeAddress(boothStr)
            if (geo) {
              boothLocation = toPostgisPoint(geo.lat, geo.lng)
              pickupLocation = toPostgisPoint(geo.lat, geo.lng)
            }
          }
          const pickupStr = inlinePickup
            ? (hasAddress(productPickupAddr) ? formatFullAddress(productPickupAddr) : boothStr)
            : null
          if (pickupStr && pickupStr !== boothStr) {
            const geo = await geocodeAddress(pickupStr)
            if (geo) {
              pickupLocation = toPostgisPoint(geo.lat, geo.lng)
            }
          }
        } catch (err) {
          console.warn('Geocoding failed during booth auto-creation/update:', err)
        }
      }

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
          
          const flatDw = inlineDelivery ? mapInlineWindows(inlineDeliveryWindows, inlineCustomDeliverySlots) : []
          const flatPw = inlinePickup ? mapInlineWindows(inlinePickupWindows, inlineCustomPickupSlots) : []
          const autoWeeklyDw: Record<string, any[]> = {}
          const autoWeeklyPw: Record<string, any[]> = {}
          if (flatDw.length > 0) {
            autoWeeklyDw[todayDayKey] = flatDw
            autoWeeklyDw[tomorrowDayKey] = flatDw
          }
          if (flatPw.length > 0) {
            autoWeeklyPw[todayDayKey] = flatPw
            autoWeeklyPw[tomorrowDayKey] = flatPw
          }

          const boothUpdatePayload: any = {
            offers_delivery: inlineDelivery,
            offers_pickup: inlinePickup,
            delivery_radius_miles: inlineDeliveryRadius,
            booth_address: formatFullAddress(boothBaseAddr) || null,
            booth_street: boothBaseAddr.street || null,
            booth_city: boothBaseAddr.city || null,
            booth_state: boothBaseAddr.state || null,
            booth_zip: boothBaseAddr.zip ? boothBaseAddr.zip.split('-')[0] : null,
            pickup_address: inlinePickup ? (hasAddress(productPickupAddr) ? formatFullAddress(productPickupAddr) : formatFullAddress(boothBaseAddr)) : null,
            pickup_street: inlinePickup ? (productPickupAddr.street || boothBaseAddr.street || null) : null,
            pickup_city: inlinePickup ? (productPickupAddr.city || boothBaseAddr.city || null) : null,
            pickup_state: inlinePickup ? (productPickupAddr.state || boothBaseAddr.state || null) : null,
            pickup_zip: inlinePickup ? ((productPickupAddr.zip || boothBaseAddr.zip || '').split('-')[0] || null) : null,
            delivery_zipcodes: inlineDelivery && inlineDeliveryZipcodes.length > 0 ? inlineDeliveryZipcodes : null,
            delivery_windows: flatDw,
            pickup_windows: flatPw,
            weekly_delivery_windows: autoWeeklyDw,
            weekly_pickup_windows: autoWeeklyPw,
          }
          if (boothLocation) boothUpdatePayload.booth_location = boothLocation
          if (pickupLocation) boothUpdatePayload.pickup_location = pickupLocation

          await supabase.from('market_booths').update(boothUpdatePayload).eq('id', boothId)
        } else {
          // Auto-create a booth using inline form values — publish immediately
          const boothName = inlineProfileName ? `${inlineProfileName}'s Produce Stand` : 'My Produce Stand'

          const autoWeeklyDw: Record<string, any[]> = {}
          const autoWeeklyPw: Record<string, any[]> = {}
          const flatDw = inlineDelivery ? mapInlineWindows(inlineDeliveryWindows, inlineCustomDeliverySlots) : []
          const flatPw = inlinePickup ? mapInlineWindows(inlinePickupWindows, inlineCustomPickupSlots) : []
          if (flatDw.length > 0) {
            autoWeeklyDw[todayDayKey] = flatDw
            autoWeeklyDw[tomorrowDayKey] = flatDw
          }
          if (flatPw.length > 0) {
            autoWeeklyPw[todayDayKey] = flatPw
            autoWeeklyPw[tomorrowDayKey] = flatPw
          }

          const boothInsertPayload: any = {
            owner_id: authUser.id,
            name: boothName,
            status: 'published',
            offers_delivery: inlineDelivery,
            offers_pickup: inlinePickup,
            delivery_radius_miles: inlineDeliveryRadius,
            booth_address: formatFullAddress(boothBaseAddr) || null,
            booth_street: boothBaseAddr.street || null,
            booth_city: boothBaseAddr.city || null,
            booth_state: boothBaseAddr.state || null,
            booth_zip: boothBaseAddr.zip ? boothBaseAddr.zip.split('-')[0] : null,
            pickup_address: inlinePickup ? (hasAddress(productPickupAddr) ? formatFullAddress(productPickupAddr) : formatFullAddress(boothBaseAddr)) : null,
            pickup_street: inlinePickup ? (productPickupAddr.street || boothBaseAddr.street || null) : null,
            pickup_city: inlinePickup ? (productPickupAddr.city || boothBaseAddr.city || null) : null,
            pickup_state: inlinePickup ? (productPickupAddr.state || boothBaseAddr.state || null) : null,
            pickup_zip: inlinePickup ? ((productPickupAddr.zip || boothBaseAddr.zip || '').split('-')[0] || null) : null,
            delivery_windows: flatDw,
            pickup_windows: flatPw,
            weekly_delivery_windows: autoWeeklyDw,
            weekly_pickup_windows: autoWeeklyPw,
            payment_method: 'automatic',
            decorative_theme: 'floral',
          }
          if (boothLocation) boothInsertPayload.booth_location = boothLocation
          if (pickupLocation) boothInsertPayload.pickup_location = pickupLocation

          const { data: newBooth, error: boothErr } = await supabase
            .from('market_booths')
            .insert(boothInsertPayload)
            .select()
            .single()

          if (boothErr || !newBooth) {
            setValidating(false)
            dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to create booth — ' + (boothErr?.message || 'unknown error'), type: 'error' } })
            return
          }
          boothId = newBooth.id
        }
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

    if (boothId) {
      // If booth exists but has no fulfillment settings (both offers_delivery and offers_pickup are false/null),
      // we copy the first product's attributes to set the booth defaults.
      const hasFulfillmentConfigured = boothDefaults && (boothDefaults.offers_delivery || boothDefaults.offers_pickup)
      if (!hasFulfillmentConfigured) {
        const autoWeeklyDw: Record<string, any[]> = {}
        const autoWeeklyPw: Record<string, any[]> = {}
        const flatDw = inlineDelivery ? mapInlineWindows(inlineDeliveryWindows, inlineCustomDeliverySlots) : []
        const flatPw = inlinePickup ? mapInlineWindows(inlinePickupWindows, inlineCustomPickupSlots) : []

        if (flatDw.length > 0) {
          autoWeeklyDw[todayDayKey] = flatDw
          autoWeeklyDw[tomorrowDayKey] = flatDw
        }
        if (flatPw.length > 0) {
          autoWeeklyPw[todayDayKey] = flatPw
          autoWeeklyPw[tomorrowDayKey] = flatPw
        }

        await supabase.from('market_booths').update({
          offers_delivery: inlineDelivery,
          offers_pickup: inlinePickup,
          delivery_radius_miles: inlineDeliveryRadius,
          booth_address: formatFullAddress(boothBaseAddr) || null,
          booth_street: boothBaseAddr.street || null,
          booth_city: boothBaseAddr.city || null,
          booth_state: boothBaseAddr.state || null,
          booth_zip: boothBaseAddr.zip ? boothBaseAddr.zip.split('-')[0] : null,
          pickup_address: inlinePickup ? (hasAddress(productPickupAddr) ? formatFullAddress(productPickupAddr) : formatFullAddress(boothBaseAddr)) : null,
          pickup_street: inlinePickup ? (productPickupAddr.street || boothBaseAddr.street || null) : null,
          pickup_city: inlinePickup ? (productPickupAddr.city || boothBaseAddr.city || null) : null,
          pickup_state: inlinePickup ? (productPickupAddr.state || boothBaseAddr.state || null) : null,
          pickup_zip: inlinePickup ? ((productPickupAddr.zip || boothBaseAddr.zip || '').split('-')[0] || null) : null,
          delivery_zipcodes: inlineDelivery && inlineDeliveryZipcodes.length > 0 ? inlineDeliveryZipcodes : null,
          delivery_windows: flatDw,
          pickup_windows: flatPw,
          weekly_delivery_windows: autoWeeklyDw,
          weekly_pickup_windows: autoWeeklyPw
        }).eq('id', boothId)
      }
    }

    const offersPickup = hasBooth ? productOffersPickup : inlinePickup
    const offersDelivery = hasBooth ? productOffersDelivery : inlineDelivery

    const resolvedRadius = inlineDeliveryRadius !== null && inlineDeliveryRadius !== undefined
      ? inlineDeliveryRadius
      : (boothDefaults?.delivery_radius_miles || 5)

    const resolvedPickupAddress = offersPickup && hasAddress(productPickupAddr)
      ? formatFullAddress(productPickupAddr)
      : null

    const resolvedZipcodes = inlineDeliveryZipcodes && inlineDeliveryZipcodes.length > 0
      ? inlineDeliveryZipcodes
      : (boothDefaults?.delivery_zipcodes || [])

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
          delivery_radius_miles: resolvedRadius,
          pickup_address: offersPickup ? resolvedPickupAddress : null,
          delivery_zipcodes: offersDelivery && resolvedZipcodes.length > 0 ? resolvedZipcodes : null,
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
        delivery_radius_miles: resolvedRadius,
        pickup_address: offersPickup ? resolvedPickupAddress : null,
        delivery_zipcodes: offersDelivery && resolvedZipcodes.length > 0 ? resolvedZipcodes : null,
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

    // Mark experiment conversion if user came from multi-arm bandit listing flow
    if (typeof window !== 'undefined') {
      const anonId = localStorage.getItem('crm_bandit_anon_id')
      if (anonId) {
        supabase.rpc('mark_experiment_conversion', {
          p_anonymous_id: anonId,
          p_experiment_name: 'listing_wizard_v2'
        }).then((res: any) => {
          if (res.error) console.warn('Failed to mark experiment conversion:', res.error)
        })
      }
    }

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
      let hasFulfillment = booth.offers_delivery || booth.offers_pickup
      let hasWindows = false
      if (hasFulfillment) {
        // Check both flat and weekly windows for completeness
        const weeklyDw = booth.weekly_delivery_windows as Record<string, any[]> | null
        const weeklyPw = booth.weekly_pickup_windows as Record<string, any[]> | null
        const hasFlatDw = (booth.delivery_windows as any[])?.length > 0
        const hasFlatPw = (booth.pickup_windows as any[])?.length > 0
        const hasWeeklyDw = !!(weeklyDw && Object.values(weeklyDw).some(arr => arr?.length > 0))
        const hasWeeklyPw = !!(weeklyPw && Object.values(weeklyPw).some(arr => arr?.length > 0))
        hasWindows = (!!booth.offers_delivery ? (hasFlatDw || hasWeeklyDw) : true) &&
                     (!!booth.offers_pickup ? (hasFlatPw || hasWeeklyPw) : true)
      }

      // If the product is being published and the booth has no fulfillment settings at all,
      // copy all fulfillment settings from the product/form state to the booth defaults.
      let boothHasNoWindows = false
      if (!needsDraft && !hasFulfillment) {
        const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat']
        const newWeeklyDw: Record<string, string[]> = {}
        const newWeeklyPw: Record<string, string[]> = {}
        const tableRows: Array<{booth_id: string; day_of_week: string; window_type: string; start_time: string; end_time: string}> = []

        for (const dateStr of selectedDates) {
          const d = new Date(dateStr + 'T12:00:00')
          const dayKey = DAY_NAMES[d.getDay()]
          const dwIds = productDeliveryWindows[dateStr] || []
          const pwIds = productPickupWindows[dateStr] || []

          if (dwIds.length > 0 && productOffersDelivery) {
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
          if (pwIds.length > 0 && productOffersPickup) {
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

        // Insert weekly windows table rows
        if (tableRows.length > 0) {
          await supabase.from('booth_fulfillment_windows').insert(tableRows)
        }

        // Update the booth with the product's fulfillment defaults
        await supabase.from('market_booths').update({
          offers_delivery: productOffersDelivery,
          offers_pickup: productOffersPickup,
          delivery_radius_miles: resolvedRadius,
          pickup_address: productOffersPickup ? resolvedPickupAddress : null,
          delivery_zipcodes: productOffersDelivery && resolvedZipcodes.length > 0 ? resolvedZipcodes : null,
          weekly_delivery_windows: Object.keys(newWeeklyDw).length > 0 ? newWeeklyDw : null,
          weekly_pickup_windows: Object.keys(newWeeklyPw).length > 0 ? newWeeklyPw : null,
        }).eq('id', boothId)

        // Re-evaluate hasFulfillment and hasWindows now that they are copied
        hasFulfillment = productOffersDelivery || productOffersPickup
        hasWindows = true
      } else {
        // ── Backfill booth defaults from first listing's windows if booth has none ──
        const { data: existingTableWindows } = await supabase
          .from('booth_fulfillment_windows')
          .select('id')
          .eq('booth_id', boothId)
          .limit(1)
        boothHasNoWindows = !hasWindows && (!existingTableWindows || existingTableWindows.length === 0)

        if (boothHasNoWindows && selectedDates.length > 0) {
          const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat']
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

    // Clear simple wizard prefill on successful save/publish
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('simple_listing_prefill')
    }

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
    const priceText = `💰 Price: $${priceUsd}/${unit} (Qty: ${quantity} available)`
    let deliveryText = ''
    if (productOffersDelivery && productOffersPickup) {
      deliveryText = `🚗 Delivery & 📍 Pickup available`
    } else if (productOffersDelivery) {
      deliveryText = `🚗 Delivery available`
    } else if (productOffersPickup) {
      deliveryText = `📍 Pickup available`
    }
    return getBoothProductShareMessage(addedProductName, priceText, deliveryText, nextMarket?.label) + getProductUrl()
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

  const applyParsedData = (data: any) => {
    // Apply basic product info
    if (data.name) setName(data.name)
    if (data.category && dbCategories.some(c => c.name === data.category)) setCategory(data.category)
    if (data.description) setDescription(data.description)
    if (data.suggested_unit) setUnit(data.suggested_unit)

    // Apply extended fields when text context was provided
    if (data.price_usd != null) {
      setPriceUsd(String(data.price_usd))
      setIsFree(data.price_usd === 0 || data.is_free === true)
    }
    if (data.unit) setUnit(data.unit)
    if (data.quantity != null) setQuantity(String(data.quantity))
    if (data.offers_delivery != null) {
      setProductOffersDelivery(data.offers_delivery)
      setBoothOffersDelivery(data.offers_delivery)
    }
    if (data.offers_pickup != null) {
      setProductOffersPickup(data.offers_pickup)
      setBoothOffersPickup(data.offers_pickup)
    }
    
    // Apply delivery zipcodes & set radius to 0 if zipcodes exist
    if (data.delivery_zipcodes && Array.isArray(data.delivery_zipcodes) && data.delivery_zipcodes.length > 0) {
      setInlineDeliveryZipcodes(data.delivery_zipcodes)
      setInlineDeliveryRadius(0)
    } else {
      if (data.delivery_radius_miles != null) {
        setInlineDeliveryRadius(data.delivery_radius_miles)
      }
    }

    // Apply pickup address override if returned by AI with non-empty values
    const hasAiPickupAddress = data.pickup_address && 
      typeof data.pickup_address === 'object' && 
      (data.pickup_address.street || data.pickup_address.city || data.pickup_address.zip)
    if (hasAiPickupAddress) {
      setProductPickupAddr({
        street: data.pickup_address.street || '',
        city: data.pickup_address.city || '',
        state: data.pickup_address.state || '',
        zip: data.pickup_address.zip || '',
      })
    }

    // Apply base address override if returned by AI with non-empty values
    const hasAiBaseAddress = data.base_address && 
      typeof data.base_address === 'object' && 
      (data.base_address.street || data.base_address.city || data.base_address.zip)
    if (hasAiBaseAddress) {
      setBoothBaseAddr({
        street: data.base_address.street || '',
        city: data.base_address.city || '',
        state: data.base_address.state || '',
        zip: data.base_address.zip || '',
      })
    }

    // Map delivery/pickup days + time_of_day or time_slots to concrete calendar windows
    const TIME_MAP: Record<string, string[]> = {
      morning: ['8-10', '10-12'],
      afternoon: ['12-14', '14-16'],
      evening: ['16-18', '18-20'],
    }
    const rawDeliveryDays = (data.delivery_days || []) as string[]
    const rawPickupDays = (data.pickup_days || []) as string[]
    if (rawDeliveryDays.length || rawPickupDays.length) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      
      // Use slots if returned directly by AI; otherwise fall back to mapping morning/afternoon/evening
      const deliverySlots = data.delivery_time_slots || (data.delivery_time_of_day || ['morning', 'afternoon']).flatMap(
        (t: string) => TIME_MAP[t] || []
      )
      const pickupSlots = data.pickup_time_slots || (data.pickup_time_of_day || ['morning', 'afternoon']).flatMap(
        (t: string) => TIME_MAP[t] || []
      )
      
      const deliveryDaysSet = new Set(rawDeliveryDays.map(d => d.toLowerCase()))
      const pickupDaysSet = new Set(rawPickupDays.map(d => d.toLowerCase()))
      const requestedDays = new Set([
        ...rawDeliveryDays.map(d => d.toLowerCase()),
        ...rawPickupDays.map(d => d.toLowerCase())
      ])
      
      const dates: string[] = []
      const dwMap: Record<string, string[]> = {}
      const pwMap: Record<string, string[]> = {}
      for (let i = 0; i < 7; i++) {
        const d = new Date()
        d.setDate(d.getDate() + i)
        const dayKey = dayNames[d.getDay()]
        if (requestedDays.has(dayKey)) {
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          dates.push(dateStr)
          if (data.offers_delivery !== false && deliveryDaysSet.has(dayKey)) {
            dwMap[dateStr] = deliverySlots
          }
          if (data.offers_pickup !== false && pickupDaysSet.has(dayKey)) {
            pwMap[dateStr] = pickupSlots
          }
        }
      }
      if (dates.length > 0) {
        setSelectedDates(dates)
        setProductDeliveryWindows(dwMap)
        setProductPickupWindows(pwMap)
      }
    }
  }

  const parseTextFallback = (text: string) => {
    const normalized = text.toLowerCase()
    const result: any = {
      offers_delivery: normalized.includes('deliver'),
      offers_pickup: normalized.includes('pickup') || normalized.includes('pick up') || normalized.includes('collect'),
    }

    if (!normalized.includes('deliver') && !normalized.includes('pickup') && !normalized.includes('pick up') && !normalized.includes('collect')) {
      result.offers_delivery = true
      result.offers_pickup = true
    }

    const qtyMatch = normalized.match(/(\d+)\s*(dozen|dz|bunch|bunches|loaf|loaves|bag|bags|box|boxes|basket|baskets|flat|flats|pint|pints|lb|lbs|each|piece|pieces|rose|roses|apple|apples|orange|oranges)/i)
    if (qtyMatch) {
      result.quantity = parseInt(qtyMatch[1])
      let unit = qtyMatch[2].toLowerCase()
      if (unit === 'dz') unit = 'dozen'
      if (unit === 'bunches') unit = 'bunch'
      if (unit === 'loaves') unit = 'loaf'
      if (unit === 'bags') unit = 'bag'
      if (unit === 'boxes') unit = 'box'
      if (unit === 'baskets') unit = 'basket'
      if (unit === 'flats') unit = 'flat'
      if (unit === 'pints') unit = 'pint'
      if (unit === 'lbs') unit = 'lb'
      if (unit === 'piece' || unit === 'pieces' || unit === 'rose' || unit === 'roses' || unit === 'apple' || unit === 'apples' || unit === 'orange' || unit === 'oranges') unit = 'each'
      result.unit = unit
    }

    const priceMatch = normalized.match(/(?:\$|price\s*(?:is)?\s*)\s*(\d+(?:\.\d{2})?)/i)
    if (priceMatch) {
      result.price_usd = parseFloat(priceMatch[1])
    }

    // Detect price denomination unit
    let priceUnit = 'each'
    if (normalized.includes('per dozen') || normalized.includes('/dozen') || normalized.includes('/dz')) {
      priceUnit = 'dozen'
    } else if (normalized.includes('per lb') || normalized.includes('per pound') || normalized.includes('/lb') || normalized.includes('/pound')) {
      priceUnit = 'lb'
    } else if (normalized.includes('per bunch') || normalized.includes('/bunch')) {
      priceUnit = 'bunch'
    } else if (normalized.includes('per piece') || normalized.includes('per each') || normalized.includes('/each') || normalized.includes('/piece') || normalized.includes('each') || normalized.includes('per item')) {
      priceUnit = 'each'
    } else {
      // Fallback to whatever quantity unit we matched
      priceUnit = result.unit || 'each'
    }

    // Convert quantity if unit doesn't match pricing unit
    if (result.unit && result.unit !== priceUnit) {
      if (result.unit === 'dozen' && priceUnit === 'each') {
        result.quantity = result.quantity * 12
      } else if (result.unit === 'each' && priceUnit === 'dozen') {
        result.quantity = Math.max(1, Math.round(result.quantity / 12))
      }
      result.unit = priceUnit
    } else if (!result.unit) {
      result.unit = priceUnit
    }

    const zipCodes: string[] = []
    const zipRegex = /\b\d{5}\b/g
    let match
    while ((match = zipRegex.exec(normalized)) !== null) {
      zipCodes.push(match[0])
    }
    if (zipCodes.length > 0) {
      result.delivery_zipcodes = zipCodes
    }

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const deliveryDays: string[] = []
    const pickupDays: string[] = []

    const parts = normalized.split(/(deliver|pickup|pick up|collect)/)
    let currentMode: 'delivery' | 'pickup' | null = null
    for (const part of parts) {
      if (part === 'deliver') {
        currentMode = 'delivery'
      } else if (part === 'pickup' || part === 'pick up' || part === 'collect') {
        currentMode = 'pickup'
      } else if (currentMode) {
        for (const day of days) {
          if (part.includes(day)) {
            if (currentMode === 'delivery') deliveryDays.push(day)
            else pickupDays.push(day)
          }
        }
      }
    }

    if (deliveryDays.length === 0 && pickupDays.length === 0) {
      for (const day of days) {
        if (normalized.includes(day)) {
          if (result.offers_delivery) deliveryDays.push(day)
          if (result.offers_pickup) pickupDays.push(day)
        }
      }
    }

    if (deliveryDays.length > 0) result.delivery_days = deliveryDays
    if (pickupDays.length > 0) result.pickup_days = pickupDays

    const times: string[] = []
    if (normalized.includes('morning') || normalized.includes('9 am') || normalized.includes('9am') || normalized.includes('10 am') || normalized.includes('10am') || normalized.includes('am')) times.push('morning')
    if (normalized.includes('afternoon') || normalized.includes('pm')) times.push('afternoon')
    if (normalized.includes('evening') || normalized.includes('night')) times.push('evening')
    
    if (times.length > 0) {
      if (result.offers_delivery) result.delivery_time_of_day = times
      if (result.offers_pickup) result.pickup_time_of_day = times
    }

    return result
  }

  // AI auto-fill from photo and/or text — calls analyze-product-photo edge function
  const handleAiAutoFill = async () => {
    if (photos.length === 0 && !simpleWizardOriginalText) return
    setAiAnalyzing(true)
    setAiToast(null)
    setAiProgressText('Reading your description...')

    const PROGRESS_STEPS = [
      'Reading your description...',
      'Analyzing your photos...',
      'Identifying product & category...',
      'Estimating fair pricing...',
      'Setting up fulfillment options...',
      'Preparing your listing form...',
    ]

    let stepIdx = 0
    const progressInterval = setInterval(() => {
      if (stepIdx < PROGRESS_STEPS.length - 1) {
        stepIdx++
        setAiProgressText(PROGRESS_STEPS[stepIdx])
      } else {
        setAiProgressText('Preparing form (still processing...)')
      }
    }, 5000)

    const cleanup = () => {
      clearInterval(progressInterval)
      setAiAnalyzing(false)
    }

    const tryInvoke = async (): Promise<{ data: any; error: any }> => {
      // 45s timeout to prevent hanging on slow/unreachable edge functions
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      try {
        const body: any = {}
        if (photos.length > 0) body.image = photos[0]
        if (simpleWizardOriginalText) body.text = simpleWizardOriginalText
        
        const stateCode = boothBaseAddr.state || profileHomeAddr.state || ''
        const cityName = boothBaseAddr.city || profileHomeAddr.city || ''
        if (stateCode) body.seller_state = stateCode
        if (cityName) body.seller_city = cityName
        const res = await supabase.functions.invoke('analyze-product-photo', {
          body,
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

      const data = res.data as any

      // Check for invocation/API errors after retry or failed identification
      if (res.error || data?.error || (!data?.name && !data?.description && !data?.category)) {
        const errMsg = res.error?.message || data?.error || 'AI could not identify the product'
        console.warn('AI autofill failed, using client-side fallback parser:', errMsg)
        
        // ── Client-side Fallback Parser ──
        const fallbackData = parseTextFallback(simpleWizardOriginalText || '')
        applyParsedData(fallbackData)
        
        setAiToast(`⚠️ AI analysis failed — populated details using text fallback.`)
        cleanup()
        setTimeout(() => setAiToast(null), 15000)
        return
      }

      // Success Path -> Apply parsed AI data
      applyParsedData(data)

      setSimpleWizardAiSuccess(true)
      setAiToast('✨ AI filled in product details — review and adjust!')
      trackClick('ai_autofill_product', { category: data?.category })
    } catch (err: any) {
      console.warn('AI autofill exception, using client-side fallback parser:', err)
      const fallbackData = parseTextFallback(simpleWizardOriginalText || '')
      applyParsedData(fallbackData)
      setAiToast(`⚠️ AI analysis failed — populated details using text fallback.`)
    }
    cleanup()
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

        {prefilled && !fromSimpleWizard && (
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

        {/* Simple wizard original text reference */}
        {simpleWizardOriginalText && (
          <div style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 14,
          }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => setShowOriginalText(prev => !prev)}
            >
              <span style={{ fontSize: 18 }}>{aiAnalyzing ? '🌱' : simpleWizardAiSuccess ? '✨' : '📝'}</span>
              <span style={{ flex: 1 }}>
                {aiAnalyzing
                  ? 'AI is analyzing your description — hang tight!'
                  : simpleWizardAiSuccess
                    ? 'We pre-filled your listing from your description. Review and edit as needed.'
                    : 'We couldn\'t auto-fill everything — please fill in the details below.'}
              </span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{showOriginalText ? '▼' : '▶'} Your text</span>
            </div>
            {showOriginalText && (
              <div style={{
                marginTop: 10,
                padding: '10px 12px',
                background: '#fff',
                borderRadius: 8,
                border: '1px solid #e0f2fe',
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                color: '#374151',
                lineHeight: 1.6,
              }}>
                {simpleWizardOriginalText}
              </div>
            )}
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
                    <span>{aiProgressText}</span>
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
                <input className={`${styles.input} ${errors.name ? styles.inputError : name.trim() ? styles.inputFilled : styles.inputRequired}`} value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }} onBlur={() => trackFieldInteract(PAGE_SLUG, 1, 'name', !!name.trim())} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }} placeholder="e.g. Heritage Tomatoes" />
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
              <textarea className={`${styles.input} ${errors.description ? styles.inputError : ''}`} value={description} onChange={e => { setDescription(e.target.value); setErrors(p => ({ ...p, description: '' })) }} onBlur={() => trackFieldInteract(PAGE_SLUG, 1, 'description', !!description.trim())} placeholder="What makes these special?" rows={4} />
              
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
                    onBlur={() => trackFieldInteract(PAGE_SLUG, 1, 'price_usd', !!priceUsd)}
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
              <input className={`${styles.input} ${errors.quantity ? styles.inputError : (quantity && parseInt(quantity) > 0) ? styles.inputFilled : styles.inputRequired}`} type="number" min="1" value={quantity} onChange={e => { setQuantity(e.target.value); setErrors(p => ({ ...p, quantity: '', minimum: '' })) }} onBlur={() => trackFieldInteract(PAGE_SLUG, 1, 'quantity', !!quantity)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }} placeholder="10" />
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

            {/* ── Fulfillment Cards (independent day/window selectors per card) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 12 }}>

              {/* ════ DELIVERY CARD ════ */}
              {(() => {
                const isDeliveryActive = hasBooth ? productOffersDelivery : inlineDelivery
                const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                const dayOptions: { date: string; label: string }[] = []
                for (let offset = 0; offset < 7; offset++) {
                  const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                  const label = offset === 0 ? todayLabel : offset === 1 ? tomorrowLabel : `${DAY_SHORT[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`
                  dayOptions.push({ date: dateStr, label })
                }
                const deliverySelectedDays = Object.keys(productDeliveryWindows).filter(d => (productDeliveryWindows[d] || []).length > 0)

                return (
                  <div data-testid="delivery-box" style={{ border: `2px solid ${isDeliveryActive ? '#22c55e' : '#e5e7eb'}`, borderRadius: 12, background: isDeliveryActive ? '#f0fdf4' : '#fff', overflow: 'hidden', transition: 'all 0.15s' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
                      onClick={() => {
                        if (hasBooth) {
                          setProductOffersDelivery(prev => !prev)
                        } else {
                          setInlineDelivery(prev => !prev)
                        }
                      }}
                    >
                      <span style={{ fontSize: 28 }}>🚗</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: isDeliveryActive ? '#15803d' : '#374151' }}>I&apos;ll Deliver</div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>Drop off at buyer&apos;s door</div>
                      </div>
                      <div>
                        <input type="checkbox" checked={isDeliveryActive} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
                      </div>
                    </div>
                    {isDeliveryActive && (
                      <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid #bbf7d0' }}>
                        <div className={styles.field} style={{ marginTop: 16, marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className={styles.label}>
                              🏠 {hasBooth ? 'Your Booth Address' : 'Home/Farm Address (Base Address)'} <span className={styles.required}>*</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleGeolocate('delivery')}
                              disabled={geolocatingDelivery}
                              style={{
                                background: 'none', border: 'none', color: '#16a34a',
                                fontSize: 12, fontWeight: 600, cursor: geolocatingDelivery ? 'wait' : 'pointer',
                                padding: 0, display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              {geolocatingDelivery ? '⏳ Locating...' : '📍 Use My Location'}
                            </button>
                          </div>
                          <div className={styles.fieldHint}>This address is used as the base location for computing your delivery radius.</div>
                          <AddressInput
                            value={boothBaseAddr}
                            onChange={val => {
                              setBoothBaseAddr(val)
                              setErrors(p => ({ ...p, boothAddress: '' }))
                              // Sync pickup address if it hasn't been customized
                              if (!productPickupAddr.street || formatFullAddress(productPickupAddr) === formatFullAddress(boothBaseAddr)) {
                                setProductPickupAddr(val)
                              }
                            }}
                            showPrivacyNote={true}
                            placeholderStreet="Street Address"
                          />
                          {errors.boothAddress && <span className={styles.error} data-testid="booth-address-error">{errors.boothAddress}</span>}
                        </div>

                        {/* Delivery Radius */}
                        <div className={styles.field} style={{ marginTop: 12, marginBottom: 12 }}>
                          <label className={styles.label}>🚗 Delivery Radius</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              type="range" min={1} max={10}
                              value={inlineDeliveryRadius}
                              onChange={e => setInlineDeliveryRadius(parseInt(e.target.value))}
                              style={{ flex: 1, accentColor: '#16a34a' }}
                            />
                            <span style={{ minWidth: 50, fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                              {inlineDeliveryRadius} mi
                            </span>
                          </div>
                        </div>

                        {/* Delivery Zip Codes */}
                        <div className={styles.field} style={{ marginTop: 12, marginBottom: 12 }}>
                          <label className={styles.label}>📮 Delivery Zip Codes (Specific zones/neighborhoods)</label>
                          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
                            Add zip codes where you deliver, regardless of distance.
                          </p>
                          <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: 8,
                            background: 'white',
                            alignItems: 'center',
                            minHeight: 38
                          }}>
                            {(inlineDeliveryZipcodes || []).map((zip) => (
                              <span key={zip} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#dcfce7',
                                color: '#15803d',
                                padding: '3px 8px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600
                              }}>
                                {zip}
                                <button
                                  type="button"
                                  onClick={() => setInlineDeliveryZipcodes(prev => (prev || []).filter(z => z !== zip))}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    color: '#15803d',
                                    cursor: 'pointer',
                                    padding: 0,
                                    fontSize: 14,
                                    lineHeight: 1
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            <input
                              type="text"
                              placeholder={(inlineDeliveryZipcodes || []).length === 0 ? "e.g. 90210, 90211" : "Add zip..."}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                                  e.preventDefault();
                                  const val = e.currentTarget.value.trim().replace(/[^0-9]/g, '');
                                  if (val.length === 5 && !(inlineDeliveryZipcodes || []).includes(val)) {
                                    setInlineDeliveryZipcodes(prev => [...(prev || []), val]);
                                    e.currentTarget.value = '';
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                const val = e.currentTarget.value.trim().replace(/[^0-9]/g, '');
                                if (val.length === 5 && !(inlineDeliveryZipcodes || []).includes(val)) {
                                  setInlineDeliveryZipcodes(prev => [...(prev || []), val]);
                                  e.currentTarget.value = '';
                                }
                              }}
                              style={{
                                border: 'none',
                                outline: 'none',
                                flex: 1,
                                minWidth: 80,
                                fontSize: 14,
                                padding: '4px 0'
                              }}
                            />
                          </div>
                        </div>

                        {/* ── Delivery Day Pills & Time Windows ── */}
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #bbf7d0' }}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>📅 Delivery Days &amp; Times</label>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {dayOptions.map(opt => {
                              const isActive = (productDeliveryWindows[opt.date] || []).length > 0
                              return (
                                <button
                                  key={opt.date}
                                  type="button"
                                  className={`${styles.windowPill} ${isActive ? styles.windowPillActive : ''}`}
                                  style={{ padding: '6px 12px', fontSize: 13 }}
                                  onClick={() => {
                                    setProductDeliveryWindows(prev => {
                                      const next = { ...prev }
                                      if (next[opt.date] && next[opt.date].length > 0) {
                                        delete next[opt.date]
                                      } else {
                                        next[opt.date] = ['10-12', '16-18']
                                      }
                                      return next
                                    })
                                  }}
                                >
                                  {isActive ? '✅' : '📅'} {opt.label}
                                </button>
                              )
                            })}
                          </div>

                          {deliverySelectedDays.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {deliverySelectedDays.map(dateStr => {
                                const dateObj = new Date(dateStr + 'T12:00:00')
                                const isToday = dateStr === todayStr
                                const isTomorrow = dateStr === tomorrowStr
                                const dateLabel = isToday ? todayLabel : isTomorrow ? tomorrowLabel : `${DAY_SHORT[dateObj.getDay()]} ${dateObj.getMonth()+1}/${dateObj.getDate()}`
                                const dwIds = productDeliveryWindows[dateStr] || []
                                const now = new Date()
                                const currentHour = now.getHours()

                                return (
                                  <div key={dateStr} style={{ background: '#f9fafb', padding: '12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                      <span style={{ fontSize: 13, fontWeight: 700, width: 85, paddingTop: 4, color: '#374151' }}>{dateLabel.split(' ')[0]}</span>
                                      <div style={{ flex: 1 }}>
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
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ════ PICKUP CARD ════ */}
              {(() => {
                const isPickupActive = hasBooth ? productOffersPickup : inlinePickup
                const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                const dayOptions: { date: string; label: string }[] = []
                for (let offset = 0; offset < 7; offset++) {
                  const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                  const label = offset === 0 ? todayLabel : offset === 1 ? tomorrowLabel : `${DAY_SHORT[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`
                  dayOptions.push({ date: dateStr, label })
                }
                const pickupSelectedDays = Object.keys(productPickupWindows).filter(d => (productPickupWindows[d] || []).length > 0)

                return (
                  <div data-testid="pickup-box" style={{ border: `2px solid ${isPickupActive ? '#22c55e' : '#e5e7eb'}`, borderRadius: 12, background: isPickupActive ? '#f0fdf4' : '#fff', overflow: 'hidden', transition: 'all 0.15s' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', cursor: 'pointer' }}
                      onClick={() => {
                        if (hasBooth) {
                          setProductOffersPickup(prev => !prev)
                        } else {
                          setInlinePickup(prev => !prev)
                        }
                      }}
                    >
                      <span style={{ fontSize: 28 }}>📍</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: isPickupActive ? '#15803d' : '#374151' }}>Pickup Available</div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>Buyers pick up from you</div>
                      </div>
                      <div>
                        <input type="checkbox" checked={isPickupActive} readOnly style={{ width: 20, height: 20, accentColor: '#16a34a', pointerEvents: 'none' }} />
                      </div>
                    </div>
                    {isPickupActive && (
                      <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid #bbf7d0' }}>
                        <div className={styles.field} style={{ marginTop: 16, marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label className={styles.label}>
                              📍 {hasBooth ? 'Pickup Address Override' : 'Alternate Pickup Address'} <span className={styles.optional}>(leave blank to use base address)</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleGeolocate('pickup')}
                              disabled={geolocatingPickup}
                              style={{
                                background: 'none', border: 'none', color: '#16a34a',
                                fontSize: 12, fontWeight: 600, cursor: geolocatingPickup ? 'wait' : 'pointer',
                                padding: 0, display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              {geolocatingPickup ? '⏳ Locating...' : '📍 Use My Location'}
                            </button>
                          </div>
                          <AddressInput
                            value={productPickupAddr}
                            onChange={val => {
                              setProductPickupAddr(val)
                              setErrors(p => ({ ...p, pickupAddress: '' }))
                            }}
                            placeholderStreet="Street Address"
                          />
                          {errors.pickupAddress && <span className={styles.error} data-testid="pickup-address-error">{errors.pickupAddress}</span>}
                        </div>

                        {/* ── Pickup Day Pills & Time Windows ── */}
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #bbf7d0' }}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>📅 Pickup Days &amp; Times</label>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {dayOptions.map(opt => {
                              const isActive = (productPickupWindows[opt.date] || []).length > 0
                              return (
                                <button
                                  key={opt.date}
                                  type="button"
                                  className={`${styles.windowPill} ${isActive ? styles.windowPillActive : ''}`}
                                  style={{ padding: '6px 12px', fontSize: 13 }}
                                  onClick={() => {
                                    setProductPickupWindows(prev => {
                                      const next = { ...prev }
                                      if (next[opt.date] && next[opt.date].length > 0) {
                                        delete next[opt.date]
                                      } else {
                                        next[opt.date] = ['10-12', '16-18']
                                      }
                                      return next
                                    })
                                  }}
                                >
                                  {isActive ? '✅' : '📅'} {opt.label}
                                </button>
                              )
                            })}
                          </div>

                          {pickupSelectedDays.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {pickupSelectedDays.map(dateStr => {
                                const dateObj = new Date(dateStr + 'T12:00:00')
                                const isToday = dateStr === todayStr
                                const isTomorrow = dateStr === tomorrowStr
                                const dateLabel = isToday ? todayLabel : isTomorrow ? tomorrowLabel : `${DAY_SHORT[dateObj.getDay()]} ${dateObj.getMonth()+1}/${dateObj.getDate()}`
                                const pwIds = productPickupWindows[dateStr] || []
                                const now = new Date()
                                const currentHour = now.getHours()

                                return (
                                  <div key={dateStr} style={{ background: '#f9fafb', padding: '12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                      <span style={{ fontSize: 13, fontWeight: 700, width: 85, paddingTop: 4, color: '#374151' }}>{dateLabel.split(' ')[0]}</span>
                                      <div style={{ flex: 1 }}>
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
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {selectedDates.length === 0 && !(hasBooth ? productOffersDelivery : inlineDelivery) && !(hasBooth ? productOffersPickup : inlinePickup) && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13, fontStyle: 'italic' }}>
                Enable delivery or pickup and select days to set availability windows.
              </div>
            )}
          </div>

          {/* Inline booth setup removed — fulfillment is unified in "Available For" section above */}

          {/* ===== Quarantine Warning Banner ===== */}
          {quarantineWarning && showQuarantineWarning && (
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
            Friendly reminder: Please check your local agricultural guidelines before listing fresh produce.
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

        {showShareModal && publishMissing.length === 0 && (() => {
          const ogPrice = parseFloat(priceUsd) === 0
            ? 'Free'
            : priceUsd
              ? `$${Number(priceUsd).toFixed(2)}/${unit}`
              : ''
          const ogTitle = `${addedProductName || 'Product'}${ogPrice ? ` — ${ogPrice}` : ''} | CasaGrown Market`
          return (
            <SocialShareModal
              isOpen={showShareModal}
              onClose={() => { setShowShareModal(false); router.back() }}
              title={`${addedProductName} added!`}
              entityName={addedProductName || 'Product'}
              shareUrl={getProductUrl() || ''}
              shareMessage={getShareMessage()}
              shareContext="new_product_share"
              imageUrl={photos?.[0] || undefined}
              ogTitle={ogTitle}
              isFree={parseFloat(priceUsd) === 0}
            />
          )
        })()}
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
