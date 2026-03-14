'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase'
import { formatUsd } from '../../../../../lib/store'
import styles from './page.module.css'

export default function BoothDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const [booth, setBooth] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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
      }
      setLoading(false)
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const themeColors: Record<string, { bg: string; border: string; accent: string }> = {
    rustic: { bg: '#fef3c7', border: '#f59e0b', accent: '🪵' },
    tropical: { bg: '#d1fae5', border: '#10b981', accent: '🌴' },
    minimal: { bg: '#f3f4f6', border: '#6b7280', accent: '✨' },
    floral: { bg: '#fce7f3', border: '#ec4899', accent: '🌸' },
    harvest: { bg: '#fef3c7', border: '#d97706', accent: '🌾' },
    cottage: { bg: '#e0f2fe', border: '#0ea5e9', accent: '🏡' },
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
        <div className={styles.frameDecor}>{theme.accent} {theme.accent} {theme.accent}</div>
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
          {/* Payment Method */}
          {booth.payment_method && (
            <div style={{ marginTop: 16 }}>
              <div className={styles.fulfillmentCard}>
                <div style={{ fontSize: 28 }}>{booth.payment_method === 'automatic' ? '⚡' : '🖐️'}</div>
                <strong>{booth.payment_method === 'automatic' ? 'Auto Payout' : 'Manual Payout'}</strong>
                <span className={styles.fulfillmentDetail}>
                  {booth.payment_method === 'automatic'
                    ? 'Paid after end-of-day settlement'
                    : 'Request payout after settlement'}
                </span>
              </div>
            </div>
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
                </div>
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
