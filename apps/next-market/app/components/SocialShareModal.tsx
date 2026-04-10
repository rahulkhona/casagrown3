'use client'

import React, { useState } from 'react'
import { ShareIcon } from './icons'

interface SocialShareModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  entityName: string
  shareUrl: string
  shareMessage: string
}

export default function SocialShareModal({
  isOpen,
  onClose,
  title,
  subtitle,
  entityName,
  shareUrl,
  shareMessage
}: SocialShareModalProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const getPayload = () => {
    return shareMessage.includes(shareUrl) ? shareMessage : `${shareMessage}\n\n${shareUrl}`
  }

  const handleShareSMS = () => {
    const text = encodeURIComponent(getPayload())
    // On iOS specifically, ?&body= is sometimes needed, but ?body= is standard.
    // We'll use ?body= as it works reliably on modern iOS and Android.
    window.location.href = `sms:?body=${text}`
  }

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(getPayload())
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handleShareNextdoor = () => {
    navigator.clipboard.writeText(getPayload()).catch(()=>{})
    setToastMessage("✅ Copied! Click 'Paste' in the Nextdoor box.")
    setTimeout(() => setToastMessage(null), 3500)
    window.open('https://nextdoor.com/news_feed/', '_blank')
  }

  const handleShareFacebook = async () => {
    const url = encodeURIComponent(shareUrl)
    navigator.clipboard.writeText(getPayload()).catch(()=>{})
    setToastMessage("✅ Copied! Click 'Paste' in the Facebook box.")
    setTimeout(() => setToastMessage(null), 3500)
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setToastMessage("📋 Link Copied!")
      setTimeout(() => setToastMessage(null), 2000)
    } catch {}
  }

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: entityName, text: shareMessage, url: shareUrl })
      } catch {}
    }
  }

  return (
    <>
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)'
        }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 10000, background: '#fff', borderRadius: 16, width: '90%', maxWidth: 400,
        padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
      }}>
        {toastMessage && (
          <div style={{
            position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
            background: '#1f2937', color: '#fff', padding: '6px 12px', borderRadius: 6,
            fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', animation: 'fadeIn 0.2s ease-out'
          }}>
            {toastMessage}
          </div>
        )}
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#111827' }}>{title}</h2>
        {subtitle && <p style={{ margin: '0 0 16px', fontSize: 14, color: '#4b5563', lineHeight: 1.5 }}>{subtitle}</p>}

        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d',
          padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 20,
          textAlign: 'left', lineHeight: 1.4, width: '100%'
        }}>
          💡 <strong>Tip:</strong> Nextdoor (and Facebook) block auto-filled text. We've copied your message—just click <strong>Paste</strong> when the app opens!
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          
          {/* 1. SMS / iMessage */}
          <button
            onClick={handleShareSMS}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: 999,
              background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <span style={{ fontSize: 18 }}>💬</span> Text a Neighbor
          </button>

          {/* 2. WhatsApp */}
          <button
            onClick={handleShareWhatsApp}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: 999,
              background: '#25D366', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <span style={{ fontSize: 18 }}>📞</span> Share on WhatsApp
          </button>

          {/* 3. Nextdoor */}
          <button
            onClick={handleShareNextdoor}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: 999,
              background: '#8ed500', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            {toastMessage && toastMessage.includes('Nextdoor') ? '✅ Copied! Paste on Nextdoor' : '🏡 Share on Nextdoor'}
          </button>

          {/* 4. Facebook */}
          <button
            onClick={handleShareFacebook}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: 999,
              background: '#1877f2', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            {toastMessage && toastMessage.includes('Facebook') ? '✅ Copied! Paste on Facebook' : <><span style={{ fontWeight: 'bold' }}>f</span> Share on Facebook</>}
          </button>

          {/* 5. Copy Link */}
          <button 
            onClick={handleCopyLink}
            style={{
              width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: 999,
              background: '#f9fafb', color: '#374151', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            📋 {toastMessage && toastMessage.includes('Link') ? 'Link Copied!' : 'Copy Link'}
          </button>

          {/* 6. Native Share */}
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button 
              onClick={handleShareNative}
              style={{
                width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: 999,
                background: '#f9fafb', color: '#374151', fontSize: 15, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}
            >
              <ShareIcon size={16} /> More Options
            </button>
          )}
        </div>

        <button 
          onClick={onClose}
          style={{
            marginTop: 20, background: 'none', border: 'none', color: '#6b7280',
            fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '8px 16px'
          }}
        >
          Close
        </button>
      </div>
    </>
  )
}
