'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMarket, formatUsd, generatePasscode } from '../../../../../../../lib/store'
import { useAuth } from '../../../../../../../lib/useAuth'
import styles from './page.module.css'

export default function ProductDetailPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id: boothId, productId } = use(params)
  const router = useRouter()
  const { state, dispatch } = useMarket()
  const { isAuthenticated } = useAuth()
  const product = state.products.find(p => p.id === productId)
  const booth = state.booths.find(b => b.id === boothId)
  const [qty, setQty] = useState(1)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ discount: number; label: string } | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>(product?.offersDelivery ? 'delivery' : 'pickup')

  if (!product || !booth) {
    return (
      <div className="container" style={{ padding: 80, textAlign: 'center' }}>
        <h2>Product not found</h2>
        <Link href="/market" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Market</Link>
      </div>
    )
  }

  const subtotal = product.priceUsd * qty
  const couponDiscount = appliedCoupon?.discount || 0
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount)
  const tax = +(discountedSubtotal * 0.0925).toFixed(2)
  const platformFee = +(discountedSubtotal * 0.05).toFixed(2)
  const total = +(discountedSubtotal + tax + platformFee).toFixed(2)

  const handleApplyCoupon = () => {
    const coupon = state.coupons.find(c => c.boothId === boothId && c.code.toLowerCase() === couponCode.toLowerCase())
    if (coupon && coupon.usesRemaining > 0) {
      const discount = coupon.discountType === 'percent'
        ? +(subtotal * coupon.discountValue / 100).toFixed(2)
        : Math.min(coupon.discountValue, subtotal)
      setAppliedCoupon({ discount, label: `${coupon.code} (-${coupon.discountType === 'percent' ? `${coupon.discountValue}%` : formatUsd(coupon.discountValue)})` })
      dispatch({ type: 'ADD_TOAST', payload: { message: `Coupon applied! You save ${formatUsd(discount)}`, type: 'success' } })
    } else {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Invalid or expired coupon code', type: 'error' } })
    }
  }

  const handleOrder = () => {
    if (!isAuthenticated) { router.push('/login'); return }
    const passcode = generatePasscode()
    dispatch({
      type: 'PLACE_ORDER',
      payload: {
        buyerId: state.user!.id, buyerName: state.user!.name,
        sellerId: booth.ownerId, sellerName: booth.ownerName,
        boothId: booth.id, boothName: booth.name,
        items: [{ productId: product.id, productName: product.name, qty, unitPrice: product.priceUsd, couponDiscount }],
        subtotal: discountedSubtotal, tax, platformFee, total,
        deliveryType, passcode,
      },
    })
    // Create conversation for the order
    dispatch({
      type: 'CREATE_CONVERSATION',
      payload: {
        orderId: `order-${Date.now()}`, buyerId: state.user!.id, buyerName: state.user!.name,
        sellerId: booth.ownerId, sellerName: booth.ownerName, boothName: booth.name,
      },
    })
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Order placed! Payment on hold. 🎉', type: 'success' } })
    router.push('/orders')
  }

  return (
    <div className="container">
      <div className={styles.breadcrumb}>
        <Link href="/market">Market</Link> / <Link href={`/market/booth/${boothId}`}>{booth.name}</Link> / <span>{product.name}</span>
      </div>

      <div className={styles.layout}>
        {/* Gallery */}
        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            <img src={product.photos[photoIndex]} alt={product.name} />
          </div>
          {product.photos.length > 1 && (
            <div className={styles.thumbs}>
              {product.photos.map((photo, i) => (
                <button key={i} className={`${styles.thumb} ${i === photoIndex ? styles.thumbActive : ''}`} onClick={() => setPhotoIndex(i)}>
                  <img src={photo} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className={styles.details}>
          <div className="badge badge-green" style={{ marginBottom: 8 }}>{product.category.replace('-', ' ')}</div>
          <h1 className={styles.productName}>{product.name}</h1>
          <p className={styles.productPrice}>
            <span className="price price-large">{formatUsd(product.priceUsd)}</span>
            <span className={styles.unit}>/ {product.unit}</span>
          </p>
          <p className={styles.productDesc}>{product.description}</p>

          {/* Stock */}
          <div className={styles.stockInfo}>
            {product.inventory > 0 ? (
              <span className="badge badge-green">✓ In Stock ({product.inventory} available)</span>
            ) : (
              <span className="badge badge-red">Sold Out</span>
            )}
          </div>

          {/* Delivery Options */}
          <div className={styles.deliverySection}>
            <h3 className={styles.sectionLabel}>Fulfillment</h3>
            <div className={styles.deliveryOptions}>
              {product.offersDelivery && (
                <button
                  className={`${styles.deliveryOption} ${deliveryType === 'delivery' ? styles.optionActive : ''}`}
                  onClick={() => setDeliveryType('delivery')}
                >
                  <span>🚗</span>
                  <div>
                    <strong>Delivery</strong>
                    <small>Within {product.deliveryRadiusMiles} mi • {product.deliveryWindows[0]}</small>
                  </div>
                </button>
              )}
              {product.offersPickup && (
                <button
                  className={`${styles.deliveryOption} ${deliveryType === 'pickup' ? styles.optionActive : ''}`}
                  onClick={() => setDeliveryType('pickup')}
                >
                  <span>📍</span>
                  <div>
                    <strong>Pickup</strong>
                    <small>{product.pickupWindows[0]}</small>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Quantity */}
          <div className={styles.qtySection}>
            <h3 className={styles.sectionLabel}>Quantity</h3>
            <div className={styles.qtyControl}>
              <button className="btn btn-outline btn-icon" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span className={styles.qtyValue}>{qty}</span>
              <button className="btn btn-outline btn-icon" onClick={() => setQty(Math.min(product.inventory, qty + 1))}>+</button>
              <span className={styles.qtyUnit}>{product.unit}{qty > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Coupon */}
          <div className={styles.couponSection}>
            <h3 className={styles.sectionLabel}>Coupon Code</h3>
            <div className={styles.couponRow}>
              <input className="input" placeholder="Enter code" value={couponCode} onChange={e => setCouponCode(e.target.value)} />
              <button className="btn btn-secondary btn-sm" onClick={handleApplyCoupon} disabled={!couponCode}>Apply</button>
            </div>
            {appliedCoupon && <span className="badge badge-green" style={{ marginTop: 8 }}>✓ {appliedCoupon.label}</span>}
          </div>

          {/* Price Breakdown */}
          <div className={styles.priceBreakdown}>
            <div className={styles.priceRow}><span>Subtotal</span><span>{formatUsd(subtotal)}</span></div>
            {couponDiscount > 0 && <div className={styles.priceRow} style={{ color: 'var(--green-600)' }}><span>Coupon Discount</span><span>-{formatUsd(couponDiscount)}</span></div>}
            <div className={styles.priceRow}><span>Sales Tax (9.25%)</span><span>{formatUsd(tax)}</span></div>
            <div className={styles.priceRow}><span>Platform Fee (5%)</span><span>{formatUsd(platformFee)}</span></div>
            <div className={`${styles.priceRow} ${styles.priceTotal}`}><span>Total</span><span>{formatUsd(total)}</span></div>
          </div>

          {/* Actions */}
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            onClick={handleOrder}
            disabled={product.inventory === 0}
          >
            {product.inventory === 0 ? 'Sold Out' : `Place Order — ${formatUsd(total)}`}
          </button>
          <p className={styles.holdNotice}>
            💳 Your card will be put on hold. You're only charged after delivery confirmation.
          </p>

          <Link href={`/chat`} className="btn btn-outline" style={{ width: '100%', marginTop: 8 }}>
            💬 Chat with Seller
          </Link>
        </div>
      </div>
    </div>
  )
}
