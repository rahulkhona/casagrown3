'use client'

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { resolveProgressiveLocation, type IpLocationData } from '../../../lib/locationResolver'
import { EXHAUSTIVE_INTERESTS_CATALOG, InterestCatalogItem } from '../../../lib/interestCatalog'
import { extractBaseProduce, getProduceImage } from '../../../lib/produceCatalog'
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
  description?: string
  liveProduct?: LiveProductItem
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All Seasonal Produce' },
  { id: 'vegetables', label: 'Vegetables' },
  { id: 'fruit', label: 'Fruit & Citrus' },
  { id: 'herbs', label: 'Fresh Herbs' },
  { id: 'honey_eggs', label: 'Honey & Eggs' },
  { id: 'plants', label: 'Flowers & Seedlings' },
]

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
  const [activeCategory, setActiveCategory] = useState<string>('all')

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
            const normName = rawName.toLowerCase()
            const baseName = extractBaseProduce(rawName).name.toLowerCase()

            const liveItem: LiveProductItem = {
              id: p.id,
              name: p.name,
              price: Number(p.price_usd) || 0,
              unit: p.unit || 'lb',
              photo_url: p.photo,
              seller_id: b.owner_id,
              seller_name: b.booth_name || 'Neighborhood Stand',
              booth_id: b.booth_id || b.owner_id,
              pickup_address: b.pickup_address || '',
              pickup_display_address: b.pickup_address || 'Porch Pickup',
              pickup_landmark: undefined,
              pickup_notice_minutes: 60,
              delivery_radius_miles: b.delivery_radius_miles || 5,
              delivery_zipcodes: [],
              booth_zip: undefined,
              distance_miles: b.distance_miles || 1.2,
              driving_mins: Math.ceil((b.distance_miles || 1.2) * 3), // rough estimate
              offers_pickup: b.offers_pickup,
              offers_delivery: b.offers_delivery,
              stock_quantity: p.inventory,
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
      const rawCatalog = EXHAUSTIVE_INTERESTS_CATALOG.filter((item) => {
        const isNotPackaged =
          !item.image.includes('apple-pie') &&
          !item.image.includes('focaccia') &&
          !item.image.includes('sourdough') &&
          !item.image.includes('jam')
        return isNotPackaged
      })

      const displayList: ProduceDisplayItem[] = rawCatalog.map((catItem) => {
        const norm = catItem.name.toLowerCase()
        const liveMatches = prodMap[norm] || prodMap[catItem.id] || []
        const liveCount = liveMatches.length

        const livePhoto = liveMatches.find((m) => m.photo_url)?.photo_url
        const livePrice = liveCount > 0 ? liveMatches[0].price : catItem.defaultPrice || 3.5

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
          description: `Freshly harvested, locally grown ${catItem.name.toLowerCase()}.`,
        }
      })

      // Add any live neighbor products that were not matched to rawCatalog
      Object.values(prodMap).flat().forEach((p: LiveProductItem) => {
        const rawName = (p.name || '').trim()
        const norm = rawName.toLowerCase()
        const baseName = extractBaseProduce(rawName).name.toLowerCase()
        const existingIdx = displayList.findIndex(
          (d) => d.name.toLowerCase() === norm || d.name.toLowerCase() === baseName
        )

        const allMatches = prodMap[norm] || prodMap[baseName] || []
        const liveCount = allMatches.length || 1

        if (existingIdx >= 0) {
          // Already in list -> update aggregate count
          displayList[existingIdx].liveProductCount = liveCount
        } else if (!displayList.some((d) => d.id === p.id)) {
          displayList.push({
            id: p.id,
            name: p.name,
            category: 'produce',
            displayCategory: 'Vegetables',
            image: p.photo_url || getProduceImage(p.name),
            defaultPrice: Number(p.price) || 3.5,
            defaultUnit: p.unit || 'lb',
            liveProductCount: liveCount,
            liveProduct: p,
            description: `Freshly harvested ${p.name} from local neighbors.`,
          })
        }
      })

      // Sort items with live listings first!
      displayList.sort((a, b) => {
        if (b.liveProductCount !== a.liveProductCount) {
          return b.liveProductCount - a.liveProductCount
        }
        return a.name.localeCompare(b.name)
      })

      setProduceItems(displayList)
    } catch (err) {
      console.error('Error loading market produce data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [buyerLat, buyerLng, supabase])

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

  // ── 5. Produce Filter Logic ──
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return produceItems.filter((item) => {
      const matchesSearch = !q || item.name.toLowerCase().includes(q)
      let matchesCat = true

      if (activeCategory === 'vegetables') {
        matchesCat = item.category === 'produce' && item.displayCategory !== 'Fruit' && item.displayCategory !== 'Citrus'
      } else if (activeCategory === 'fruit') {
        matchesCat = item.displayCategory === 'Fruit' || item.displayCategory === 'Citrus'
      } else if (activeCategory === 'herbs') {
        matchesCat = item.category === 'herbs'
      } else if (activeCategory === 'honey_eggs') {
        matchesCat = item.category === 'honey' || item.category === 'eggs'
      } else if (activeCategory === 'plants') {
        matchesCat = item.category === 'flowers' || item.category === 'seedlings' || item.category === 'plants'
      }

      return matchesSearch && matchesCat
    })
  }, [produceItems, searchQuery, activeCategory])

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
      {/* ── TOP HEADER: 1. Add Produce -> 2. Categories -> 3. Search & Location ── */}
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

          {/* 2. Category Filter Pills */}
          <div className={styles.categoryPillsRow}>
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`${styles.categoryPill} ${
                  activeCategory === tab.id ? styles.categoryPillActive : ''
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 3. Search & Location Bar */}
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
            {filteredItems.length === 0 && searchQuery && (
              <div id="no-produce-matches" className={styles.zeroResultsCard}>
                <div className={styles.zeroIcon}>🌱</div>
                <div className={styles.zeroTitle}>
                  No produce found matching &ldquo;{searchQuery}&rdquo;
                </div>
                <p className={styles.zeroSub}>
                  Want to list your harvest on a neighborhood stand?
                </p>
                <Link
                  href={searchQuery.trim() ? `/my-booth/products/new?name=${encodeURIComponent(searchQuery.trim())}` : '/my-booth/products/new'}
                  className={styles.zeroAddBtn}
                >
                  <span>+</span> List on Neighborhood Stand
                </Link>
              </div>
            )}

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
                  <div className={styles.produceImageWrapper}>
                    <img
                      src={myListing?.photoUrl || item.image}
                      alt={item.name}
                      onError={(e: any) => {
                        e.currentTarget.src = '/images/produce_placeholder.jpg'
                      }}
                      className={styles.produceImage}
                    />
                  </div>

                  <div className={styles.produceCardContent}>
                    <div className={styles.produceTitleRow}>
                      <h3 className={styles.produceTitle}>{item.name}</h3>
                      <span className={styles.priceBadge}>
                        ~${item.defaultPrice.toFixed(2)} / {item.defaultUnit}
                      </span>
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
            setUserExistingDemand((prev) => ({
              ...prev,
              [name.toLowerCase()]: { quantity: qty, unit },
            }))
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
