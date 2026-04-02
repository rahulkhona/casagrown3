'use client'


import { use, useState, useEffect , Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../../../../lib/supabase'
import { formatUsd } from '../../../../../../../lib/store'
import { useAuth } from '../../../../../../../lib/useAuth'
import { useMarketStatus } from '../../../../../../../lib/useMarketStatus'
import { hasValidWindows } from '../../../../../../../lib/windowUtils'
import { geocodeAddress } from '../../../../../../../lib/geocode'
import { getWindowDays, anonymizeAddress } from '../../../../../../../lib/windowDisplay'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import BuyModal from '../../../../../../components/BuyModal'
import { FlagModal } from '../../../../../../components/FlagModal'
import { ShareIcon } from '../../../../../../components/icons'
import { ProductQA } from '../../../../../../components/ProductQA'
import { NotificationPromptModal } from '../../../../../../components/NotificationPromptModal'
import { useErrorToast } from '../../../../../../components/ErrorToast'
import { useNotificationPrompt } from '../../../../../../../lib/useNotificationPrompt'
import { useCart } from '../../../../../../../lib/useCart'
import styles from './page.module.css'

// Haversine distance in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
function metersToMiles(m: number): number { return m / 1609.344 }

function ProductDetailPageInner({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id: boothId, productId } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isAuthenticated, profileComplete } = useAuth()
  const { isOpen: marketIsOpen, nextOpenDate, loading: marketLoading } = useMarketStatus()
  const autoBuy = searchParams.get('autoBuy') === 'true'
  const [product, setProduct] = useState<any>(null)
  const [booth, setBooth] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [showBuy, setShowBuy] = useState(false)
  const [buyerZip, setBuyerZip] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [showFlag, setShowFlag] = useState(false)
  const [flagged, setFlagged] = useState(false)
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  // Reminder state
  const [reminderSet, setReminderSet] = useState(false)
  const [reminderLoading, setReminderLoading] = useState(false)
  const { showSuccess, showInfo, showError } = useErrorToast()
  const [sellerRating, setSellerRating] = useState<{ avg: number; count: number } | null>(null)


  const cart = useCart()
  const existingCartQty = cart.getItemQty(productId)
  const [cartQty, setCartQty] = useState(existingCartQty || 1)
  const [cartToast, setCartToast] = useState<string | null>(null)

  // Detect demo product
  const isDemo = productId.startsWith('demo-')

  // ── Distance checking state ──
  const [buyerLat, setBuyerLat] = useState<number | null>(null)
  const [buyerLng, setBuyerLng] = useState<number | null>(null)
  const [sellerLat, setSellerLat] = useState<number | null>(null)
  const [sellerLng, setSellerLng] = useState<number | null>(null)
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null)
  const [withinDelivery, setWithinDelivery] = useState<boolean | null>(null)
  const [altAddress, setAltAddress] = useState('')
  const [checkingAltAddr, setCheckingAltAddr] = useState(false)
  const [showAltAddrInput, setShowAltAddrInput] = useState(false)
  const [addrLabel, setAddrLabel] = useState('Your address')

  useEffect(() => {
    const load = async () => {
      // Demo products: load from sessionStorage (cached by market page)
      if (isDemo) {
        try {
          const cachedProduct = sessionStorage.getItem(`demo_product_${productId}`)
          const cachedBooth = sessionStorage.getItem(`demo_booth_${boothId}`)
          if (cachedProduct) setProduct(JSON.parse(cachedProduct))
          if (cachedBooth) {
            const bd = JSON.parse(cachedBooth)
            setBooth(bd)
            if (bd.seller_avg_rating) {
              setSellerRating({ avg: bd.seller_avg_rating, count: bd.seller_rating_count || 0 })
            }
          }
        } catch {}
        setLoading(false)
        return
      }

      const [{ data: prod }, { data: boothData }] = await Promise.all([
        supabase.from('market_products').select('*').eq('id', productId).eq('is_active', true).eq('is_draft', false).eq('moderation_status', 'approved').single(),
        supabase.from('market_booths').select('*').eq('id', boothId).single(),
      ])
      if (prod) setProduct(prod)
      if (boothData) {
        // Fetch seller profile for rating + pickup address fallback
        const { data: profileData } = await supabase
          .from('profiles')
          .select('seller_avg_rating, seller_rating_count, street_address, city, state_code, zip_plus4')
          .eq('id', boothData.owner_id)
          .single()
        if (profileData && profileData.seller_rating_count >= 5) {
          setSellerRating({ avg: profileData.seller_avg_rating, count: profileData.seller_rating_count })
        }
        // Derive pickup address from seller profile if not set on booth
        if (!boothData.pickup_address && profileData?.street_address) {
          const fullAddr = [profileData.street_address, profileData.city, profileData.state_code, profileData.zip_plus4].filter(Boolean).join(', ')
          boothData.pickup_address = fullAddr
          boothData.pickup_display_address = anonymizeAddress(fullAddr)
        } else if (boothData.pickup_address && !boothData.pickup_display_address) {
          boothData.pickup_display_address = anonymizeAddress(boothData.pickup_address)
        }
        setBooth(boothData)
      }
      setLoading(false)
    }
    load()
    try {
      const saved = new URLSearchParams(localStorage.getItem('market_search') || '')
      setBuyerZip(saved.get('zip') || '')
      setBuyerAddress(saved.get('addr') || '')
    } catch {}
  }, [productId, boothId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Geocode buyer and seller for distance checks ──
  // First try localStorage (from market browse), then fall back to profile address
  useEffect(() => {
    if (isDemo) return
    // Try localStorage first
    const saved = new URLSearchParams(localStorage.getItem('market_search') || '')
    const savedAddr = saved.get('addr') || ''
    if (savedAddr) {
      setAddrLabel(savedAddr)
      geocodeAddress(savedAddr).then(geo => {
        if (geo) { setBuyerLat(geo.lat); setBuyerLng(geo.lng) }
      })
      return
    }
    // Fall back to profile address
    if (!user) return
    supabase.from('profiles').select('street_address, city, state_code').eq('id', user.id).single()
      .then(({ data: profile }) => {
        if (profile?.street_address) {
          const addr = [profile.street_address, profile.city, profile.state_code].filter(Boolean).join(', ')
          setAddrLabel(addr)
          geocodeAddress(addr).then(geo => {
            if (geo) { setBuyerLat(geo.lat); setBuyerLng(geo.lng) }
          })
        }
      })
  }, [user, isDemo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!booth?.pickup_address || isDemo) return
    geocodeAddress(booth.pickup_address).then(geo => {
      if (geo) { setSellerLat(geo.lat); setSellerLng(geo.lng) }
    })
  }, [booth?.pickup_address, isDemo])

  useEffect(() => {
    if (buyerLat == null || buyerLng == null || sellerLat == null || sellerLng == null) return
    const dist = metersToMiles(haversineMeters(buyerLat, buyerLng, sellerLat, sellerLng))
    setDistanceMiles(Math.round(dist * 10) / 10)
    if (booth?.offers_delivery) {
      setWithinDelivery(dist <= (booth.delivery_radius_miles || 5))
    }
  }, [buyerLat, buyerLng, sellerLat, sellerLng, booth?.delivery_radius_miles, booth?.offers_delivery])

  const handleCheckAltAddress = async () => {
    if (!altAddress.trim()) return
    setCheckingAltAddr(true)
    const geo = await geocodeAddress(altAddress.trim())
    if (geo) { setBuyerLat(geo.lat); setBuyerLng(geo.lng); setAddrLabel(altAddress.trim()) }
    setCheckingAltAddr(false)
    setShowAltAddrInput(false)
    setAltAddress('')
  }

  // Load existing product reminder
  useEffect(() => {
    if (!user || !productId) return
    supabase.from('product_reminders').select('id').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
      .then(({ data }) => { if (data) setReminderSet(true) })
  }, [user, productId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open Buy modal when returning from login flow
  useEffect(() => {
    if (autoBuy && isAuthenticated && product && booth && !showBuy) {
      setShowBuy(true)
    }
  }, [autoBuy, isAuthenticated, product, booth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic poll for fresh product data (price, inventory) — every 30s + on tab focus
  // Skip for demo products (no real data to refresh)
  useEffect(() => {
    if (!product || isDemo) return
    const refreshProduct = async () => {
      const { data } = await supabase.rpc('refresh_product_data', { product_ids: [productId] })
      if (data && (data as any[]).length > 0) {
        const d = (data as any[])[0]
        setProduct((prev: any) => prev ? {
          ...prev,
          inventory: d.inventory,
          price_usd: Number(d.price_usd),
          is_active: d.is_active,
        } : prev)
      }
    }
    const interval = setInterval(refreshProduct, 30_000)
    const onFocus = () => { if (!document.hidden) refreshProduct() }
    document.addEventListener('visibilitychange', onFocus)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onFocus) }
  }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Window-based availability: check if product has any valid fulfillment windows
  const windowsExpired = product ? !hasValidWindows(
    product.window_dates,
    product.product_delivery_windows,
    product.product_pickup_windows,
  ) : false
  const isExpired = product?.expires_at ? new Date(product.expires_at) < new Date() : false
  const isClosed = windowsExpired || isExpired  // used by existing UI logic

  // Toggle product reminder
  const toggleReminder = async () => {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }
    if (profileComplete !== true) {
      router.push('/profile-setup')
      return
    }

    setReminderLoading(true)
    try {
      if (reminderSet) {
        // Remove reminder
        await supabase.from('product_reminders').delete().eq('user_id', user.id).eq('product_id', productId)
        setReminderSet(false)
        showInfo('Reminder removed')
      } else {
        // Set product reminder
        await supabase.from('product_reminders').upsert(
          { user_id: user.id, product_id: productId },
          { onConflict: 'user_id,product_id', ignoreDuplicates: true }
        )

        setReminderSet(true)
        showSuccess('🔔 Saved! We\'ll notify you when market opens')
      }
    } catch (err) {
      console.error('Reminder toggle failed:', err)
      showError('Failed to set reminder')
    }
    setReminderLoading(false)
  }

  if (loading || marketLoading) {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <p>Loading product...</p>
      </div>
    )
  }

  if (!product || !booth) {
    return (
      <div className="container" style={{ padding: 80, textAlign: 'center' }}>
        <h2>Product not found</h2>
        <Link href="/market" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Market</Link>
      </div>
    )
  }

  const photos = product.photos || []

  // Format next open date
  const nextOpenStr = nextOpenDate
    ? nextOpenDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) +
      ' at ' + nextOpenDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="container">
      {/* Demo Banner */}
      {isDemo && (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
          border: '1px solid #86efac', borderRadius: 12,
          padding: '12px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 24 }}>🌿</span>
          <div>
            <strong style={{ color: '#15803d', fontSize: 14 }}>Demo Listing</strong>
            <p style={{ margin: 0, fontSize: 13, color: '#166534' }}>
              This is a preview of what CasaGrown looks like. Purchases are not available for demo listings.
            </p>
          </div>
        </div>
      )}

      <div className={styles.breadcrumb}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--green-700)', cursor: 'pointer', padding: 0, font: 'inherit' }}>← Back</button>
        <span style={{ color: 'var(--gray-400)', margin: '0 6px' }}>/</span>
        <span>{product.name}</span>
      </div>

      <div className={styles.layout}>
        {/* Gallery */}
        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            {photos.length > 0 ? (
              <img src={photos[photoIndex]} alt={product.name} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, borderRadius: 'var(--radius-lg)' }}>🥬</div>
            )}
          </div>
          {photos.length > 1 && (
            <div className={styles.thumbs}>
              {photos.map((photo: string, i: number) => (
                <button key={i} className={`${styles.thumb} ${i === photoIndex ? styles.thumbActive : ''}`} onClick={() => setPhotoIndex(i)}>
                  <img src={photo} alt="" />
                </button>
              ))}
            </div>
          )}
          {isAuthenticated && user?.id !== product.seller_id && !isDemo && (
            <button
              className={styles.reportLink}
              onClick={() => setShowFlag(true)}
              disabled={flagged}
            >
              {flagged ? '✓ Reported' : 'Report this product'}
            </button>
          )}
        </div>

        {/* Details */}
        <div className={styles.details}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <span className="badge badge-green">
              {product.category?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
            </span>
            {isDemo && (
              <span className="badge" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>🌿 Demo</span>
            )}
          </div>
          <h1 className={styles.productName}>{product.name}</h1>
          {sellerRating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 14 }}>⭐</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-700)' }}>{sellerRating.avg}</span>
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>({sellerRating.count} ratings)</span>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>• Seller</span>
            </div>
          )}
          <p className={styles.productPrice}>
            {product.price_usd === 0 ? <span className="price price-large" style={{ color: '#16a34a' }}>Free</span> : <><span className="price price-large">{formatUsd(product.price_usd)}</span><span className={styles.unit}>/ {product.unit}</span></>}
          </p>
          {product.description && <p className={styles.productDesc}>{product.description}</p>}

          {/* Stock */}
          <div className={styles.stockInfo}>
            {isExpired ? (
              <span className="badge badge-red">⏰ Listing Expired</span>
            ) : product.inventory > 0 ? (
              <span className="badge badge-green">✓ In Stock ({product.inventory} available)</span>
            ) : (
              <span className="badge badge-red">Sold Out</span>
            )}
          </div>

          {/* Owner Share Button */}
          {isAuthenticated && user?.id === product.seller_id && !isDemo && (
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', padding: '10px 20px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={async () => {
                  const url = typeof window !== 'undefined' ? window.location.href : ''
                  const text = `Hey! Check out my fresh ${product.name} on CasaGrown Market 🌱\n\n${product.price_usd === 0 ? 'Free' : formatUsd(product.price_usd) + ' / ' + product.unit}\n\n🛒 ${url}`
                  if (navigator.share) {
                    try { await navigator.share({ title: `${product.name} on CasaGrown`, text, url }) } catch {}
                  } else {
                    try { 
                      await navigator.clipboard.writeText(text)
                      showSuccess('Product link copied to clipboard! 📋')
                    } catch {}
                  }
                }}
              >
                <ShareIcon size={16} /> Share Product
              </button>
            </div>
          )}

          {/* Windows Expired Banner + Reminder */}
          {windowsExpired && (
            <div style={{
              background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
              border: '1px solid #fbbf24',
              borderRadius: 'var(--radius-md, 12px)',
              padding: '16px 20px',
              marginTop: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>⏰</span>
                <strong style={{ color: '#92400e', fontSize: 15 }}>No delivery or pickup windows available</strong>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#92400e' }}>
                This product&apos;s fulfillment windows have passed. Set a reminder to be notified when it&apos;s available again!
              </p>
              <button
                onClick={toggleReminder}
                disabled={reminderLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 24,
                  border: reminderSet ? '2px solid #16a34a' : '2px solid #d97706',
                  background: reminderSet
                    ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
                    : 'linear-gradient(135deg, #fff, #fef9c3)',
                  color: reminderSet ? '#15803d' : '#92400e',
                  fontWeight: 600, fontSize: 14,
                  cursor: reminderLoading ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {reminderLoading ? '⏳' : reminderSet ? '✅' : '🔔'}
                {reminderLoading ? 'Saving...' : reminderSet ? 'Reminder Set — Tap to Remove' : 'Remind Me When Market Opens'}
              </button>
            </div>
          )}

          {/* Buy Now + Add to Cart (blocked for demo) */}
          <div style={{ marginTop: 16 }}>
            {isDemo ? (
              /* Demo: show blocked buttons + Start Selling CTA */
              <div>
                <button
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', fontSize: 16, opacity: 0.5, cursor: 'not-allowed' }}
                  disabled
                >
                  🌿 Demo — Buy Now Not Available
                </button>
                <button
                  style={{
                    width: '100%', marginTop: 8, padding: '12px 20px',
                    border: '2px solid var(--green-600, #16a34a)', borderRadius: 'var(--radius-md, 12px)',
                    background: 'var(--green-50, #f0fdf4)', color: 'var(--green-700, #15803d)',
                    fontSize: 16, fontWeight: 600, opacity: 0.5, cursor: 'not-allowed',
                  }}
                  disabled
                >
                  🛒 Add to Cart — Demo Only
                </button>
                <div style={{
                  marginTop: 16, padding: '16px 20px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                  border: '1px solid #86efac', textAlign: 'center',
                }}>
                  <p style={{ margin: '0 0 12px', fontSize: 14, color: '#166534' }}>
                    Want to see real listings like this? Start selling to your neighbors!
                  </p>
                  <Link
                    href={user ? '/my-booth/products/new?camera=true' : '/login?redirect=%2Fmy-booth%2Fproducts%2Fnew%3Fcamera%3Dtrue'}
                    style={{
                      display: 'inline-block', padding: '12px 28px', borderRadius: 12,
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: '#fff', fontWeight: 600, fontSize: 15,
                      textDecoration: 'none', boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
                    }}
                  >
                    🌱 Start Selling →
                  </Link>
                </div>
              </div>
            ) : (
              /* Real product: Qty above, Buy Now + Add to Cart side by side */
              <>
                {/* Qty selector — always visible when available */}
                {!windowsExpired && product.inventory > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-600)' }}>Qty:</span>
                    <button
                      className="btn"
                      style={{ width: 34, height: 34, padding: 0, fontSize: 18, borderRadius: '50%' }}
                      onClick={() => setCartQty(Math.max(1, cartQty - 1))}
                      disabled={cartQty <= 1}
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      max={product.inventory}
                      value={cartQty}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10)
                        if (!isNaN(v)) setCartQty(Math.max(1, Math.min(product.inventory, v)))
                      }}
                      style={{ width: 48, fontSize: 18, fontWeight: 600, textAlign: 'center', border: '1px solid var(--gray-200)', borderRadius: 6, padding: '2px 0', appearance: 'textfield', MozAppearance: 'textfield', WebkitAppearance: 'none' } as any}
                    />
                    <button
                      className="btn"
                      style={{ width: 34, height: 34, padding: 0, fontSize: 18, borderRadius: '50%' }}
                      onClick={() => setCartQty(Math.min(product.inventory, cartQty + 1))}
                      disabled={cartQty >= product.inventory}
                    >+</button>
                    <span style={{ fontSize: 13, color: 'var(--gray-500)', marginLeft: 4 }}>
                      {product.inventory} available
                    </span>
                  </div>
                )}

                {/* Buy Now + Add to Cart — side by side */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ flex: 1, fontSize: 14, padding: '12px 8px' }}
                    onClick={() => {
                      if (!isAuthenticated) {
                        router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
                        return
                      }
                      if (profileComplete !== true) {
                        router.push('/profile-setup')
                        return
                      }
                      setShowBuy(true)
                    }}
                    disabled={product.inventory === 0 || windowsExpired || isExpired}
                  >
                    {windowsExpired || isExpired
                      ? '⏰ Unavailable'
                      : product.inventory === 0
                        ? 'Sold Out'
                        : `⚡ ${product.price_usd === 0 ? 'Buy Now — Free' : `Buy Now`}`}
                  </button>

                  {!windowsExpired && !isExpired && product.inventory > 0 && (
                    <button
                      style={{
                        flex: 1, padding: '12px 8px',
                        border: '2px solid var(--green-600, #16a34a)', borderRadius: 'var(--radius-md, 12px)',
                        background: 'var(--green-50, #f0fdf4)', color: 'var(--green-700, #15803d)',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => {
                        if (!isAuthenticated) {
                          router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
                          return
                        }
                        if (profileComplete !== true) {
                          router.push('/profile-setup')
                          return
                        }
                        cart.addItem(
                          {
                            id: product.id,
                            name: product.name,
                            price_usd: product.price_usd,
                            unit: product.unit,
                            inventory: product.inventory,
                            photos: product.photos,
                            category: product.category,
                          },
                          {
                            id: booth.id,
                            name: booth.name,
                            offers_delivery: booth.offers_delivery,
                            offers_pickup: booth.offers_pickup,
                            pickup_address: booth.pickup_address,
                            delivery_radius_miles: booth.delivery_radius_miles,
                          },
                          cartQty
                        )
                        setCartToast(existingCartQty > 0 ? `Cart updated! (${cartQty} ${product.unit}${cartQty > 1 ? 's' : ''})` : `Added to cart! 🛒`)
                        setTimeout(() => setCartToast(null), 3000)
                      }}
                    >
                      {existingCartQty > 0
                        ? `🛒 In Cart (${existingCartQty})`
                        : `🛒 Add to Cart`}
                    </button>
                  )}
                </div>

                {existingCartQty > 0 && (
                  <button
                    style={{
                      width: '100%', marginTop: 8, padding: '10px', border: '1px solid var(--gray-300)',
                      borderRadius: 'var(--radius-md, 12px)', background: 'none', cursor: 'pointer',
                      fontSize: 14, color: 'var(--green-700, #15803d)', fontWeight: 500,
                    }}
                    onClick={() => router.push('/cart')}
                  >
                    View Cart →
                  </button>
                )}
              </>
            )}
          </div>

          {/* Harvest info */}
          {product.harvested_at && (
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 8 }}>
              🌱 Harvested {new Date(product.harvested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}

          {/* Fulfillment */}
          <div className={styles.deliverySection}>
            <h3 className={styles.sectionLabel}>Fulfillment Options</h3>
            <div className={styles.deliveryOptions}>
              {booth.offers_delivery && (
                <div className={styles.deliveryOption} style={{
                  background: withinDelivery === true ? '#f0fdf4' : withinDelivery === false ? '#fef2f2' : undefined,
                  border: withinDelivery === true ? '1px solid #86efac' : withinDelivery === false ? '1px solid #fca5a5' : undefined,
                  borderRadius: 8, padding: withinDelivery != null ? '8px 10px' : undefined,
                }}>
                  <span>🚗</span>
                  <div>
                    <strong>Delivery</strong>
                    {distanceMiles != null ? (
                      withinDelivery ? (
                        <small style={{ color: '#15803d', fontWeight: 600 }}>✅ Within range ({distanceMiles} mi)</small>
                      ) : (
                        <small style={{ color: '#dc2626', fontWeight: 600 }}>❌ Outside range ({distanceMiles} mi — max {booth.delivery_radius_miles} mi)</small>
                      )
                    ) : (
                      <small>Within {booth.delivery_radius_miles} miles</small>
                    )}
                    {/* Delivery time windows */}
                    {(() => {
                      const days = getWindowDays(product.window_dates, product.product_delivery_windows)
                      return days.length > 0 ? (
                        <div style={{ marginTop: 6 }}>
                          {days.map(day => (
                            <div key={day.date} style={{ marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)' }}>{day.label}</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                                {day.pills.map((p, i) => (
                                  <span key={i} style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                                    background: 'var(--green-50, #f0fdf4)', border: '1px solid var(--green-200, #bbf7d0)',
                                    fontSize: 11, fontWeight: 600, color: 'var(--green-700, #15803d)',
                                  }}>{p}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null
                    })()}
                    {/* Delivery address check — inline under delivery */}
                    {!isDemo && product.seller_id !== user?.id && (
                      <div style={{ marginTop: 6 }}>
                        {distanceMiles != null && (
                          <p style={{ fontSize: 11, color: 'var(--gray-400)', margin: '0 0 2px' }}>
                            📍 {addrLabel.length > 40 ? addrLabel.slice(0, 40) + '…' : addrLabel}
                          </p>
                        )}
                        {!showAltAddrInput ? (
                          <button
                            onClick={() => setShowAltAddrInput(true)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--green-600)',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                            }}
                          >
                            {distanceMiles != null ? '🔄 Check another address' : '📍 Check your distance'}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
                            <input
                              style={{
                                flex: 1, padding: '4px 8px', border: '1px solid var(--gray-200)',
                                borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none',
                              }}
                              placeholder="Enter address..."
                              value={altAddress}
                              onChange={e => setAltAddress(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleCheckAltAddress()}
                              autoFocus
                            />
                            <button
                              onClick={handleCheckAltAddress}
                              disabled={checkingAltAddr || !altAddress.trim()}
                              style={{
                                width: 24, height: 24, borderRadius: '50%', background: 'var(--green-600)',
                                color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                opacity: checkingAltAddr || !altAddress.trim() ? 0.4 : 1,
                              }}
                            >{checkingAltAddr ? '…' : '→'}</button>
                            <button
                              onClick={() => { setShowAltAddrInput(false); setAltAddress('') }}
                              style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: 12 }}
                            >✕</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {booth.offers_pickup && (
                <div className={styles.deliveryOption}>
                  <span>📍</span>
                  <div>
                    <strong>Pickup</strong>
                    {/* Anonymized location */}
                    {(() => {
                      const displayAddr = booth.pickup_display_address || anonymizeAddress(booth.pickup_address)
                      return displayAddr ? (
                        <small style={{ display: 'block' }}>{displayAddr}</small>
                      ) : null
                    })()}
                    {/* Pickup time windows */}
                    {(() => {
                      const days = getWindowDays(product.window_dates, product.product_pickup_windows)
                      return days.length > 0 ? (
                        <div style={{ marginTop: 6 }}>
                          {days.map(day => (
                            <div key={day.date} style={{ marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)' }}>{day.label}</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                                {day.pills.map((p, i) => (
                                  <span key={i} style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                                    background: 'var(--blue-50, #eff6ff)', border: '1px solid var(--blue-200, #bfdbfe)',
                                    fontSize: 11, fontWeight: 600, color: 'var(--blue-700, #1d4ed8)',
                                  }}>{p}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Q&A Section */}
      <ProductQA productId={productId} sellerId={product.seller_id} isDemo={isDemo} productName={product.name} productDescription={product.description} />

      {/* Message Seller — below Q&A so users can check answers first */}
      {!isDemo && isAuthenticated && user?.id !== product.seller_id && (
        <div style={{ padding: '0 0 16px' }}>
          <Link
            href={`/messages/new?userId=${product.seller_id}&productId=${product.id}&name=${encodeURIComponent(booth.name || 'Seller')}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '12px 20px',
              border: '2px solid var(--green-200, #bbf7d0)', borderRadius: 'var(--radius-md, 12px)',
              background: 'var(--green-50, #f0fdf4)', color: 'var(--green-700, #15803d)', textAlign: 'center',
              fontSize: 16, fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
            }}
          >
            💬 Message Seller
          </Link>
        </div>
      )}

      {/* Buy Modal — never shown for demo */}
      {showBuy && !isDemo && (
        <BuyModal
          product={product}
          booth={booth}
          buyerZip={buyerZip}
          buyerAddress={buyerAddress}
          onClose={() => setShowBuy(false)}
          onSuccess={(order) => {
            setShowBuy(false)
            showSuccess(`Order placed! Hold: $${order.holdAmount.toFixed(2)}. You'll only be charged the net amount at end of day.`)
            showPrompt()
            router.push(`/market/booth/${boothId}`)
          }}
        />
      )}

      {/* Flag Modal — not for demo */}
      {showFlag && product && !isDemo && (
        <FlagModal
          productId={product.id}
          productName={product.name}
          onClose={() => setShowFlag(false)}
          onFlagged={() => setFlagged(true)}
        />
      )}

      {/* Notification Prompt Modal */}
      <NotificationPromptModal {...modalProps} />

      {/* Cart Toast */}
      {cartToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--green-700, #15803d)', color: '#fff', padding: '10px 20px',
          borderRadius: 24, fontSize: 14, zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'fadeInUp 0.3s ease',
        }}>
          {cartToast}
        </div>
      )}
    </div>
  )
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ProductDetailPageInner params={params} />
    </Suspense>
  )
}
