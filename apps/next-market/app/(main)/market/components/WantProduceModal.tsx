'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../lib/useAuth'
import { useQuickSetup } from '../../../../lib/useQuickSetup'
import { useCart } from '../../../../lib/useCart'
import { trackEvent } from '../../../../lib/crm-analytics'
import {
  getInstacartItemUrl,
  getKrogerItemUrl,
  getRegionalKrogerBanner,
  getPartnerStoreDisplay,
  checkKrogerProximity,
  type KrogerProximityResult,
} from '../../../../lib/groceryDelivery'
import {
  inferProduceUnitAndPrice,
} from '../../../../lib/bulkListingUtils'
import { getWindowDays } from '../../../../lib/windowDisplay'
import { geocodeAddress, STATE_CODES } from '../../../../lib/geocode'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../../../lib/interestCatalog'
import AddressInput from '../../../components/AddressInput'
import { AddressFields, formatFullAddress, EMPTY_ADDRESS } from '../../../../lib/address'
import styles from './WantProduceModal.module.css'

// Haversine distance in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
function metersToMiles(m: number): number {
  return m / 1609.344
}

export function resolveCropPhotoUrl(cropName: string, prodPhotoUrl?: string, cropImg?: string): string {
  if (prodPhotoUrl && !prodPhotoUrl.includes('127.0.0.1:54321')) {
    return prodPhotoUrl
  }
  if (cropImg) {
    if (cropImg.startsWith('/')) {
      return cropImg
    }
    if (cropImg.includes('/interest-images/')) {
      const filename = cropImg.split('/interest-images/')[1]
      if (filename) return `/images/catalog/${filename}`
    }
    if (!cropImg.includes('127.0.0.1:54321')) {
      return cropImg
    }
  }
  const norm = (cropName || '').toLowerCase().trim().replace(/\s+/g, '_')
  return `/images/catalog/studio_${norm}.jpg`
}

export interface LiveProductItem {
  id: string
  name: string
  price: number
  unit: string
  photo_url?: string
  seller_id: string
  seller_name?: string
  booth_id?: string
  pickup_display_address?: string
  pickup_address?: string
  pickup_landmark?: string
  pickup_notice_minutes?: number
  delivery_radius_miles?: number
  delivery_zipcodes?: string[]
  booth_zip?: string
  distance_miles?: number
  driving_mins?: number
  latitude?: number
  longitude?: number
  offers_pickup?: boolean
  offers_delivery?: boolean
  stock_quantity?: number
  rating?: { avg: number; count: number }
  pickup_windows?: any
  delivery_windows?: any
  product_pickup_windows?: any
  product_delivery_windows?: any
}

function formatFulfillmentWindowPreview(
  windows: any
): { label: string; pills: string[] } | null {
  if (!windows) return null

  // If per-date object e.g. { "2026-08-30": [{ start: "16:00", end: "18:00" }] }
  if (typeof windows === 'object' && !Array.isArray(windows)) {
    const dates = Object.keys(windows).sort()
    if (dates.length > 0) {
      const days = getWindowDays(dates, windows)
      if (days.length > 0) {
        return { label: days[0].label, pills: days[0].pills }
      }
    }
  }

  // If array of slots or schedule strings
  if (Array.isArray(windows) && windows.length > 0) {
    const SLOT_LABELS: Record<string, string> = {
      '8-10': '8–10a',
      '10-12': '10–12p',
      '12-14': '12–2p',
      '14-16': '2–4p',
      '16-18': '4–6p',
      '18-20': '6–8p',
    }
    const pills = windows.map((w: any) => {
      if (typeof w === 'string') return SLOT_LABELS[w] || w
      if (w.start && w.end) return `${w.start}–${w.end}`
      if (w.start_time && w.end_time) return `${w.start_time}–${w.end_time}`
      return w.label || String(w)
    })
    return { label: 'Available Windows', pills }
  }

  return null
}

export interface UsdaMarketItem {
  listing_name: string
  distance?: string | number
  location_address?: string
  location_street?: string
  location_city?: string
  location_state?: string
  location_zipcode?: string
  media_website?: string | null
  briefdesc?: string
  season_schedule?: string
  listing_description?: string
  _directory?: string
}

interface WantProduceModalProps {
  isOpen: boolean
  cropName: string
  cropImage?: string
  category?: string
  initialQty?: string
  initialUnit?: string
  liveProducts?: LiveProductItem[]
  currentZipcode?: string
  onClose: () => void
  onBuyProduct?: (product: LiveProductItem) => void
  onSignalSuccess?: (produceName: string, quantity: string, unit: string) => void
}

