'use client'


import { use, useState, useEffect, useMemo, Suspense } from 'react'
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
import SocialShareModal from '../../../../../../components/SocialShareModal'
import { getProductShareMessage } from '../../../../../../../lib/shareMessages'
import { ProductQA } from '../../../../../../components/ProductQA'
import { NotificationPromptModal } from '../../../../../../components/NotificationPromptModal'
import { useErrorToast } from '../../../../../../components/ErrorToast'
import { useNotificationPrompt } from '../../../../../../../lib/useNotificationPrompt'
import { useQuickSetup } from '../../../../../../../lib/useQuickSetup'
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
  const resolvedParams = params && typeof (params as any).then === 'function'
    ? params
    : Promise.resolve(params || {})
  const { id: boothId, productId } = use(resolvedParams)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isAuthenticated, profileComplete } = useAuth()
  const { isOpen: marketIsOpen, isScheduleOpen, nextOpenDate, productsNeverExpire, loading: marketLoading } = useMarketStatus()
  const autoBuy = searchParams.get('autoBuy') === 'true'
  const { requireAuth } = useQuickSetup()
  // Messenger PSID linking — capture from URL, link to profile for cross-seller memory
  const fbPsid = searchParams.get('fb_psid')
  const fbPage = searchParams.get('fb_page')
  const [product, setProduct] = useState<any>(null)
  const [booth, setBooth] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [showBuy, setShowBuy] = useState(false)
  const [selectedFulfillment, setSelectedFulfillment] = useState<'delivery' | 'pickup' | null>(null)
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
  const [sellerFirstName, setSellerFirstName] = useState<string | null>(null)
  const [sellerBiz, setSellerBiz] = useState<{
    farmName?: string; businessType?: string; sellerBio?: string;
    businessLicense?: string; foodHandlerPermit?: string;
    cottageFoodPermit?: string; insuranceProvider?: string;
  }>({})



  const cart = useCart()
  const existingCartQty = cart.getItemQty(productId)
  const [cartQty, setCartQty] = useState(existingCartQty || 1)
  const [cartToast, setCartToast] = useState<string | null>(null)

  // Quarantine check
  const [quarantineInfo, setQuarantineInfo] = useState<{ pest_name: string; county_name: string; source_url?: string } | null>(null)

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
  const [showShareModal, setShowShareModal] = useState(false)

  // Resolve effective radius and addresses (product-level overrides with booth fallbacks)
  const effectiveRadius = (product?.delivery_radius_miles !== undefined && product?.delivery_radius_miles !== null)
    ? product.delivery_radius_miles
    : booth?.delivery_radius_miles;

  const effectivePickupAddress = product?.pickup_address || booth?.pickup_address;

  const effectivePickupDisplayAddress = product?.pickup_address
    ? anonymizeAddress(product.pickup_address)
    : (booth?.pickup_display_address || (booth?.pickup_address ? anonymizeAddress(booth.pickup_address) : ''));

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
            if (!selectedFulfillment) setSelectedFulfillment(bd.offers_pickup ? 'pickup' : 'delivery')
            if (bd.seller_avg_rating) {
              setSellerRating({ avg: bd.seller_avg_rating, count: bd.seller_rating_count || 0 })
            }
          }
        } catch {}
        setLoading(false)
        return
      }

      const [{ data: prod }, { data: boothData }] = await Promise.all([
        supabase.from('market_products').select('*').eq('id', productId).single(),
        supabase.from('market_booths').select('*').or(`id.eq.${boothId},owner_id.eq.${boothId}`).single(),
      ])
      if (prod) setProduct(prod)
      if (boothData) {
        // Fetch seller profile for rating + pickup address fallback
        const { data: profileData } = await supabase
          .from('profiles')
          .select('seller_avg_rating, seller_rating_count, full_name, street_address, city, state_code, zip_plus4, farm_name, business_type, seller_bio, business_license, food_handler_permit, cottage_food_permit, insurance_provider')
          .eq('id', boothData.owner_id)
          .single()
        if (profileData?.full_name) {
          setSellerFirstName(profileData.full_name.split(' ')[0])
        }
        if (profileData && profileData.seller_rating_count >= 5) {
          setSellerRating({ avg: profileData.seller_avg_rating, count: profileData.seller_rating_count })
        }
        // Business info
        setSellerBiz({
          farmName: profileData?.farm_name || undefined,
          businessType: profileData?.business_type || undefined,
          sellerBio: profileData?.seller_bio || undefined,
          businessLicense: profileData?.business_license || undefined,
          foodHandlerPermit: profileData?.food_handler_permit || undefined,
          cottageFoodPermit: profileData?.cottage_food_permit || undefined,
          insuranceProvider: profileData?.insurance_provider || undefined,
        })

        // Derive pickup address from seller profile if not set on booth
        if (!boothData.pickup_address && profileData?.street_address) {
          const fullAddr = [profileData.street_address, profileData.city, profileData.state_code, profileData.zip_plus4].filter(Boolean).join(', ')
          boothData.pickup_address = fullAddr
          boothData.pickup_display_address = anonymizeAddress(fullAddr)
        } else if (boothData.pickup_address && !boothData.pickup_display_address) {
          boothData.pickup_display_address = anonymizeAddress(boothData.pickup_address)
        }
        setBooth(boothData)
        
        // Wait for product to be fully set before we evaluate productOffersPickup
        // Fallback initialized later in a separate useEffect
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
    const savedZip = saved.get('zip') || ''
    if (savedAddr) {
      setAddrLabel(savedAddr)
      if (savedZip) setBuyerZip(savedZip)
      geocodeAddress(savedAddr).then(geo => {
        if (geo) {
          setBuyerLat(geo.lat)
          setBuyerLng(geo.lng)
          if (geo.zipCode) setBuyerZip(geo.zipCode)
        }
      })
      return
    }
    // Fall back to profile address
    if (!user) return
    supabase.from('profiles').select('street_address, city, state_code, zip_code, zip_plus4').eq('id', user.id).single()
      .then(({ data: profile }: { data: any }) => {
        if (profile?.street_address) {
          const activeZip = profile.zip_plus4 ? profile.zip_plus4 : profile.zip_code
          const addr = [profile.street_address, profile.city, profile.state_code, activeZip].filter(Boolean).join(', ')
          setAddrLabel(addr)
          const zip = profile.zip_plus4 ? profile.zip_plus4.split('-')[0] : profile.zip_code
          if (zip) setBuyerZip(zip)
          geocodeAddress(addr).then(geo => {
            if (geo) {
              setBuyerLat(geo.lat)
              setBuyerLng(geo.lng)
              if (geo.zipCode) setBuyerZip(geo.zipCode)
            }
          })
        }
      })
  }, [user, isDemo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const addr = product?.pickup_address || booth?.pickup_address
    if (!addr || isDemo) return
    geocodeAddress(addr).then(geo => {
      if (geo) { setSellerLat(geo.lat); setSellerLng(geo.lng) }
    })
  }, [product?.pickup_address, booth?.pickup_address, isDemo])

  useEffect(() => {
    if (buyerLat == null || buyerLng == null || sellerLat == null || sellerLng == null) return
    const dist = metersToMiles(haversineMeters(buyerLat, buyerLng, sellerLat, sellerLng))
    setDistanceMiles(Math.round(dist * 10) / 10)
    if (booth?.offers_delivery) {
      let allowed = false
      if (booth.delivery_zipcodes && booth.delivery_zipcodes.length > 0 && buyerZip) {
        if (booth.delivery_zipcodes.includes(buyerZip)) {
          allowed = true
        }
      }
      if (!allowed) {
        const radius = (product?.delivery_radius_miles !== undefined && product?.delivery_radius_miles !== null)
          ? product.delivery_radius_miles
          : booth?.delivery_radius_miles
        if (radius != null && radius > 0) {
          allowed = dist <= radius
        } else if (radius === 0) {
          allowed = false
        } else {
          allowed = dist <= 5
        }
      }
      setWithinDelivery(allowed)
    }
  }, [buyerLat, buyerLng, sellerLat, sellerLng, product?.delivery_radius_miles, booth?.delivery_radius_miles, booth?.offers_delivery, booth?.delivery_zipcodes, buyerZip])

  const handleCheckAltAddress = async () => {
    if (!altAddress.trim()) return
    setCheckingAltAddr(true)
    const geo = await geocodeAddress(altAddress.trim())
    if (geo) {
      setBuyerLat(geo.lat)
      setBuyerLng(geo.lng)
      setAddrLabel(altAddress.trim())
      if (geo.zipCode) setBuyerZip(geo.zipCode)
    }
    setCheckingAltAddr(false)
    setShowAltAddrInput(false)
    setAltAddress('')
  }

  // Load existing product reminder
  useEffect(() => {
    if (!user || !productId) return
    supabase.from('product_reminders').select('id').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
      .then(({ data }: { data: any }) => { if (data) setReminderSet(true) })
  }, [user, productId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open Buy modal when returning from login flow
  useEffect(() => {
    if (autoBuy && isAuthenticated && product && booth && !showBuy) {
      setShowBuy(true)
    }
  }, [autoBuy, isAuthenticated, product, booth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Link Messenger PSID to profile for cross-seller bot memory
  useEffect(() => {
    if (!fbPsid || !fbPage || !user || isDemo) return
    supabase.rpc('link_psid_to_profile', {
      p_user_id: user.id, p_psid: fbPsid, p_page_id: fbPage,
    }).then(({ error }: { error: any }) => {
      if (error) console.warn('PSID link failed:', error.message)
      else console.log(`[PSID] Linked ${fbPsid} to profile ${user.id}`)
    })
  }, [fbPsid, fbPage, user, isDemo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Quarantine check — county-level only
  useEffect(() => {
    if (!product || isDemo) return
    supabase.rpc('check_quarantine_for_product', { p_product_id: productId })
      .then(({ data }: { data: any }) => {
        if (data && data.length > 0) {
          setQuarantineInfo({ pest_name: data[0].pest_name, county_name: data[0].county_name, source_url: data[0].source_url })
        }
      })
  }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Resolve fulfillment windows: product data takes priority, booth is fallback for empty arrays
  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const _now = new Date();
  const _todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
  const _tom = new Date(_now); _tom.setDate(_tom.getDate() + 1);
  const _tomorrowStr = `${_tom.getFullYear()}-${String(_tom.getMonth() + 1).padStart(2, '0')}-${String(_tom.getDate()).padStart(2, '0')}`;
  const _fallbackDates = [_todayStr, _tomorrowStr];

  function resolveWindows(
    productWindows: any,
    productDates: any,
    boothWeekly: any,
    boothFlat: any,
  ): { dates: string[]; windows: Record<string, any[]> | any[] } {
    // Product has real per-date windows → use them directly
    if (productWindows && typeof productWindows === 'object' && !Array.isArray(productWindows) && Object.keys(productWindows).length > 0) {
      return { dates: productDates?.length > 0 ? productDates : Object.keys(productWindows), windows: productWindows };
    }
    // Product has a flat array with items → use them
    if (Array.isArray(productWindows) && productWindows.length > 0) {
      return { dates: productDates?.length > 0 ? productDates : _fallbackDates, windows: productWindows };
    }
    // Empty or missing → fall back to booth
    if (boothWeekly && typeof boothWeekly === 'object' && !Array.isArray(boothWeekly)) {
      const perDate: Record<string, any[]> = {};
      for (const ds of _fallbackDates) {
        const [y, m, d] = ds.split('-').map(Number);
        const dayName = DAY_NAMES[new Date(y, m - 1, d).getDay()];
        const dayWindows = boothWeekly[dayName] || [];
        if (dayWindows.length > 0) perDate[ds] = dayWindows;
      }
      if (Object.keys(perDate).length > 0) return { dates: _fallbackDates, windows: perDate };
    }
    if (Array.isArray(boothFlat) && boothFlat.length > 0) {
      return { dates: _fallbackDates, windows: boothFlat };
    }
    return { dates: [], windows: [] };
  }

  const pickupResolved = resolveWindows(product?.product_pickup_windows, product?.window_dates, booth?.weekly_pickup_windows, booth?.pickup_windows);
  const deliveryResolved = resolveWindows(product?.product_delivery_windows, product?.window_dates, booth?.weekly_delivery_windows, booth?.delivery_windows);

  // Effective dates (union of pickup + delivery dates)
  const effectiveDates = Array.from(new Set([...pickupResolved.dates, ...deliveryResolved.dates])).sort();

  // Window-based availability
  const windowsExpired = product ? !hasValidWindows(
    effectiveDates.length > 0 ? effectiveDates : product.window_dates,
    deliveryResolved.windows,
    pickupResolved.windows,
  ) : false
  const isExpired = useMemo(() => {
    if (productsNeverExpire) return false
    if (product?.expires_at) {
      return new Date(product.expires_at) < new Date()
    }
    // Fallback: listing date (created_at) + 7 days
    const listingDate = product?.created_at ? new Date(product.created_at) : new Date()
    const fallbackExpiry = new Date(listingDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    return fallbackExpiry < new Date()
  }, [product?.expires_at, product?.created_at, productsNeverExpire])

  const isClosed = windowsExpired || isExpired

  // Fulfillment: null = seller didn't enable. Empty array or object = enabled (fall back to booth)
  const productOffersPickup = product?.product_pickup_windows === null ? false : (product?.product_pickup_windows != null || !!booth?.offers_pickup)
  const productOffersDelivery = product?.product_delivery_windows === null ? false : (product?.product_delivery_windows != null || !!booth?.offers_delivery)

  // Initialize selectedFulfillment once product data is loaded
  useEffect(() => {
    if (product && !selectedFulfillment) {
      setSelectedFulfillment(productOffersPickup ? 'pickup' : 'delivery')
    }
  }, [product, selectedFulfillment, productOffersPickup])
  // Toggle product reminder
  const toggleReminder = async () => {
    if (!user) {
      requireAuth({
        trigger: 'product_reminder',
        onReady: () => toggleReminder(),
      })
      return
    }
    if (profileComplete !== true) {
      requireAuth({
        trigger: 'product_reminder',
        onReady: () => toggleReminder(),
      })
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

  const distanceCheckerForm = (!isDemo && product.seller_id !== user?.id) ? (
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
            placeholder="Street, City, State ZIP"
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
  ) : null;

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
          <div className={styles.mainImage} style={{ position: 'relative' }}>
            {photos.length > 0 ? (
              <img src={photos[photoIndex]} alt={product.name} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, borderRadius: 'var(--radius-lg)' }}>🥬</div>
            )}
            {/* Carousel arrows */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)}
                  style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    width: 36, height: 36, borderRadius: '50%', border: 'none',
                    background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 18,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  aria-label="Previous photo"
                >‹</button>
                <button
                  onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    width: 36, height: 36, borderRadius: '50%', border: 'none',
                    background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 18,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  aria-label="Next photo"
                >›</button>
                {/* Dot indicators */}
                <div style={{
                  position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 6,
                }}>
                  {photos.map((_: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIndex(i)}
                      style={{
                        width: i === photoIndex ? 18 : 8, height: 8, borderRadius: 4, border: 'none',
                        background: i === photoIndex ? '#fff' : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer', transition: 'all 0.2s', padding: 0,
                      }}
                      aria-label={`Photo ${i + 1}`}
                    />
                  ))}
                </div>
              </>
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

          {/* Seller / Booth Info */}
          <div style={{
            padding: '12px 14px', marginTop: 8, marginBottom: 4,
            background: 'var(--gray-50, #f9fafb)', borderRadius: 12,
            border: '1px solid var(--gray-100, #f3f4f6)',
          }}>
            <Link
              href={`/market/booth/${boothId}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                textDecoration: 'none', color: 'inherit',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>🌱</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
                  {sellerBiz.farmName || booth.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {sellerFirstName ? `by ${sellerFirstName}` : 'View booth'} →
                </div>
              </div>
              {sellerRating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <span style={{ fontSize: 13 }}>⭐</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-700)' }}>{sellerRating.avg}</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>({sellerRating.count})</span>
                </div>
              )}
            </Link>

            {/* Bio */}
            {sellerBiz.sellerBio && (
              <p style={{ fontSize: 12, color: 'var(--gray-600)', margin: '8px 0 0', lineHeight: 1.5 }}>
                {sellerBiz.sellerBio.length > 120 ? sellerBiz.sellerBio.slice(0, 120) + '…' : sellerBiz.sellerBio}
              </p>
            )}

            {/* Business Type */}
            {sellerBiz.businessType && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#ecfdf5', color: '#065f46', fontWeight: 600 }}>
                  {({ hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm', cottage_food: '🏠 Cottage Food', urban_farm: '🏙️ Urban Farm', homestead: '🌾 Homestead', community_garden: '🌻 Community Garden', gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service', commercial: '🏢 Commercial' } as Record<string, string>)[sellerBiz.businessType] || sellerBiz.businessType}
                </span>
              </div>
            )}

            {/* Trust Badges */}
            {(sellerBiz.businessLicense || sellerBiz.foodHandlerPermit || sellerBiz.cottageFoodPermit || sellerBiz.insuranceProvider) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {sellerBiz.businessLicense && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>✓ Licensed</span>
                )}
                {sellerBiz.foodHandlerPermit && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>✓ Food Handler</span>
                )}
                {sellerBiz.cottageFoodPermit && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f0fdf4', color: '#166534', fontWeight: 600 }}>✓ Cottage Food</span>
                )}
                {sellerBiz.insuranceProvider && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f3e8ff', color: '#6b21a8', fontWeight: 600 }}>✓ Insured</span>
                )}
              </div>
            )}


          </div>
          <p className={styles.productPrice}>
            {product.price_usd === 0 ? <span className="price price-large" style={{ color: '#16a34a' }}>Free</span> : <><span className="price price-large">{formatUsd(product.price_usd)}</span><span className={styles.unit}>/ {product.unit}</span></>}
          </p>
          {product.harvested_at && (
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '4px 0 0' }}>
              🌱 Harvested {new Date(product.harvested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}

          {/* Stock */}
          <div className={styles.stockInfo}>
            {isExpired ? (
              <span className="badge badge-red">⏰ Listing Expired</span>
            ) : product.inventory > 0 ? (
              <span className="badge badge-green">✓ In Stock ({product.inventory} {product.unit === 'dozen' ? product.unit : product.unit === 'box' && product.inventory !== 1 ? 'boxes' : product.unit === 'bag' && product.inventory !== 1 ? 'bags' : product.unit !== 'piece' && product.unit !== 'each' ? product.unit : product.unit === 'each' ? 'each' : ''} available)</span>
            ) : (
              <span className="badge badge-red">Sold Out</span>
            )}
          </div>

          {product.description && <p className={styles.productDesc}>{product.description}</p>}

          {/* Share Button (Owner & Visitor) */}
          {!isDemo && (
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', padding: '10px 20px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={() => setShowShareModal(true)}
              >
                <ShareIcon size={16} /> Share Product
              </button>
            </div>
          )}

          {/* Market Closed Banner — only shown when override is off and schedule says closed */}
          {!marketIsOpen && (
            <div style={{
              background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
              border: '1px solid #fbbf24',
              borderRadius: 'var(--radius-md, 12px)',
              padding: '16px 20px',
              marginTop: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🕐</span>
                <strong style={{ color: '#92400e', fontSize: 15 }}>
                  Market is currently closed
                </strong>
              </div>
              {nextOpenStr && (
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#a16207' }}>
                  Next market open: <strong>{nextOpenStr}</strong>
                </p>
              )}
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

          {/* General Quarantine Disclaimer */}
          <p style={{ marginTop: 16, fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
            🌱 Please check with your local USDA or Department of Agriculture for any agricultural quarantine restrictions in your area.
          </p>

          {/* Buy Now + Add to Cart (blocked for demo or quarantine) */}
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
                  <button
                    onClick={() => {
                      requireAuth({
                        trigger: 'start_selling',
                        onReady: () => router.push('/my-stands'),
                      })
                    }}
                    style={{
                      display: 'inline-block', padding: '12px 28px', borderRadius: 12,
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: '#fff', fontWeight: 600, fontSize: 15,
                      border: 'none', cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
                    }}
                  >
                    🌱 Start Selling →
                  </button>
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
                      {product.inventory} {product.unit === 'dozen' ? product.unit : product.unit === 'box' && product.inventory !== 1 ? 'boxes' : product.unit === 'bag' && product.inventory !== 1 ? 'bags' : product.unit !== 'piece' && product.unit !== 'each' ? product.unit : product.unit === 'each' ? 'each' : ''} available
                    </span>
                  </div>
                )}

                {/* Unified Fulfillment Section — Pickup and/or Delivery with inline details */}
                {(productOffersPickup || productOffersDelivery) && !windowsExpired && product.inventory > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      {productOffersPickup && productOffersDelivery ? 'How would you like to get it?' : 'Fulfillment'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* ── Pickup Card ── */}
                      {productOffersPickup && (
                        <div
                          role="button"
                          tabIndex={0}
                          style={{
                            width: '100%', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                            transition: 'all 0.2s', border: '2px solid',
                            borderColor: selectedFulfillment === 'pickup' ? 'var(--green-600, #16a34a)' : 'var(--gray-200)',
                            background: selectedFulfillment === 'pickup' ? 'var(--green-50, #f0fdf4)' : 'white',
                            textAlign: 'left', display: 'block',
                          }}
                          onClick={() => setSelectedFulfillment('pickup')}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedFulfillment('pickup') }}
                          aria-pressed={selectedFulfillment === 'pickup'}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: '50%', border: '2px solid',
                              borderColor: selectedFulfillment === 'pickup' ? 'var(--green-600, #16a34a)' : 'var(--gray-300)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                            }}>
                              {selectedFulfillment === 'pickup' && (
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green-600, #16a34a)' }} />
                              )}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: selectedFulfillment === 'pickup' ? 'var(--green-700, #15803d)' : 'var(--gray-700)' }}>
                                📍 Pickup
                              </div>
                              {/* Address */}
                              {(() => {
                                const displayAddr = effectivePickupDisplayAddress
                                return displayAddr ? (
                                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{displayAddr}</div>
                                ) : null
                              })()}
                              {distanceMiles != null && (
                                <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, marginTop: 2 }}>
                                  📍 {distanceMiles} miles away
                                </div>
                              )}
                              {/* Pickup time windows */}
                              {(() => {
                                const days = getWindowDays(pickupResolved.dates, pickupResolved.windows)
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
                              {/* Distance checker for pickup */}
                              {distanceCheckerForm}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Delivery Card ── */}
                      {productOffersDelivery && (
                        <div
                          role="button"
                          tabIndex={0}
                          style={{
                            width: '100%', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                            transition: 'all 0.2s', border: '2px solid',
                            borderColor: selectedFulfillment === 'delivery' ? 'var(--green-600, #16a34a)' : 'var(--gray-200)',
                            background: selectedFulfillment === 'delivery'
                              ? (withinDelivery === true ? '#f0fdf4' : withinDelivery === false ? '#fef2f2' : 'var(--green-50, #f0fdf4)')
                              : 'white',
                            textAlign: 'left', display: 'block',
                          }}
                          onClick={() => setSelectedFulfillment('delivery')}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedFulfillment('delivery') }}
                          aria-pressed={selectedFulfillment === 'delivery'}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: '50%', border: '2px solid',
                              borderColor: selectedFulfillment === 'delivery' ? 'var(--green-600, #16a34a)' : 'var(--gray-300)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                            }}>
                              {selectedFulfillment === 'delivery' && (
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green-600, #16a34a)' }} />
                              )}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: selectedFulfillment === 'delivery' ? 'var(--green-700, #15803d)' : 'var(--gray-700)' }}>
                                🚗 Delivery
                              </div>
                              {/* Distance / range info */}
                              {distanceMiles != null ? (
                                withinDelivery ? (
                                  <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, marginTop: 2 }}>✅ Within range ({distanceMiles} mi)</div>
                                ) : (
                                  <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>❌ Outside range ({distanceMiles} mi — max {effectiveRadius} mi)</div>
                                )
                              ) : (
                                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                                  Within {effectiveRadius || 10} miles of {effectivePickupDisplayAddress || 'Seller location'}
                                </div>
                              )}
                              {/* Delivery time windows */}
                              {(() => {
                                const days = getWindowDays(deliveryResolved.dates, deliveryResolved.windows)
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
                              {/* Distance checker */}
                              {distanceCheckerForm}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Buy Now + Add to Cart — side by side */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {(() => {
                    const isOutsideRange = selectedFulfillment === 'delivery' && withinDelivery === false
                    const isUnavailable = windowsExpired || isExpired || isOutsideRange
                    return (
                      <>
                        <button
                          className="btn btn-primary btn-lg"
                          style={{ flex: 1, fontSize: 14, padding: '12px 8px' }}
                          onClick={() => {
                            if (!isAuthenticated || profileComplete !== true) {
                              requireAuth({
                                trigger: 'buy_now',
                                onReady: () => setShowBuy(true),
                              })
                              return
                            }
                            setShowBuy(true)
                          }}
                          disabled={product.inventory === 0 || isUnavailable}
                        >
                          {isUnavailable
                            ? (isOutsideRange ? '❌ Outside Range' : '⏰ Unavailable')
                            : product.inventory === 0
                              ? 'Sold Out'
                              : `⚡ ${product.price_usd === 0 ? 'Buy Now — Free' : `Buy Now`}`}
                        </button>

                        {!isUnavailable && product.inventory > 0 && (
                    <button
                      style={{
                        flex: 1, padding: '12px 8px',
                        border: '2px solid var(--green-600, #16a34a)', borderRadius: 'var(--radius-md, 12px)',
                        background: 'var(--green-50, #f0fdf4)', color: 'var(--green-700, #15803d)',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => {
                        if (!isAuthenticated || profileComplete !== true) {
                          requireAuth({
                            trigger: 'add_to_cart',
                            onReady: () => {
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
                            offers_delivery: productOffersDelivery,
                            offers_pickup: productOffersPickup,
                            pickup_address: effectivePickupAddress,
                            delivery_radius_miles: effectiveRadius,
                          },
                          cartQty,
                          selectedFulfillment || (productOffersPickup ? 'pickup' : 'delivery')
                        )
                        setCartToast(existingCartQty > 0 ? `Cart updated! (${cartQty} ${product.unit}${cartQty > 1 ? 's' : ''})` : `Added to cart! 🛒`)
                        setTimeout(() => setCartToast(null), 3000)
                            },
                          })
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
                            offers_delivery: productOffersDelivery,
                            offers_pickup: productOffersPickup,
                            pickup_address: effectivePickupAddress,
                            delivery_radius_miles: effectiveRadius,
                          },
                          cartQty,
                          selectedFulfillment || (productOffersPickup ? 'pickup' : 'delivery')
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
                  </>
                )
              })()}
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


        </div>
      </div>

      {/* Q&A Section */}
      <ProductQA productId={productId} sellerId={product.seller_id} isDemo={isDemo} productName={product.name} productDescription={product.description} />

      {/* Message Seller — below Q&A so users can check answers first */}
      {!isDemo && user?.id !== product.seller_id && (
        <div style={{ padding: '0 0 16px' }}>
          <button
            onClick={() => {
              if (!isAuthenticated) {
                requireAuth({
                  trigger: 'dm_seller',
                  onReady: () => router.push(`/messages/new?userId=${product.seller_id}&productId=${product.id}&name=${encodeURIComponent(booth.name || 'Seller')}`),
                })
                return
              }
              router.push(`/messages/new?userId=${product.seller_id}&productId=${product.id}&name=${encodeURIComponent(booth.name || 'Seller')}`)
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '12px 20px',
              border: '2px solid var(--green-200, #bbf7d0)', borderRadius: 'var(--radius-md, 12px)',
              background: 'var(--green-50, #f0fdf4)', color: 'var(--green-700, #15803d)', textAlign: 'center',
              fontSize: 16, fontWeight: 600, cursor: 'pointer',
            }}
          >
            💬 DM {sellerFirstName || 'Seller'}
          </button>
        </div>
      )}

      {/* ── More from this booth ── */}
      <MoreFromSeller
        boothId={boothId}
        boothName={booth.name}
        sellerId={product.seller_id}
        currentProductId={productId}
        isDemo={isDemo}
      />


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
            router.push(`/orders/${order.orderId}`)
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

      <SocialShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={product ? `Share ${product.name}` : 'Share Product'}
        subtitle={`Invite your neighbors to check out this fresh produce!`}
        entityName={product ? product.name : 'Product'}
        shareUrl={typeof window !== 'undefined' ? window.location.href : ''}
        shareMessage={(p) => {
          const priceText = product?.price_usd === 0 ? 'Free' : `${formatUsd(product?.price_usd || 0)} / ${product?.unit}`
          const deliveryText = (productOffersDelivery || productOffersPickup) ? `${productOffersDelivery && productOffersPickup ? '🚗 Delivery or 📍 Pickup' : productOffersDelivery ? '🚗 Delivery' : '📍 Pickup'} near ${effectivePickupDisplayAddress || 'you'}` : '📍 Available nearby'
          return getProductShareMessage(product?.name || 'produce', priceText, deliveryText, p) +
            (product?.inventory ? `\n\nOnly ${product.inventory} available!` : '')
        }}
        shareContext="product_share"
        userId={user?.id}
      />
    </div>
  )
}

/** More from this seller — keeps buyer in the seller's ecosystem */
function MoreFromSeller({
  boothId, boothName, sellerId, currentProductId, isDemo,
}: {
  boothId: string; boothName: string; sellerId: string;
  currentProductId: string; isDemo: boolean;
}) {
  const supabase = createClient()
  const [boothProducts, setBoothProducts] = useState<any[]>([])
  const [otherBooths, setOtherBooths] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (isDemo) return
    const load = async () => {
      // Fetch other products from the SAME booth (exclude current product)
      const { data: products } = await supabase
        .from('market_products')
        .select('id, name, price_usd, unit, photos, inventory, category')
        .eq('booth_id', boothId)
        .eq('is_active', true)
        .eq('is_deleted', false)
        .neq('id', currentProductId)
        .order('created_at', { ascending: false })
        .limit(6)

      if (products) setBoothProducts(products)

      // Fetch other booths by the same seller
      const { data: booths } = await supabase
        .from('market_booths')
        .select('id, name, header_image_url, offers_pickup, offers_delivery, pickup_display_address')
        .eq('owner_id', sellerId)
        .eq('is_open', true)
        .neq('id', boothId)
        .limit(5)

      if (booths) setOtherBooths(booths)
      setLoaded(true)
    }
    load()
  }, [boothId, sellerId, currentProductId, isDemo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded || isDemo) return null
  if (boothProducts.length === 0 && otherBooths.length === 0) return null

  return (
    <div style={{ padding: '8px 0 24px' }}>
      {/* Products from same booth */}
      {boothProducts.length > 0 && (
        <div style={{ marginBottom: otherBooths.length > 0 ? 24 : 0 }}>
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: 'var(--gray-800, #1f2937)',
            margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            🏪 More from {boothName || 'this booth'}
          </h3>
          <div style={{
            display: 'flex', gap: 12, overflowX: 'auto',
            paddingBottom: 4, scrollSnapType: 'x mandatory',
          }}>
            {boothProducts.map(p => (
              <Link
                key={p.id}
                href={`/market/booth/${boothId}/product/${p.id}`}
                style={{
                  flexShrink: 0, width: 140, scrollSnapAlign: 'start',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <div style={{
                  width: 140, height: 140, borderRadius: 12, overflow: 'hidden',
                  background: 'var(--gray-100, #f3f4f6)', marginBottom: 6,
                }}>
                  {p.photos?.[0] ? (
                    <img src={p.photos[0]} alt={p.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 36,
                    }}>🥬</div>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', lineHeight: 1.3 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--green-700, #15803d)', fontWeight: 600 }}>
                  ${Number(p.price_usd).toFixed(2)}/{p.unit}
                </div>
                {p.inventory <= 0 && (
                  <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>Sold Out</span>
                )}
              </Link>
            ))}
          </div>
          {/* Visit booth link */}
          <Link
            href={`/market/booth/${boothId}`}
            style={{
              display: 'inline-block', marginTop: 8,
              fontSize: 13, fontWeight: 600, color: 'var(--green-600, #16a34a)',
              textDecoration: 'none',
            }}
          >
            View all from {boothName || 'this booth'} →
          </Link>
        </div>
      )}

      {/* Other booths by same seller */}
      {otherBooths.length > 0 && (
        <div>
          <h3 style={{
            fontSize: 14, fontWeight: 600, color: 'var(--gray-500, #6b7280)',
            margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Also sells at
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {otherBooths.map(b => (
              <Link
                key={b.id}
                href={`/market/booth/${b.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 12,
                  border: '1px solid var(--gray-200, #e5e7eb)',
                  background: '#fff', textDecoration: 'none', color: 'inherit',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10, overflow: 'hidden',
                  background: 'var(--gray-100)', flexShrink: 0,
                }}>
                  {b.header_image_url ? (
                    <img src={b.header_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏪</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', display: 'flex', gap: 8 }}>
                    {b.offers_pickup && <span>📍 Pickup</span>}
                    {b.offers_delivery && <span>🚗 Delivery</span>}
                    {b.pickup_display_address && (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        • {b.pickup_display_address}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ color: 'var(--gray-400)', fontSize: 14 }}>→</span>
              </Link>
            ))}
          </div>
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
