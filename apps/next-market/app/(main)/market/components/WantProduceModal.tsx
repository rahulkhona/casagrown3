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
} from '../../../../lib/groceryDelivery'
import {
  FULFILLMENT_PRESET_OPTIONS,
  FulfillmentPresetType,
  getWindowsForPreset,
  isHourSelected,
  toggleHourCell,
  inferProduceUnitAndPrice,
} from '../../../../lib/bulkListingUtils'
import { EXHAUSTIVE_INTERESTS_CATALOG } from '../../../../lib/interestCatalog'
import styles from './WantProduceModal.module.css'

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
  offers_pickup?: boolean
  offers_delivery?: boolean
  stock_quantity?: number
  rating?: { avg: number; count: number }
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
  const { user } = useAuth()
  const { requireAuth } = useQuickSetup()
  const { addItem } = useCart()

  const [showSignalForm, setShowSignalForm] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [quantity, setQuantity] = useState(initialQty)
  const [unit, setUnit] = useState(initialUnit)
  const [fulfillmentPref, setFulfillmentPref] = useState<'either' | 'pickup' | 'delivery'>('either')

  // ── 7-Day Matrix Day Options for Custom Calendar ──
  const dayOptions = React.useMemo(() => {
    const localToday = new Date()
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const options: { date: string; label: string; isWeekend: boolean }[] = []
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() + offset)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      const label = DAY_SHORT[d.getDay()]
      options.push({ date: dateStr, label, isWeekend })
    }
    return options
  }, [])

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

  // ── Separate Windows for Pickup & Delivery ──
  const [pickupPreset, setPickupPreset] = useState<FulfillmentPresetType>('both')
  const [customPickupWindows, setCustomPickupWindows] = useState<Record<string, string[]>>(() => getWindowsForPreset('both'))
  const [deliveryPreset, setDeliveryPreset] = useState<FulfillmentPresetType>('both')
  const [customDeliveryWindows, setCustomDeliveryWindows] = useState<Record<string, string[]>>(() => getWindowsForPreset('both'))
  
  // CasaGrown Cart Integration
  const cart = useCart()
  const [cartFeedback, setCartFeedback] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Tier (c): Nearby USDA Farmers Markets & Farms
  const [usdaMarkets, setUsdaMarkets] = useState<UsdaMarketItem[]>([])
  const [isLoadingUsda, setIsLoadingUsda] = useState(false)

  // Regional supermarket banner & delivery links
  const krogerBanner = getRegionalKrogerBanner(currentZipcode)
  const partnerStoreInfo = getPartnerStoreDisplay(cropName)
  const instacartUrl = getInstacartItemUrl(cropName, currentZipcode)
  const krogerUrl = getKrogerItemUrl(cropName, currentZipcode)

  const prevCropNameRef = React.useRef(cropName)
  const prevIsOpenRef = React.useRef(isOpen)

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

      const resolvedPickupWindows = pickupPreset === 'custom'
        ? customPickupWindows
        : getWindowsForPreset(pickupPreset)

      const resolvedDeliveryWindows = deliveryPreset === 'custom'
        ? customDeliveryWindows
        : getWindowsForPreset(deliveryPreset)

      const res = await fetch('/api/interest/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          zipcodes: [currentZipcode.trim() || '95125'],
          preference_pickup: fulfillmentPref === 'pickup' || fulfillmentPref === 'either',
          preference_delivery: fulfillmentPref === 'delivery' || fulfillmentPref === 'either',
          accepts_email: true,
          accepts_push: true,
          source_url: '/market',
          metadata: {
            fulfillment_pref: fulfillmentPref,
            benchmark_unit_price: benchmarkInfo.price,
            estimated_total_value: parseFloat(estimatedTotal),
            pickup_preset: pickupPreset,
            delivery_preset: deliveryPreset,
            weekly_pickup_windows: (fulfillmentPref === 'pickup' || fulfillmentPref === 'either') ? resolvedPickupWindows : null,
            weekly_delivery_windows: (fulfillmentPref === 'delivery' || fulfillmentPref === 'either') ? resolvedDeliveryWindows : null,
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

      trackEvent('button_click', '/market', {
        action: 'harvest_signal_submitted',
        cropName,
        quantity: numQty,
        unit,
        zipcode: currentZipcode,
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

    performSignalSubmission(numQty)
  }

  const handleAddInstacartToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    const numQty = parseFloat(quantity) || 1
    cart.addItem(
      {
        id: `commercial_instacart_${cropName.toLowerCase().replace(/\s+/g, '_')}`,
        name: `${cropName} (Instacart Supermarket)`,
        price_usd: Number((benchmarkInfo.price * 1.35).toFixed(2)),
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
    cart.addItem(
      {
        id: `commercial_kroger_${cropName.toLowerCase().replace(/\s+/g, '_')}`,
        name: `${cropName} (${krogerBanner} Delivery)`,
        price_usd: Number((benchmarkInfo.price * 1.30).toFixed(2)),
        unit: unit || benchmarkInfo.unit,
        inventory: 999,
        photos: cropImage ? [cropImage] : [],
        category: category || 'produce',
      },
      {
        id: 'booth_kroger_partner',
        name: `${krogerBanner} Delivery & Pickup`,
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
      banner: krogerBanner,
      cropName,
      zipcode: currentZipcode,
      quantity: numQty,
    })
    setCartFeedback(`Added ${numQty} ${unit || benchmarkInfo.unit} of ${cropName} to CasaGrown Cart!`)
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
              <p className={styles.cropSubtitle}>
                {hasActiveListings ? `${liveProducts.length} local stand(s) available in ${currentZipcode}` : `Signal growers in ${currentZipcode}`}
              </p>
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
              <h3 className={styles.successHubTitle}>Demand Signal Sent!</h3>
              <p className={styles.successHubDesc}>
                We&apos;ve notified local growers in <strong>{currentZipcode}</strong> that you want{' '}
                <strong>{quantity} {unit}</strong> of fresh <strong>{cropName}</strong> (est. <strong>~${estimatedTotal}</strong> at ~${benchmarkInfo.price.toFixed(2)}/{benchmarkInfo.unit}). You&apos;ll receive an instant alert the moment a neighbor lists!
              </p>
            </div>

            {/* Commercial Supermarket Delivery (Instacart & Kroger) */}
            <div className={styles.deliveryOptionsSection}>
              <div className={styles.sectionHeadingRow}>
                <span className={styles.sectionIcon}>🚚</span>
                <div>
                  <h4 className={styles.sectionTitle}>Need It Delivered Today?</h4>
                  <p className={styles.sectionSubtitle}>
                    Add commercial produce to your CasaGrown cart
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
                        {partnerStoreInfo.instacartDescription} in {currentZipcode} • Avg supermarket price: ~${(benchmarkInfo.price * 1.35).toFixed(2)}/{benchmarkInfo.unit}
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

                {/* Kroger Banner Card */}
                <div
                  className={styles.deliveryPartnerCard}
                  onClick={handleAddKrogerToCart}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.deliveryPartnerLeft}>
                    <div className={styles.krogerLogoBadge}>🏪</div>
                    <div>
                      <div className={styles.partnerName}>
                        {krogerBanner} <span className={styles.partnerPill}>Delivery & Pickup</span>
                      </div>
                      <div className={styles.partnerSub}>
                        Local supermarket delivery from your nearest {krogerBanner} • Avg supermarket price: ~${(benchmarkInfo.price * 1.3).toFixed(2)}/{benchmarkInfo.unit}
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
            <div className={styles.listingsHeader}>
              <span className={styles.listingsBadge}>
                <span className={styles.pulseDot}></span> Available from Neighbors
              </span>
              <span style={{ fontSize: '11px', color: 'var(--gray-500)' }}>Sorted by distance</span>
            </div>

            <div className={styles.listingsScrollList}>
              {liveProducts.map((prod) => {
                const dist = prod.distance_miles != null ? prod.distance_miles : 1.2
                const deliversToBuyer = prod.offers_delivery && (
                  (prod.delivery_zipcodes && prod.delivery_zipcodes.length > 0
                    ? prod.delivery_zipcodes.includes(currentZipcode.trim())
                    : true) &&
                  (dist == null || prod.delivery_radius_miles == null || dist <= (prod.delivery_radius_miles || 5))
                )

                return (
                  <div key={prod.id} className={styles.listingCard}>
                    {/* Top Row: Thumbnail + Stand Info + Price */}
                    <div className={styles.listingTopRow}>
                      <img
                        src={prod.photo_url || cropImage || '/images/produce_placeholder.jpg'}
                        alt={prod.name}
                        className={styles.listingThumb}
                      />
                      <div className={styles.listingMainContent}>
                        <div className={styles.listingHeaderLine}>
                          <span className={styles.standTitle}>
                            🏡 {prod.seller_name || 'Neighborhood Stand'}
                            {prod.rating && (
                              <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginLeft: 4 }}>
                                ⭐️ {prod.rating.avg.toFixed(1)}
                              </span>
                            )}
                          </span>
                          <span className={styles.listingPriceBadge}>
                            ${prod.price.toFixed(2)}<span className={styles.listingPriceUnit}>/{prod.unit}</span>
                          </span>
                        </div>

                        {prod.stock_quantity != null && (
                          <div className={styles.stockLine}>
                            {prod.stock_quantity > 0 ? `${prod.stock_quantity} available` : 'Sold out'}
                          </div>
                        )}

                        {/* Badges / Chips: Driving distance & Delivery area */}
                        <div className={styles.chipsContainer}>
                          {prod.offers_pickup && (
                            <div className={styles.pickupChip}>
                              <span>📍</span>
                              <span>
                                {prod.pickup_landmark ? prod.pickup_landmark : prod.pickup_display_address || 'Pickup'}
                                {` · ~${dist.toFixed(1)} mi driving distance`}
                              </span>
                              {prod.pickup_notice_minutes ? (
                                <span className={styles.noticeChip}>{prod.pickup_notice_minutes}m notice</span>
                              ) : null}
                            </div>
                          )}

                          {prod.offers_delivery && (
                            <div className={styles.deliveryChip}>
                              <span>🚗</span>
                              <span>
                                {deliversToBuyer
                                  ? `Delivers to your zip (${currentZipcode})`
                                  : `Delivers within ${prod.delivery_radius_miles || 5} mi`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: Buy Now & Add to Cart */}
                    <div className={styles.listingButtonRow}>
                      <button
                        type="button"
                        onClick={() => {
                          if (onBuyProduct) {
                            onBuyProduct(prod)
                          }
                        }}
                        className={styles.buyNowActionBtn}
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
                            1,
                            prod.offers_pickup ? 'pickup' : 'delivery'
                          )
                          setCartFeedback(`Added 1 ${prod.unit} of ${prod.name} to Cart!`)
                        }}
                        className={styles.cartActionBtn}
                      >
                        <span>🛒</span> + Cart
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={styles.signalPromptBanner}>
              <span>Need a custom quantity or looking for another harvest?</span>
              <button
                type="button"
                onClick={() => setShowSignalForm(true)}
                className={styles.signalLinkBtn}
              >
                Signal All Neighbors
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

            <div className={styles.infoBox}>
              <div className={styles.infoBoxTitle}>
                <span>🔔</span> Get Notified When Harvested
              </div>
              <p>
                Tell local growers what you need. You&apos;ll receive an instant alert the moment a neighbor lists fresh {cropName.toLowerCase()} so you can buy!
              </p>
            </div>

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

            {/* Pickup Schedule & Availability */}
            {(fulfillmentPref === 'pickup' || fulfillmentPref === 'either') && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  📍 Pickup Availability & Timing
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: pickupPreset === 'custom' ? 10 : 0 }}>
                  {FULFILLMENT_PRESET_OPTIONS.map((opt) => {
                    const isActive = pickupPreset === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setPickupPreset(opt.id)
                          if (opt.id !== 'custom') {
                            setCustomPickupWindows(getWindowsForPreset(opt.id))
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isActive ? '1.5px solid var(--green-600)' : '1px solid var(--gray-300)',
                          background: isActive ? 'var(--green-50)' : '#ffffff',
                          color: isActive ? 'var(--green-800)' : 'var(--gray-700)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {pickupPreset === 'custom' && (
                  <div style={{ background: '#f9fafb', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 10, marginTop: 8, overflowX: 'auto' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 6, textAlign: 'center' }}>
                      Tap hour cells when you can pickup from seller
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'center' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 28, padding: '2px' }}></th>
                          {dayOptions.map((d) => (
                            <th key={d.date} style={{ padding: '2px', fontWeight: 600, color: 'var(--gray-700)' }}>
                              {d.label.split(' ')[0]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 13 }).map((_, index) => {
                          const hour = 8 + index
                          const isPm = hour >= 12
                          const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                          const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`
                          return (
                            <tr key={hour}>
                              <td style={{ color: 'var(--gray-400)', padding: '2px 0', fontSize: 9 }}>{hourLabel}</td>
                              {dayOptions.map((opt) => {
                                const isSelected = isHourSelected(hour, customPickupWindows[opt.date] || [])
                                return (
                                  <td
                                    key={opt.date}
                                    onClick={() => toggleHourCell(opt.date, hour, customPickupWindows, setCustomPickupWindows)}
                                    style={{
                                      height: 18,
                                      border: '1px solid #e5e7eb',
                                      background: isSelected ? 'var(--green-500)' : '#ffffff',
                                      cursor: 'pointer',
                                      borderRadius: 2,
                                    }}
                                  />
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Delivery Schedule & Availability */}
            {(fulfillmentPref === 'delivery' || fulfillmentPref === 'either') && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  🚗 Delivery Availability & Timing
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: deliveryPreset === 'custom' ? 10 : 0 }}>
                  {FULFILLMENT_PRESET_OPTIONS.map((opt) => {
                    const isActive = deliveryPreset === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDeliveryPreset(opt.id)
                          if (opt.id !== 'custom') {
                            setCustomDeliveryWindows(getWindowsForPreset(opt.id))
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isActive ? '1.5px solid var(--green-600)' : '1px solid var(--gray-300)',
                          background: isActive ? 'var(--green-50)' : '#ffffff',
                          color: isActive ? 'var(--green-800)' : 'var(--gray-700)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {deliveryPreset === 'custom' && (
                  <div style={{ background: '#f9fafb', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 10, marginTop: 8, overflowX: 'auto' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 6, textAlign: 'center' }}>
                      Tap hour cells when you are home for doorstep delivery
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'center' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 28, padding: '2px' }}></th>
                          {dayOptions.map((d) => (
                            <th key={d.date} style={{ padding: '2px', fontWeight: 600, color: 'var(--gray-700)' }}>
                              {d.label.split(' ')[0]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 13 }).map((_, index) => {
                          const hour = 8 + index
                          const isPm = hour >= 12
                          const hourNum = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                          const hourLabel = `${hourNum}${isPm ? 'p' : 'a'}`
                          return (
                            <tr key={hour}>
                              <td style={{ color: 'var(--gray-400)', padding: '2px 0', fontSize: 9 }}>{hourLabel}</td>
                              {dayOptions.map((opt) => {
                                const isSelected = isHourSelected(hour, customDeliveryWindows[opt.date] || [])
                                return (
                                  <td
                                    key={opt.date}
                                    onClick={() => toggleHourCell(opt.date, hour, customDeliveryWindows, setCustomDeliveryWindows)}
                                    style={{
                                      height: 18,
                                      border: '1px solid #e5e7eb',
                                      background: isSelected ? 'var(--green-500)' : '#ffffff',
                                      cursor: 'pointer',
                                      borderRadius: 2,
                                    }}
                                  />
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submitSignalBtn}
            >
              <span>🔔</span> {isSubmitting ? 'Saving Request...' : 'Notify Me When Available'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