export default function WantProduceModal({
  isOpen,
  cropName,
  cropImage,
  category = 'produce',
  initialQty = '2',
  initialUnit = 'lb',
  liveProducts = [],
  currentZipcode = '95125',
  onClose,
  onBuyProduct,
  onSignalSuccess,
}: WantProduceModalProps) {
  const supabase = createClient()
  const { user, isAuthenticated, tosAccepted } = useAuth()
  const { requireAuth } = useQuickSetup()
  const { addItem } = useCart()

  const [showSignalForm, setShowSignalForm] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [quantity, setQuantity] = useState(initialQty)
  const [unit, setUnit] = useState(initialUnit)
  const [fulfillmentPref, setFulfillmentPref] = useState<'either' | 'pickup' | 'delivery'>('either')

  // ── Price Benchmark & Est. Value ──
  const benchmarkInfo = React.useMemo(() => {
    const catalogItem = EXHAUSTIVE_INTERESTS_CATALOG.find(
      (c) => c.name.toLowerCase() === cropName.toLowerCase() || c.id === cropName.toLowerCase()
    )
    if (catalogItem && catalogItem.defaultPrice != null) {
      return {
        price: catalogItem.defaultPrice,
        unit: catalogItem.defaultUnit || 'lb',
      }
    }
    const inferred = inferProduceUnitAndPrice(cropName)
    return {
      price: parseFloat(inferred.price) || 2.50,
      unit: inferred.unit || 'lb',
    }
  }, [cropName])

  const unitPrice = benchmarkInfo.price ?? 2.50
  const parsedQty = parseFloat(quantity)
  const estimatedTotal = !isNaN(parsedQty) && parsedQty > 0
    ? (parsedQty * unitPrice).toFixed(2)
    : unitPrice.toFixed(2)
  
  // CasaGrown Cart Integration
  const cart = useCart()
  const [cartFeedback, setCartFeedback] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Tier (c): Nearby USDA Farmers Markets & Farms
  const [usdaMarkets, setUsdaMarkets] = useState<UsdaMarketItem[]>([])
  const [isLoadingUsda, setIsLoadingUsda] = useState(false)

  // Distance & Address State for Pickup & Delivery Eligibility
  const [buyerAddress, setBuyerAddress] = useState<string>('')
  const [buyerLat, setBuyerLat] = useState<number | null>(null)
  const [buyerLng, setBuyerLng] = useState<number | null>(null)
  const [profileAddress, setProfileAddress] = useState<string | null>(null)
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [addressFields, setAddressFields] = useState<AddressFields>(EMPTY_ADDRESS)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [isGeolocating, setIsGeolocating] = useState(false)
  const [fulfillmentListFilter, setFulfillmentListFilter] = useState<'all' | 'pickup' | 'delivery'>('all')

  // Regional supermarket banner & delivery links
  const [krogerProximity, setKrogerProximity] = useState<KrogerProximityResult | null>(null)
  const [liveKrogerPrice, setLiveKrogerPrice] = useState<{ price: number; unit: string } | null>(null)
  const [isLoadingKroger, setIsLoadingKroger] = useState(false)

  const krogerBanner = krogerProximity?.banner || getRegionalKrogerBanner(currentZipcode)
  const partnerStoreInfo = getPartnerStoreDisplay(cropName)
  const instacartUrl = getInstacartItemUrl(cropName, currentZipcode)
  const krogerUrl = getKrogerItemUrl(cropName, currentZipcode)
  const prevCropNameRef = React.useRef(cropName)
  const prevIsOpenRef = React.useRef(isOpen)

  const [standCoords, setStandCoords] = useState<Record<string, { lat: number; lng: number }>>({})

  // Pre-geocode seller stands to guarantee instant driving distance calculation
  useEffect(() => {
    if (!liveProducts || liveProducts.length === 0) return
    liveProducts.forEach((p) => {
      const addr = p.pickup_address || p.pickup_display_address
      if (addr && !standCoords[p.id]) {
        geocodeAddress(addr).then((geo) => {
          if (geo) {
            setStandCoords((prev) => ({ ...prev, [p.id]: { lat: geo.lat, lng: geo.lng } }))
          }
        })
      }
    })
  }, [liveProducts, standCoords])

  // ── Address Resolution for Driving Distance & Delivery Eligibility ──
  useEffect(() => {
    if (!isOpen) return

    // 1. Instant fallback from localStorage
    try {
      const savedDeliveryAddr = localStorage.getItem('casagrown_delivery_address')
      const savedFields = localStorage.getItem('casagrown_delivery_fields')
      if (savedDeliveryAddr) {
        setBuyerAddress(savedDeliveryAddr)
        setProfileAddress(savedDeliveryAddr)
      }
      if (savedFields) {
        try {
          const parsed = JSON.parse(savedFields)
          if (parsed && (parsed.street || parsed.zip)) {
            setAddressFields(parsed)
          }
        } catch {}
      }
    } catch {}

    // 2. Load user profile address if logged in
    const resolveUserProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const activeId = user?.id || session?.user?.id
        if (!activeId) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('street_address, city, state_code, zip_code, latitude, longitude')
          .eq('id', activeId)
          .maybeSingle()

        if (profile) {
          const hasStreet = !!profile.street_address
          const hasCity = !!profile.city
          const hasZip = !!profile.zip_code
          if (hasStreet || hasCity || hasZip) {
            const newFields: AddressFields = {
              street: profile.street_address || '',
              city: profile.city || '',
              state: profile.state_code || 'CA',
              zip: profile.zip_code || currentZipcode || '',
            }
            setAddressFields(newFields)
            const parts = [profile.street_address, profile.city, profile.state_code, profile.zip_code].filter(Boolean)
            if (parts.length > 0) {
              const fullProfileAddr = parts.join(', ')
              setProfileAddress(fullProfileAddr)
              setBuyerAddress(fullProfileAddr)
              if (profile.latitude && profile.longitude) {
                setBuyerLat(profile.latitude)
                setBuyerLng(profile.longitude)
              }
              try {
                localStorage.setItem('casagrown_delivery_address', fullProfileAddr)
                localStorage.setItem('casagrown_delivery_fields', JSON.stringify(newFields))
              } catch {}
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load profile address:', err)
      }
    }

    resolveUserProfile()
  }, [isOpen, user?.id, currentZipcode])

  const handleApplyAddressFields = async (fields: AddressFields) => {
    const fullAddr = formatFullAddress(fields)
    if (!fullAddr.trim()) return
    setAddressFields(fields)
    setBuyerAddress(fullAddr.trim())
    setProfileAddress(fullAddr.trim())
    setShowAddressModal(false)

    try {
      localStorage.setItem('casagrown_delivery_address', fullAddr.trim())
      localStorage.setItem('casagrown_delivery_fields', JSON.stringify(fields))
    } catch {}

    setIsGeocoding(true)
    try {
      const geo = await geocodeAddress(fullAddr.trim())
      if (geo) {
        setBuyerLat(geo.lat)
        setBuyerLng(geo.lng)
      }

      const { data: { session } } = await supabase.auth.getSession()
      const activeId = user?.id || session?.user?.id
      if (activeId) {
        await supabase
          .from('profiles')
          .update({
            street_address: fields.street || '',
            city: fields.city || '',
            state_code: fields.state || 'CA',
            zip_code: fields.zip || geo?.zipCode || currentZipcode || '',
            latitude: geo?.lat || undefined,
            longitude: geo?.lng || undefined,
          })
          .eq('id', activeId)
      }
    } catch (err) {
      console.warn('Geocoding/profile sync failed:', err)
    } finally {
      setIsGeocoding(false)
    }
  }

  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    setIsGeolocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setBuyerLat(lat)
          setBuyerLng(lng)

          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
              { headers: { 'User-Agent': 'CasaGrown/1.0' } }
            )
            if (res.ok) {
              const data = await res.json()
              const addr = data.address || {}
              const road = addr.road || addr.pedestrian || addr.street || ''
              const houseNum = addr.house_number || ''
              const street = [houseNum, road].filter(Boolean).join(' ')
              const city = addr.city || addr.town || addr.village || addr.suburb || ''
              const state = addr.state ? (STATE_CODES[addr.state] || addr.state.slice(0, 2).toUpperCase()) : 'CA'
              const zip = addr.postcode || ''

              const newFields: AddressFields = { street, city, state, zip }
              setAddressFields(newFields)
              const formatted = formatFullAddress(newFields) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
              setBuyerAddress(formatted)
              setProfileAddress(formatted)
              try {
                localStorage.setItem('casagrown_delivery_address', formatted)
                localStorage.setItem('casagrown_delivery_fields', JSON.stringify(newFields))
              } catch {}

              const { data: { session } } = await supabase.auth.getSession()
              const activeId = user?.id || session?.user?.id
              if (activeId) {
                try {
                  await supabase
                    .from('profiles')
                    .update({
                      street_address: street || '',
                      city: city || '',
                      state_code: state || 'CA',
                      zip_code: zip || currentZipcode || '',
                      latitude: lat,
                      longitude: lng,
                    })
                    .eq('id', activeId)
                } catch (e: any) {
                  console.warn('Failed to update profile location:', e)
                }
              }
            } else {
              setBuyerAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
            }
          } catch {
            setBuyerAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
          }
          setShowAddressModal(false)
        } catch (err) {
          console.warn('Geolocation failed:', err)
        } finally {
          setIsGeolocating(false)
        }
      },
      (err) => {
        console.warn('Geolocation error / permission denied:', err)
        setIsGeolocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    if (!isOpen) return
    const cleanZip = (currentZipcode || '95125').trim().substring(0, 5)
    if (!cleanZip) return

    let cancelled = false
    setIsLoadingKroger(true)

    checkKrogerProximity(cleanZip, 15).then((prox) => {
      if (cancelled) return
      setKrogerProximity(prox)
      if (prox.available) {
        supabase.rpc('get_suggested_produce_price', {
          p_produce_name: cropName,
          p_zip_code: cleanZip,
        }).then(({ data, error }: { data: any; error: any }) => {
          if (cancelled) return
          if (!error && data && data.found && typeof data.suggested_price === 'number') {
            setLiveKrogerPrice({
              price: Number(data.avg_retail_price || data.suggested_price),
              unit: data.unit || 'lb',
            })
          } else {
            setLiveKrogerPrice(null)
          }
        }).catch(() => {
          if (!cancelled) setLiveKrogerPrice(null)
        })
      }
      setIsLoadingKroger(false)
    }).catch(() => {
      if (!cancelled) setIsLoadingKroger(false)
    })

    return () => { cancelled = true }
  }, [isOpen, currentZipcode, cropName])

  useEffect(() => {
    if (!prevIsOpenRef.current && isOpen) {
      setQuantity(initialQty || '2')
      setUnit(initialUnit || 'lb')
      setErrorMessage('')
      setSuccessMessage('')
      setIsSubmitted(false)
      setShowSignalForm(true)
    } else if (prevCropNameRef.current !== cropName) {
      setQuantity(initialQty || '2')
      setUnit(initialUnit || 'lb')
      setErrorMessage('')
      setSuccessMessage('')
      setIsSubmitted(false)
      setShowSignalForm(true)
    }
    prevCropNameRef.current = cropName
    prevIsOpenRef.current = isOpen
  }, [cropName, isOpen, initialQty, initialUnit])

  useEffect(() => {
    if (!isOpen) return
    const cleanZip = (currentZipcode || '95125').trim().substring(0, 5)
    if (!cleanZip) return

    // 1. Tier 1: Check localStorage (0ms instant render)
    const localCacheKey = `usda_cache_${cleanZip}`
    try {
      const cached = localStorage.getItem(localCacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        const ageMs = Date.now() - (parsed.timestamp || 0)
        // Fresh if < 24 hours
        if (ageMs < 24 * 60 * 60 * 1000 && Array.isArray(parsed.markets) && parsed.markets.length > 0) {
          const combined = [...parsed.markets, ...(parsed.farms || [])].slice(0, 4)
          setUsdaMarkets(combined)
          setIsLoadingUsda(false)
          return
        }
      }
    } catch {}

    setIsLoadingUsda(true)

    // 2. Tier 2: Check database cache table (public.usda_market_cache)
    supabase
      .from('usda_market_cache')
      .select('markets, farms')
      .or(`cache_key.ilike.%${cleanZip}%,zip_code.eq.${cleanZip}`)
      .limit(1)
      .maybeSingle()
      .then(({ data: dbData, error: dbError }: { data: any; error: any }) => {
        if (!dbError && dbData && Array.isArray(dbData.markets) && dbData.markets.length > 0) {
          const combined = [...dbData.markets, ...(dbData.farms || [])].slice(0, 4)
          setUsdaMarkets(combined)
          setIsLoadingUsda(false)
          try {
            localStorage.setItem(
              localCacheKey,
              JSON.stringify({ timestamp: Date.now(), markets: dbData.markets, farms: dbData.farms || [] })
            )
          } catch {}
          return
        }

        // 3. Tier 3: Invoke Edge Function if not in DB cache
        if (supabase?.functions?.invoke) {
          supabase.functions
            .invoke('usda-farmers-markets', {
              body: { zipcode: cleanZip, radius: 25 },
            })
            .then(({ data, error }: { data: any; error: any }) => {
              if (!error && data?.data && Array.isArray(data.data) && data.data.length > 0) {
                const combined = [...data.data, ...(data.farms || [])].slice(0, 4)
                setUsdaMarkets(combined)
                try {
                  localStorage.setItem(
                    localCacheKey,
                    JSON.stringify({ timestamp: Date.now(), markets: data.data, farms: data.farms || [] })
                  )
                } catch {}
              }
            })
            .catch((err: unknown) => console.warn('USDA invoke failed:', err))
            .finally(() => setIsLoadingUsda(false))
        } else {
          setIsLoadingUsda(false)
        }
      })
      .catch(() => {
        setIsLoadingUsda(false)
      })
  }, [isOpen, currentZipcode])

  if (!isOpen) return null

  const performSignalSubmission = async (numQty: number) => {
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const email = currentUser?.email || user?.email || session?.user?.email || 'guest@casagrown.local'

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const effectiveZip = addressFields.zip || currentZipcode.trim() || '95125'
      const effectiveDeliveryAddr = buyerAddress || formatFullAddress(addressFields) || null

      const res = await fetch('/api/interest/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          zipcodes: [effectiveZip],
          preference_pickup: fulfillmentPref === 'pickup' || fulfillmentPref === 'either',
          preference_delivery: fulfillmentPref === 'delivery' || fulfillmentPref === 'either',
          accepts_email: true,
          accepts_push: true,
          source_url: '/market',
          metadata: {
            fulfillment_pref: fulfillmentPref,
            delivery_address: effectiveDeliveryAddr,
            delivery_latitude: buyerLat,
            delivery_longitude: buyerLng,
            benchmark_unit_price: benchmarkInfo.price,
            estimated_total_value: parseFloat(estimatedTotal),
          },
          interests: [
            {
              produce_name: cropName,
              interest_type: 'buy',
              category: category,
              requested_quantity: numQty,
              requested_unit: unit,
            },
          ],
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save request')
      }

      // Persist delivery address to user's profile and localStorage
      const activeId = currentUser?.id || user?.id || session?.user?.id
      if (activeId && (addressFields.street || effectiveDeliveryAddr)) {
        try {
          await supabase
            .from('profiles')
            .update({
              street_address: addressFields.street || effectiveDeliveryAddr || '',
              city: addressFields.city || '',
              state_code: addressFields.state || 'CA',
              zip_code: addressFields.zip || effectiveZip,
              latitude: buyerLat || undefined,
              longitude: buyerLng || undefined,
            })
            .eq('id', activeId)
        } catch (e: any) {
          console.warn('Failed to update profile during signal submission:', e)
        }
      }

      if (effectiveDeliveryAddr) {
        try {
          localStorage.setItem('casagrown_delivery_address', effectiveDeliveryAddr)
          localStorage.setItem('casagrown_delivery_fields', JSON.stringify(addressFields))
        } catch {}
      }

      trackEvent('button_click', '/market', {
        action: 'harvest_signal_submitted',
        cropName,
        quantity: numQty,
        unit,
        zipcode: effectiveZip,
      })

      setIsSubmitted(true)

      if (onSignalSuccess) {
        onSignalSuccess(cropName, String(numQty), unit)
      }
    } catch (err: any) {
      console.error('Error submitting interest request:', err)
      setErrorMessage(err.message || 'Failed to save signal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const numQty = parseFloat(quantity)
    if (isNaN(numQty) || numQty <= 0) {
      setErrorMessage('Please enter a valid quantity.')
      return
    }

    // If Delivery or Either is selected, address is mandatory
    if ((fulfillmentPref === 'delivery' || fulfillmentPref === 'either') && !buyerAddress && !addressFields.street) {
      setErrorMessage('Please provide a delivery address so local sellers know where to deliver.')
      setShowAddressModal(true)
      return
    }

    if (!isAuthenticated || !tosAccepted) {
      requireAuth({
        trigger: 'want_signal',
        onReady: () => {
          performSignalSubmission(numQty)
        },
      })
      return
    }

    performSignalSubmission(numQty)
  }

  const handleAddInstacartToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    const numQty = parseFloat(quantity) || 1
    const itemPrice = benchmarkInfo.price
    cart.addItem(
      {
        id: `commercial_instacart_${cropName.toLowerCase().replace(/\s+/g, '_')}`,
        name: `${cropName} (Instacart Supermarket)`,
        price_usd: Number(itemPrice.toFixed(2)),
        unit: unit || benchmarkInfo.unit,
        inventory: 999,
        photos: cropImage ? [cropImage] : [],
        category: category || 'produce',
      },
      {
        id: 'booth_instacart_partner',
        name: 'Instacart Supermarket Delivery',
        offers_delivery: true,
        offers_pickup: false,
        delivery_radius_miles: 15,
      },
      numQty,
      'delivery'
    )
    trackEvent('button_click', '/market', {
      action: 'add_to_casagrown_cart',
      partner: 'instacart',
      cropName,
      zipcode: currentZipcode,
      quantity: numQty,
    })
    setCartFeedback(`Added ${numQty} ${unit || benchmarkInfo.unit} of ${cropName} to CasaGrown Cart!`)
  }

  const handleAddKrogerToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    const numQty = parseFloat(quantity) || 1
    const banner = krogerProximity?.banner || krogerBanner
    const itemPrice = liveKrogerPrice?.price || benchmarkInfo.price
    const itemUnit = liveKrogerPrice?.unit || unit || benchmarkInfo.unit

    cart.addItem(
      {
        id: `commercial_kroger_${cropName.toLowerCase().replace(/\s+/g, '_')}`,
        name: `${cropName} (${banner} Delivery)`,
        price_usd: Number(itemPrice.toFixed(2)),
        unit: itemUnit,
        inventory: 999,
        photos: cropImage ? [cropImage] : [],
        category: category || 'produce',
      },
      {
        id: 'booth_kroger_partner',
        name: `${banner} Delivery & Pickup`,
        offers_delivery: true,
        offers_pickup: true,
        delivery_radius_miles: 15,
      },
      numQty,
      'delivery'
    )
    trackEvent('button_click', '/market', {
      action: 'add_to_casagrown_cart',
      partner: 'kroger',
      banner,
      cropName,
      zipcode: currentZipcode,
      quantity: numQty,
    })
    setCartFeedback(`Added ${numQty} ${itemUnit} of ${cropName} to CasaGrown Cart!`)
  }

  const hasActiveListings = liveProducts.length > 0 && !showSignalForm

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalContent}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>💚</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 className={styles.cropTitle}>{cropName}</h3>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 100,
                  background: '#f0fdf4',
                  color: '#166534',
                  border: '1px solid #bbf7d0'
                }}>
                  ~${benchmarkInfo.price.toFixed(2)} / {benchmarkInfo.unit}
                </span>
              </div>
              {hasActiveListings && (
                <p className={styles.cropSubtitle}>
                  {liveProducts.length} local stand(s) available in {currentZipcode}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* State C: Post-Submission Success Hub */}
        {isSubmitted ? (
          <div className={styles.modalBody}>
            <div className={styles.successHubCard}>
              <div className={styles.successIconBadge}>🎉</div>
              <h3 className={styles.successHubTitle}>Neighbors notified</h3>
              <p className={styles.successHubDesc}>
                We&apos;ve notified neighbors in <strong>{currentZipcode}</strong> that you want{' '}
                <strong>{quantity} {unit}</strong> of fresh <strong>{cropName}</strong> (est. <strong>~${estimatedTotal}</strong> at ~${benchmarkInfo.price.toFixed(2)}/{benchmarkInfo.unit}). You&apos;ll be notified the moment a neighbor has it available!
              </p>
            </div>

            {/* Commercial Supermarket Delivery (Instacart & Kroger) */}
            <div className={styles.deliveryOptionsSection}>
              <div className={styles.sectionHeadingRow}>
                <span className={styles.sectionIcon}>🛒</span>
                <div>
                  <h4 className={styles.sectionTitle}>Need immediately?</h4>
                  <p className={styles.sectionSubtitle}>
                    Buy produce from nearby stores
                  </p>
                </div>
              </div>

              {cartFeedback && (
                <div style={{
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  color: '#166534',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  animation: 'fadeIn 0.2s ease',
                }}>
                  <span>🛒 {cartFeedback}</span>
                  <Link href="/cart" onClick={onClose} style={{ color: '#15803d', fontWeight: 700, textDecoration: 'underline', marginLeft: 8 }}>
                    View Cart →
                  </Link>
                </div>
              )}

              <div className={styles.deliveryCardsList}>
                {/* Instacart Card */}
                <div
                  className={styles.deliveryPartnerCard}
                  onClick={handleAddInstacartToCart}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.deliveryPartnerLeft}>
                    <div className={styles.instacartLogoBadge}>🛒</div>
                    <div>
                      <div className={styles.partnerName}>
                        Instacart Delivery <span className={styles.partnerPill}>{partnerStoreInfo.instacartStoresPill}</span>
                      </div>
                      <div className={styles.partnerSub}>
                        {partnerStoreInfo.instacartDescription} in {currentZipcode} • Choose Sprouts, Safeway, ALDI at checkout
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddInstacartToCart}
                    className={styles.partnerCta}
                  >
                    + Add to Cart →
                  </button>
                </div>

                {/* Kroger Banner Card - Rendered only if store exists within radius */}
                {krogerProximity?.available !== false && (
                  <div
                    className={styles.deliveryPartnerCard}
                    onClick={handleAddKrogerToCart}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={styles.deliveryPartnerLeft}>
                      <div className={styles.krogerLogoBadge}>🏪</div>
                      <div>
                        <div className={styles.partnerName}>
                          {krogerProximity?.banner || krogerBanner}{' '}
                          <span className={styles.partnerPill}>
                            {krogerProximity?.distanceMiles ? `${krogerProximity.distanceMiles.toFixed(1)} mi away` : 'Delivery & Pickup'}
                          </span>
                        </div>
                        <div className={styles.partnerSub}>
                          Local supermarket delivery from your nearest {krogerProximity?.banner || krogerBanner}
                          {liveKrogerPrice?.price ? ` • Local store price: $${liveKrogerPrice.price.toFixed(2)}/${liveKrogerPrice.unit}` : ` • Est. price: ~$${benchmarkInfo.price.toFixed(2)}/${benchmarkInfo.unit}`}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddKrogerToCart}
                      className={styles.partnerCta}
                    >
                      + Add to Cart →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Tier (c): Nearby Farmers & Farmers Markets (USDA Directory) - only shown when data exists */}
            {(isLoadingUsda || usdaMarkets.length > 0) && (
              <div className={styles.usdaSection}>
                <div className={styles.usdaHeader}>
                  <div className={styles.usdaTitleRow}>
                    <span className={styles.usdaIcon}>🌾</span>
                    <div>
                      <h4 className={styles.usdaTitle}>Nearby Farmers Markets & Stands</h4>
                      <p className={styles.usdaSubtitle}>
                        Physical USDA markets near {currentZipcode} that may carry fresh {cropName.toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <span className={styles.usdaBadge}>USDA Verified</span>
                </div>

                {isLoadingUsda ? (
                  <div className={styles.usdaLoading}>
                    <div className={styles.usdaSpinner}></div>
                    <span>Searching USDA directory for local markets...</span>
                  </div>
                ) : (
                  <div className={styles.usdaList}>
                    {usdaMarkets.map((market, idx) => {
                      const distMiles = market.distance ? parseFloat(String(market.distance)).toFixed(1) : null
                      const fullAddress =
                        market.location_address ||
                        [market.location_street, market.location_city, market.location_state, market.location_zipcode]
                          .filter(Boolean)
                          .join(', ')
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        fullAddress || `${market.listing_name} ${market.location_city || ''}`
                      )}`
                      const websiteUrl = market.media_website
                        ? market.media_website.startsWith('http')
                          ? market.media_website
                          : `https://${market.media_website}`
                        : null
                      const schedule = market.season_schedule || market.briefdesc || market.listing_description

                      return (
                        <div key={idx} className={styles.usdaCard}>
                          <div className={styles.usdaCardTop}>
                            <span className={styles.usdaMarketName}>{market.listing_name}</span>
                            {distMiles && (
                              <span className={styles.usdaDistanceBadge}>
                                📍 {distMiles} mi
                              </span>
                            )}
                          </div>

                          {fullAddress && (
                            <div className={styles.usdaAddress}>{fullAddress}</div>
                          )}

                          {schedule && (
                            <div className={styles.usdaSchedule}>
                              <span>🕒</span> <span>{schedule}</span>
                            </div>
                          )}

                          <div className={styles.usdaActions}>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.usdaMapBtn}
                            >
                              🗺️ Directions
                            </a>
                            {websiteUrl && (
                              <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.usdaWebBtn}
                              >
                                🌐 Website
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className={styles.doneBtn}
            >
              ✓ Done / Back to Produce Market
            </button>
          </div>
        ) : hasActiveListings ? (
          /* State A: Active Listings in Booths */
          <div className={styles.modalBody}>
            {cartFeedback && (
              <div style={{
                background: '#dcfce7',
                border: '1px solid #86efac',
                color: '#166534',
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>🛒 {cartFeedback}</span>
                <Link href="/cart" onClick={onClose} style={{ color: '#15803d', fontWeight: 700, textDecoration: 'underline', marginLeft: 8 }}>
                  View Cart →
                </Link>
              </div>
            )}

            <div className={styles.listingsHeader}>
              <span className={styles.listingsBadge}>
                <span className={styles.pulseDot}></span> Available from Neighbors
              </span>
              <span style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                {liveProducts.length} {liveProducts.length === 1 ? 'stand' : 'stands'} nearby
              </span>
            </div>

            <div className={styles.listingsScrollList}>
              {liveProducts
                .map((prod) => {
                let exactDist: number | null = null
                if (buyerLat != null && buyerLng != null) {
                  const standCoord = standCoords[prod.id] || (prod.latitude && prod.longitude ? { lat: prod.latitude, lng: prod.longitude } : null)
                  if (standCoord) {
                    exactDist = Math.round(metersToMiles(haversineMeters(buyerLat, buyerLng, standCoord.lat, standCoord.lng)) * 10) / 10
                  } else if (prod.distance_miles != null) {
                    exactDist = prod.distance_miles
                  } else {
                    exactDist = 0.8
                  }
                } else if (buyerAddress) {
                  exactDist = prod.distance_miles || 0.8
                }

                const maxRadius = prod.delivery_radius_miles || 5
                const hasZipFilter = Array.isArray(prod.delivery_zipcodes) && prod.delivery_zipcodes.length > 0
                const zipMatches = hasZipFilter ? prod.delivery_zipcodes!.includes(currentZipcode.trim()) : null

                let deliversToBuyer: boolean | null = null
                if (buyerAddress || (buyerLat != null && buyerLng != null)) {
                  if (hasZipFilter) {
                    const bZip = addressFields.zip || currentZipcode
                    deliversToBuyer = prod.delivery_zipcodes!.includes(bZip.trim())
                  } else if (exactDist != null) {
                    deliversToBuyer = exactDist <= maxRadius
                  }
                }

                const encodedCrop = encodeURIComponent(cropName)
                const productDetailUrl = `/market/booth/${prod.booth_id || prod.seller_id}/product/${prod.id}?from=market&crop=${encodedCrop}`
                const pickupSched = formatFulfillmentWindowPreview(prod.product_pickup_windows || prod.pickup_windows)
                const deliverySched = formatFulfillmentWindowPreview(prod.product_delivery_windows || prod.delivery_windows)
                const heroImgSrc = resolveCropPhotoUrl(cropName, prod.photo_url, cropImage)

                return (
                  <div key={prod.id} className={styles.listingCard}>
                    {/* Full-Width Hero Photo Container with Overlays */}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: 160,
                        background: '#e8f5e9',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={heroImgSrc}
                        alt={prod.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          const fallback = `/images/catalog/studio_${cropName.toLowerCase().replace(/\s+/g, '_')}.jpg`
                          if (!target.src.endsWith(fallback) && !target.src.includes('produce_placeholder')) {
                            target.src = fallback
                          } else {
                            target.src = '/images/produce_placeholder.jpg'
                          }
                        }}
                      />
                      <Link href={productDetailUrl} onClick={onClose} className={styles.heroStandBadge}>
                        🏡 {prod.seller_name || 'Neighborhood Stand'}
                        {prod.rating && (
                          <span style={{ fontSize: 11, color: '#fbbf24', marginLeft: 2 }}>
                            ⭐️ {prod.rating.avg.toFixed(1)}
                          </span>
                        )}
                      </Link>
                      <div className={styles.heroPriceBadge}>
                        ${prod.price.toFixed(2)}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.9 }}>/{prod.unit}</span>
                      </div>
                      <Link href={productDetailUrl} onClick={onClose} className={styles.heroDetailsOverlayBtn}>
                        View Full Details →
                      </Link>
                    </div>

                    <div className={styles.listingCardBody} style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Stock Line if available */}
                      {prod.stock_quantity != null && (
                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
                          📦 {prod.stock_quantity > 0 ? `${prod.stock_quantity} available` : 'Sold out'}
                        </div>
                      )}

                      {/* Fulfillment Section */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Pickup */}
                        {prod.offers_pickup && (
                          exactDist == null ? (
                            <button
                              type="button"
                              onClick={() => setShowAddressModal(true)}
                              style={{ width: '100%', padding: '9px 12px', background: '#eff6ff', border: '1.5px solid #93c5fd', color: '#1d4ed8', fontSize: 12, fontWeight: 700, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              <span>📍</span> Check driving distance for pickup
                            </button>
                          ) : (
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, color: '#1e40af', display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <span>📍</span>
                                <span style={{ fontWeight: 700 }}>Porch Pickup:</span>
                                <span>
                                  {prod.pickup_landmark ? prod.pickup_landmark : prod.pickup_display_address || 'Pickup'} · ~{exactDist.toFixed(1)} mi driving distance
                                </span>
                                {prod.pickup_notice_minutes ? (
                                  <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>{prod.pickup_notice_minutes}m notice</span>
                                ) : null}
                              </div>
                              {pickupSched && pickupSched.pills.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3, paddingTop: 3, borderTop: '1px dashed rgba(0,0,0,0.08)' }}>
                                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1e40af' }}>🕒 {pickupSched.label}:</span>
                                  {pickupSched.pills.map((pill, i) => (
                                    <span key={i} style={{ padding: '1px 6px', borderRadius: 10, background: '#dbeafe', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}>{pill}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        )}

                        {/* Delivery */}
                        {prod.offers_delivery && (
                          deliversToBuyer == null ? (
                            <button
                              type="button"
                              onClick={() => setShowAddressModal(true)}
                              style={{ width: '100%', padding: '9px 12px', background: '#f0fdf4', border: '1.5px solid #86efac', color: '#166534', fontSize: 12, fontWeight: 700, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              <span>🚗</span> Check delivery availability to my address
                            </button>
                          ) : (
                            <div style={{ background: '#dcfce7', border: '1px solid #86efac', padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, color: '#166534', display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <span>🚗</span>
                                <span style={{ fontWeight: 700 }}>Home Delivery:</span>
                                <span>
                                  {deliversToBuyer === true ? (
                                    `✅ Delivers to your location (${exactDist != null ? `~${exactDist.toFixed(1)} mi away` : `ZIP ${currentZipcode}`})`
                                  ) : (
                                    `❌ Outside delivery area (${exactDist != null ? `~${exactDist.toFixed(1)} mi away — max ${maxRadius} mi` : hasZipFilter ? 'ZIP not covered' : `max ${maxRadius} mi`})`
                                  )}
                                </span>
                              </div>
                              {deliverySched && deliverySched.pills.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3, paddingTop: 3, borderTop: '1px dashed rgba(0,0,0,0.08)' }}>
                                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#166534' }}>🕒 {deliverySched.label}:</span>
                                  {deliverySched.pills.map((pill, i) => (
                                    <span key={i} style={{ padding: '1px 6px', borderRadius: 10, background: '#bbf7d0', border: '1px solid #86efac', color: '#14532d', fontSize: 10, fontWeight: 700 }}>{pill}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>

                      {/* Bottom Action Buttons — only shown when address is known */}
                      {buyerAddress ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                          {/* Change my address — full width, subtle */}
                          <button
                            type="button"
                            onClick={() => setShowAddressModal(true)}
                            style={{ width: '100%', padding: '8px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', fontSize: 12, fontWeight: 600, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                          >
                            <span>📍</span> Change my address
                          </button>
                          {/* Buy Now + Add to Cart side by side */}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (onBuyProduct) {
                                  onBuyProduct(prod)
                                }
                              }}
                              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 8px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#ffffff', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: '0 2px 4px rgba(22,163,74,0.2)' }}
                            >
                              <span>⚡</span> Buy Now (${prod.price.toFixed(2)})
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                addItem(
                                  {
                                    id: prod.id,
                                    name: prod.name,
                                    price_usd: prod.price,
                                    unit: prod.unit,
                                    inventory: prod.stock_quantity || 10,
                                    photos: prod.photo_url ? [prod.photo_url] : [],
                                    category: category,
                                  },
                                  {
                                    id: prod.booth_id || prod.seller_id,
                                    name: prod.seller_name || 'Neighborhood Stand',
                                    offers_delivery: prod.offers_delivery ?? false,
                                    offers_pickup: prod.offers_pickup ?? true,
                                    pickup_address: prod.pickup_address || prod.pickup_display_address || '',
                                    delivery_radius_miles: prod.delivery_radius_miles || 5,
                                  },
                                  1
                                )
                                setCartFeedback(`Added ${prod.name} to cart`)
                                setTimeout(() => setCartFeedback(null), 3000)
                              }}
                              style={{ padding: '11px 14px', background: '#ffffff', border: '1.5px solid #16a34a', color: '#16a34a', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                            >
                              <span>🛒</span> Add to Cart
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={styles.signalPromptBanner}>
              <span>Looking for a custom quantity or another harvest?</span>
              <button
                type="button"
                onClick={() => setShowSignalForm(true)}
                className={styles.signalLinkBtn}
              >
                Find Sellers
              </button>
            </div>
          </div>
        ) : (
          /* State B: Signal Neighbors to Harvest */
          <form onSubmit={handleSignalSubmit} className={styles.modalBody}>
            {liveProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSignalForm(false)}
                className={styles.signalLinkBtn}
                style={{ alignSelf: 'flex-start', marginBottom: '-6px' }}
              >
                ← View {liveProducts.length} active listings
              </button>
            )}

            {errorMessage && <div className={styles.errorBanner}>{errorMessage}</div>}
            {successMessage && <div className={styles.successBanner}>{successMessage}</div>}

            <div className={styles.fieldGroup}>
              <label htmlFor="want-quantity" className={styles.fieldLabel}>
                Desired Quantity
              </label>
              <div className={styles.qtyRow}>
                <input
                  id="want-quantity"
                  type="number"
                  min="0.1"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={styles.qtyInput}
                  required
                />
                <select
                  id="want-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className={styles.unitSelect}
                >
                  <option value="lb">lbs</option>
                  <option value="each">each</option>
                  <option value="bunch">bunch</option>
                  <option value="dozen">dozen</option>
                  <option value="basket">basket</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 11, color: '#4b5563' }}>
                <span>Benchmark rate: ~${benchmarkInfo.price.toFixed(2)} / {unit}</span>
                {!isNaN(parsedQty) && parsedQty > 0 && (
                  <span style={{ fontWeight: 700, color: '#166534' }}>
                    Est. Value: ~${estimatedTotal}
                  </span>
                )}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Fulfillment Preference
              </label>
              <div className={styles.pillGroup}>
                <button
                  type="button"
                  onClick={() => setFulfillmentPref('either')}
                  className={`${styles.prefPill} ${fulfillmentPref === 'either' ? styles.prefPillActive : ''}`}
                >
                  Either
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentPref('pickup')}
                  className={`${styles.prefPill} ${fulfillmentPref === 'pickup' ? styles.prefPillActive : ''}`}
                >
                  📍 Pickup
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentPref('delivery')}
                  className={`${styles.prefPill} ${fulfillmentPref === 'delivery' ? styles.prefPillActive : ''}`}
                >
                  🚗 Delivery
                </button>
              </div>
            </div>

            {/* Delivery Address Section (Visible when Delivery or Either is selected) */}
            {(fulfillmentPref === 'delivery' || fulfillmentPref === 'either') && (
              <div className={styles.fieldGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                    🚗 Delivery Address <span style={{ color: '#dc2626', fontSize: 12 }}>*</span>
                  </label>
                  {buyerAddress ? (
                    <button
                      type="button"
                      onClick={() => setShowAddressModal(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#16a34a',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: 0,
                      }}
                    >
                      <span>✏️</span> Change Address
                    </button>
                  ) : null}
                </div>

                {buyerAddress ? (
                  <div
                    onClick={() => setShowAddressModal(true)}
                    style={{
                      background: '#f0fdf4',
                      border: '1.5px solid #86efac',
                      borderRadius: 12,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>📍</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                          {buyerAddress}
                        </div>
                        <div style={{ fontSize: 11, color: '#15803d' }}>
                          Deliveries will be sent to this destination
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>Edit →</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddressModal(true)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: '#fef2f2',
                      border: '1.5px dashed #f87171',
                      borderRadius: 12,
                      color: '#b91c1c',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span>📍</span> Enter Delivery Address (Required)
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submitSignalBtn}
            >
              <span>🔔</span> {isSubmitting ? 'Notifying Neighbors...' : 'Find sellers in my neighborhood'}
            </button>
          </form>
        )}

        {/* Address & Distance Verification Modal Popup */}
        {showAddressModal && (
          <div className={styles.addressModalOverlay} onClick={() => setShowAddressModal(false)}>
            <div className={styles.addressModalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.addressModalHeader}>
                <div>
                  <h3 className={styles.addressModalTitle}>📍 Enter Delivery Address</h3>
                  <p className={styles.addressModalSubtitle}>
                    Provide your street address or use GPS to enable doorstep delivery from neighborhood growers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className={styles.addressModalCloseBtn}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Quick Option 1: Use Current Location (GPS) */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isGeolocating}
                className={styles.useLocationBtn}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📍</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                      {isGeolocating ? 'Locating via GPS…' : 'Use Current Location'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Auto-detect using browser GPS
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
                  {isGeolocating ? '⏳' : 'Locate →'}
                </span>
              </button>

              {/* Quick Option 2: Saved Profile Address (if available) */}
              {profileAddress && (
                <button
                  type="button"
                  onClick={() => handleApplyAddressFields(addressFields)}
                  className={styles.useProfileAddressCard}
                >
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                      Saved Profile Address
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#14532d', marginTop: 2 }}>
                      {profileAddress}
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>Use →</span>
                </button>
              )}

              <div className={styles.addressModalDivider}>
                <span>or enter full address</span>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleApplyAddressFields(addressFields) }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <AddressInput
                  value={addressFields}
                  onChange={setAddressFields}
                  placeholderStreet="Street Address (e.g. 123 Main St)"
                />

                <div className={styles.addressModalActions}>
                  <button
                    type="button"
                    onClick={() => setShowAddressModal(false)}
                    className={styles.addressModalCancelBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGeocoding || (!addressFields.street?.trim() && !addressFields.zip?.trim())}
                    className={styles.addressModalSubmitBtn}
                  >
                    {isGeocoding ? 'Saving Address…' : 'Save Delivery Address'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
