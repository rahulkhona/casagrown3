'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../../../../lib/supabase'
import { formatUsd } from '../../../../../../../lib/store'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function ProductDetailPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id: boothId, productId } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const [product, setProduct] = useState<any>(null)
  const [booth, setBooth] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [photoIndex, setPhotoIndex] = useState(0)

  useEffect(() => {
    const load = async () => {
      const [{ data: prod }, { data: boothData }] = await Promise.all([
        supabase.from('market_products').select('*').eq('id', productId).single(),
        supabase.from('market_booths').select('*').eq('id', boothId).single(),
      ])
      if (prod) setProduct(prod)
      if (boothData) setBooth(boothData)
      setLoading(false)
    }
    load()
  }, [productId, boothId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
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

  return (
    <div className="container">
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
        </div>

        {/* Details */}
        <div className={styles.details}>
          <div className="badge badge-green" style={{ marginBottom: 8 }}>
            {product.category?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
          </div>
          <h1 className={styles.productName}>{product.name}</h1>
          <p className={styles.productPrice}>
            <span className="price price-large">{formatUsd(product.price_usd)}</span>
            <span className={styles.unit}>/ {product.unit}</span>
          </p>
          {product.description && <p className={styles.productDesc}>{product.description}</p>}

          {/* Stock */}
          <div className={styles.stockInfo}>
            {product.inventory > 0 ? (
              <span className="badge badge-green">✓ In Stock ({product.inventory} available)</span>
            ) : (
              <span className="badge badge-red">Sold Out</span>
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
                <div className={styles.deliveryOption}>
                  <span>🚗</span>
                  <div>
                    <strong>Delivery</strong>
                    {booth.delivery_radius_miles && <small>Within {booth.delivery_radius_miles} miles</small>}
                  </div>
                </div>
              )}
              {booth.offers_pickup && (
                <div className={styles.deliveryOption}>
                  <span>📍</span>
                  <div>
                    <strong>Pickup</strong>
                    {booth.pickup_address && <small>{booth.pickup_address}</small>}
                  </div>
                </div>
              )}
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}
