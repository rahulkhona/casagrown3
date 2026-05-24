'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase'
import { formatUsd } from '../../../../../lib/store'
import { useAuth } from '../../../../../lib/useAuth'
import { useMarketStatus } from '../../../../../lib/useMarketStatus'
import { hasValidWindows } from '../../../../../lib/windowUtils'
import { useRouter, usePathname } from 'next/navigation'
import BuyModal from '../../../../components/BuyModal'
import { FlagModal } from '../../../../components/FlagModal'
import { NotificationPromptModal } from '../../../../components/NotificationPromptModal'
import { useNotificationPrompt } from '../../../../../lib/useNotificationPrompt'
import { useErrorToast } from '../../../../components/ErrorToast'
import styles from './page.module.css'

export default function BoothDetailClient({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = params && typeof (params as any).then === 'function'
    ? params
    : Promise.resolve(params || {})
  const { id } = use(resolvedParams)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated, profileComplete } = useAuth()
  const { isOpen: marketIsOpen, isScheduleOpen, nextOpenDate, loading: marketLoading } = useMarketStatus()
  const [booth, setBooth] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [buyProduct, setBuyProduct] = useState<any>(null)
  const [buyerZip, setBuyerZip] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [flagProduct, setFlagProduct] = useState<any>(null)
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [sellerRating, setSellerRating] = useState<{ avg: number; count: number } | null>(null)
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [pickupWindows, setPickupWindows] = useState<any[]>([])
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  // Reminder state
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set())
  const { showSuccess, showInfo } = useErrorToast()

  // Format fulfillment windows grouped by day
  const DAY_LABELS: Record<string, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
  }
  const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const formatTime = (t: string) => {
    const h = parseInt(t.split(':')[0])
    if (h === 0) return '12 AM'
    if (h === 12) return '12 PM'
    return h > 12 ? `${h - 12} PM` : `${h} AM`
  }
  const formatWindowsByDay = (windows: any[]) => {
    const grouped: Record<string, string[]> = {}
    for (const w of windows) {
      const day = w.day_of_week
      if (!grouped[day]) grouped[day] = []
      grouped[day].push(`${formatTime(w.start_time)} – ${formatTime(w.end_time)}`)
    }
    return DAY_ORDER
      .filter(d => grouped[d])
      .map(d => ({ day: DAY_LABELS[d], slots: grouped[d] }))
  }

  useEffect(() => {
    const load = async () => {
      const { data: boothData } = await supabase
        .from('market_booths')
        .select('*')
        .eq('id', id)
        .single()

      if (boothData) {
        setBooth(boothData)
        const [{ data: prods }, { data: profileData }] = await Promise.all([
          supabase
            .from('market_products')
            .select('*')
            .eq('booth_id', id)
            .eq('is_active', true)
            .eq('is_draft', false)
            .eq('moderation_status', 'approved')
            .order('created_at', { ascending: true }),
          supabase
            .from('profiles')
            .select('seller_avg_rating, seller_rating_count')
            .eq('id', boothData.owner_id)
            .single(),
        ])
        if (prods) setProducts(prods)
        if (profileData && profileData.seller_rating_count >= 5) {
          setSellerRating({ avg: profileData.seller_avg_rating, count: profileData.seller_rating_count })
        }

        // Fetch fulfillment windows from relational table
        const { data: windows } = await supabase
          .from('booth_fulfillment_windows')
          .select('*')
          .eq('booth_id', id)
          .order('day_of_week')
        if (windows) {
          setDeliveryWindows(windows.filter((w: any) => w.window_type === 'delivery'))
          setPickupWindows(windows.filter((w: any) => w.window_type === 'pickup'))
        }

        // Check follow status + count
        const { count: fCount } = await supabase
          .from('market_followers')
          .select('*', { count: 'exact', head: true })
          .eq('booth_id', boothData.id)
        setFollowerCount(fCount || 0)

        if (user) {
          const { data: fRow } = await supabase
            .from('market_followers')
            .select('follower_id')
            .eq('follower_id', user.id)
            .eq('booth_id', boothData.id)
            .maybeSingle()
          if (fRow) setFollowing(true)
        }
      } else {
        // Fallback: check sessionStorage for demo booth data
        try {
          const cached = sessionStorage.getItem(`demo_booth_${id}`)
          if (cached) {
            const demoBooth = JSON.parse(cached)
            setBooth(demoBooth)
            // Load demo products from sessionStorage
            const demoProducts: any[] = []
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i)
              if (key?.startsWith('demo_product_')) {
                try {
                  const p = JSON.parse(sessionStorage.getItem(key)!)
                  if (p.booth_id === id || p.seller_id === demoBooth.owner_id) {
                    demoProducts.push(p)
                  }
                } catch {}
              }
            }
            setProducts(demoProducts)
          }
        } catch {}
      }
      setLoading(false)
    }
    load()
    try {
      const saved = new URLSearchParams(localStorage.getItem('market_search') || '')
      setBuyerZip(saved.get('zip') || '')
      setBuyerAddress(saved.get('addr') || '')
    } catch {}
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing product reminders
  useEffect(() => {
    if (!user) return
    supabase.from('product_reminders').select('product_id').eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setSavedProductIds(new Set(data.map(r => r.product_id)))
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Two-tier polling:
  // 1. Lightweight refresh (30s + tab focus): just update prices/inventory
  // 2. Full product re-fetch (2 min): catch new/removed products
  useEffect(() => {
    if (!booth) return

    const refreshProducts = async () => {
      const productIds = products.map(p => p.id)
      if (productIds.length === 0) return
      const { data } = await supabase.rpc('refresh_product_data', { product_ids: productIds })
      if (!data) return
      const updates = new Map((data as any[]).map(d => [d.id, d]))
      setProducts(prev => prev.map(p => {
        const u = updates.get(p.id)
        return u ? { ...p, price_usd: u.price_usd, inventory: u.inventory, is_active: u.is_active } : p
      }).filter(p => p.is_active))
    }

    const fullRefetch = async () => {
      const { data: prods } = await supabase
        .from('market_products')
        .select('*')
        .eq('booth_id', booth.id)
        .eq('is_active', true)
        .eq('is_draft', false)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: true })
      if (prods) setProducts(prods)
    }

    const lightInterval = setInterval(refreshProducts, 30_000)
    const heavyInterval = setInterval(fullRefetch, 120_000)
    const onFocus = () => { if (!document.hidden) refreshProducts() }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(lightInterval)
      clearInterval(heavyInterval)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [booth?.id, products.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // With window-based fulfillment, buying is always available as long as product has inventory
  // isClosed drives the "Market is currently closed" banner.
  // Use marketIsOpen (which respects the market_never_closes override) so the
  // banner is suppressed when the admin override is active. isScheduleOpen is
  // only used for the banner on the market listing page.
  const isClosed = !marketIsOpen

  // Toggle product reminder
  const toggleProductReminder = async (productId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { router.push(`/login?redirect=${encodeURIComponent(pathname)}`); return }
    if (profileComplete !== true) { router.push('/profile-setup'); return }

    const isSaved = savedProductIds.has(productId)
    if (isSaved) {
      await supabase.from('product_reminders').delete().eq('user_id', user.id).eq('product_id', productId)
      setSavedProductIds(prev => { const next = new Set(prev); next.delete(productId); return next })
      showInfo('Reminder removed')
    } else {
      await supabase.from('product_reminders').upsert(
        { user_id: user.id, product_id: productId },
        { onConflict: 'user_id,product_id', ignoreDuplicates: true }
      )

      setSavedProductIds(prev => new Set(prev).add(productId))
      showSuccess('🔔 Saved! We\'ll notify you when market opens')
    }
  }

  const themeColors: Record<string, { bg: string; border: string }> = {
    rustic: { bg: '#fef3c7', border: '#f59e0b' },
    tropical: { bg: '#d1fae5', border: '#10b981' },
    minimal: { bg: '#f3f4f6', border: '#6b7280' },
    floral: { bg: '#fce7f3', border: '#ec4899' },
    harvest: { bg: '#fef3c7', border: '#d97706' },
    cottage: { bg: '#e0f2fe', border: '#0ea5e9' },
  }

  if (loading || marketLoading) {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <p>Loading booth...</p>
      </div>
    )
  }

  if (!booth) {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2>Booth not found</h2>
        <Link href="/market" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Market</Link>
      </div>
    )
  }

  const theme = themeColors[booth.decorative_theme] || themeColors.minimal

  // Format next open date for banner
  const nextOpenStr = nextOpenDate
    ? nextOpenDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) +
      ' at ' + nextOpenDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="container">
      {/* Booth Header */}
      <div className={styles.boothFrame} style={{ background: theme.bg, borderColor: theme.border }}>

        {booth.header_image_url && (
          <div style={{ width: '100%', height: 160, overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
            <img src={booth.header_image_url} alt={booth.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        <h1 className={styles.boothName}>{booth.name}</h1>
        {sellerRating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>⭐</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--gray-800)' }}>{sellerRating.avg}</span>
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>({sellerRating.count} reviews)</span>
          </div>
        )}
        <div className={styles.boothStats}>
          <span>{products.length} products</span>
          {booth.offers_delivery && <><span>•</span><span>🚗 Delivery</span></>}
          {booth.offers_pickup && <><span>•</span><span>📍 Pickup</span></>}
        </div>
        {booth.description && <p className={styles.boothDesc}>{booth.description}</p>}
        {/* Follow & Message actions */}
        {isAuthenticated && user?.id !== booth.owner_id && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className={`${styles.followBtn} ${following ? styles.followBtnActive : ''}`}
              style={{ flex: 1 }}
              onClick={async () => {
                if (profileComplete !== true) {
                  router.push('/profile-setup')
                  return
                }
                if (following) {
                  await supabase.from('market_followers').delete().match({ follower_id: user!.id, booth_id: booth.id })
                  setFollowing(false)
                  setFollowerCount(c => Math.max(0, c - 1))
                } else {
                  await supabase.from('market_followers').insert({ follower_id: user!.id, booth_id: booth.id })
                  setFollowing(true)
                  setFollowerCount(c => c + 1)
                }
              }}
            >
              {following ? '❤️ Following' : '🤍 Follow'}
            </button>

            {/* NEW: Message Farm Action */}
            <Link
              href={`/messages/new?userId=${booth.owner_id}&name=${encodeURIComponent(booth.name || 'Farm')}`}
              className={styles.followBtn}
              style={{ flex: 1, textDecoration: 'none', textAlign: 'center', background: 'transparent', color: 'var(--gray-700)', border: '1px solid var(--gray-300)' }}
            >
              💬 Message Farm
            </Link>
          </div>
        )}
        {followerCount > 0 && (
          <p className={styles.followerCount}>{followerCount} follower{followerCount !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Fulfillment Options */}
      {(booth.offers_delivery || booth.offers_pickup) && (
        <div className={styles.fulfillmentSection} style={{ '--theme-border': theme.border } as React.CSSProperties}>
          <h2 className={styles.sectionTitle}>Ordering Options</h2>
          <div className={styles.fulfillmentGrid}>
            {booth.offers_delivery && (
              <div className={styles.fulfillmentCard}>
                <div style={{ fontSize: 28 }}>🚗</div>
                <strong>Delivery</strong>
                {/* Base address (city, state — no house number) */}
                {(booth.booth_city || booth.pickup_city) && (
                  <span className={styles.fulfillmentDetail}>
                    From {booth.booth_city || booth.pickup_city}{booth.booth_state || booth.pickup_state ? `, ${booth.booth_state || booth.pickup_state}` : ''}
                  </span>
                )}
                {/* Radius */}
                {booth.delivery_radius_miles && (
                  <span className={styles.fulfillmentDetail}>Within {booth.delivery_radius_miles} miles</span>
                )}
                {/* Zip codes */}
                {booth.delivery_zipcodes && booth.delivery_zipcodes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: 'center' }}>
                    {booth.delivery_zipcodes.map((z: string) => (
                      <span key={z} style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 12,
                        background: 'var(--green-50)', color: 'var(--green-700)',
                        border: '1px solid var(--green-200)',
                      }}>{z}</span>
                    ))}
                  </div>
                )}
                {/* Buyer distance check */}
                {buyerZip && booth.delivery_zipcodes && booth.delivery_zipcodes.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>
                    {booth.delivery_zipcodes.includes(buyerZip) ? (
                      <span style={{ color: 'var(--green-700)' }}>✅ Delivers to your zip ({buyerZip})</span>
                    ) : (
                      <span style={{ color: '#b45309' }}>⚠️ Your zip ({buyerZip}) may be outside delivery area</span>
                    )}
                  </div>
                )}
                {/* Fulfillment windows from table */}
                {deliveryWindows.length > 0 && (
                  <div className={styles.windowList}>
                    {formatWindowsByDay(deliveryWindows).map(({ day, slots }, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {slots.map((slot, j) => (
                          <span key={j} className={styles.windowChip}>{day} {slot}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {booth.offers_pickup && (
              <div className={styles.fulfillmentCard}>
                <div style={{ fontSize: 28 }}>📍</div>
                <strong>Pickup</strong>
                {/* Partial address — city area only, no house number */}
                {(booth.pickup_city || booth.booth_city) && (
                  <span className={styles.fulfillmentDetail}>
                    Near {booth.pickup_city || booth.booth_city}{booth.pickup_state || booth.booth_state ? `, ${booth.pickup_state || booth.booth_state}` : ''}
                  </span>
                )}
                {/* Fulfillment windows */}
                {pickupWindows.length > 0 && (
                  <div className={styles.windowList}>
                    {formatWindowsByDay(pickupWindows).map(({ day, slots }, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {slots.map((slot, j) => (
                          <span key={j} className={styles.windowChip}>{day} {slot}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Market Closed Banner */}
      {isClosed && (
        <div style={{
          background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
          border: '1px solid #fbbf24',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '16px 20px',
          margin: '16px 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🕐</span>
            <strong style={{ color: '#92400e', fontSize: 15 }}>
              Market is currently closed
            </strong>
          </div>
          {nextOpenStr && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#a16207' }}>
              Next market open: <strong>{nextOpenStr}</strong> — tap 🔔 on any product to get notified!
            </p>
          )}
        </div>
      )}

      {/* Products */}
      <div className={styles.productsSection} style={{ '--theme-border': theme.border, '--theme-accent-color': theme.border } as React.CSSProperties}>
        <h2 className={styles.sectionTitle}>Products</h2>
        {products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">No products listed yet</div>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {products.map(p => (
              <Link key={p.id} href={`/market/booth/${id}/product/${p.id}`} className={styles.productCard}>
                <div className={styles.productImage}>
                  {p.photos?.[0] ? (
                    <img src={p.photos[0]} alt={p.name} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🥬</div>
                  )}
                  {p.inventory <= 3 && p.inventory > 0 && (
                    <span className={styles.lowStock}>Only {p.inventory} left</span>
                  )}
                  {p.inventory === 0 && <span className={styles.outOfStock}>Sold Out</span>}
                  {/* Reminder bell overlay when closed */}
                  {isClosed && (
                    <button
                      onClick={(e) => toggleProductReminder(p.id, e)}
                      title={savedProductIds.has(p.id) ? 'Remove reminder' : 'Remind me when market opens'}
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        background: savedProductIds.has(p.id) ? 'var(--green-100, #dcfce7)' : 'rgba(255,255,255,0.9)',
                        border: savedProductIds.has(p.id) ? '1px solid var(--green-300, #86efac)' : '1px solid var(--gray-200, #e5e7eb)',
                        borderRadius: 20, padding: '3px 10px', fontSize: 12,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        color: savedProductIds.has(p.id) ? 'var(--green-700, #15803d)' : 'var(--gray-600)',
                        zIndex: 2, transition: 'all 0.2s', fontWeight: 600,
                      }}
                    >
                      🔔 {savedProductIds.has(p.id) ? 'Saved' : 'Remind'}
                    </button>
                  )}
                </div>
                {isAuthenticated && user?.id !== booth?.owner_id && (
                  <button
                    className={styles.reportLink}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFlagProduct(p) }}
                    disabled={flaggedIds.has(p.id)}
                  >
                    {flaggedIds.has(p.id) ? '✓ Reported' : 'Report'}
                  </button>
                )}
                <div className={styles.productInfo}>
                  <h3 className={styles.productName}>{p.name}</h3>
                  {p.description && <p className={styles.productDesc}>{p.description}</p>}
                  <p className={styles.productPrice}>
                    {p.price_usd === 0 ? <span style={{ color: '#16a34a', fontWeight: 'bold' }}>Free</span> : <>{formatUsd(p.price_usd)}<span className={styles.productUnit}>/ {p.unit}</span></>}
                  </p>
                  <p className={styles.productQty}>
                    {p.inventory > 3 ? `${p.inventory} ${p.unit === 'dozen' ? p.unit : p.unit === 'box' && p.inventory !== 1 ? 'boxes' : p.unit === 'bag' && p.inventory !== 1 ? 'bags' : p.unit !== 'piece' && p.unit !== 'each' ? p.unit : p.unit === 'each' ? 'each' : ''} available`.replace('  ', ' ') : p.inventory > 0 ? `Only ${p.inventory} ${p.unit === 'dozen' ? p.unit : p.unit === 'box' && p.inventory !== 1 ? 'boxes' : p.unit === 'bag' && p.inventory !== 1 ? 'bags' : p.unit !== 'piece' && p.unit !== 'each' ? p.unit : p.unit === 'each' ? 'each' : ''} left!`.replace('  ', ' ') : 'Sold out'}
                  </p>
                  {p.harvested_at && (
                    <p className={styles.productHarvest}>
                      🌱 Harvested {new Date(p.harvested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  )}
                  <button
                      className="btn btn-primary"
                      style={{ width: '100%', fontSize: 13, padding: '6px 12px', marginTop: 8 }}
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        if (!hasValidWindows(p.window_dates, p.product_delivery_windows, p.product_pickup_windows)) return
                        if (!isAuthenticated) {
                          const productUrl = `/market/booth/${id}/product/${p.id}`
                          router.push(`/login?redirect=${encodeURIComponent(productUrl)}`)
                          return
                        }
                        if (profileComplete !== true) {
                          router.push(`/profile-setup`)
                          return
                        }
                        setBuyProduct(p)
                      }}
                      disabled={p.inventory === 0 || !hasValidWindows(p.window_dates, p.product_delivery_windows, p.product_pickup_windows)}
                    >
                      {!hasValidWindows(p.window_dates, p.product_delivery_windows, p.product_pickup_windows)
                        ? '⏰ No Windows'
                        : p.inventory === 0 ? 'Sold Out' : 'Buy'}
                    </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Buy Modal */}
      {buyProduct && booth && (
        <BuyModal
          product={buyProduct}
          booth={booth}
          buyerZip={buyerZip}
          buyerAddress={buyerAddress}
          onClose={() => setBuyProduct(null)}
          onSuccess={(order) => {
            setBuyProduct(null)
            setProducts(prev => prev.map(p => p.id === buyProduct.id ? { ...p, inventory: Math.max(0, p.inventory - order.quantity) } : p))
            showSuccess(`✅ Order placed! Hold: $${order.holdAmount.toFixed(2)}. You'll only be charged the net amount at end of day.`)
            showPrompt()
          }}
        />
      )}

      {/* Flag Modal */}
      {flagProduct && (
        <FlagModal
          productId={flagProduct.id}
          productName={flagProduct.name}
          onClose={() => setFlagProduct(null)}
          onFlagged={() => {
            setFlaggedIds(prev => new Set(prev).add(flagProduct.id))
            setFlagProduct(null)
          }}
        />
      )}

      {/* Notification Prompt Modal */}
      <NotificationPromptModal {...modalProps} />

    </div>
  )
}
