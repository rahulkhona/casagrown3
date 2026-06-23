'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import SocialShareModal from '../SocialShareModal'
import { useBootstrap } from '../../../lib/useBootstrap'
import { getBoothProductShareMessage, type SharePlatformType } from '../../../lib/shareMessages'

export default function Step6Success() {
  const { state } = useWizard()
  const { data } = useBootstrap()
  const router = useRouter()
  const [showShareModal, setShowShareModal] = useState(true)

  const referralCode = data?.profile?.referral_code || ''
  const productUrl = state.publishedProductId 
    ? `https://casagrown.com/p/${state.publishedProductId}${referralCode ? `?ref=${referralCode}` : ''}`
    : 'https://casagrown.com/p/preview'

  // Build price text
  const priceText = state.isFree
    ? '💚 Price: Free'
    : state.priceUsd
      ? `💰 Price: $${state.priceUsd}${state.unit ? ` / ${state.unit}` : ''}`
      : ''

  // Build quantity text
  const qtyText = state.quantity ? `📦 Available Qty: ${state.quantity}` : ''

  // Build fulfillment text
  const modes: string[] = []
  if (state.offersDelivery) modes.push('🚗 Delivery')
  if (state.offersPickup) modes.push('📍 Pickup')
  const deliveryText = modes.length > 0
    ? `${qtyText ? qtyText + '\n' : ''}${modes.join(' • ')}`
    : qtyText

  const shareMessage = (platform?: SharePlatformType) =>
    getBoothProductShareMessage(state.name || 'homegrown produce', priceText, deliveryText, undefined, platform)

      const ogPrice = state.isFree
        ? 'Free'
        : state.priceUsd
          ? `$${Number(state.priceUsd).toFixed(2)}/${state.unit}`
          : ''
      const ogTitle = `${state.name || 'Product'}${ogPrice ? ` — ${ogPrice}` : ''} | CasaGrown Market`

  const isFree = state.isFree || parseFloat(state.priceUsd || '0') === 0;

  return (
    <div style={{ background: '#f0fdf4', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, margin: '-24px -20px -100px -20px' }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#15803d', marginBottom: 12, textAlign: 'center' }}>Your listing is live!</h2>
      
      <div style={{ marginTop: 24, width: '100%', border: '2px solid #bbf7d0', borderRadius: 24, padding: 24, background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#166534', textAlign: 'center', lineHeight: 1.5, marginBottom: 24 }}>
          {isFree 
            ? `🎁 Let friends and neighbors know you want to share your ${state.name || 'produce'} in just a couple of clicks!`
            : "💰 Sell out fast by letting neighbors know about your listing in just a couple of clicks."
          }
        </p>
        
        <button 
          className={styles.btnPrimary} 
          style={{ background: '#16a34a', marginBottom: 12 }}
          onClick={() => setShowShareModal(true)}
        >
          🔗 Share your Listing
        </button>
      </div>
      
      <button 
        style={{ marginTop: 32, fontWeight: 600, color: '#16a34a', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', fontSize: 16 }}
        onClick={() => router.push('/my-booth')}
      >
        Go to My Dashboard →
      </button>

      <SocialShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={`${state.name || 'Product'} added!`}
        entityName={state.name || 'Product'}
        shareUrl={productUrl}
        shareMessage={shareMessage}
        shareContext="new_product_share"
        imageUrl={state.photos?.[0] || undefined}
        ogTitle={ogTitle}
        isFree={isFree}
      />
    </div>
  )
}
