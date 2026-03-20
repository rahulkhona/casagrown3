'use client'

import { useState } from 'react'
import { useMarket } from '../../../../lib/store'
import { trackFormSubmit, trackClick } from '../../../../lib/analytics'
import styles from './page.module.css'

export default function CouponsPage() {
  const { state, dispatch } = useMarket()
  const myBooth = state.booths.find(b => b.ownerId === state.user?.id)
  const coupons = state.coupons.filter(c => c.boothId === myBooth?.id)
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [uses, setUses] = useState('50')

  const handleCreate = () => {
    if (!code || !discountValue || !myBooth) return
    trackFormSubmit('create_coupon', { code: code.toUpperCase(), discountType, discountValue: parseFloat(discountValue) })
    dispatch({
      type: 'CREATE_COUPON',
      payload: {
        boothId: myBooth.id, code: code.toUpperCase(),
        discountType, discountValue: parseFloat(discountValue),
        expiresAt: '2026-12-31', usesRemaining: parseInt(uses), totalUses: parseInt(uses),
      },
    })
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Coupon created! 🏷️', type: 'success' } })
    setShowForm(false); setCode(''); setDiscountValue('')
  }

  const shareCoupon = (coupon: typeof coupons[0]) => {
    const boothUrl = typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${myBooth?.id}` : ''
    const msg = `🏷️ Exclusive deal from ${myBooth?.name} on CasaGrown Market!

Use code ${coupon.code} for ${coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `$${coupon.discountValue} off`} your order!

🛒 Shop now: ${boothUrl}

Fresh. Local. Trusted. 🌱`
    navigator.clipboard?.writeText(msg)
    trackClick('share_coupon', { code: coupon.code })
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Coupon share message copied! 📋', type: 'success' } })
  }

  return (
    <div className="container-sm">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0 16px' }}>
        <div><h1 className="page-title">Coupons</h1></div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '➕ Create Coupon'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="form-group">
            <label className="label">Coupon Code</label>
            <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="FRESH10" style={{ textTransform: 'uppercase' }} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Type</label>
              <select className="input" value={discountType} onChange={e => setDiscountType(e.target.value as any)}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Value</label>
              <input className="input" type="number" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder={discountType === 'percent' ? '10' : '5.00'} />
            </div>
            <div className="form-group">
              <label className="label">Uses</label>
              <input className="input" type="number" min="1" value={uses} onChange={e => setUses(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!code || !discountValue}>Create Coupon</button>
        </div>
      )}

      {coupons.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No coupons yet</div>
          <div className="empty-state-text">Create coupons to share with buyers for discounts</div>
        </div>
      ) : (
        <div className={styles.couponGrid}>
          {coupons.map(c => (
            <div key={c.id} className={styles.couponCard}>
              <div className={styles.couponLeft}>
                <div className={styles.couponCircleLeft} />
                <div className={styles.couponCircleRight} />
                <div className={styles.couponDiscount}>
                  {c.discountType === 'percent' ? `${c.discountValue}%` : `$${c.discountValue}`}
                </div>
                <div className={styles.couponOff}>OFF</div>
              </div>
              <div className={styles.couponRight}>
                <div className={styles.couponCode}>{c.code}</div>
                <div className={styles.couponMeta}>
                  {c.usesRemaining}/{c.totalUses} uses remaining
                </div>
                <div className={styles.couponActions}>
                  <button className={styles.couponShareBtn} onClick={() => shareCoupon(c)}>
                    📋 Copy Share Message
                  </button>
                  <button className={styles.couponDeleteBtn} onClick={() => {
                    dispatch({ type: 'DELETE_COUPON', payload: c.id })
                    dispatch({ type: 'ADD_TOAST', payload: { message: 'Coupon deleted', type: 'info' } })
                  }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 40 }} />
    </div>
  )
}
