'use client'

import { useState } from 'react'
import { useMarket } from '../../../../lib/store'
import { trackClick } from '../../../../lib/analytics'
import styles from './page.module.css'
import { ShareIcon } from '../../../components/icons'

export default function InvitationsPage() {
  const { state, dispatch } = useMarket()
  const myBooth = state.booths.find(b => b.ownerId === state.user?.id)
  const coupons = state.coupons.filter(c => c.boothId === myBooth?.id)
  const [selectedCoupon, setSelectedCoupon] = useState(coupons[0]?.code || '')

  if (!myBooth) return <div className="container" style={{ padding: 80, textAlign: 'center' }}><h2>Create a booth first</h2></div>

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/market/booth/${myBooth.id}` : ''
  const coupon = coupons.find(c => c.code === selectedCoupon)
  const couponText = coupon
    ? `Use code ${coupon.code} for ${coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `$${coupon.discountValue} off`}!`
    : ''

  const shareMessage = `Hey! 🌱 Check out my produce stand "${myBooth.name}" on CasaGrown Market!

Fresh produce straight from my backyard. ${couponText ? couponText + '\n\n' : ''}📅 Market open Saturdays & Sundays, 8–11 AM

👇 Click the link below to browse my produce stand and shop:
${inviteUrl}

Fresh. Local. Trusted.`

  const copyLink = () => {
    navigator.clipboard?.writeText(inviteUrl)
    trackClick('copy_invitation_link')
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Link copied! 📋', type: 'success' } })
  }

  const copyMessage = () => {
    navigator.clipboard?.writeText(shareMessage)
    trackClick('copy_invitation_message')
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Share message copied! 📋', type: 'success' } })
  }

  const shareVia = (channel: 'sms' | 'whatsapp' | 'email') => {
    trackClick('share_invitation', { channel })
    const encodedMsg = encodeURIComponent(shareMessage)
    const subject = encodeURIComponent(`Check out ${myBooth.name} on CasaGrown Market!`)
    let url = ''
    switch (channel) {
      case 'sms': url = `sms:?body=${encodedMsg}`; break
      case 'whatsapp': url = `https://wa.me/?text=${encodedMsg}`; break
      case 'email': url = `mailto:?subject=${subject}&body=${encodedMsg}`; break
    }
    window.open(url, '_blank')
    dispatch({ type: 'ADD_TOAST', payload: { message: `Opening ${channel}... 🚀`, type: 'info' } })
  }


  return (
    <div className="container-sm">
      <div className="page-header">
        <h1 className="page-title">Share Your Produce Stand</h1>
        <p className="page-subtitle">Invite friends and family to visit your produce stand</p>
      </div>

      {/* Share Preview Card */}
      <div className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <img src="/logo.png" alt="CasaGrown" className={styles.previewLogo} />
          <span className={styles.previewBrand}>CasaGrown Market</span>
        </div>
        <h2 className={styles.previewTitle}>You&apos;re invited to {myBooth.name}!</h2>
        <p className={styles.previewSubtitle}>
          Fresh produce from your neighbor&apos;s backyard 🌱
        </p>
        <div className={styles.previewBtn}>Browse Booth →</div>
        {coupon && (
          <div className={styles.couponBadge}>
            <span className={styles.couponIcon}>🏷️</span>
            <span>Use code <strong>{coupon.code}</strong> for {coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `$${coupon.discountValue} off`}</span>
          </div>
        )}
        <div className={styles.previewSchedule}>
          📅 Open Saturdays & Sundays, 8–11 AM
        </div>
      </div>

      {/* Coupon selector */}
      {coupons.length > 0 && (
        <div className={styles.couponSelector}>
          <label className={styles.couponSelectorLabel}>Include coupon in invitation:</label>
          <select className="input" value={selectedCoupon} onChange={e => setSelectedCoupon(e.target.value)} style={{ maxWidth: 280 }}>
            <option value="">None</option>
            {coupons.map(c => (
              <option key={c.id} value={c.code}>
                {c.code} — {c.discountType === 'percent' ? `${c.discountValue}%` : `$${c.discountValue}`} off
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sharing Options */}
      <div className={styles.sectionHeader}>
        <h3>Share via</h3>
      </div>
      <div className={styles.shareGrid}>
        <button className={`${styles.shareBtn} ${styles.shareNative}`} onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title: `${myBooth.name} on CasaGrown Market`, text: shareMessage, url: inviteUrl })
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Shared! 🎉', type: 'success' } })
            } catch { /* user cancelled */ }
          } else {
            copyMessage()
          }
        }}>
          <span className={styles.shareIcon}><ShareIcon size={20} /></span>
          <span>Share</span>
          <span className={styles.shareSub}>Opens your device&apos;s share menu</span>
        </button>
        <button className={`${styles.shareBtn} ${styles.shareCopy}`} onClick={copyMessage}>
          <span className={styles.shareIcon}>📋</span>
          <span>Copy Message</span>
          <span className={styles.shareSub}>Copy the full invite text</span>
        </button>
        <button className={`${styles.shareBtn} ${styles.shareCopy}`} onClick={copyLink}>
          <span className={styles.shareIcon}>🔗</span>
          <span>Copy Link</span>
          <span className={styles.shareSub}>Just the booth URL</span>
        </button>
        <button className={`${styles.shareBtn} ${styles.shareEmail}`} onClick={() => shareVia('email')}>
          <span className={styles.shareIcon}>✉️</span>
          <span>Email</span>
          <span className={styles.shareSub}>Opens your email client</span>
        </button>
      </div>

      {/* Pre-composed message */}
      <div className={styles.sectionHeader}>
        <h3>Preview Message</h3>
      </div>
      <div className={styles.messagePreview}>
        <pre className={styles.messageText}>{shareMessage}</pre>
      </div>

      {/* QR Code */}
      <div className={styles.sectionHeader}>
        <h3>QR Code</h3>
      </div>
      <div className={styles.qrCard}>
        <div className={styles.qrPlaceholder}>
          <div className={styles.qrInner}>QR Code</div>
          <p className={styles.qrCaption}>Scan to visit <strong>{myBooth.name}</strong></p>
        </div>
        <div className={styles.inviteCodeRow}>
          Invite Code: <strong className={styles.inviteCode}>{myBooth.inviteCode}</strong>
        </div>
      </div>

      <div style={{ height: 40 }} />
    </div>
  )
}
