'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase'
import { geocodeAddress } from '../../../../lib/geocode'
import { getWindowDays, anonymizeAddress } from '../../../../lib/windowDisplay'
import styles from '../page.module.css'

// Haversine distance in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function metersToMiles(m: number): number { return m / 1609.344 }

interface ProductListingCardProps {
  productId: string
  messageContent: string
  currentUserId?: string
}

interface ProductData {
  id: string
  name: string
  description: string | null
  price_usd: number
  unit: string
  photos: string[]
  category: string
  inventory: number
  is_active: boolean
  seller_id: string
  expires_at: string | null
  window_dates: string[] | null
  product_delivery_windows: any[] | null
  product_pickup_windows: any[] | null
}

interface BoothData {
  id: string
  name: string
  offers_delivery: boolean
  offers_pickup: boolean
  delivery_radius_miles: number
  pickup_address: string | null
  pickup_display_address: string | null
  owner_id: string
}

export default function ProductListingCard({ productId, currentUserId }: ProductListingCardProps) {
  const [product, setProduct] = useState<ProductData | null>(null)
  const [booth, setBooth] = useState<BoothData | null>(null)
  const [loading, setLoading] = useState(true)
  const [photoIndex, setPhotoIndex] = useState(0)
  
  // Distance checking state
  const [buyerLat, setBuyerLat] = useState<number | null>(null)
  const [buyerLng, setBuyerLng] = useState<number | null>(null)
  const [sellerLat, setSellerLat] = useState<number | null>(null)
  const [sellerLng, setSellerLng] = useState<number | null>(null)
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null)
  const [withinDelivery, setWithinDelivery] = useState<boolean | null>(null)
  const [altAddress, setAltAddress] = useState('')
  const [checkingAddress, setCheckingAddress] = useState(false)
  const [showAltInput, setShowAltInput] = useState(false)
  const [addressLabel, setAddressLabel] = useState('Your address')

  const supabase = createClient()

  // Fetch product + booth data
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: prod } = await supabase
        .from('market_products')
        .select('id, name, description, price_usd, unit, photos, category, inventory, is_active, seller_id, expires_at, window_dates, product_delivery_windows, product_pickup_windows')
        .eq('id', productId)
        .single()
      
      if (!prod || cancelled) { setLoading(false); return }
      setProduct(prod)

      const { data: b } = await supabase
        .from('market_booths')
        .select('id, name, offers_delivery, offers_pickup, delivery_radius_miles, pickup_address, pickup_display_address, owner_id')
        .eq('owner_id', prod.seller_id)
        .single()
      if (b && !cancelled) {
        // Derive pickup address from seller profile if not set on booth
        if (!b.pickup_address || !b.pickup_display_address) {
          const { data: sellerProfile } = await supabase
            .from('profiles')
            .select('street_address, city, state_code, zip_plus4')
            .eq('id', prod.seller_id)
            .single()
          if (sellerProfile?.street_address) {
            if (!b.pickup_address) {
              const fullAddr = [sellerProfile.street_address, sellerProfile.city, sellerProfile.state_code, sellerProfile.zip_plus4].filter(Boolean).join(', ')
              b.pickup_address = fullAddr
              b.pickup_display_address = anonymizeAddress(fullAddr)
            } else if (!b.pickup_display_address) {
              b.pickup_display_address = anonymizeAddress(b.pickup_address)
            }
          }
        }
        setBooth(b)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve buyer's location from profile
  useEffect(() => {
    if (!currentUserId) return
    async function resolveBuyer() {
      const { data: profile } = await supabase
        .from('profiles')
        .select('street_address, city, state_code, zip_code')
        .eq('id', currentUserId)
        .single()
      if (profile?.street_address) {
        const addr = [profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', ')
        setAddressLabel(addr)
        const geo = await geocodeAddress(addr)
        if (geo) { setBuyerLat(geo.lat); setBuyerLng(geo.lng) }
      }
    }
    resolveBuyer()
  }, [currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve seller's location from their profile address (delivery origin)
  useEffect(() => {
    if (!product) return
    async function resolveSeller() {
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('street_address, city, state_code, zip_code')
        .eq('id', product!.seller_id)
        .single()
      if (sellerProfile?.street_address) {
        const addr = [sellerProfile.street_address, sellerProfile.city, sellerProfile.state_code].filter(Boolean).join(', ')
        const geo = await geocodeAddress(addr)
        if (geo) { setSellerLat(geo.lat); setSellerLng(geo.lng) }
      }
    }
    resolveSeller()
  }, [product, booth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute distance when both locations are available
  useEffect(() => {
    if (buyerLat == null || buyerLng == null || sellerLat == null || sellerLng == null) return
    const dist = metersToMiles(haversineMeters(buyerLat, buyerLng, sellerLat, sellerLng))
    setDistanceMiles(Math.round(dist * 10) / 10)
    if (booth?.offers_delivery) {
      setWithinDelivery(dist <= (booth.delivery_radius_miles || 5))
    }
  }, [buyerLat, buyerLng, sellerLat, sellerLng, booth?.delivery_radius_miles, booth?.offers_delivery])

  // Handle alternative address check
  const handleCheckAddress = async () => {
    if (!altAddress.trim()) return
    setCheckingAddress(true)
    const geo = await geocodeAddress(altAddress.trim())
    if (geo) {
      setBuyerLat(geo.lat)
      setBuyerLng(geo.lng)
      setAddressLabel(altAddress.trim())
    }
    setCheckingAddress(false)
    setShowAltInput(false)
    setAltAddress('')
  }

  if (loading) {
    return (
      <div className={styles.productCardSkeleton}>
        <div className={styles.skeletonShimmer} />
      </div>
    )
  }

  if (!product) {
    return (
      <div className={styles.productCardUnavailable}>
        <span>🚫</span>
        <span>This listing is no longer available</span>
      </div>
    )
  }

  const isExpired = product.expires_at && new Date(product.expires_at) < new Date()
  const isSoldOut = product.inventory <= 0
  const isUnavailable = !product.is_active || isExpired || isSoldOut
  const photos = product.photos || []
  const isSeller = currentUserId === product.seller_id

  const formatPrice = (price: number) => {
    if (price === 0) return 'Free'
    return `$${price.toFixed(2)}`
  }

  return (
    <div className={styles.productListingCard}>
      {/* Photo carousel */}
      {photos.length > 0 && (
        <div className={styles.plcPhotoWrap}>
          <img
            src={photos[photoIndex]}
            alt={product.name}
            className={styles.plcPhoto}
          />
          {photos.length > 1 && (
            <>
              <button
                className={`${styles.plcPhotoNav} ${styles.plcPhotoNavLeft}`}
                onClick={(e) => { e.preventDefault(); setPhotoIndex((photoIndex - 1 + photos.length) % photos.length) }}
              >‹</button>
              <button
                className={`${styles.plcPhotoNav} ${styles.plcPhotoNavRight}`}
                onClick={(e) => { e.preventDefault(); setPhotoIndex((photoIndex + 1) % photos.length) }}
              >›</button>
              <div className={styles.plcPhotoDots}>
                {photos.map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.plcDot} ${i === photoIndex ? styles.plcDotActive : ''}`}
                    onClick={(e) => { e.preventDefault(); setPhotoIndex(i) }}
                  />
                ))}
              </div>
            </>
          )}
          {/* Status badges */}
          {isUnavailable && (
            <div className={styles.plcBadgeOverlay}>
              {isSoldOut ? (
                <span className={styles.plcBadgeSoldOut}>Sold Out</span>
              ) : isExpired ? (
                <span className={styles.plcBadgeExpired}>Expired</span>
              ) : (
                <span className={styles.plcBadgeInactive}>Unavailable</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Product info */}
      <div className={styles.plcInfo}>
        <div className={styles.plcHeader}>
          {booth ? (
            <Link href={`/market/booth/${booth.id}/product/${product.id}`} className={styles.plcName} style={{ textDecoration: 'none', color: 'inherit' }}>
              <h4 className={styles.plcName} style={{ margin: 0 }}>{product.name}</h4>
            </Link>
          ) : (
            <h4 className={styles.plcName}>{product.name}</h4>
          )}
          <span className={styles.plcPrice}>
            {formatPrice(product.price_usd)}<span className={styles.plcUnit}>/{product.unit}</span>
          </span>
        </div>

        {product.description && (
          <p className={styles.plcDesc}>{product.description}</p>
        )}

        <div className={styles.plcMeta}>
          <span className={styles.plcCategory}>
            {product.category.replace(/_/g, ' ')}
          </span>
          {!isSoldOut && (
            <span className={styles.plcInventory}>
              {product.inventory} available
            </span>
          )}
        </div>

        {/* Fulfillment options */}
        {booth && (
          <div className={styles.plcFulfillment}>
            {booth.offers_delivery && (
              <div className={`${styles.plcFulfillmentOption} ${withinDelivery === true ? styles.plcFulfillmentOk : withinDelivery === false ? styles.plcFulfillmentNo : ''}`}>
                <span className={styles.plcFulfillmentIcon}>🚗</span>
                <div className={styles.plcFulfillmentText}>
                  <span className={styles.plcFulfillmentLabel}>Delivery</span>
                  {distanceMiles != null ? (
                    withinDelivery ? (
                      <span className={styles.plcFulfillmentStatus}>✅ Within range ({distanceMiles} mi)</span>
                    ) : (
                      <span className={styles.plcFulfillmentStatusNo}>❌ Outside range ({distanceMiles} mi — max {booth.delivery_radius_miles} mi)</span>
                    )
                  ) : (
                    <span className={styles.plcFulfillmentHint}>Within {booth.delivery_radius_miles} mi</span>
                  )}
                  {(() => {
                    const days = getWindowDays(product.window_dates, product.product_delivery_windows)
                    return days.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                        {days.slice(0, 2).flatMap(day =>
                          day.pills.slice(0, 2).map((p, i) => (
                            <span key={`${day.date}-${i}`} style={{
                              display: 'inline-block', padding: '1px 6px', borderRadius: 10,
                              background: 'var(--green-50, #f0fdf4)', border: '1px solid var(--green-200, #bbf7d0)',
                              fontSize: 10, fontWeight: 600, color: 'var(--green-700, #15803d)',
                            }}>{day.label.split(' ')[0]} {p}</span>
                          ))
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
              </div>
            )}

            {booth.offers_pickup && (
              <div className={styles.plcFulfillmentOption}>
                <span className={styles.plcFulfillmentIcon}>📍</span>
                <div className={styles.plcFulfillmentText}>
                  <span className={styles.plcFulfillmentLabel}>Pickup</span>
                  {(() => {
                    const displayAddr = booth.pickup_display_address || anonymizeAddress(booth.pickup_address)
                    return displayAddr ? (
                      <span className={styles.plcFulfillmentHint}>{displayAddr}</span>
                    ) : null
                  })()}
                  {distanceMiles != null && (
                    <span className={styles.plcFulfillmentHint}>{distanceMiles} mi from you</span>
                  )}
                  {(() => {
                    const days = getWindowDays(product.window_dates, product.product_pickup_windows)
                    return days.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                        {days.slice(0, 2).flatMap(day =>
                          day.pills.slice(0, 2).map((p, i) => (
                            <span key={`${day.date}-${i}`} style={{
                              display: 'inline-block', padding: '1px 6px', borderRadius: 10,
                              background: 'var(--blue-50, #eff6ff)', border: '1px solid var(--blue-200, #bfdbfe)',
                              fontSize: 10, fontWeight: 600, color: 'var(--blue-700, #1d4ed8)',
                            }}>{day.label.split(' ')[0]} {p}</span>
                          ))
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
              </div>
            )}

            {/* Address check section */}
            {(booth.offers_delivery || booth.offers_pickup) && !isSeller && (
              <div className={styles.plcAddressCheck}>
                {distanceMiles != null && (
                  <span className={styles.plcAddressFrom}>
                    📍 Your location: {addressLabel.length > 40 ? addressLabel.slice(0, 40) + '…' : addressLabel}
                  </span>
                )}
                {!showAltInput ? (
                  <button
                    className={styles.plcCheckBtn}
                    onClick={(e) => { e.preventDefault(); setShowAltInput(true) }}
                  >
                    {distanceMiles != null ? '🔄 Check another address' : '📍 Check your distance'}
                  </button>
                ) : (
                  <div className={styles.plcAltForm}>
                    <input
                      className={styles.plcAltInput}
                      placeholder="Enter address to check..."
                      value={altAddress}
                      onChange={e => setAltAddress(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCheckAddress()}
                      autoFocus
                    />
                    <button
                      className={styles.plcAltSubmit}
                      onClick={handleCheckAddress}
                      disabled={checkingAddress || !altAddress.trim()}
                    >
                      {checkingAddress ? '...' : '→'}
                    </button>
                    <button
                      className={styles.plcAltCancel}
                      onClick={() => { setShowAltInput(false); setAltAddress('') }}
                    >✕</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        {booth && !isSeller && (
          <Link
            href={`/market/booth/${booth.id}/product/${product.id}`}
            className={`${styles.plcCta} ${isUnavailable ? styles.plcCtaDisabled : ''}`}
            onClick={e => { if (isUnavailable) e.preventDefault() }}
          >
            {isUnavailable ? (isSoldOut ? 'Sold Out' : 'Unavailable') : (product.price_usd === 0 ? 'Get — Free' : 'View & Purchase →')}
          </Link>
        )}
        {isSeller && (
          <Link href={`/my-booth/products/new?edit=${product.id}`} className={styles.plcCta}>
            ✏️ Edit Listing
          </Link>
        )}
      </div>
    </div>
  )
}
