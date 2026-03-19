'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMarket, formatUsd, type Product } from '../../../../lib/store'
import styles from './page.module.css'

export default function ProductsListPage() {
  const { state, dispatch } = useMarket()
  const myBooth = state.booths.find(b => b.ownerId === state.user?.id)
  const products = state.products.filter(p => p.boothId === myBooth?.id)
  const coupons = state.coupons.filter(c => c.boothId === myBooth?.id)

  // Invite modal state
  const [inviteProduct, setInviteProduct] = useState<Product | null>(null)
  const [attachCoupon, setAttachCoupon] = useState(false)
  const [couponType, setCouponType] = useState<'percent' | 'fixed'>('percent')
  const [couponValue, setCouponValue] = useState('10')
  const [selectedCoupon, setSelectedCoupon] = useState('')

  if (!myBooth) return (
    <div className="container" style={{ padding: 80, textAlign: 'center' }}>
      <h2>Create a booth first</h2>
      <Link href="/my-booth" className="btn btn-primary" style={{ marginTop: 16 }}>Go to My Booth</Link>
    </div>
  )

  const openInvite = (product: Product) => {
    setInviteProduct(product)
    setAttachCoupon(false)
    setSelectedCoupon(coupons[0]?.code || '')
  }

  const getInviteMessage = () => {
    if (!inviteProduct) return ''
    const boothUrl = typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${myBooth.id}/product/${inviteProduct.id}` : ''
    let msg = `Hey! 🌿 I have fresh ${inviteProduct.name} available on CasaGrown — ${formatUsd(inviteProduct.priceUsd)} per ${inviteProduct.unit}.${inviteProduct.marketDate ? ` Listed for ${inviteProduct.marketDate}.` : ''}\n\nTake a look: ${boothUrl}`

    if (attachCoupon) {
      const existingCoupon = coupons.find(c => c.code === selectedCoupon)
      if (existingCoupon) {
        msg += `\n\n🏷️ Use code ${existingCoupon.code} for ${existingCoupon.discountType === 'percent' ? `${existingCoupon.discountValue}% off` : `$${existingCoupon.discountValue} off`}!`
      } else {
        const disc = couponType === 'percent' ? `${couponValue}% off` : `$${couponValue} off`
        msg += `\n\n🏷️ Use coupon for ${disc} your first order!`
      }
    }
    return msg
  }

  const handleInviteCopy = () => {
    navigator.clipboard?.writeText(getInviteMessage())
    setInviteProduct(null)
  }

  const handleInviteShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${inviteProduct?.name} at ${myBooth.name}`,
        text: getInviteMessage(),
      }).catch(() => {})
    } else {
      handleInviteCopy()
    }
    setInviteProduct(null)
  }

  const toggleVisibility = (product: Product) => {
    dispatch({ type: 'UPDATE_PRODUCT', payload: { id: product.id, isActive: !product.isActive } })
  }

  return (
    <div className="container-sm">
      <div className={styles.header}>
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">{products.length} product{products.length !== 1 ? 's' : ''} listed</p>
        </div>
        <Link href="/my-booth/products/new" className="btn btn-primary">➕ Add Product</Link>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No products yet</div>
          <div className="empty-state-text">Add your first product to start selling</div>
          <Link href="/my-booth/products/new" className="btn btn-primary">Add Product</Link>
        </div>
      ) : (
        <div className={styles.productList}>
          {products.map(p => {
            const isDraft = p.status === 'draft'
            const isHidden = !p.isActive
            const isFlagged = (p as any).is_flagged || (p as any).isFlagged
            return (
              <div
                key={p.id}
                className={`${styles.productCard} ${isHidden ? styles.productHidden : ''}`}
              >
                {(isDraft || isHidden || isFlagged) && (
                  <div className={styles.badges}>
                    {isDraft && <span className={styles.badgeDraft}>Draft</span>}
                    {isFlagged && <span className={styles.badgeFlagged}>⚠️ Flagged — edit to resolve</span>}
                    {isHidden && !isDraft && !isFlagged && <span className={styles.badgeHidden}>Hidden</span>}
                  </div>
                )}

                <div className={styles.productThumb}>
                  <img src={p.photos[0]} alt={p.name} className={styles.productThumbImg} />
                </div>

                <div className={styles.productInfo}>
                  <strong className={styles.productName}>{p.name}</strong>
                  <div className={styles.productMeta}>
                    {formatUsd(p.priceUsd)} / {p.unit} • Stock: {p.inventory}
                  </div>
                  {p.marketDate && (
                    <div className={styles.productDate}>📅 {p.marketDate}</div>
                  )}
                </div>

                <div className={styles.productActions}>
                  <button
                    className={styles.inviteBtn}
                    onClick={() => openInvite(p)}
                  >
                    ✉️ Invite Neighbors
                  </button>
                  <button
                    className={`${styles.actionBtn} ${isHidden ? styles.actionBtnActive : ''}`}
                    title={isHidden ? 'Show to buyers' : 'Hide from buyers'}
                    onClick={() => toggleVisibility(p)}
                  >
                    {isHidden ? '🙈' : '👁️'}
                  </button>
                  <button
                    className={styles.actionBtn}
                    title="Delete"
                    onClick={() => dispatch({ type: 'DELETE_PRODUCT', payload: p.id })}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== Invite Modal ===== */}
      {inviteProduct && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setInviteProduct(null)} />
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Invite your neighbors to your booth!</h2>
            <p className={styles.modalProduct}>{inviteProduct.name} — {formatUsd(inviteProduct.priceUsd)} / {inviteProduct.unit}</p>

            {/* Coupon attachment */}
            <div className={styles.couponSection}>
              <label className={styles.toggle}>
                <input type="checkbox" checked={attachCoupon} onChange={e => setAttachCoupon(e.target.checked)} />
                <span>🏷️ Attach a coupon</span>
              </label>
              {attachCoupon && (
                <>
                  {coupons.length > 0 ? (
                    <div className={styles.couponPicker}>
                      <label className={styles.couponPickerLabel}>Choose an existing coupon:</label>
                      <select
                        className={styles.couponSelect}
                        value={selectedCoupon}
                        onChange={e => setSelectedCoupon(e.target.value)}
                      >
                        {coupons.map(c => (
                          <option key={c.id} value={c.code}>
                            {c.code} — {c.discountType === 'percent' ? `${c.discountValue}%` : `$${c.discountValue}`} off
                          </option>
                        ))}
                        <option value="">Create new...</option>
                      </select>
                    </div>
                  ) : null}
                  {(coupons.length === 0 || selectedCoupon === '') && (
                    <div className={styles.couponRow}>
                      <div className={styles.couponToggle}>
                        <button
                          type="button"
                          className={`${styles.couponTab} ${couponType === 'percent' ? styles.couponTabActive : ''}`}
                          onClick={() => setCouponType('percent')}
                        >% Off</button>
                        <button
                          type="button"
                          className={`${styles.couponTab} ${couponType === 'fixed' ? styles.couponTabActive : ''}`}
                          onClick={() => setCouponType('fixed')}
                        >$ Off</button>
                      </div>
                      <input
                        className={styles.couponInput}
                        type="number"
                        min="1"
                        value={couponValue}
                        onChange={e => setCouponValue(e.target.value)}
                      />
                      <span className={styles.couponPreview}>
                        {couponType === 'percent' ? `${couponValue}% off` : `$${couponValue} off`}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className={styles.modalActions}>
              <button className={styles.modalActionBtn} onClick={handleInviteCopy}>
                📋 Copy Invite
              </button>
              <button className={styles.modalActionBtn} onClick={handleInviteShare}>
                📤 Share
              </button>
            </div>
            <button className={styles.modalClose} onClick={() => setInviteProduct(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
