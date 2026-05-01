'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWizard } from './WizardContext'
import styles from './wizard.module.css'
import SocialShareModal from '../SocialShareModal'
import { useBootstrap } from '../../../lib/useBootstrap'

export default function Step6Success() {
  const { state } = useWizard()
  const { data } = useBootstrap()
  const router = useRouter()
  const [showShareModal, setShowShareModal] = useState(true)

  const referralCode = data?.profile?.referral_code || ''
  const productUrl = state.publishedProductId 
    ? `https://casagrown.com/p/${state.publishedProductId}${referralCode ? `?ref=${referralCode}` : ''}`
    : 'https://casagrown.com/p/preview'
  const shareMessage = `Hey neighbors! I'm selling ${state.name || 'homegrown produce'} on CasaGrown:`

  return (
    <div style={{ background: '#f0fdf4', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, margin: '-24px -20px -100px -20px' }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#15803d', marginBottom: 12, textAlign: 'center' }}>Your listing is live!</h2>
      
      <div style={{ marginTop: 24, width: '100%', border: '2px solid #16a34a', borderRadius: 24, padding: 24, background: 'white' }}>
        <h3 style={{ fontSize: 16, marginBottom: 12, textAlign: 'center', fontWeight: 700 }}>📣 The Secret to Selling</h3>
        <p style={{ fontSize: 14, color: '#4b5563', textAlign: 'center', lineHeight: 1.5, marginBottom: 24 }}>
          Neighborhood sales rely on word-of-mouth. Share your listing to local Facebook groups or Nextdoor to get your first orders!
        </p>
        
        <button 
          className={styles.btnPrimary} 
          style={{ background: '#16a34a', marginBottom: 12 }}
          onClick={() => setShowShareModal(true)}
        >
          📣 Share your Listing
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
        subtitle="🎉 Your listing is live! Invite your neighbors to check it out."
        entityName={state.name || 'Product'}
        shareUrl={productUrl}
        shareMessage={shareMessage}
      />
    </div>
  )
}
