'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../../../../../../lib/supabase'
import { formatUsd } from '../../../../../../../lib/store'
import { useAuth } from '../../../../../../../lib/useAuth'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import BuyModal from '../../../../../../components/BuyModal'
import { FlagModal } from '../../../../../../components/FlagModal'
import { ProductQA } from '../../../../../../components/ProductQA'
import { NotificationPromptModal } from '../../../../../../components/NotificationPromptModal'
import { useNotificationPrompt } from '../../../../../../../lib/useNotificationPrompt'
import styles from './page.module.css'

export default function ProductDetailPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id: boothId, productId } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isAuthenticated } = useAuth()
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
    try {
      const saved = new URLSearchParams(localStorage.getItem('market_search') || '')
      setBuyerZip(saved.get('zip') || '')
      setBuyerAddress(saved.get('addr') || '')
    } catch {}
  }, [productId, boothId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open Buy modal when returning from login flow
  useEffect(() => {
    if (autoBuy && isAuthenticated && product && booth && !showBuy) {
      setShowBuy(true)
    }
  }, [autoBuy, isAuthenticated, product, booth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic poll for fresh product data (price, inventory) — every 30s + on tab focus
  useEffect(() => {
    if (!product) return
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
          {isAuthenticated && user?.id !== product.seller_id && (
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

          {/* Buy Button */}
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 16, fontSize: 16 }}
            onClick={() => {
              if (!isAuthenticated) {
                router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
                return
              }
              setShowBuy(true)
            }}
            disabled={product.inventory === 0}
          >
            {product.inventory === 0 ? 'Sold Out' : `Buy — ${formatUsd(product.price_usd)} / ${product.unit}`}
          </button>

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

      {/* Q&A Section */}
      <ProductQA productId={productId} sellerId={product.seller_id} />

      {/* Buy Modal */}
      {showBuy && (
        <BuyModal
          product={product}
          booth={booth}
          buyerZip={buyerZip}
          buyerAddress={buyerAddress}
          onClose={() => setShowBuy(false)}
          onSuccess={(order) => {
            setShowBuy(false)
            alert(`Order placed! Hold: $${order.holdAmount.toFixed(2)}. You'll only be charged the net amount at end of day.`)
            showPrompt()
            router.push(`/market/booth/${boothId}`)
          }}
        />
      )}

      {/* Flag Modal */}
      {showFlag && product && (
        <FlagModal
          productId={product.id}
          productName={product.name}
          onClose={() => setShowFlag(false)}
          onFlagged={() => setFlagged(true)}
        />
      )}

      {/* Notification Prompt Modal */}
      <NotificationPromptModal {...modalProps} />
    </div>
  )
}
