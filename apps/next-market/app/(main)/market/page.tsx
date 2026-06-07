'use client'


import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { latLngToCell, gridDisk } from 'h3-js'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { geocodeAddress, GeocodeRateLimitError } from '../../../lib/geocode'
import { formatUsd } from '../../../lib/store'
import { useMarketStatus } from '../../../lib/useMarketStatus'
import MarketClosedBox from '../../components/MarketClosedBox'
import PioneerBanner from '../../components/PioneerBanner'
import { resetTour } from '../../components/GuidedTour'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useErrorToast } from '../../components/ErrorToast'
import SocialShareModal from '../../components/SocialShareModal'
import { getGlobalMarketShareMessage } from '../../../lib/shareMessages'
import { useCommunityDigest } from '../../../lib/useCommunityDigest'
import AddressInput from '../../components/AddressInput'
import { type AddressFields, EMPTY_ADDRESS, toGeocodingString, formatFullAddress } from '../../../lib/address'
import GrowBotFAB from '../../components/GrowBotFAB'
import { NativeBridge } from '../../../lib/nativeBridge'
import styles from './page.module.css'

// ── Feature Flags ──
// Set OFN_ENABLED to true once a partner API token is obtained from Open Food Network.
// Until then, the OFN product fallback is suppressed (USDA remains active).
const OFN_ENABLED = false

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const isTextInput = (el: HTMLElement | null) => {
      if (!el) return false
      if (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') {
        return true
      }
      if (el.tagName === 'INPUT') {
        const type = (el as HTMLInputElement).type || 'text'
        const nonKeyboardTypes = ['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'reset', 'submit']
        return !nonKeyboardTypes.includes(type.toLowerCase())
      }
      return false
    }

    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const THRESHOLD = 150

    const updateVisibility = () => {
      const activeEl = document.activeElement as HTMLElement
      const isFocused = isTextInput(activeEl)
      
      let isShrunk = false
      if (vv) {
        const heightDiff = window.innerHeight - vv.height
        isShrunk = heightDiff > THRESHOLD || (window.screen && (window.screen.height - vv.height > THRESHOLD * 1.5))
      }
      
      setVisible(isFocused || isShrunk)
    }

    // Initialize state
    updateVisibility()

    if (vv) {
      vv.addEventListener('resize', updateVisibility)
    }

    const handleFocusIn = () => {
      setTimeout(updateVisibility, 0)
    }
    const handleFocusOut = () => {
      setTimeout(updateVisibility, 0)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateVisibility)
      }
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  return visible
}

// ── Compact countdown timer for closed market ──
function CountdownTimer({ targetDate, theme = 'light' }: { targetDate: Date, theme?: 'light' | 'dark' }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const diff = Math.max(0, targetDate.getTime() - Date.now())
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff / 3600000) % 24)
  const m = Math.floor((diff / 60000) % 60)
  const s = Math.floor((diff / 1000) % 60)
  const pad = (n: number) => String(n).padStart(2, '0')

  const isDark = theme === 'dark'
  const numColor = isDark ? '#4ade80' : '#16a34a' // neon green vs green
  const labelColor = isDark ? '#94a3b8' : '#9ca3af'
  const colonColor = isDark ? '#64748b' : '#d1d5db'

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {d > 0 && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: numColor, lineHeight: 1 }}>{d}</div>
          <div style={{ fontSize: 8, color: labelColor, fontWeight: 600, textTransform: 'uppercase' }}>day{d !== 1 ? 's' : ''}</div>
        </div>
      )}
      {d > 0 && <span style={{ color: colonColor, fontSize: 12, fontWeight: 700 }}>:</span>}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: numColor, lineHeight: 1 }}>{pad(h)}</div>
        <div style={{ fontSize: 8, color: labelColor, fontWeight: 600, textTransform: 'uppercase' }}>hrs</div>
      </div>
      <span style={{ color: colonColor, fontSize: 12, fontWeight: 700 }}>:</span>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: numColor, lineHeight: 1 }}>{pad(m)}</div>
        <div style={{ fontSize: 8, color: labelColor, fontWeight: 600, textTransform: 'uppercase' }}>min</div>
      </div>
      <span style={{ color: colonColor, fontSize: 12, fontWeight: 700 }}>:</span>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: numColor, lineHeight: 1 }}>{pad(s)}</div>
        <div style={{ fontSize: 8, color: labelColor, fontWeight: 600, textTransform: 'uppercase' }}>sec</div>
      </div>
    </div>
  )
}

interface BoothResult {
  booth_id: string
  owner_id: string
  booth_name: string
  description: string | null
  decorative_theme: string
  header_image_url: string | null
  offers_delivery: boolean
  offers_pickup: boolean
  delivery_radius_miles: number
  pickup_address: string | null
  delivery_windows: any[]
  pickup_windows: any[]
  distance_miles: number
  product_count: number
  matched_products: any[]
  seller_avatar_url: string | null
  seller_avg_rating: number | null
  seller_rating_count: number
  is_demo: boolean
}

