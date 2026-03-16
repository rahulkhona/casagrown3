'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase'
import { formatUsd } from '../../../../../lib/store'
import { useAuth } from '../../../../../lib/useAuth'
import { useRouter, usePathname } from 'next/navigation'
import BuyModal from '../../../../components/BuyModal'
import { FlagModal } from '../../../../components/FlagModal'
import styles from './page.module.css'

export default function BoothDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated } = useAuth()
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

  useEffect(() => {
    const load = async () => {
      const { data: boothData } = await supabase
        .from('market_booths')
        .select('*')
        .eq('id', id)
        .single()

      if (boothData) {
        setBooth(boothData)
        const { data: prods } = await supabase
          .from('market_products')
          .select('*')
          .eq('seller_id', boothData.owner_id)
          .order('created_at', { ascending: true })
        if (prods) setProducts(prods)

        // Check follow status + count
        const { count: fCount } = await supabase
          .from('market_followers')
          .select('*', { count: 'exact', head: true })
          .eq('booth_id', boothData.id)
        setFollowerCount(fCount || 0)

        const { data: session } = await supabase.auth.getUser()
        if (session?.user) {
          const { data: fRow } = await supabase
            .from('market_followers')
            .select('follower_id')
            .eq('follower_id', session.user.id)
            .eq('booth_id', boothData.id)
            .maybeSingle()
          if (fRow) setFollowing(true)
        }
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
        .eq('seller_id', booth.owner_id)
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

  const themeColors: Record<string, { bg: string; border: string }> = {
    rustic: { bg: '#fef3c7', border: '#f59e0b' },
    tropical: { bg: '#d1fae5', border: '#10b981' },
    minimal: { bg: '#f3f4f6', border: '#6b7280' },
    floral: { bg: '#fce7f3', border: '#ec4899' },
    harvest: { bg: '#fef3c7', border: '#d97706' },
    cottage: { bg: '#e0f2fe', border: '#0ea5e9' },
  }

  if (loading) {
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
        <div className={styles.boothStats}>
          <span>{products.length} products</span>
          {booth.offers_delivery && <><span>•</span><span>🚗 Delivery</span></>}
          {booth.offers_pickup && <><span>•</span><span>📍 Pickup</span></>}
        </div>
        {booth.description && <p className={styles.boothDesc}>{booth.description}</p>}
        {/* Follow button */}
        {isAuthenticated && user?.id !== booth.owner_id && (
          <button
            className={`${styles.followBtn} ${following ? styles.followBtnActive : ''}`}
            onClick={async () => {
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
                {booth.delivery_radius_miles && (
                  <span className={styles.fulfillmentDetail}>Within {booth.delivery_radius_miles} miles</span>
                )}
                {booth.delivery_windows && (booth.delivery_windows as any[]).length > 0 && (
                  <div className={styles.windowList}>
                    {(booth.delivery_windows as any[]).map((w: any, i: number) => (
                      <span key={i} className={styles.windowChip}>{w.start} – {w.end}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {booth.offers_pickup && (
              <div className={styles.fulfillmentCard}>
                <div style={{ fontSize: 28 }}>📍</div>
                <strong>Pickup</strong>
                {booth.pickup_address && (
                  <span className={styles.fulfillmentDetail}>{booth.pickup_address}</span>
                )}
                {booth.pickup_windows && (booth.pickup_windows as any[]).length > 0 && (
                  <div className={styles.windowList}>
                    {(booth.pickup_windows as any[]).map((w: any, i: number) => (
                      <span key={i} className={styles.windowChip}>{w.start} – {w.end}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
                    {formatUsd(p.price_usd)}
                    <span className={styles.productUnit}>/ {p.unit}</span>
                  </p>
                  <p className={styles.productQty}>
                    {p.inventory > 3 ? `${p.inventory} available` : p.inventory > 0 ? `Only ${p.inventory} left!` : 'Sold out'}
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
                        if (!isAuthenticated) {
                          const productUrl = `/market/booth/${id}/product/${p.id}`
                          router.push(`/login?redirect=${encodeURIComponent(productUrl)}`)
                          return
                        }
                        setBuyProduct(p)
                      }}
                      disabled={p.inventory === 0}
                    >
                      {p.inventory === 0 ? 'Sold Out' : 'Buy'}
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
            alert(`Order placed! Hold: $${order.holdAmount.toFixed(2)}. You'll only be charged the net amount at end of day.`)
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
              Notification.requestPermission()
            }
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
    </div>
  )
}
