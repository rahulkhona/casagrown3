'use client'

import { useState } from 'react'
import { useMarket } from '../../../../lib/store'
import { trackClick } from '../../../../lib/analytics'
import styles from './page.module.css'
import SocialShareModal from '../../../components/SocialShareModal'

export default function InvitationsPage() {
  const { state, dispatch } = useMarket()
  const myBooth = state.booths.find(b => b.ownerId === state.user?.id)
  const coupons = state.coupons.filter(c => c.boothId === myBooth?.id)
  const [selectedCoupon, setSelectedCoupon] = useState(coupons[0]?.code || '')
  const [showShareModal, setShowShareModal] = useState(false)

  if (!myBooth) return <div className="container" style={{ padding: 80, textAlign: 'center' }}><h2>Create a stand first</h2></div>

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
        <div className={styles.previewBtn}>Browse Stand →</div>
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

      {/* Share Button — opens SocialShareModal */}
      <div style={{ marginTop: 24 }}>
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '14px 20px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => {
            trackClick('open_invitation_share_modal')
            setShowShareModal(true)
          }}
        >
          📣 Share Invitation
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

      {showShareModal && (
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title={`Share ${myBooth.name}`}
          subtitle="Invite friends and family to visit your produce stand."
          entityName={myBooth.name}
          shareUrl={inviteUrl}
          shareMessage={shareMessage}
          shareContext="booth_invitation"
          userId={state.user?.id}
          platforms={['email', 'whatsapp', 'copy']}
        />
      )}
    </div>
  )
}