const themeColors: Record<string, { border: string; gradient: string }> = {
  rustic:   { border: '#b45309', gradient: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
  tropical: { border: '#047857', gradient: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
  minimal:  { border: '#4b5563', gradient: 'linear-gradient(135deg, #f9fafb, #e5e7eb)' },
  floral:   { border: '#be185d', gradient: 'linear-gradient(135deg, #fce7f3, #fbcfe8)' },
  harvest:  { border: '#d97706', gradient: 'linear-gradient(135deg, #fffbeb, #fde68a)' },
  cottage:  { border: '#0369a1', gradient: 'linear-gradient(135deg, #e0f2fe, #bae6fd)' },
}

const categoryIcons: Record<string, string> = {
  produce: '🥬', baked: '🍞', preserved: '🫙', other: '📦',
  flowers: '💐', flower_arrangements: '💐', garden_equipment: '🧰',
  pots: '🪴', soil: '🌱', seeds: '🌰', eggs: '🥚', honey: '🍯',
}

const getSearchEmoji = (query: string) => {
  const q = query.toLowerCase()
  if (q.includes('tomato')) return '🍅'
  if (q.includes('apple')) return '🍎'
  if (q.includes('honey')) return '🍯'
  if (q.includes('egg')) return '🥚'
  if (q.includes('milk') || q.includes('dairy')) return '🥛'
  if (q.includes('orange') || q.includes('citrus')) return '🍊'
  if (q.includes('lemon')) return '🍋'
  if (q.includes('strawber')) return '🍓'
  if (q.includes('grape')) return '🍇'
  if (q.includes('melon') || q.includes('watermelon')) return '🍉'
  if (q.includes('carrot')) return '🥕'
  if (q.includes('corn')) return '🌽'
  if (q.includes('pepper') || q.includes('chili')) return '🌶️'
  if (q.includes('potato')) return '🥔'
  if (q.includes('onion')) return '🧅'
  if (q.includes('garlic')) return '🧄'
  if (q.includes('broccoli')) return '🥦'
  if (q.includes('mushroom')) return '🍄'
  if (q.includes('bread') || q.includes('sourdough')) return '🍞'
  if (q.includes('cheese')) return '🧀'
  if (q.includes('jam')) return '🫙'
  if (q.includes('flower') || q.includes('rose') || q.includes('tulip')) return '💐'
  if (q.includes('plant') || q.includes('seedling')) return '🪴'
  if (q.includes('sugar') || q.includes('cane') || q.includes('bamboo')) return '🎋'
  if (q.includes('herb') || q.includes('basil') || q.includes('mint') || q.includes('parsley')) return '🌿'
  if (q.includes('meat') || q.includes('beef') || q.includes('pork')) return '🥩'
  if (q.includes('chicken') || q.includes('poultry')) return '🍗'
  return '🌱'
}

function BrowseMarketPageInner() {
  const supabase = createClient()
  const { user } = useAuth()
  const keyboardOpen = useKeyboardVisible()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [showAppBanner, setShowAppBanner] = useState(false)
  const [isNativeApp, setIsNativeApp] = useState(false)
  const [deviceOS, setDeviceOS] = useState<'ios' | 'android' | 'desktop' | null>(null)


  // Debug helper to reset notification status from URL parameter (e.g. ?resetNotif=1)
  useEffect(() => {
    if (typeof window !== 'undefined' && searchParams.has('resetNotif')) {
      localStorage.removeItem('casagrown_notif_dismissed_at')
      localStorage.removeItem('casagrown_notif_opted_out')
      localStorage.removeItem('casagrown_native_push_registered')
      localStorage.removeItem('casagrown_native_push_token')
      const url = new URL(window.location.href)
      url.searchParams.delete('resetNotif')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams])

  // Detect environment and show top app download banner for mobile web
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isNative = (window as any).IS_NATIVE_APP === true || 
                       window.location.search.includes('native=true') ||
                       sessionStorage.getItem('casagrown_is_native') === 'true'
      
      if (isNative) {
        sessionStorage.setItem('casagrown_is_native', 'true')
      }

      setIsNativeApp(isNative)

      const ua = navigator.userAgent || navigator.vendor || (window as any).opera
      let os: 'ios' | 'android' | 'desktop' = 'desktop'
      if (/android/i.test(ua)) {
        os = 'android'
      } else if (/iPad|iPhone|iPod/i.test(ua) && !(window as any).MSStream) {
        os = 'ios'
      }
      setDeviceOS(os)

      const dismissed = localStorage.getItem('casagrown_app_banner_dismissed') === 'true'
      if (!isNative && !dismissed && (os === 'ios' || os === 'android')) {
        setShowAppBanner(true)
      } else {
        setShowAppBanner(false)
      }
    }
  }, [])


  const handleDismissAppBanner = () => {
    localStorage.setItem('casagrown_app_banner_dismissed', 'true')
    setShowAppBanner(false)
  }

  const renderAppBanner = () => {
    if (!showAppBanner || !deviceOS) return null

    const storeUrl = deviceOS === 'ios'
      ? 'https://apps.apple.com/app/id6774057094'
      : 'https://play.google.com/store/apps/details?id=com.casagrown.market'

    const badgeSrc = deviceOS === 'ios' ? '/app-store-badge.svg' : '/google-play-badge.svg'
    const altText = deviceOS === 'ios' ? 'Download on the App Store' : 'Get it on Google Play'

    return (
      <div className={styles.appBanner}>
        <button className={styles.appBannerClose} onClick={handleDismissAppBanner} aria-label="Close app banner">
          ×
        </button>
        <div className={styles.appBannerLogo}>
          <img src="/logo.png" alt="CasaGrown" />
        </div>
        <div className={styles.appBannerInfo}>
          <h4 className={styles.appBannerTitle}>CasaGrown</h4>
          <p className={styles.appBannerSubtitle}>Get our official app</p>
        </div>
        <a href={storeUrl} target="_blank" rel="noopener noreferrer" className={styles.appBannerBadge}>
          <img src={badgeSrc} alt={altText} className={styles.appBannerBadgeImg} />
        </a>
      </div>
    )
  }



  // Restore from localStorage if URL has no params
  const saved = typeof window !== 'undefined' && !searchParams.has('lat')
    ? new URLSearchParams(localStorage.getItem('market_search') || '') : null

  const [address, setAddress] = useState<AddressFields>(() => {
    const savedAddr = searchParams.get('addr') || saved?.get('addr') || ''
    if (!savedAddr) return EMPTY_ADDRESS
    // Parse legacy "street, city, state zip" from URL/localStorage
    const parts = savedAddr.split(',').map(s => s.trim())
    if (parts.length >= 3) {
      const stateZip = parts[parts.length - 1].split(/\s+/)
      return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: stateZip[0] || '', zip: stateZip.slice(1).join(' ') }
    }
    if (parts.length === 2) return { street: parts[0], city: parts[1], state: '', zip: '' }
    return { street: savedAddr, city: '', state: '', zip: '' }
  })
  const [lat, setLat] = useState<number | null>(searchParams.has('lat') ? parseFloat(searchParams.get('lat')!) : saved?.has('lat') ? parseFloat(saved.get('lat')!) : null)
  const [lng, setLng] = useState<number | null>(searchParams.has('lng') ? parseFloat(searchParams.get('lng')!) : saved?.has('lng') ? parseFloat(saved.get('lng')!) : null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [locationDenied, setLocationDenied] = useState(false)
  const [addressResolved, setAddressResolved] = useState(
    (searchParams.has('lat') && searchParams.has('lng')) ||
    ((saved?.has('lat') ?? false) && (saved?.has('lng') ?? false))
  )
  const [zipCode, setZipCode] = useState(searchParams.get('zip') || saved?.get('zip') || '')

  const [search, setSearch] = useState(searchParams.get('q') || saved?.get('q') || '')
  const [fulfillment, setFulfillment] = useState<'all' | 'delivery' | 'pickup'>((searchParams.get('ff') || saved?.get('ff') || 'all') as any)
  const [maxMiles, setMaxMiles] = useState(searchParams.has('mi') ? parseInt(searchParams.get('mi')!) : saved?.has('mi') ? parseInt(saved.get('mi')!) : 10)
  const [minPrice, setMinPrice] = useState(searchParams.get('pmin') || saved?.get('pmin') || '')
  const [maxPrice, setMaxPrice] = useState(searchParams.get('pmax') || saved?.get('pmax') || '')
  const [category, setCategory] = useState(searchParams.get('cat') || saved?.get('cat') || '')

  const [allowedCategories, setAllowedCategories] = useState<{ name: string }[]>([])
  const [booths, setBooths] = useState<BoothResult[]>([])
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [buyerStateCode, setBuyerStateCode] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  // External Fallback Results
  const [usdaMarkets, setUsdaMarkets] = useState<any[]>([])
  const [localFarms, setLocalFarms] = useState<any[]>([])
  const [ofnProducts, setOfnProducts] = useState<any[]>([])
  const [loadingExternal, setLoadingExternal] = useState(false)

  // Pagination state for infinite scroll
  const PAGE_SIZE = 20
  const [boothOffset, setBoothOffset] = useState(0)
  const [hasMoreBooths, setHasMoreBooths] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Product reminders (when market is closed)
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set())
  const [showDemoModal, setShowDemoModal] = useState(false)
  const [showGlobalShareModal, setShowGlobalShareModal] = useState(false)
  const { digest } = useCommunityDigest()
  const { showSuccess, showInfo } = useErrorToast()

  // Pioneer banner state
  const [communityMemberCount, setCommunityMemberCount] = useState<number | null>(null)
  const [showPioneerBanner, setShowPioneerBanner] = useState(true)
  const [userH3, setUserH3] = useState<string | null>(null)

  // Market hours status
  const { isOpen: marketIsOpen, isScheduleOpen, isGrandOpening, todaySchedule, nextOpenDate, loading: marketLoading } = useMarketStatus()

  // Sync state to URL and localStorage
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams()
    const addrStr = formatFullAddress(address)
    if (addrStr) params.set('addr', addrStr)
    if (lat) params.set('lat', lat.toFixed(4))
    if (lng) params.set('lng', lng.toFixed(4))
    if (search) params.set('q', search)
    if (fulfillment !== 'all') params.set('ff', fulfillment)
    if (fulfillment === 'pickup' && maxMiles !== 10) params.set('mi', maxMiles.toString())
    if (zipCode) params.set('zip', zipCode)
    if (minPrice) params.set('pmin', minPrice)
    if (maxPrice) params.set('pmax', maxPrice)
    if (category) params.set('cat', category)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/market?${qs}` : '/market')
    // Persist to localStorage so Browse tab restores last search
    try { localStorage.setItem('market_search', qs) } catch {}
  }, [address, lat, lng, search, fulfillment, maxMiles, minPrice, maxPrice, category, zipCode])

  useEffect(() => { if (addressResolved) syncUrl() }, [syncUrl, addressResolved])

  // Recovery: address is present but coordinates are missing/incomplete (e.g. corrupt localStorage).
  // Auto-geocode the address to restore lat/lng and unblock the search.
  useEffect(() => {
    const addrGeoStr = toGeocodingString(address)
    if (addressResolved || !addrGeoStr || (lat != null && lng != null)) return
    geocodeAddress(addrGeoStr).then(geo => {
      if (geo) {
        setLat(geo.lat); setLng(geo.lng)
        const zip = geo.zipCode || (geo.display?.match(/\b(\d{5})\b/) || [])[1] || (address.zip) || ''
        if (zip) setZipCode(zip)
        setAddressResolved(true)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Consolidated profile fetch — address resolution.
  // Guard against addressResolved prevents re-geocoding on Supabase token refresh.
  useEffect(() => {
    if (addressResolved) { setProfileLoading(false); return }
    if (searchParams.has('lat')) { setProfileLoading(false); return }
    if (!user) { setProfileLoading(false); return }

    supabase.from('profiles')
      .select('street_address, city, state_code, zip_code, home_community_h3_index')
      .eq('id', user.id).single()
      .then(async ({ data: profile, error }: { data: any; error: any }) => {
        if (error) { console.error('Profile fetch error:', error.message); setProfileLoading(false); return }
        // Address resolution (skip if already resolved from URL)
        if (!addressResolved && !searchParams.has('lat')) {
          if (profile?.state_code) setBuyerStateCode(profile.state_code)
          if (profile?.street_address) {
            const addr: AddressFields = {
              street: profile.street_address || '',
              city: profile.city || '',
              state: profile.state_code || '',
              zip: profile.zip_code || '',
            }
            setAddress(addr)
            if (profile.zip_code) setZipCode(profile.zip_code)
            const geo = await geocodeAddress(toGeocodingString(addr))
            if (geo) { setLat(geo.lat); setLng(geo.lng); setAddressResolved(true) }
          }
        } else if (profile?.state_code) {
          setBuyerStateCode(profile.state_code)
        }

        setProfileLoading(false)
      })
  }, [user, addressResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch allowed categories from DB when address resolves
  useEffect(() => {
    if (!addressResolved) return
    supabase.rpc('get_allowed_categories', { buyer_zip: zipCode || null })
      .then(({ data }: { data: any }) => { if (data) setAllowedCategories(data) })
  }, [addressResolved, zipCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Pioneer Banner Independently
  const pioneerFetchedRef = useRef(false)
  useEffect(() => {
    if (!user || pioneerFetchedRef.current) return
    pioneerFetchedRef.current = true
    
    supabase.from('profiles').select('home_community_h3_index')
      .eq('id', user.id).single()
      .then(({ data: profile }: { data: any }) => {
        if (!profile?.home_community_h3_index) return
        
        try {
          if (localStorage.getItem(`pioneer_banner_dismissed_${profile.home_community_h3_index}`)) {
            setShowPioneerBanner(false)
            return
          }
        } catch {}
        
        setUserH3(profile.home_community_h3_index)
        supabase.rpc('get_community_member_count', { target_h3: profile.home_community_h3_index })
          .then(({ data: count }: { data: any }) => {
            if (typeof count === 'number') setCommunityMemberCount(count)
          })
      })
  }, [user])

  // Pre-load demo booths for guest users who haven't entered an address yet.
  // Demo booths are synthetic — they don't depend on real coordinates.
  const demoFetchedRef = useRef(false)
  useEffect(() => {
    if (addressResolved || demoFetchedRef.current || profileLoading) return
    if (lat && lng) return // user already has coordinates
    demoFetchedRef.current = true

    // Use a default location (San Jose, CA) just to satisfy the RPC signature.
    // Only demo booths will be returned since there are no real booths at this coordinate.
    supabase.rpc('nearby_booths', {
      user_lat: 37.3382, user_lng: -121.8863,
      max_miles: 25,
      fulfillment_filter: 'all',
      product_search: null,
      min_price: null, max_price: null,
      category_filter: null,
      buyer_state_code: null,
      exclude_demos: false,
      p_limit: 12, p_offset: 0,
      buyer_zip: null,
    }).then(({ data }: { data: any }) => {
      if (data && Array.isArray(data)) {
        const demos = data.filter((b: BoothResult) => b.is_demo)
        if (demos.length > 0) setBooths(demos)
      }
    })
  }, [profileLoading, addressResolved, lat, lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search booths
  const searchBooths = useCallback(async (silent = false) => {
    if (!lat || !lng) return
    if (!silent) setLoading(true)

    // 2-hour Local Storage cache for Demo Booths (tied to the searched ZIP code)
    let cachedDemos: BoothResult[] | null = null
    const CACHE_KEY = 'demo_booths_cache'
    
    if (!silent) {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          // 2 hours = 7200000 ms
          if (Date.now() - parsed.timestamp < 7200000 && parsed.zipCode === zipCode) {
            cachedDemos = parsed.booths
          }
        }
      } catch {}
    }

    const shouldExcludeDemos = silent || !!cachedDemos

    const { data, error } = await supabase.rpc('nearby_booths', {
      user_lat: lat, user_lng: lng,
      max_miles: maxMiles,
      fulfillment_filter: fulfillment,
      product_search: search.trim() || null,
      min_price: minPrice ? parseFloat(minPrice) : null,
      max_price: maxPrice ? parseFloat(maxPrice) : null,
      category_filter: category || null,
      buyer_state_code: buyerStateCode,
      exclude_demos: shouldExcludeDemos,
      p_limit: PAGE_SIZE,
      p_offset: silent ? boothOffset : 0,
      buyer_zip: zipCode ? zipCode.substring(0, 5) : null,
    })
    if (error) {
      console.error('Search error:', error.message)
      // Auto-retry once after a short delay (handles transient API/network failures)
      if (!silent) {
        console.log('[Market] Retrying search in 2s...')
        await new Promise(r => setTimeout(r, 2000))
        const retry = await supabase.rpc('nearby_booths', {
          user_lat: lat, user_lng: lng, max_miles: maxMiles,
          fulfillment_filter: fulfillment, product_search: search.trim() || null,
          min_price: minPrice ? parseFloat(minPrice) : null,
          max_price: maxPrice ? parseFloat(maxPrice) : null,
          category_filter: category || null, buyer_state_code: buyerStateCode,
          exclude_demos: false, p_limit: PAGE_SIZE, p_offset: 0,
          buyer_zip: zipCode ? zipCode.substring(0, 5) : null,
        })
        if (!retry.error && Array.isArray(retry.data)) {
          setSearchError(null)
          setBooths(retry.data)
          setLoading(false)
          return
        }
        // Both attempts failed — show error to user
        setSearchError('Unable to load nearby listings. Please check your connection and try again.')
        setLoading(false)
        return
      }
    } else {
      setSearchError(null) // Clear any previous error on success
      // Only update state if results actually changed — avoids unnecessary re-renders
      // during background polling when nothing has changed on the market.
      setBooths(prev => {
        const next = Array.isArray(data) ? [...data] : []
        
        const realCount = next.length
        const TARGET_MIN = 12

        if (silent) {
          // Idle polling: Retain the demo booths we already had in React state
          // BUT only enough to pad the difference. If real booths take over, demos naturally fall away.
          if (realCount < TARGET_MIN) {
            const existingDemos = prev.filter(b => b.is_demo)
            next.push(...existingDemos.slice(0, TARGET_MIN - realCount))
          }
        } else if (cachedDemos) {
          // Active page load: Inject the 2-hour valid Local Storage cache
          // ONLY up to the remaining capacity we need to fill the screen
          if (realCount < TARGET_MIN) {
            let validDemos = cachedDemos.slice(0, TARGET_MIN - realCount)
            if (search.trim()) {
              const queryWords = search.toLowerCase().trim().split(/\s+/).filter((w: string) => w.length >= 2)
              if (queryWords.length > 0) {
                validDemos = validDemos.map((db: BoothResult) => {
                  const matchedProducts = (db.matched_products || []).filter((p: any) => {
                    const text = (p.name + ' ' + (p.description || '') + ' ' + (p.category || '')).toLowerCase()
                    return queryWords.every((w: string) => text.includes(w))
                  })
                  return { ...db, matched_products: matchedProducts, product_count: matchedProducts.length }
                }).filter((db: BoothResult) => db.product_count > 0)
              }
            }
            next.push(...validDemos)
          }
        } else {
          // Active page load (Cache Miss): We fetched fresh demos! Save them to the 2-hour cache.
          const freshDemos = next.filter(b => b.is_demo)
          if (freshDemos.length > 0) {
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                zipCode,
                booths: freshDemos
              }))
            } catch {}
          }
        }

        // Include sorted product IDs in the fingerprint so we only replace when
        // the actual product set changes, not just on stale RPC responses.
        // Round distance_miles to 2dp — PostGIS floats drift slightly between calls
        // (e.g. 2.345678 → 2.345679) which would cause the fingerprint to never match,
        // replacing the booth array every 2 minutes and causing visible UI flicker.
        const fingerprint = (arr: BoothResult[]) => Array.isArray(arr) ? JSON.stringify(arr.map(b => ({
          id: b.booth_id, pc: b.product_count,
          dist: Math.round(b.distance_miles * 100) / 100,
          pids: (b.matched_products || []).map((p: any) => p.id).sort().join(','),
        }))) : ''
        if (fingerprint(prev) !== fingerprint(next as BoothResult[])) {
          // Cache demo booth/product data so ProductDetailClient can render them
          try {
            const demoBooths = (next as BoothResult[]).filter(b => b.is_demo)
            for (const db of demoBooths) {
              sessionStorage.setItem(`demo_booth_${db.booth_id}`, JSON.stringify({
                id: db.booth_id, name: db.booth_name, owner_id: db.owner_id,
                description: db.description, decorative_theme: db.decorative_theme,
                header_image_url: db.header_image_url, offers_delivery: db.offers_delivery,
                offers_pickup: db.offers_pickup, delivery_radius_miles: db.delivery_radius_miles,
                pickup_address: db.pickup_address, is_demo: true,
                seller_avg_rating: db.seller_avg_rating, seller_rating_count: db.seller_rating_count,
              }))
              for (const p of (db.matched_products || [])) {
                sessionStorage.setItem(`demo_product_${p.id}`, JSON.stringify({
                  id: p.id, name: p.name, description: p.description,
                  price_usd: p.price_usd, unit: p.unit, photos: p.photo ? [p.photo] : [],
                  category: p.category, inventory: p.inventory || 10,
                  harvested_at: p.harvested_at, seller_id: db.owner_id, is_active: true,
                  is_demo: true, booth_id: db.booth_id,
                }))
              }
            }
          } catch {}
          return next
        }
        return prev
      })
    }
    if (!silent) {
      setLoading(false)
      // Reset pagination on fresh search
      setBoothOffset(0)
      const resultCount = Array.isArray(data) ? data.filter((b: BoothResult) => !b.is_demo).length : 0
      setHasMoreBooths(resultCount >= PAGE_SIZE)

      // Trigger USDA fallback — always run when we have coordinates.
      // zip is optional and used as a hint; lat/lng are the primary lookup keys.
      if (lat && lng) {
        const effectiveZip = zipCode || address.zip || ''
        setLoadingExternal(true)

        // 1. Run USDA (works with zip OR lat/lng)
        supabase.functions.invoke('usda-farmers-markets', {
          body: { zipcode: effectiveZip, lat, lng, radius: maxMiles }
        }).then(({ data: usdaData }: { data: any }) => {
          if (usdaData?.data && Array.isArray(usdaData.data)) {
            setUsdaMarkets(usdaData.data.slice(0, 5))
          }
          if (usdaData?.farms && Array.isArray(usdaData.farms)) {
            setLocalFarms(usdaData.farms.slice(0, 6))
          }
          setLoadingExternal(false)
        }).catch((e: any) => {
          console.warn('USDA search error:', e)
          setLoadingExternal(false)
        })

        // 2. Run OFN Fallback if enabled, query exists and native results are sparse
        const nativeCount = Array.isArray(data) ? data.reduce((acc: number, b: any) => acc + (b.matched_products?.length || 0), 0) : 0
        if (OFN_ENABLED && search.trim() && nativeCount < 4) {
          supabase.functions.invoke('ofn-product-search', {
            body: { query: search.trim(), zipcode: effectiveZip, lat, lng, radius: maxMiles }
          }).then(({ data: ofnData }: { data: any }) => {
            if (ofnData?.data && Array.isArray(ofnData.data)) {
              setOfnProducts(ofnData.data)
            } else {
              setOfnProducts([])
            }
          }).catch((e: any) => {
            console.warn('OFN search error:', e)
            setOfnProducts([])
          })
        } else {
          setOfnProducts([])
        }
      }
    }

    // Compute H3 zone IDs for the search area and cache for pulse polling
    if (lat && lng) {
      try {
        // H3 resolution 5 ≈ hex edge length ~8km. Ring size scales with search radius.
        const centerCell = latLngToCell(lat, lng, 5)
        const ringSize = Math.max(1, Math.ceil(maxMiles / 5)) // ~5 miles per ring at res 5
        const zoneIds = gridDisk(centerCell, ringSize)
        const pulseKey = `${lat.toFixed(4)},${lng.toFixed(4)},${maxMiles}`
        localStorage.setItem('market_zones', JSON.stringify(zoneIds))
        localStorage.setItem('market_pulse_key', pulseKey)
        // Don't reset pulse timestamp here — let the next pulse check detect changes naturally
      } catch (e) {
        console.warn('[ZonePulse] h3-js zone computation failed:', e)
      }
    }
  }, [lat, lng, fulfillment, maxMiles, search, minPrice, maxPrice, category, buyerStateCode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (lat && lng && addressResolved) searchBooths() }, [lat, lng, fulfillment, maxMiles, category, addressResolved, buyerStateCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (!lat || !lng || !addressResolved) return
    const t = setTimeout(searchBooths, 500)
    return () => clearTimeout(t)
  }, [search, minPrice, maxPrice]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load more booths (infinite scroll)
  const loadMoreBooths = useCallback(async () => {
    if (!lat || !lng || loadingMore || !hasMoreBooths) return
    setLoadingMore(true)
    const nextOffset = boothOffset + PAGE_SIZE
    const { data, error } = await supabase.rpc('nearby_booths', {
      user_lat: lat, user_lng: lng,
      max_miles: maxMiles,
      fulfillment_filter: fulfillment,
      product_search: search.trim() || null,
      min_price: minPrice ? parseFloat(minPrice) : null,
      max_price: maxPrice ? parseFloat(maxPrice) : null,
      category_filter: category || null,
      buyer_state_code: buyerStateCode,
      exclude_demos: true, // no demos on subsequent pages
      p_limit: PAGE_SIZE,
      p_offset: nextOffset,
      buyer_zip: zipCode ? zipCode.substring(0, 5) : null,
    })
    if (!error && Array.isArray(data)) {
      const realBooths = data.filter((b: BoothResult) => !b.is_demo)
      if (realBooths.length > 0) {
        setBooths(prev => [...prev, ...realBooths])
        setBoothOffset(nextOffset)
      }
      setHasMoreBooths(realBooths.length >= PAGE_SIZE)
    }
    setLoadingMore(false)
  }, [lat, lng, loadingMore, hasMoreBooths, boothOffset, maxMiles, fulfillment, search, minPrice, maxPrice, category, buyerStateCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // IntersectionObserver for infinite scroll sentinel
  useEffect(() => {
    if (!sentinelRef.current || !hasMoreBooths) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMoreBooths() },
      { rootMargin: '200px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMoreBooths, loadMoreBooths])

  // ── Zone Pulse Polling ──
  // Instead of the old two-tier polling (30s light + 2min heavy), we check
  // a tiny zone_pulse table every 30s. Zone IDs are computed client-side
  // using h3-js from lat/lng + radius. If no zone has been updated since
  // the last check, we skip entirely. If a zone changed (seller edited a
  // product), we do a full searchBooths refresh.
  const searchBoothsRef = useRef(searchBooths)
  useEffect(() => { searchBoothsRef.current = searchBooths }, [searchBooths])

  useEffect(() => {
    if (!lat || !lng || !addressResolved) return

    // Invalidate cached zones if address/radius changed
    const currentKey = `${lat.toFixed(4)},${lng.toFixed(4)},${maxMiles}`
    const storedKey = localStorage.getItem('market_pulse_key')
    if (storedKey !== currentKey) {
      localStorage.removeItem('market_pulse')
      localStorage.removeItem('market_zones')
      localStorage.setItem('market_pulse_key', currentKey)
    }

    const checkPulse = async () => {
      try {
        const zonesJson = localStorage.getItem('market_zones')
        if (!zonesJson) return // zones not computed yet (first search still in progress)
        const zoneIds = JSON.parse(zonesJson) as string[]
        if (zoneIds.length === 0) return

        const { data, error } = await supabase.rpc('check_zone_pulse', { p_zone_ids: zoneIds })
        if (error) { console.warn('[ZonePulse] RPC error:', error.message); return }

        const pulse = String(data)
        const cachedPulse = localStorage.getItem('market_pulse')

        if (cachedPulse && pulse !== cachedPulse) {
          // Something changed in our zones — full refresh
          console.log('[ZonePulse] Change detected, refreshing market')
          searchBoothsRef.current(true)
        }
        localStorage.setItem('market_pulse', pulse)
      } catch (e) {
        console.warn('[ZonePulse] Check failed:', e)
      }
    }

    const interval = setInterval(checkPulse, 30_000)
    const onFocus = () => { if (!document.hidden) checkPulse() }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [lat, lng, maxMiles, addressResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddressSubmit = async () => {
    const geoStr = toGeocodingString(address)
    if (!geoStr) return
    setLocationLoading(true); setLocationError('')
    try {
      const geo = await geocodeAddress(geoStr)
      if (geo) {
        setLat(geo.lat); setLng(geo.lng)
        // Extract zip code from geocoding explicitly or fallback to display name regex
        const explicitZip = geo.zipCode
        const zipMatch = geo.display?.match(/\b(\d{5})\b/)
        const finalZip = explicitZip || (zipMatch ? zipMatch[1] : undefined)
        if (finalZip) {
          setZipCode(finalZip)
        } else {
          // If we can't find a zip code, the external search (like USDA) might fail to find anything.
          console.warn('Could not determine zip code for address')
        }
        setAddressResolved(true)
      } else {
        setLocationError('Could not find that address. Please include city and state.')
      }
    } catch (err) {
      if (err instanceof GeocodeRateLimitError) {
        setLocationError('Location service is temporarily busy. Please wait a moment and try again.')
      } else {
        setLocationError('Could not find that address. Please include city and state.')
      }
    }
    setLocationLoading(false)
  }

  const handleUseMyLocation = () => {
    setLocationLoading(true); setLocationError(''); setLocationDenied(false)

    // ── Native app with location bridge: use expo-location via NativeBridge ──
    // Only use native bridge if wrapper advertises support (NATIVE_SUPPORTS_LOCATION flag).
    // Old builds (e.g. Android in review) will fall through to navigator.geolocation.
    if (NativeBridge.supportsLocation) {
      NativeBridge.requestLocation()
        .then(async ({ lat: nLat, lng: nLng }: { lat: number; lng: number }) => {
          setLat(nLat); setLng(nLng)
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${nLat}&lon=${nLng}`)
            const data = await res.json()
            if (data?.address) {
              const street = [data.address.house_number, data.address.road].filter(Boolean).join(' ')
              const city = data.address.city || data.address.town || data.address.suburb || data.address.village
              const stateMap: Record<string, string> = {
                'California': 'CA', 'Florida': 'FL', 'New York': 'NY', 'Texas': 'TX',
                'Oklahoma': 'OK', 'Arizona': 'AZ', 'Oregon': 'OR', 'Washington': 'WA',
              }
              const sc = stateMap[data.address.state] || data.address['ISO3166-2-lvl4']?.split('-')[1] || data.address.state
              setAddress({ street: street || '', city: city || '', state: sc || '', zip: data.address.postcode || '' })
              if (data.address.postcode) setZipCode(data.address.postcode)
              if (sc) setBuyerStateCode(sc)
            }
          } catch { /* ignore reverse geocode failure */ }
          setAddressResolved(true); setLocationLoading(false)
        })
        .catch((err: any) => {
          const msg = err?.message || ''
          if (msg === 'DENIED') {
            setLocationError('Location access denied.')
            setLocationDenied(true)
          } else {
            setLocationError('Could not get location. Please type your address.')
          }
          setLocationLoading(false)
        })
      return
    }

    // ── Web browser: use navigator.geolocation ──
    if (!('geolocation' in navigator)) { setLocationLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude); setLng(pos.coords.longitude)
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          const data = await res.json()
          if (data?.address) {
            const street = [data.address.house_number, data.address.road].filter(Boolean).join(' ')
            const city = data.address.city || data.address.town || data.address.suburb || data.address.village
            const stateMap: Record<string, string> = {
              'California': 'CA', 'Florida': 'FL', 'New York': 'NY', 'Texas': 'TX',
              'Oklahoma': 'OK', 'Arizona': 'AZ', 'Oregon': 'OR', 'Washington': 'WA',
            }
            const sc = stateMap[data.address.state] || data.address['ISO3166-2-lvl4']?.split('-')[1] || data.address.state
            const parts = [street, city, sc, data.address.postcode].filter(Boolean)
            setAddress({ street: street || '', city: city || '', state: sc || '', zip: data.address.postcode || '' })
            if (data.address.postcode) setZipCode(data.address.postcode)
            if (sc) setBuyerStateCode(sc)
          }
        } catch { /* ignore */ }
        setAddressResolved(true); setLocationLoading(false)
      },
      () => { setLocationError('Location access denied.'); setLocationLoading(false); setLocationDenied(true) },
      { timeout: 10000 }
    )
  }

  const handleChangeAddress = () => {
    setAddressResolved(false); setBooths([]); demoFetchedRef.current = false
  }

  // Load existing product reminders
  useEffect(() => {
    if (!user) return
    // ---- DEBUGGING LOGS ----
    console.log('[DEBUG] Market page render state:', { 
      showPioneerBanner, 
      communityMemberCount, 
      userH3, 
      marketIsOpen, 
      isLoaded: !profileLoading,
      addressResolved
    })

    supabase.from('product_reminders').select('product_id').eq('user_id', user.id)
      .then(({ data }: { data: any }) => {
        if (data) setSavedProductIds(new Set(data.map((r: any) => r.product_id)))
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProductReminder = async (productId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { router.push(`/login?redirect=/market`); return }
    // Gate behind profile completion
    const supabaseClient = createClient()
    const { data: profile } = await supabaseClient.from('profiles').select('profile_completed_at').eq('id', user.id).single()
    if (!profile?.profile_completed_at) { router.push('/profile-setup'); return }
    const isSaved = savedProductIds.has(productId)
    if (isSaved) {
      await supabase.from('product_reminders').delete().eq('user_id', user.id).eq('product_id', productId)
      setSavedProductIds(prev => { const next = new Set(prev); next.delete(productId); return next })
      showInfo('Reminder removed')
    } else {
      await supabase.from('product_reminders').upsert({ user_id: user.id, product_id: productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true })

      setSavedProductIds(prev => new Set(prev).add(productId))
      showSuccess('🔔 Saved! We\'ll notify you when market opens')
    }
  }

  const isSearching = !!search.trim()
  const totalProducts = booths.reduce((sum, b) => sum + (b.matched_products?.length || 0), 0)

  // Pioneer Banner Rendering (Profile Context, Global Overlay)
  const renderPioneerBanner = () => {
    if (!showPioneerBanner || communityMemberCount === null || communityMemberCount > 20 || !userH3) return null;
    return (
      <div style={{ position: 'relative', zIndex: 100 }}>
        <PioneerBanner
          memberCount={communityMemberCount}
          communityH3={userH3}
          onDismiss={() => {
            setShowPioneerBanner(false)
            try { localStorage.setItem(`pioneer_banner_dismissed_${userH3}`, '1') } catch {}
          }}
        />
        <div style={{ height: 140 }} />
      </div>
    )
  }

  // ── STATE 1: Loading profile or market status ──
  if (profileLoading || marketLoading) {
    return (
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  // ── STATE 2: Need address (only when market is open) ──
  if (!addressResolved && marketIsOpen) {
    return (
      <>
        {renderAppBanner()}
        {renderPioneerBanner()}
        <div className="container">
          {/* Market Days soft banner — consistent with STATE 3 */}
          {!isScheduleOpen && !isGrandOpening && nextOpenDate && (
            <div style={{ padding: '16px 0 24px' }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', 
                border: '1px solid #3730a3',
                borderRadius: 24, padding: '32px 24px', marginBottom: 24,
                boxShadow: '0 8px 32px rgba(30, 27, 75, 0.4)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 48, marginBottom: -8, animation: 'pulse 2s infinite' }}>🌙</div>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: '#e0e7ff', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
                    {nextOpenDate 
                      ? `Next Market Day is ${nextOpenDate.toLocaleDateString('en-US', { weekday: 'long' })}` 
                      : 'Market Days Bring the Most Variety'}
                  </h2>
                  <p style={{ fontSize: 15, color: '#c7d2fe', margin: '0 auto', maxWidth: 600, lineHeight: 1.5 }}>
                    You can still browse and purchase from individual growers anytime! However, Market days result in more variety and more chances of finding what you want.
                    <br /><br />
                    While you wait for the market to open, head over to the Community to share gardening tips, ask questions, and connect with your neighbors!
                    {nextOpenDate && (
                      <>
                        <br /><br />
                        Do visit us on our next Market day on {nextOpenDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at {todaySchedule?.open_time || '8:00 AM'}.
                      </>
                    )}
                  </p>
                </div>
                
                {nextOpenDate && (
                  <div style={{ margin: '8px 0', transform: 'scale(1.15)', transformOrigin: 'center' }}>
                    <CountdownTimer targetDate={nextOpenDate} theme="dark" />
                  </div>
                )}

                {/* Action buttons row */}
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap',
                  marginTop: 8, width: '100%',
                }}>
                  <button onClick={() => router.push('/community')} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 18px', borderRadius: 999,
                    background: '#4f46e5', color: '#fff', border: '1px solid #6366f1',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                  }}>
                    👥 Visit Community
                  </button>
                  <button onClick={() => setShowGlobalShareModal(true)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 18px', borderRadius: 999,
                    background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff',
                    fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(22,163,74,0.3)', transition: 'transform 0.1s ease',
                  }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}>
                    📣 Invite Neighbors
                  </button>
                  <button onClick={() => {
                    if (!user) { router.push('/login'); return }
                    if ('Notification' in window && Notification.permission !== 'granted') {
                      Notification.requestPermission().then(p => {
                        if (p === 'granted') showSuccess('🔔 You\'ll be notified when the market opens!')
                        else showInfo('Please enable notifications in your browser settings.')
                      })
                    } else {
                      showSuccess('🔔 You\'ll be notified when the market opens!')
                    }
                  }} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 18px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.1)', color: '#e0e7ff', border: '1px solid rgba(255,255,255,0.2)',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    backdropFilter: 'blur(4px)'
                  }}>
                    🔔 Set Reminder
                  </button>
                  <button onClick={() => resetTour()} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 18px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.1)', color: '#e0e7ff', border: '1px solid rgba(255,255,255,0.2)',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    backdropFilter: 'blur(4px)'
                  }}>
                    🔄 Guided Tour
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.addressPrompt}>
          <h2 className={styles.promptTitle}>Where should we look?</h2>
          <p className={styles.promptText}>Tell us where you are and we'll show you fresh produce available for delivery or pickup nearby.</p>

          <div className={styles.addressForm}>
            <AddressInput
              value={address}
              onChange={(val: AddressFields) => setAddress(val)}
              placeholderStreet="e.g. 123 Main St"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleAddressSubmit}
                disabled={locationLoading || !toGeocodingString(address)} style={{ flex: 1 }}>
                {locationLoading ? 'Finding...' : 'Find Produce'}
              </button>
            </div>
            <div className={styles.geoRow}>
              <button className={styles.geoLink} onClick={handleUseMyLocation} disabled={locationLoading}>
                📍 Use My Location
              </button>
            </div>
          </div>
          {locationError && <p className="form-error" style={{ marginTop: 8 }}>{locationError}</p>}
          {locationDenied && (
            <div style={{ marginTop: 8, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.5, fontWeight: 600 }}>
                📍 Location access was denied
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#78716c', lineHeight: 1.5 }}>
                You can type your address above, or grant location permission and try again.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setLocationDenied(false); handleUseMyLocation() }}
                  style={{
                    padding: '8px 16px', borderRadius: 999,
                    background: '#16a34a', color: '#fff', border: 'none',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  📍 Try Again
                </button>
                {NativeBridge.isNative && (
                  <button
                    onClick={() => NativeBridge.openAppSettings()}
                    style={{
                      padding: '8px 16px', borderRadius: 999,
                      background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    ⚙️ Open Settings
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Vertically stacked FABs — outside container so position:fixed works in all states */}
      {!keyboardOpen && (
        <>
          <Link
            href="/create-listing"
            id="sell-fab"
            style={{
              position: 'fixed', bottom: 80, right: 24,
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
              color: '#fff', borderRadius: 28, padding: '14px 24px',
              fontSize: 15, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 6px 20px rgba(22, 163, 74, 0.4)',
              zIndex: 100, transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
          >
            {marketIsOpen ? '🌱 Sell Something' : '🌱 List for Next Market'}
          </Link>
          <GrowBotFAB />
        </>
      )}
      </>
    )
  }

  // ── STATE 3: Address resolved — show results ──
  const demoBooths = booths.filter(b => b.is_demo)

  return (
    <>
      {renderAppBanner()}
      {renderPioneerBanner()}
      <div className="container">
        {!isScheduleOpen && isGrandOpening && (
          <div style={{ padding: '16px 0 24px' }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              background: 'linear-gradient(135deg, #a16207 0%, #ca8a04 100%)', 
              border: '1px solid #facc15',
              borderRadius: 24, padding: '32px 24px', marginBottom: 24,
              boxShadow: '0 8px 32px rgba(161, 98, 7, 0.4)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 48, marginBottom: -8, animation: 'bounce 2s infinite' }}>🎉</div>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fefce8', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
                  CasaGrown Grand Opening!
                </h2>
                <p style={{ fontSize: 15, color: '#fef08a', margin: '0 auto', maxWidth: 600, lineHeight: 1.5 }}>
                  The wait is almost over! We are officially opening our doors on {nextOpenDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at {todaySchedule?.open_time || '8:00 AM'}.
                  Get ready for the freshest produce straight from your neighbors' backyards!
                  <br /><br />
                  While you wait, head over to the Community to share gardening tips, ask questions, and connect with your neighbors!
                </p>
              </div>
              
              {nextOpenDate && (
                <div style={{ margin: '8px 0', transform: 'scale(1.15)', transformOrigin: 'center' }}>
                  <CountdownTimer targetDate={nextOpenDate} theme="dark" />
                </div>
              )}

              {/* Action buttons row */}
              <div style={{
                display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap',
                marginTop: 8, width: '100%',
              }}>
                <button onClick={() => router.push('/community')} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', borderRadius: 999,
                  background: '#fefce8', color: '#a16207',
                  fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(254, 252, 232, 0.4)', transition: 'transform 0.1s ease',
                }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}>
                  👥 Visit Community
                </button>
                <button onClick={() => setShowGlobalShareModal(true)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.15)', color: '#fefce8', border: '1px solid rgba(255,255,255,0.3)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(4px)'
                }}>
                  📣 Invite Neighbors
                </button>
                <button onClick={() => {
                  if (!user) { router.push('/login'); return }
                  if ('Notification' in window && Notification.permission !== 'granted') {
                    Notification.requestPermission().then(p => {
                      if (p === 'granted') showSuccess('🔔 You\'ll be notified when the market opens!')
                      else showInfo('Please enable notifications in your browser settings.')
                    })
                  } else {
                    showSuccess('🔔 You\'ll be notified when the market opens!')
                  }
                }} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.15)', color: '#fefce8', border: '1px solid rgba(255,255,255,0.3)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(4px)'
                }}>
                  🔔 Set Reminder
                </button>
                <button onClick={() => resetTour()} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.15)', color: '#fefce8', border: '1px solid rgba(255,255,255,0.3)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(4px)'
                }}>
                  🔄 Guided Tour
                </button>
              </div>
            </div>
          </div>
        )}

        {!isScheduleOpen && !isGrandOpening && nextOpenDate && (
        <div style={{ padding: '16px 0 24px' }}>
          {/* Large Closed Market Banner */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', 
            border: '1px solid #3730a3',
            borderRadius: 24, padding: '32px 24px', marginBottom: 24,
            boxShadow: '0 8px 32px rgba(30, 27, 75, 0.4)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: -8, animation: 'pulse 2s infinite' }}>🌙</div>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#e0e7ff', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
                {nextOpenDate 
                  ? `Next Market Day is ${nextOpenDate.toLocaleDateString('en-US', { weekday: 'long' })}` 
                  : 'Market Days Bring the Most Variety'}
              </h2>
              <p style={{ fontSize: 15, color: '#c7d2fe', margin: '0 auto', maxWidth: 600, lineHeight: 1.5 }}>
                You can still browse and purchase from individual growers anytime! However, Market days result in more variety and more chances of finding what you want.
                <br /><br />
                While you wait for the market to open, head over to the Community to share gardening tips, ask questions, and connect with your neighbors!
                {nextOpenDate && (
                  <>
                    <br /><br />
                    Do visit us on our next Market day on {nextOpenDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at {todaySchedule?.open_time || '8:00 AM'}.
                  </>
                )}
              </p>
            </div>
            
            {nextOpenDate && (
              <div style={{ margin: '8px 0', transform: 'scale(1.15)', transformOrigin: 'center' }}>
                <CountdownTimer targetDate={nextOpenDate} theme="dark" />
              </div>
            )}

            {/* Action buttons row */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap',
              marginTop: 8, width: '100%',
            }}>
              <button onClick={() => router.push('/community')} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 999,
                background: '#4f46e5', color: '#fff', border: '1px solid #6366f1',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
              }}>
                👥 Visit Community
              </button>
              <button onClick={() => setShowGlobalShareModal(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 999,
                background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff',
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(22,163,74,0.3)', transition: 'transform 0.1s ease',
              }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}>
                📣 Invite Neighbors
              </button>
              <button onClick={() => {
                if (!user) { router.push('/login'); return }
                if ('Notification' in window && Notification.permission !== 'granted') {
                  Notification.requestPermission().then(p => {
                    if (p === 'granted') showSuccess('🔔 You\'ll be notified when the market opens!')
                    else showInfo('Please enable notifications in your browser settings.')
                  })
                } else {
                  showSuccess('🔔 You\'ll be notified when the market opens!')
                }
              }} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 999,
                background: 'rgba(255,255,255,0.1)', color: '#e0e7ff', border: '1px solid rgba(255,255,255,0.2)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                backdropFilter: 'blur(4px)'
              }}>
                🔔 Set Reminder
              </button>
              <button onClick={() => resetTour()} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 999,
                background: 'rgba(255,255,255,0.1)', color: '#e0e7ff', border: '1px solid rgba(255,255,255,0.2)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                backdropFilter: 'blur(4px)'
              }}>
                🔄 Guided Tour
              </button>
            </div>
          </div>
          {/* Demo products header */}
          {demoBooths.length > 0 && (
            <>
              <h2 style={{
                fontSize: 16, fontWeight: 800, color: 'var(--gray-800, #1f2937)',
                marginBottom: 4, letterSpacing: '-0.02em',
              }}>
                🛒 Explore the Market
              </h2>
              <p style={{
                fontSize: 12, color: 'var(--gray-500, #6b7280)', lineHeight: 1.4, margin: 0,
              }}>
                Browse demo listings to see how the market works
              </p>
            </>
          )}
        </div>
      )}

      {/* Address bar + change (always visible) */}
      <div className={styles.addressBar}>
        <span className={styles.addressLabel}>📍 {formatFullAddress(address) || 'Your location'}</span>
        <button className="btn btn-xs btn-ghost" onClick={handleChangeAddress}>Change</button>
      </div>

      {/* Search + Filters (always visible) */}
      <div className={styles.searchSection}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Search products... (tomatoes, basil, honey)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchBooths(true); } }}
          />
          <button className="btn btn-primary" onClick={() => searchBooths(true)}>
            Search
          </button>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.pills}>
            {(['all', 'delivery', 'pickup'] as const).map(f => (
              <button key={f}
                className={`${styles.pill} ${fulfillment === f ? styles.pillActive : ''}`}
                onClick={() => setFulfillment(f)}>
                {f === 'all' ? 'All' : f === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
              </button>
            ))}
          </div>
          <div className={styles.rangeWrap}>
            <span className={styles.rangeLabel}>Within {maxMiles} mi</span>
            <input type="range" min={1} max={25} value={maxMiles}
              onChange={e => setMaxMiles(parseInt(e.target.value))} className={styles.slider} />
          </div>
          <select className={styles.categorySelect} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {allowedCategories.map(c => (
              <option key={c.name} value={c.name}>
                {c.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
          <div className={styles.priceWrap}>
            <span className={styles.priceLabel}>Price:</span>
            <input className={styles.priceInput} type="number" placeholder="Min" min="0" step="0.50"
              value={minPrice} onChange={e => setMinPrice(e.target.value)} />
            <span style={{ color: 'var(--gray-400)' }}>–</span>
            <input className={styles.priceInput} type="number" placeholder="Max" min="0" step="0.50"
              value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Status (always visible) */}
      {!loading && booths.length > 0 && (() => {
        const realCount = booths.filter(b => !b.is_demo).length
        const demoCount = booths.filter(b => b.is_demo).length
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
            <p className={styles.statusText} style={{ marginBottom: 0 }}>
              {isSearching
                ? `${totalProducts} result${totalProducts !== 1 ? 's' : ''} for "${search}" across ${booths.length} booth${booths.length !== 1 ? 's' : ''}`
                : demoCount > 0
                  ? `${realCount} booth${realCount !== 1 ? 's' : ''} near you + ${demoCount} demo`
                  : `${booths.length} booth${booths.length !== 1 ? 's' : ''} near you`}
            </p>

          </div>
        )
      })()}

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '20vh' }}>
          <LoadingSpinner />
        </div>
      ) : booths.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: isSearching && !searchError ? 0 : '24px 20px', textAlign: 'center'
        }}>
          {searchError ? (
            /* ── Error state: show retry button instead of misleading "Invite" CTA ── */
            <div style={{
              position: 'relative', overflow: 'hidden', padding: '32px 24px', borderRadius: 24,
              background: 'linear-gradient(145deg, #ffffff, #fffbeb)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
              width: '100%', maxWidth: 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#fef3c7', color: '#d97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, marginBottom: 16, boxShadow: '0 4px 12px rgba(217,119,6,0.15)'
              }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 19, color: '#1f2937', fontWeight: 800, letterSpacing: '-0.4px' }}>
                Something went wrong
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: 15, color: '#4b5563', lineHeight: 1.5, maxWidth: 360 }}>
                {searchError}
              </p>
              <button
                onClick={() => { setSearchError(null); searchBooths() }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: 999,
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff',
                  fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(245,158,11,0.3)', transition: 'transform 0.2s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
              >
                🔄 Try Again
              </button>
            </div>
          ) : isSearching ? null : (
            /* ── Genuine empty state: no booths found, invite neighbors ── */
            <div style={{
              position: 'relative', overflow: 'hidden', padding: '32px 24px', borderRadius: 24,
              background: 'linear-gradient(145deg, #ffffff, #f0fdf4)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
              width: '100%', maxWidth: 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{
                position: 'absolute', top: -40, right: -30, opacity: 0.05,
                fontSize: 160, transform: 'rotate(15deg)', pointerEvents: 'none'
              }}>🌱</div>

              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#dcfce7', color: '#16a34a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, marginBottom: 16, boxShadow: '0 4px 12px rgba(22,163,74,0.15)'
              }}>🌱</div>

              <h3 style={{ margin: '0 0 8px', fontSize: 19, color: '#1f2937', fontWeight: 800, letterSpacing: '-0.4px', position: 'relative', zIndex: 1 }}>
                Everything is better with friends
              </h3>

              <p style={{ margin: '0 0 24px', fontSize: 15, color: '#4b5563', lineHeight: 1.5, position: 'relative', zIndex: 1, maxWidth: 360 }}>
                More neighbors mean more fresh food. Invite your neighbors to start building your local community!
              </p>

              <button
                onClick={() => setShowGlobalShareModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: 999,
                  background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff',
                  fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(22,163,74,0.3)', transition: 'transform 0.2s ease',
                  position: 'relative', zIndex: 1
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
              >
                🚀 Invite Neighbors
              </button>
            </div>
          )}
        </div>
      ) : (() => {
        const realBooths = booths.filter(b => !b.is_demo)
        const demoBoothsOnly = booths.filter(b => b.is_demo)
        // Demos now shown exclusively after USDA results (in the <3 real booth fallback section below)
        const showDemos = false

        const renderBoothCard = (booth: BoothResult) => {
          const theme = themeColors[booth.decorative_theme] || themeColors.minimal
          const products = booth.matched_products || []
          return (
            <div key={booth.booth_id} className="card">
              <Link href={`/market/booth/${booth.booth_id}`} className={styles.cardHeaderLink}>
                <div className={styles.cardHeader} style={{
                  background: booth.header_image_url ? `url(${booth.header_image_url}) center/cover` : theme.gradient,
                  borderBottom: `3px solid ${theme.border}`,
                }}>
                  {booth.header_image_url && <div className={styles.headerOverlay} />}
                  <div className={styles.headerContent}>
                    <h3 className={styles.cardTitle} style={{ color: booth.header_image_url ? '#fff' : theme.border }}>
                      {booth.booth_name}
                    </h3>
                    <div className={styles.cardMeta}>
                      {booth.is_demo && (
                        <span className="badge" style={{ fontSize: 10, background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>🌿 Demo</span>
                      )}
                      {booth.owner_id === user?.id ? (
                        <span className="badge" style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>Your Booth</span>
                      ) : (
                        <span className="badge badge-green" style={{ fontSize: 11 }}>{booth.distance_miles} mi</span>
                      )}
                      <span style={{ color: 'var(--gray-400)' }}>·</span>
                      <span>{booth.product_count} items</span>
                    </div>
                  </div>
                  <div className={styles.sellerBadge}>
                    <div className={styles.sellerAvatar}>
                      {booth.seller_avatar_url
                        ? <img src={booth.seller_avatar_url} alt="" />
                        : <span>{booth.booth_name.charAt(0)}</span>
                      }
                    </div>
                    {booth.seller_avg_rating && booth.seller_rating_count >= 5 ? (
                      <span className={styles.sellerRating}>⭐ {booth.seller_avg_rating}</span>
                    ) : !booth.is_demo && (
                      <span className={styles.sellerRating} style={{ fontSize: 10, color: 'var(--gray-400)' }}>🆕 New Seller</span>
                    )}
                  </div>
                </div>
              </Link>
              <div className={styles.cardBody}>
                {booth.description && <p className={styles.cardDesc}>{booth.is_demo ? `${booth.description} Demo listing — viewing only.` : booth.description}</p>}
                <div className={styles.tagRow}>
                  {booth.offers_delivery && (
                    <span className="badge badge-green">🚗 Delivers {booth.delivery_radius_miles}mi</span>
                  )}
                  {booth.offers_pickup && !booth.is_demo && (
                    <span className="badge badge-blue">📍 Pickup</span>
                  )}
                </div>
                {products.length > 0 && (
                  <div className={styles.productList}>
                    {products.slice(0, isSearching ? 6 : 4).map((p: any) => (
                      <div key={p.id} style={{ position: 'relative' }}>
                        <Link href={`/market/booth/${booth.booth_id}/product/${p.id}`} className={styles.productCard}>
                          <div className={styles.productThumb}>
                            {p.photo ? <img src={p.photo} alt={p.name} /> : <span>{categoryIcons[p.category] || '📦'}</span>}
                          </div>
                          <div className={styles.productInfo}>
                            <span className={styles.productName}>{p.name}</span>
                            <div className={styles.productMeta}>
                              <span className={styles.productPrice}>{p.price_usd === 0 ? <span style={{ color: '#16a34a', fontWeight: 'bold' }}>Free</span> : <>{formatUsd(p.price_usd)}<span className={styles.unit}>/{p.unit}</span></>}</span>
                              <span className={styles.qty}>{p.inventory > 0 ? `${p.inventory} ${p.unit === 'dozen' ? p.unit : p.unit === 'box' && p.inventory !== 1 ? 'boxes' : p.unit === 'bag' && p.inventory !== 1 ? 'bags' : p.unit !== 'piece' && p.unit !== 'each' ? p.unit : p.unit === 'each' ? 'each' : ''} avail`.replace('  ', ' ') : 'Sold out'}</span>
                            </div>
                          </div>
                        </Link>
                        {!marketIsOpen && !booth.is_demo && (
                          <button
                            onClick={(e) => toggleProductReminder(p.id, e)}
                            title={savedProductIds.has(p.id) ? 'Remove reminder' : 'Remind me when market opens'}
                            className={styles.remindBtn}
                            style={{
                              position: 'absolute', top: 4, right: 4,
                              background: savedProductIds.has(p.id) ? 'var(--green-100, #dcfce7)' : 'rgba(255,255,255,0.9)',
                              border: savedProductIds.has(p.id) ? '1px solid var(--green-300, #86efac)' : '1px solid var(--gray-200, #e5e7eb)',
                              borderRadius: 20, padding: '2px 8px', fontSize: 11,
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                              color: savedProductIds.has(p.id) ? 'var(--green-700, #15803d)' : 'var(--gray-600)',
                              zIndex: 2, transition: 'all 0.2s',
                            }}
                          >
                            🔔 {savedProductIds.has(p.id) ? 'Saved' : 'Remind Me'}
                          </button>
                        )}
                      </div>
                    ))}
                    {products.length > (isSearching ? 6 : 4) && (
                      <Link href={`/market/booth/${booth.booth_id}`} className={styles.moreCard}>
                        +{products.length - (isSearching ? 6 : 4)}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        }

        return (
          <>
            {/* ── 1. Real booths ── */}
            {realBooths.length > 0 && (
              <div className={styles.boothGrid}>
                {realBooths.map(renderBoothCard)}
                {/* Infinite scroll sentinel */}
                {hasMoreBooths && !loading && (
                  <div ref={sentinelRef} style={{ padding: 20, textAlign: 'center' }}>
                    {loadingMore && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--gray-500)', fontSize: 14 }}>
                        <LoadingSpinner /> Loading more booths…
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 2. USDA Farmers Markets (full-width, below real booths) ── */}
            {!hasMoreBooths && !loading && (
              <>
                {loadingExternal && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                    <LoadingSpinner />
                  </div>
                )}
              </>
            )}

            {/* ── 3. Demo booths — only when no real results AND no USDA ── */}
            {showDemos && demoBoothsOnly.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '10px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 }}>
                  <span style={{ fontSize: 18 }}>🌿</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#15803d' }}>Showing demo listings</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#16a34a' }}>No real sellers found yet. These demos show what CasaGrown looks like when neighbors start selling.</p>
                  </div>
                </div>
                <div className={styles.boothGrid}>
                  {demoBoothsOnly.map(renderBoothCard)}
                </div>
              </div>
            )}

            {/* End of results CTA — only show when results are complete and external fallback is NOT shown */}
            {!hasMoreBooths && !loading && booths.length > 0 && booths.filter(b => !b.is_demo).length >= 3 && (() => {
              const realCount = booths.filter(b => !b.is_demo).length
              return (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--gray-500)' }}>
                  <p style={{ marginBottom: 12, fontSize: 14 }}>
                    {realCount === 0 ? "You've reached the end of the demo booths." : "You've reached the end of the market."} Don't see what you're looking for?
                  </p>
                  <button
                    onClick={() => setShowGlobalShareModal(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 999, background: '#fff', border: '1px solid var(--gray-300)', color: 'var(--gray-700)', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  >
                    📣 Invite Neighbors
                  </button>
                </div>
              )
            })()}

          </>
        )
      })()}

      {/* USDA fallback — empty-shelf guard: show when real CasaGrown results are sparse */}
      {!loading && booths.filter(b => !b.is_demo).length < 3 && (
        <>
          {/* OFN Products Fallback — gated by OFN_ENABLED flag (requires partner API access) */}
          {OFN_ENABLED && !loadingExternal && ofnProducts.length > 0 && (() => {
            const rc = booths.filter(b => !b.is_demo).length
            return (
              <div style={{ marginTop: rc > 0 ? 48 : 24, paddingTop: rc > 0 ? 32 : 0, borderTop: rc > 0 ? '2px dashed #e5e7eb' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fcd34d', borderRadius: 16, padding: '16px 20px', marginBottom: 24 }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#b45309' }}>
                      External Network Notice
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
                      The items below are hosted on the Open Food Network. Transactions take place outside of CasaGrown and are not covered by our platform guarantees. Prices and availability are approximate.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', margin: 0, letterSpacing: '-0.02em' }}>🌐 Explore the Open Food Network</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
                  {ofnProducts.map((p, i) => (
                    <a key={i} href={p.external_shop_url} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                      <div style={{ height: 140, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 40 }}>{categoryIcons[p.category] || '📦'}</span>}
                      </div>
                      <div style={{ padding: 12 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.enterprise_name}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>~{p.price_usd ? formatUsd(p.price_usd) : 'See Pricing'}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>External</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Local Farms (On-Farm Markets + CSAs) */}
          {!loadingExternal && localFarms.length > 0 && (() => {
            const rc = booths.filter(b => !b.is_demo).length
            return (
              <div style={{ marginTop: rc > 0 ? 48 : 24, paddingTop: rc > 0 ? 32 : 0, borderTop: rc > 0 ? '2px dashed #e5e7eb' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', borderRadius: 16, padding: '16px 20px', marginBottom: 24 }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>🌱</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#14532d' }}>
                      {isSearching && rc === 0 ? `No neighbors selling "${search}" — check these local farms` : 'Local farms selling directly to you'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#166534', lineHeight: 1.5 }}>These USDA-registered farms sell direct to consumers. Contact them to see what&apos;s available.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', margin: 0, letterSpacing: '-0.02em' }}>🌿 Local Farms Near You</h3>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderRadius: 999, padding: '2px 10px' }}>via USDA</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {localFarms.map((farm, i) => {
                    const isCSA = farm._directory === 'csa'
                    const mapsUrl = farm.location_address
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(farm.location_address)}`
                      : (farm.location_y && farm.location_x)
                      ? `https://maps.google.com/?q=${farm.location_y},${farm.location_x}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([farm.listing_name, farm.location_city, farm.location_state].filter(Boolean).join(', '))}`
                    const websiteUrl = farm.media_website?.startsWith('http') ? farm.media_website : farm.media_website ? `https://${farm.media_website}` : null
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'stretch', background: '#fff', border: '1px solid #d1fae5', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{ width: 6, flexShrink: 0, background: isCSA ? 'linear-gradient(180deg, #059669, #047857)' : 'linear-gradient(180deg, #16a34a, #15803d)' }} />
                        <div style={{ flex: 1, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: '#1f2937' }}>{farm.listing_name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, background: isCSA ? '#059669' : '#16a34a', color: '#fff', borderRadius: 999, padding: '2px 8px' }}>{isCSA ? 'CSA' : 'On-Farm Market'}</span>
                          </div>
                          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280' }}>📍 {farm.location_address || [farm.location_city, farm.location_state, farm.location_zipcode].filter(Boolean).join(', ')}</p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 999, background: '#1f2937', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🗺️ Directions</a>
                            {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 999, background: '#fff', color: '#15803d', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid #86efac' }}>🌐 Website</a>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* USDA Farmers Markets */}
          {!loadingExternal && usdaMarkets.length > 0 && (() => {
            const rc = booths.filter(b => !b.is_demo).length
            return (
              <div style={{ marginTop: rc > 0 ? 48 : 24, paddingTop: rc > 0 ? 32 : 0, borderTop: rc > 0 ? '2px dashed #e5e7eb' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'linear-gradient(135deg, #fefce8, #fef9c3)', border: '1px solid #fde047', borderRadius: 16, padding: '16px 20px', marginBottom: 24 }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>🌾</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#854d0e' }}>
                      {isSearching && rc === 0 ? `No neighbors are selling "${search}" right now` : 'Explore your local food community'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#a16207', lineHeight: 1.5 }}>
                      {isSearching && rc === 0
                        ? `We searched your neighborhood but couldn't find "${search}" from local sellers. These USDA-registered Farmers Markets near you may carry it!`
                        : 'Here are certified Farmers Markets in your area from the USDA Local Food Portal.'}
                    </p>
                  </div>
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', marginBottom: 4, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>🏪 Nearby Farmers Markets <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderRadius: 999, padding: '2px 10px' }}>via USDA</span></h3>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Sorted by distance from your location</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {usdaMarkets.map((market, i) => {
                    const distMiles = market.distance ? parseFloat(market.distance).toFixed(1) : null
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(market.location_address || `${market.listing_name} ${market.location_city} ${market.location_state}`)}`
                    const websiteUrl = market.media_website?.startsWith('http') ? market.media_website : market.media_website ? `https://${market.media_website}` : null
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'stretch', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'}
                      >
                        <div style={{ width: 6, flexShrink: 0, background: 'linear-gradient(180deg, #f59e0b, #d97706)' }} />
                        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 28, flexShrink: 0 }}>🏪</span>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 16, color: '#1f2937' }}>{market.listing_name}</span>
                              {distMiles && <span style={{ fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '2px 8px' }}>📍 {distMiles} mi away</span>}
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>{market.location_address || `${market.location_street || ''} ${market.location_city}, ${market.location_state} ${market.location_zipcode}`}</p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, background: '#1f2937', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = '#374151'} onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = '#1f2937'}>🗺️ Directions</a>
                            {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, background: '#fff', color: '#d97706', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid #fde68a' }}>🌐 Website</a>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Demo Booths — show below USDA when CasaGrown has < 3 real results */}
          {demoBooths.length > 0 && (() => {
            const rc = booths.filter(b => !b.is_demo).length
            return (
              <div style={{ marginTop: rc > 0 ? 48 : 24, paddingTop: rc > 0 ? 32 : 0, borderTop: rc > 0 ? '2px dashed #e5e7eb' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', borderRadius: 16, padding: '16px 20px', marginBottom: 24 }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>🌿</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#14532d' }}>
                      See how CasaGrown works
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                      Browse these demo listings to explore the market experience. Transactions are view-only.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', margin: 0, letterSpacing: '-0.02em' }}>🛒 Demo Booths</h3>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 999, padding: '2px 10px' }}>View Only</span>
                </div>
                <div className={styles.boothGrid}>
                  {demoBooths.map(booth => {
                    const theme = themeColors[booth.decorative_theme] || themeColors.minimal
                    const products = booth.matched_products || []
                    return (
                      <div key={booth.booth_id} className="card">
                        <Link href={`/market/booth/${booth.booth_id}`} className={styles.cardHeaderLink}>
                          <div className={styles.cardHeader} style={{
                            background: booth.header_image_url ? `url(${booth.header_image_url}) center/cover` : theme.gradient,
                            borderBottom: `3px solid ${theme.border}`,
                          }}>
                            {booth.header_image_url && <div className={styles.headerOverlay} />}
                            <div className={styles.headerContent}>
                              <h3 className={styles.cardTitle} style={{ color: booth.header_image_url ? '#fff' : theme.border }}>{booth.booth_name}</h3>
                              <div className={styles.cardMeta}>
                                <span className="badge" style={{ fontSize: 10, background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>🌿 Demo</span>
                                <span style={{ color: 'var(--gray-400)' }}>·</span>
                                <span>{booth.product_count} items</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                        <div className={styles.cardBody}>
                          {booth.description && <p className={styles.cardDesc}>{booth.description} Demo listing — viewing only.</p>}
                          {products.length > 0 && (
                            <div className={styles.productList}>
                              {products.slice(0, 4).map((p: any) => (
                                <Link key={p.id} href={`/market/booth/${booth.booth_id}/product/${p.id}`} className={styles.productCard}>
                                  <div className={styles.productThumb}>
                                    {p.photo ? <img src={p.photo} alt={p.name} /> : <span>{categoryIcons[p.category] || '📦'}</span>}
                                  </div>
                                  <div className={styles.productInfo}>
                                    <span className={styles.productName}>{p.name}</span>
                                    <span className={styles.productPrice}>${p.price_usd?.toFixed(2)}/{p.unit}</span>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* After USDA fallback: invite CTA for search-miss case */}
      {!loading && booths.filter(b => !b.is_demo).length < 3 && isSearching && (
        <div style={{ textAlign: 'center', padding: '32px 20px 16px' }}>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>
            Don&apos;t see what you&apos;re looking for? Help grow your local market.
          </p>
          <button
            onClick={() => setShowGlobalShareModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 999, background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}
          >
            🚀 Invite Neighbors to Sell
          </button>
        </div>
      )}

      {showDemoModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }} onClick={() => setShowDemoModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%',
            boxShadow: '0 24px 48px rgba(0,0,0,0.2)', textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌿</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#15803d' }}>
              This is a Demo Listing
            </h3>
            <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 20 }}>
              Demo booths show what CasaGrown looks like when your neighbors start selling.
              Transactions are not available for demo listings.
            </p>
            <Link
              href="/create-listing"
              style={{
                display: 'block', padding: '14px 24px', borderRadius: 12,
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', fontWeight: 600, fontSize: 16,
                textDecoration: 'none', marginBottom: 12,
                boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
              }}
            >
              🌱 Start Selling →
            </Link>
            <button
              onClick={() => setShowDemoModal(false)}
              style={{
                background: 'none', border: '1px solid var(--gray-300)',
                borderRadius: 8, padding: '10px 24px', cursor: 'pointer',
                fontSize: 14, color: 'var(--gray-600)',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Global Share Modal */}
      {showGlobalShareModal && (
        <SocialShareModal
          isOpen={showGlobalShareModal}
          onClose={() => setShowGlobalShareModal(false)}
          title="Invite Neighbors"
          subtitle="Share CasaGrown with your neighborhood."
          shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/` : ''}
          shareMessage={(p) => getGlobalMarketShareMessage(p, digest)}
          entityName="Market Invite"
          shareContext="market_invite"
          userId={user?.id}
        />
      )}
    </div>

    {/* Vertically stacked FABs — outside container so position:fixed works in all states */}
    {!keyboardOpen && (
      <>
        <Link
          href="/create-listing"
          id="sell-fab"
          style={{
            position: 'fixed', bottom: 80, right: 24,
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            color: '#fff', borderRadius: 28, padding: '14px 24px',
            fontSize: 15, fontWeight: 600, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 6px 20px rgba(22, 163, 74, 0.4)',
            zIndex: 100, transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        >
          {marketIsOpen ? '🌱 Sell Something' : '🌱 List for Next Market'}
        </Link>
        <GrowBotFAB />
      </>
    )}
  </>
  )
}

export default function BrowseMarketPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <BrowseMarketPageInner />
    </Suspense>
  )
}
