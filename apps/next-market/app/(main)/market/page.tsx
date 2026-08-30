'use client'

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { resolveProgressiveLocation, type IpLocationData } from '../../../lib/locationResolver'
import { EXHAUSTIVE_INTERESTS_CATALOG, InterestCatalogItem } from '../../../lib/interestCatalog'
import { extractBaseProduce, getProduceImage, categorizeProduce, isRawHarvestProduce } from '../../../lib/produceCatalog'
import { isProduceInSeason } from '../../../lib/produceSeasonality'
import { checkTextForViolations } from '../../../lib/moderation'
import WantProduceModal, { LiveProductItem } from './components/WantProduceModal'
import BatchListingDrawer, { BatchItem } from './components/BatchListingDrawer'
import LeadMagnetReportBanner from './components/LeadMagnetReportBanner'
import BuyModal from '../../components/BuyModal'
import { SmartAppBanner } from '../../components/SmartAppBanner'
import DailyGamesMicrostrip from '../../components/games/DailyGamesMicrostrip'
import { trackEvent } from '../../../lib/crm-analytics'
import styles from './page.module.css'

interface ProduceDisplayItem {
  id: string
  name: string
  category: string
  displayCategory: string
  image: string
  defaultPrice: number
  defaultUnit: string
  liveProductCount: number
  inSeason?: boolean
  isUserDemanded?: boolean
  userDemandCount?: number
  description?: string
  liveProduct?: LiveProductItem
}

function MarketProducePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()

  // Location & Search State
  const [zipcode, setZipcode] = useState<string>('95125')
  const [buyerLat, setBuyerLat] = useState<number | null>(null)
  const [buyerLng, setBuyerLng] = useState<number | null>(null)
  const [locationDisplay, setLocationDisplay] = useState<string>('San Jose, CA 95125')
  const [locationInput, setLocationInput] = useState<string>('San Jose, CA 95125')
  const [isGeolocating, setIsGeolocating] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Produce Grid State
  const [produceItems, setProduceItems] = useState<ProduceDisplayItem[]>([])
  const [liveProductsMap, setLiveProductsMap] = useState<Record<string, LiveProductItem[]>>({})
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Batch Listing State (Have Extra)
  const [selectedExtra, setSelectedExtra] = useState<Record<string, BatchItem>>({})
  const [isBatchDrawerOpen, setIsBatchDrawerOpen] = useState<boolean>(false)

  // Want Flow State
  const [selectedWantCrop, setSelectedWantCrop] = useState<ProduceDisplayItem | null>(null)
  const [isWantModalOpen, setIsWantModalOpen] = useState<boolean>(false)
  const [userExistingDemand, setUserExistingDemand] = useState<Record<string, { quantity: string; unit: string }>>({})

  // Buy Checkout State
  const [activeBuyProduct, setActiveBuyProduct] = useState<{
    product: any
    booth: any
  } | null>(null)

  // ── 1. Resolve User Location ──
  // Track whether we have seeded the search query from the URL param already
  const didSeedSearchQuery = React.useRef(false)

  useEffect(() => {
    async function initLocation() {
      // Check URL search params for zipcode first
      const zipParam = searchParams.get('zipcode') || searchParams.get('zip')
      const qParam = searchParams.get('q') || searchParams.get('produce')
      // Only seed from URL once on initial mount; don't overwrite user's subsequent searches
      if (qParam && !didSeedSearchQuery.current) {
        didSeedSearchQuery.current = true
        setSearchQuery(qParam)
      }

      let initialZip = zipParam || '95125'
      let initialLabel = zipParam ? `ZIP ${zipParam}` : 'San Jose, CA 95125'

      if (!zipParam) {
        try {
          const cachedZip = typeof window !== 'undefined' ? localStorage.getItem('casagrown_user_zip') : null
          const cachedLabel = typeof window !== 'undefined' ? localStorage.getItem('casagrown_user_location_label') : null
          if (cachedZip) {
            initialZip = cachedZip
            initialLabel = cachedLabel || cachedZip
          }
        } catch {}

        if (user?.id) {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('zip_code, city, state, home_address')
              .eq('id', user.id)
              .maybeSingle()

            if (prof?.zip_code) {
              initialZip = prof.zip_code
              initialLabel = [prof.city, prof.state, prof.zip_code].filter(Boolean).join(', ') || prof.zip_code
            }
          } catch {}
        }
      }

      setZipcode(initialZip)
      setLocationDisplay(initialLabel)
      setLocationInput(initialLabel)

      // Always resolve the zip to get lat/lng
      try {
        const res = await resolveProgressiveLocation(initialZip, null)
        if (res?.lat && res?.lng) {
          setBuyerLat(res.lat)
          setBuyerLng(res.lng)
          if (res.displayLabel) {
            setLocationDisplay(res.displayLabel)
            setLocationInput(res.displayLabel)
          }
        } else {
          // Fallback San Jose
          setBuyerLat(37.3382)
          setBuyerLng(-121.8863)
        }
      } catch {
        setBuyerLat(37.3382)
        setBuyerLng(-121.8863)
      }
    }
    initLocation()
  }, [user?.id, supabase, searchParams])

  // ── 2. Fetch User's Existing Interests & Active Listings ──
  const [userExistingListings, setUserExistingListings] = useState<Record<string, {
    id?: string
    produceName: string
    quantity: string
    unit: string
    price: string
    harvestedAt?: string
    description?: string
    photoUrl?: string | null
    status: string
  }>>({})

  useEffect(() => {
    async function fetchUserInterestsAndListings() {
      if (!user?.id) return
      try {
        // 1. Fetch Buy Interests (Demand)
        const { data: buyData } = await supabase
          .from('crm_produce_interests')
          .select('produce_name, requested_quantity, requested_unit, status')
          .eq('user_id', user.id)
          .eq('interest_type', 'buy')
          .eq('status', 'active')

        if (buyData && buyData.length > 0) {
          const buyMap: Record<string, { quantity: string; unit: string }> = {}
          buyData.forEach((row: any) => {
            buyMap[row.produce_name.toLowerCase()] = {
              quantity: String(row.requested_quantity || '2'),
              unit: row.requested_unit || 'lb',
            }
          })
          setUserExistingDemand(buyMap)
        }

        // 2. Fetch Sell Interests (Listings)
        const { data: sellData } = await supabase
          .from('crm_produce_interests')
          .select('id, produce_name, requested_quantity, requested_unit, metadata, status')
          .eq('user_id', user.id)
          .eq('interest_type', 'sell')
          .eq('status', 'active')

        const sellMap: Record<string, {
          id?: string
          produceName: string
          quantity: string
          unit: string
          price: string
          harvestedAt?: string
          description?: string
          photoUrl?: string | null
          status: string
        }> = {}

        if (sellData && sellData.length > 0) {
          sellData.forEach((row: any) => {
            const meta = row.metadata || {}
            sellMap[row.produce_name.toLowerCase()] = {
              id: row.id,
              produceName: row.produce_name,
              quantity: String(row.requested_quantity || '5'),
              unit: row.requested_unit || 'lb',
              price: meta.price_usd != null ? String(meta.price_usd) : '3.50',
              harvestedAt: meta.harvested_at || undefined,
              description: meta.description || undefined,
              photoUrl: meta.photo_url || null,
              status: row.status || 'active',
            }
          })
        }

        // Also check if user has market_products as a vendor booth
        const { data: myProducts } = await supabase
          .from('market_products')
          .select('id, name, price_usd, unit, photos, inventory, is_active')
          .eq('seller_id', user.id)
          .eq('is_active', true)

        if (myProducts && myProducts.length > 0) {
          myProducts.forEach((mp: any) => {
            const norm = (mp.name || '').toLowerCase().trim()
            sellMap[norm] = {
              id: mp.id,
              produceName: mp.name,
              quantity: String(mp.inventory || '5'),
              unit: mp.unit || 'lb',
              price: String(mp.price_usd || '3.50'),
              photoUrl: mp.photos?.[0] || null,
              status: 'active',
            }
          })
        }

        setUserExistingListings(sellMap)
      } catch (err) {
        console.warn('Error fetching user interests and listings:', err)
      }
    }
    fetchUserInterestsAndListings()
  }, [user?.id, supabase])

  // ── 3. Fetch Produce & Live Neighbor Listings ──
  const loadMarketData = useCallback(async () => {
    if (!buyerLat || !buyerLng) return // Wait until coordinates are resolved
    setIsLoading(true)
    try {
      const { data: nearbyBooths, error } = await supabase.rpc('nearby_booths', {
        user_lat: buyerLat,
        user_lng: buyerLng,
        max_miles: 25,
        fulfillment_filter: 'all',
        exclude_demos: true,
      })

      if (error) {
        console.error('Error calling nearby_booths:', error)
      }

      const prodMap: Record<string, LiveProductItem[]> = {}
      
      if (nearbyBooths) {
        nearbyBooths.forEach((b: any) => {
          const boothProducts = b.matched_products || []
          boothProducts.forEach((p: any) => {
            const rawName = (p.name || '').trim()
            if (!isRawHarvestProduce(rawName)) return // Skip baked / processed goods (e.g. pies, breads)

            const normName = rawName.toLowerCase()
            const baseName = extractBaseProduce(rawName).name.toLowerCase()

            const liveItem: LiveProductItem = {
              id: p.id,
              name: p.name,
              price: Number(p.price_usd) || 0,
              unit: p.unit || 'lb',
              photo_url: p.photo_url || p.photo || (Array.isArray(p.photos) ? p.photos[0] : p.photos) || undefined,
              seller_id: b.owner_id,
              seller_name: b.booth_name || 'Neighborhood Stand',
              booth_id: b.booth_id || b.owner_id,
              pickup_address: b.pickup_address || '',
              pickup_display_address: b.pickup_address || 'Porch Pickup',
              pickup_landmark: b.pickup_landmark || undefined,
              pickup_notice_minutes: p.pickup_notice_minutes || b.pickup_notice_minutes || 60,
              delivery_radius_miles: p.delivery_radius_miles || b.delivery_radius_miles || 5,
              delivery_zipcodes: b.delivery_zipcodes || [],
              booth_zip: b.zipcode || undefined,
              distance_miles: b.distance_miles || 1.2,
              driving_mins: Math.ceil((b.distance_miles || 1.2) * 3), // rough estimate
              offers_pickup: p.offers_pickup ?? b.offers_pickup ?? true,
              offers_delivery: p.offers_delivery ?? b.offers_delivery ?? false,
              stock_quantity: p.inventory,
              latitude: b.latitude ?? b.lat,
              longitude: b.longitude ?? b.lng,
              pickup_windows: p.product_pickup_windows || p.pickup_windows || b.pickup_windows,
              delivery_windows: p.product_delivery_windows || p.delivery_windows || b.delivery_windows,
              product_pickup_windows: p.product_pickup_windows || b.pickup_windows,
              product_delivery_windows: p.product_delivery_windows || b.delivery_windows,
            }

            if (!prodMap[normName]) prodMap[normName] = []
            prodMap[normName].push(liveItem)

            if (baseName !== normName) {
              if (!prodMap[baseName]) prodMap[baseName] = []
              prodMap[baseName].push(liveItem)
            }
          })
        })
      }
      setLiveProductsMap(prodMap)

      // Filter catalog to strictly raw produce items
      const rawCatalog = EXHAUSTIVE_INTERESTS_CATALOG.filter((item) => isRawHarvestProduce(item.name))

      const displayList: ProduceDisplayItem[] = rawCatalog.map((catItem) => {
        const norm = catItem.name.toLowerCase()
        const liveMatches = prodMap[norm] || prodMap[catItem.id] || []
        const liveCount = liveMatches.length

        const livePhoto = liveMatches.find((m) => m.photo_url)?.photo_url
        const livePrice = liveCount > 0 ? liveMatches[0].price : catItem.defaultPrice || 3.5
        const inSeason = isProduceInSeason(catItem.name, zipcode)

        return {
          id: catItem.id,
          name: catItem.name,
          category: catItem.category,
          displayCategory: catItem.displayCategory,
          image: livePhoto || catItem.image,
          defaultPrice: livePrice,
          defaultUnit: liveCount > 0 ? liveMatches[0].unit : catItem.defaultUnit || 'lb',
          liveProductCount: liveCount,
          liveProduct: liveMatches.length > 0 ? liveMatches[0] : undefined,
          inSeason,
          description: `Freshly harvested, locally grown ${catItem.name.toLowerCase()}.`,
        }
      })

      // Add any live neighbor products that were not matched to rawCatalog (if raw produce)
      Object.values(prodMap).flat().forEach((p: LiveProductItem) => {
        const rawName = (p.name || '').trim()
        if (!isRawHarvestProduce(rawName)) return

        const norm = rawName.toLowerCase()
        const baseName = extractBaseProduce(rawName).name.toLowerCase()
        const existingIdx = displayList.findIndex(
          (d) => d.name.toLowerCase() === norm || d.name.toLowerCase() === baseName
        )

        const allMatches = prodMap[norm] || prodMap[baseName] || []
        const liveCount = allMatches.length || 1

        if (existingIdx >= 0) {
          // Already in list -> update aggregate count and photo
          displayList[existingIdx].liveProductCount = liveCount
          const bestPhoto = allMatches.find((m) => m.photo_url)?.photo_url
          if (bestPhoto) {
            displayList[existingIdx].image = bestPhoto
          }
        } else if (!displayList.some((d) => d.id === p.id)) {
          const base = extractBaseProduce(rawName)
          const livePhoto = allMatches.find((m) => m.photo_url)?.photo_url || p.photo_url
          displayList.push({
            id: p.id,
            name: p.name,
            category: base.category || 'produce',
            displayCategory: base.displayCategory || 'Vegetables',
            image: livePhoto || getProduceImage(p.name),
            defaultPrice: Number(p.price) || 3.5,
            defaultUnit: p.unit || 'lb',
            liveProductCount: liveCount,
            liveProduct: p,
            inSeason: isProduceInSeason(p.name, zipcode),
            description: `Freshly harvested ${p.name} from local neighbors.`,
          })
        }
      })

      // ── Tier 4: Fetch User-Initiated Demand Signals for this ZIP ──
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const demandRes = await fetch(`${origin}/api/interest/demand?zipcode=${encodeURIComponent(zipcode || '95125')}`)
        if (demandRes.ok) {
          const demandJson = await demandRes.json()
          if (demandJson.success && Array.isArray(demandJson.demandedItems)) {
            demandJson.demandedItems.forEach((dItem: { produce_name: string; count: number }) => {
              const rawName = (dItem.produce_name || '').trim()
              if (!rawName) return

              // Content moderation & banned items check
              const modCheck = checkTextForViolations(rawName)
              if (!modCheck.isClean) return

              // Raw harvest check
              if (!isRawHarvestProduce(rawName)) return

              const norm = rawName.toLowerCase()
              const baseName = extractBaseProduce(rawName).name.toLowerCase()

              // Check if already in displayList (e.g. from standard catalog or live listings)
              const alreadyExists = displayList.some(
                (d) => d.name.toLowerCase() === norm || d.name.toLowerCase() === baseName || d.id.toLowerCase() === norm
              )

              if (!alreadyExists) {
                const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1)
                displayList.push({
                  id: `user_demand_${norm.replace(/\s+/g, '_')}`,
                  name: capitalized,
                  category: 'produce',
                  displayCategory: 'Neighborhood Request',
                  image: '',
                  defaultPrice: 3.5,
                  defaultUnit: 'lb',
                  liveProductCount: 0,
                  isUserDemanded: true,
                  userDemandCount: dItem.count || 1,
                  inSeason: isProduceInSeason(rawName, zipcode),
                  description: `Requested by ${dItem.count} neighbor${dItem.count > 1 ? 's' : ''} in ${zipcode}. Have extra in your garden?`,
                })
              }
            })
          }
        }
      } catch (demandErr) {
        console.warn('Failed to load user-demanded produce:', demandErr)
      }

      // ── 4-Tier Sort: 1. Live Listings -> 2. In Season -> 3. Off Season -> 4. User Demanded ──
      displayList.sort((a, b) => {
        // Tier 1: Live listings first (by live stand count)
        if (b.liveProductCount !== a.liveProductCount) {
          return b.liveProductCount - a.liveProductCount
        }

        const getTier = (item: ProduceDisplayItem) => {
          if (item.liveProductCount > 0) return 1
          if (!item.isUserDemanded && item.inSeason) return 2
          if (!item.isUserDemanded && !item.inSeason) return 3
          return 4 // User-demanded uncatalogued request
        }

        const tierA = getTier(a)
        const tierB = getTier(b)
        if (tierA !== tierB) {
          return tierA - tierB
        }

        // Within each tier: Pure Alphabetical sort
        return a.name.localeCompare(b.name)
      })

      setProduceItems(displayList)
    } catch (err) {
      console.error('Error loading market produce data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [buyerLat, buyerLng, supabase, zipcode])

  useEffect(() => {
    loadMarketData()
  }, [loadMarketData])

  // Periodic Zone Pulse Poller (immediate + 30s interval for realtime freshness checks)
  useEffect(() => {
    const firePulse = async () => {
      try {
        await supabase.rpc('check_zone_pulse', {
          p_lat: 37.3382,
          p_lng: -121.8863,
          p_radius_miles: 25,
        })
      } catch {
        // silent pulse handling
      }
    }

    firePulse()
    const pulseInterval = setInterval(firePulse, 30000)

    return () => clearInterval(pulseInterval)
  }, [supabase])

  // ── 4. Location Handlers (GPS Geolocation & Manual Typing) ──
  const handleGeolocate = () => {
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
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
            { headers: { 'User-Agent': 'CasaGrown-Market/1.0' } }
          )
          const data = await res.json()
          const detectedZip = data.address?.postcode?.substring(0, 5)
          const city = data.address?.city || data.address?.town || data.address?.suburb || 'Local Area'
          const state = data.address?.state_code || data.address?.state || ''
          const label = detectedZip ? `${city}, ${state} ${detectedZip}`.trim() : 'Current Location'

          if (detectedZip) {
            setZipcode(detectedZip)
            setBuyerLat(lat)
            setBuyerLng(lng)
            setLocationDisplay(label)
            setLocationInput(label)
            try {
              localStorage.setItem('casagrown_user_zip', detectedZip)
              localStorage.setItem('casagrown_user_location_label', label)
            } catch {}
          }
        } catch (err) {
          console.error('Geolocate reverse error:', err)
        } finally {
          setIsGeolocating(false)
        }
      },
      (err) => {
        console.warn('Geolocation permission denied / failed:', err)
        setIsGeolocating(false)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  const handleLocationSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = locationInput.trim()
    if (!trimmed) return

    // If 5-digit zip directly
    const zipMatch = trimmed.match(/\b\d{5}\b/)
    if (zipMatch) {
      const zip = zipMatch[0]
      try {
        const res = await resolveProgressiveLocation(zip, null)
        if (res?.lat && res?.lng) {
          setBuyerLat(res.lat)
          setBuyerLng(res.lng)
        }
      } catch {}
      setZipcode(zip)
      setLocationDisplay(trimmed)
      try {
        localStorage.setItem('casagrown_user_zip', zip)
        localStorage.setItem('casagrown_user_location_label', trimmed)
      } catch {}
      return
    }

    try {
      const res = await resolveProgressiveLocation(trimmed, null)
      if (res?.zipCode) {
        setZipcode(res.zipCode)
        if (res.lat && res.lng) {
          setBuyerLat(res.lat)
          setBuyerLng(res.lng)
        }
        const label = res.displayLabel || trimmed
        setLocationDisplay(label)
        setLocationInput(label)
        try {
          localStorage.setItem('casagrown_user_zip', res.zipCode)
          localStorage.setItem('casagrown_user_location_label', label)
        } catch {}
      } else {
        setLocationDisplay(trimmed)
      }
    } catch (err) {
      console.error('Failed to resolve location:', err)
    }
  }

  // ── 5. Produce Filter Logic (Search Query) ──
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return produceItems
    return produceItems.filter((item) => item.name.toLowerCase().includes(q))
  }, [produceItems, searchQuery])

  // ── 6. Produce Listing Handlers ──
  const handleOpenListingForCrop = (item: ProduceDisplayItem, existingListing?: {
    id?: string
    produceName: string
    quantity: string
    unit: string
    price: string
    harvestedAt?: string
    description?: string
    photoUrl?: string | null
    status: string
  }) => {
    setSelectedExtra({
      [item.id]: {
        id: existingListing?.id || item.id,
        name: item.name,
        category: item.category,
        price: existingListing ? existingListing.price : item.defaultPrice.toFixed(2),
        suggestedPrice: item.defaultPrice,
        unit: existingListing ? existingListing.unit : item.defaultUnit,
        quantity: existingListing ? existingListing.quantity : '5',
        stockImage: item.image,
        customPhotoDataUrl: existingListing?.photoUrl || null,
        harvestedAt: existingListing?.harvestedAt || new Date().toISOString().split('T')[0],
        description: existingListing?.description || '',
        isFree: existingListing ? parseFloat(existingListing.price) === 0 : false,
        isSelected: true,
      },
    })
    setIsBatchDrawerOpen(true)
  }

  // ── Auto-open modal from ?openCrop= param (used by product detail back button) ──
  const didAutoOpenCrop = React.useRef(false)
  useEffect(() => {
    if (didAutoOpenCrop.current) return
    const openCropParam = searchParams.get('openCrop')
    if (!openCropParam || produceItems.length === 0) return
    const targetName = decodeURIComponent(openCropParam).toLowerCase()
    const match = produceItems.find(
      (p) => p.name.toLowerCase() === targetName || p.name.toLowerCase().startsWith(targetName)
    )
    if (match) {
      didAutoOpenCrop.current = true
      setSelectedWantCrop(match)
      setIsWantModalOpen(true)
      // Clean up URL param without adding a history entry
      const url = new URL(window.location.href)
      url.searchParams.delete('openCrop')
      window.history.replaceState({}, '', url.toString())
    }
  }, [produceItems, searchParams])

  const handleOpenWantForCrop = (crop: ProduceDisplayItem) => {
    setSelectedWantCrop(crop)
    setIsWantModalOpen(true)
  }

  const handleCustomCropAdded = (name: string, price: string, unit: string) => {
    const newItem: ProduceDisplayItem = {
      id: `custom_${Date.now()}`,
      name,
      category: 'produce',
      displayCategory: 'Vegetables',
      image: getProduceImage(name),
      defaultPrice: parseFloat(price) || 4.0,
      defaultUnit: unit || 'lb',
      liveProductCount: 0,
      description: `Locally grown custom ${name}.`,
    }
    setProduceItems((prev) => [newItem, ...prev])
    handleOpenListingForCrop(newItem)
  }

  const handleUpdateBatchItem = (id: string, updates: Partial<BatchItem>) => {
    setSelectedExtra((prev) => {
      if (!prev[id]) return prev
      return {
        ...prev,
        [id]: { ...prev[id], ...updates },
      }
    })
  }

  const handleRemoveBatchItem = (id: string) => {
    setSelectedExtra((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const handleClearBatch = () => {
    setSelectedExtra({})
  }

  // ── 7. Custom Produce Creator ──
  const handleOpenWantForSearch = (query: string) => {
    const cleanName = query.trim()
    if (!cleanName) return

    // Strict category validation & moderation
    const categoryMatch = categorizeProduce(cleanName)
    if (!categoryMatch) return

    const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
    const customCropItem: ProduceDisplayItem = {
      id: `custom_want_${Date.now()}`,
      name: capitalized,
      category: categoryMatch.category,
      displayCategory: categoryMatch.displayCategory,
      image: getProduceImage(cleanName),
      defaultPrice: 3.5,
      defaultUnit: 'lb',
      liveProductCount: 0,
      description: `Locally grown ${cleanName}.`,
    }
    setSelectedWantCrop(customCropItem)
    setIsWantModalOpen(true)
  }

  const handleAddCustomWant = (name: string, category: string, price: string, unit: string, photoUrl?: string) => {
    const newItem: ProduceDisplayItem = {
      id: `custom_${Date.now()}`,
      name,
      category,
      displayCategory: category,
      image: photoUrl || '/images/produce_placeholder.jpg',
      defaultPrice: parseFloat(price) || 4.0,
      defaultUnit: unit || 'lb',
      liveProductCount: 0,
      description: `Locally grown custom ${name}.`,
    }
    setProduceItems((prev) => [newItem, ...prev])
    setSelectedWantCrop(newItem)
    setIsWantModalOpen(true)
  }

  const handleAddCustomHaveExtra = (name: string, category: string, price: string, unit: string, photoUrl?: string) => {
    const newItem: ProduceDisplayItem = {
      id: `custom_${Date.now()}`,
      name,
      category,
      displayCategory: category,
      image: photoUrl || '/images/produce_placeholder.jpg',
      defaultPrice: parseFloat(price) || 4.0,
      defaultUnit: unit || 'lb',
      liveProductCount: 0,
      description: `Locally grown custom ${name}.`,
    }
    setProduceItems((prev) => [newItem, ...prev])
    handleOpenListingForCrop(newItem)
  }

  return (
    <div className={styles.marketContainer}>
      <SmartAppBanner />
      {/* ── TOP HEADER: 1. Add Produce -> 2. Search & Location ── */}
      <header className={styles.headerSticky}>
        <div className={styles.headerInner}>
          {/* 1. Add Produce Button */}
          <Link
            href="/my-booth/products/new"
            className={styles.addProduceBtn}
            title="Create a new stand listing or add produce"
          >
            <span>+</span> <span>Add Produce</span>
          </Link>

          {/* 2. Search & Location Bar */}
          <div className={styles.headerSearchRow}>
            {/* Produce Search Bar */}
            <div className={styles.searchBarWrapper}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                id="produce-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search produce (e.g. Tomatoes, Lemons, Basil)..."
                className={styles.searchInput}
              />
            </div>

            {/* Location / Zipcode Form */}
            <form onSubmit={handleLocationSubmit} className={styles.locationFormWrapper}>
              <span className={styles.locationIcon}>📍</span>
              <input
                id="zip-search"
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onBlur={() => handleLocationSubmit()}
                placeholder="Address or ZIP"
                className={styles.locationInput}
                title="Type ZIP or address and press Enter"
              />
              <button
                type="button"
                onClick={handleGeolocate}
                disabled={isGeolocating}
                className={styles.geolocateBtn}
                title="Use current location (GPS)"
                aria-label="Use current location"
              >
                {isGeolocating ? (
                  <span className={styles.geolocateSpin}>⏳</span>
                ) : (
                  <span>🎯</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT & PRODUCE GRID ── */}
      <main className={styles.mainContainer}>
        {/* Lead Magnet Report Banner (if arriving from /sell or /check-nutrition-loss) */}
        <LeadMagnetReportBanner />

        {/* Floating Daily Games Microstrip & Collapsible Mini-Bubble */}
        <DailyGamesMicrostrip />

        {isLoading ? (
          <div className={styles.loadingWrapper}>
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" style={{ width: '32px', height: '32px', border: '3px solid var(--green-600)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
            <p style={{ fontSize: '13px', fontWeight: 500 }}>Finding fresh produce in your neighborhood...</p>
          </div>
        ) : (
          <div className={styles.produceGrid} id="produce-grid">
            {/* Zero-Results Search State */}
            {filteredItems.length === 0 && searchQuery && (() => {
              const categoryMatch = categorizeProduce(searchQuery)
              const modCheck = checkTextForViolations(searchQuery)

              if (!modCheck.isClean) {
                return (
                  <div id="no-produce-matches" className={styles.zeroBlockedCard}>
                    <div className={styles.zeroBlockedIcon}>🛡️</div>
                    <div className={styles.zeroBlockedTitle}>Prohibited Search Term</div>
                    <p className={styles.zeroBlockedSub}>
                      {modCheck.error || 'Weapons, controlled substances, and prohibited items are not allowed on CasaGrown.'}
                    </p>
                  </div>
                )
              }

              if (!isRawHarvestProduce(searchQuery)) {
                return (
                  <div id="no-produce-matches" className={styles.zeroBlockedCard}>
                    <div className={styles.zeroBlockedIcon}>🥗</div>
                    <div className={styles.zeroBlockedTitle}>Raw Garden Produce Only</div>
                    <p className={styles.zeroBlockedSub}>
                      CasaGrown neighborhood stands are exclusively for freshly harvested garden produce. Cooked food, baked goods, and cottage food are not eligible.
                    </p>
                  </div>
                )
              }

              if (!categoryMatch) {
                return (
                  <div id="no-produce-matches" className={styles.zeroBlockedCard}>
                    <div className={styles.zeroBlockedIcon}>🌱</div>
                    <div className={styles.zeroBlockedTitle}>Not a recognized garden item</div>
                    <p className={styles.zeroBlockedSub}>
                      &ldquo;{searchQuery}&rdquo; is not a recognized garden category (produce, herbs, flowers, honey, eggs, pots, soil, seeds, or garden equipment). CasaGrown is exclusively dedicated to fresh garden harvests and supplies.
                    </p>
                  </div>
                )
              }

              return (
                <div id="no-produce-matches" className={styles.zeroResultsCard}>
                  <div className={styles.zeroIcon}>🌱</div>
                  <div className={styles.zeroTitle}>
                    No active listings for &ldquo;{searchQuery}&rdquo; nearby
                  </div>
                  <p className={styles.zeroSub}>
                    Signal neighbors to harvest {searchQuery}, or add it to your stand if you have extra to share.
                  </p>

                  <div className={styles.zeroActionRow}>
                    {/* Primary Buyer Action: Signal Neighbors -> Save demand -> Show Instacart/Kroger delivery options */}
                    <button
                      type="button"
                      onClick={() => handleOpenWantForSearch(searchQuery)}
                      className={styles.zeroWantBtn}
                      id="zero-want-btn"
                    >
                      <span>💚</span> Want {searchQuery} (Notify Neighbors)
                    </button>

                    {/* Consistent Seller Action: Add Produce */}
                    <Link
                      href={searchQuery.trim() ? `/my-booth/products/new?name=${encodeURIComponent(searchQuery.trim())}` : '/my-booth/products/new'}
                      className={styles.zeroAddBtn}
                    >
                      <span>+</span> Add Produce
                    </Link>
                  </div>
                </div>
              )
            })()}

            {/* Produce Cards */}
            {filteredItems.map((item) => {
              const myListing = userExistingListings[item.name.toLowerCase()]
              const myDemand = userExistingDemand[item.name.toLowerCase()]

              return (
                <div
                  key={item.id}
                  data-id={item.id}
                  data-name={item.name}
                  className={styles.produceCard}
                >
                  {item.isUserDemanded && !item.image ? (
                    <div className={styles.demandPlaceholderWrapper}>
                      <span className={styles.demandBadge}>💚 Requested</span>
                      <span className={styles.demandPlaceholderIcon}>🌱</span>
                    </div>
                  ) : (
                    <div className={styles.produceImageWrapper}>
                      <img
                        src={myListing?.photoUrl || item.image || '/images/produce_placeholder.jpg'}
                        alt={item.name}
                        onError={(e: any) => {
                          e.currentTarget.src = '/images/produce_placeholder.jpg'
                        }}
                        className={styles.produceImage}
                      />
                    </div>
                  )}

                  <div className={styles.produceCardContent}>
                    <div className={styles.produceTitleRow}>
                      <h3 className={styles.produceTitle}>{item.name}</h3>
                      {item.isUserDemanded ? (
                        <span className={styles.demandPriceBadge}>
                          {item.userDemandCount || 1} wanted
                        </span>
                      ) : (
                        <span className={styles.priceBadge}>
                          ~${item.defaultPrice.toFixed(2)} / {item.defaultUnit}
                        </span>
                      )}
                    </div>

                    {myListing && (
                      <div className={styles.yourListingBadge}>
                        <span className={styles.yourListingIcon}>🧺</span>
                        <div className={styles.yourListingText}>
                          <div className={styles.yourListingHeader}>Your Active Listing</div>
                          <div className={styles.yourListingDetails}>
                            {myListing.quantity} {myListing.unit} • ${parseFloat(myListing.price || '0').toFixed(2)}/{myListing.unit}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2 Action Buttons: Want and Have Extra */}
                    <div className={styles.cardActionRow}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWantCrop(item)
                          setIsWantModalOpen(true)
                        }}
                        className={`${styles.wantBtn} ${myDemand ? styles.wantBtnActive : ''}`}
                      >
                        <span>💚</span> {myDemand ? `Want (${myDemand.quantity} ${myDemand.unit})` : 'Want'}
                      </button>

                      {myListing ? (
                        <button
                          type="button"
                          onClick={() => handleOpenListingForCrop(item, myListing)}
                          className={styles.editListingBtn}
                        >
                          <span>✏️</span> Edit Listing
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenListingForCrop(item)}
                          className={styles.haveExtraBtn}
                        >
                          <span>🧺</span> Have Extra
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

          </div>
        )}
      </main>

      {/* ── MODALS ── */}
      {isWantModalOpen && selectedWantCrop && (
        <WantProduceModal
          isOpen={isWantModalOpen}
          cropName={selectedWantCrop.name}
          cropImage={selectedWantCrop.image}
          category={selectedWantCrop.category}
          initialQty={userExistingDemand[selectedWantCrop.name.toLowerCase()]?.quantity || '2'}
          initialUnit={userExistingDemand[selectedWantCrop.name.toLowerCase()]?.unit || selectedWantCrop.defaultUnit}
          liveProducts={liveProductsMap[selectedWantCrop.name.toLowerCase()] || []}
          currentZipcode={zipcode}
          onClose={() => setIsWantModalOpen(false)}
          onBuyProduct={(prod) => {
            setIsWantModalOpen(false)
            setActiveBuyProduct({
              product: {
                id: prod.id,
                name: prod.name,
                price_usd: prod.price,
                unit: prod.unit,
                inventory: prod.stock_quantity || 10,
                category: selectedWantCrop.category,
                product_pickup_windows: prod.offers_pickup ? [] : null,
                product_delivery_windows: prod.offers_delivery ? [] : null,
              },
              booth: {
                id: prod.seller_id,
                name: prod.seller_name || 'Neighborhood Stand',
                offers_pickup: prod.offers_pickup ?? true,
                offers_delivery: prod.offers_delivery ?? false,
                booth_zip: zipcode,
              },
            })
          }}
          onSignalSuccess={(name, qty, unit) => {
            const norm = name.toLowerCase()
            setUserExistingDemand((prev) => ({
              ...prev,
              [norm]: { quantity: qty, unit },
            }))
            setProduceItems((prev) => {
              const exists = prev.some((p) => p.name.toLowerCase() === norm)
              if (exists) return prev
              const capitalized = name.charAt(0).toUpperCase() + name.slice(1)
              const newItem: ProduceDisplayItem = {
                id: `user_demand_${norm.replace(/\s+/g, '_')}`,
                name: capitalized,
                category: 'produce',
                displayCategory: 'Neighborhood Request',
                image: '',
                defaultPrice: 3.5,
                defaultUnit: unit || 'lb',
                liveProductCount: 0,
                isUserDemanded: true,
                userDemandCount: 1,
                inSeason: isProduceInSeason(name, zipcode),
                description: `Requested by neighbors in ${zipcode}. Have extra in your garden?`,
              }
              return [...prev, newItem]
            })
            loadMarketData()
          }}
        />
      )}

      {isBatchDrawerOpen && (
        <BatchListingDrawer
          isOpen={isBatchDrawerOpen}
          items={Object.values(selectedExtra)}
          currentZipcode={zipcode}
          onClose={() => setIsBatchDrawerOpen(false)}
          onUpdateItem={handleUpdateBatchItem}
          onRemoveItem={handleRemoveBatchItem}
          onAddItem={(newItem) => {
            setSelectedExtra((prev) => ({
              ...prev,
              [newItem.id]: newItem,
            }))
          }}
          onPublishSuccess={(count) => {
            setUserExistingListings((prev) => {
              const next = { ...prev }
              Object.values(selectedExtra).forEach((item) => {
                if (item.isSelected !== false) {
                  next[item.name.toLowerCase()] = {
                    id: item.id,
                    produceName: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    price: item.isFree ? '0.00' : item.price,
                    harvestedAt: item.harvestedAt,
                    description: item.description,
                    photoUrl: item.customPhotoDataUrl || item.stockImage || null,
                    status: 'active',
                  }
                }
              })
              return next
            })
            setSelectedExtra({})
            loadMarketData()
          }}
        />
      )}

      {activeBuyProduct && (
        <BuyModal
          product={activeBuyProduct.product}
          booth={activeBuyProduct.booth}
          buyerZip={zipcode}
          onClose={() => setActiveBuyProduct(null)}
          onSuccess={(order) => {
            setActiveBuyProduct(null)
            loadMarketData()
          }}
        />
      )}
    </div>
  )
}

export default function MarketPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid var(--green-600)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
        </div>
      }
    >
      <MarketProducePageContent />
    </Suspense>
  )
}
