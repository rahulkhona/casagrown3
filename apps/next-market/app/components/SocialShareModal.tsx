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
  showBuzz?: boolean
  onShareBuzz?: () => void
  isBuzzShared?: boolean
}

export default function SocialShareModal({
  isOpen,
  onClose,
  title,
  subtitle,
  entityName,
  shareUrl,
  shareMessage,
  showBuzz,
  onShareBuzz,
  isBuzzShared
}: SocialShareModalProps) {
  const [shareCopied, setShareCopied] = useState(false)

  if (!isOpen) return null

  const handleShareFacebook = () => {
    const url = encodeURIComponent(shareUrl)
    const quote = encodeURIComponent(shareMessage)
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`, '_blank', 'width=600,height=400')
  }

  const handleShareNextdoor = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {}
    window.open('https://nextdoor.com/news_feed/', '_blank')
  }

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(shareMessage)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: entityName, text: shareMessage, url: shareUrl })
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareMessage)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
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
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#111827' }}>{title}</h2>
        {subtitle && <p style={{ margin: '0 0 20px', fontSize: 14, color: '#4b5563', lineHeight: 1.5 }}>{subtitle}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {showBuzz && onShareBuzz && (
            <button
              onClick={onShareBuzz}
              disabled={isBuzzShared}
              style={{
                width: '100%', padding: '12px', border: 'none', borderRadius: 999,
                background: isBuzzShared ? '#f3f4f6' : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                color: isBuzzShared ? '#9ca3af' : '#92400e', fontSize: 15, fontWeight: 600,
                cursor: isBuzzShared ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}
            >
              {isBuzzShared ? '✅ Shared to Community' : '📍 Share to Community Buzz'}
            </button>
          )}

          <button
            onClick={handleShareFacebook}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: 999,
              background: '#1877f2', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <span style={{ fontWeight: 'bold' }}>f</span> Share on Facebook
          </button>

          <button
            onClick={handleShareWhatsApp}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: 999,
              background: '#25D366', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <span style={{ fontSize: 18 }}>💬</span> Share on WhatsApp
          </button>

          <button
            onClick={handleShareNextdoor}
            style={{
              width: '100%', padding: '12px', border: 'none', borderRadius: 999,
              background: '#8ed500', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            {shareCopied ? '✅ Copied! Paste on Nextdoor' : '🏡 Share on Nextdoor'}
          </button>

          <button 
            onClick={handleShareNative}
            style={{
              width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: 999,
              background: '#f9fafb', color: '#374151', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <ShareIcon size={16} /> {shareCopied ? 'Copied to Clipboard!' : 'More Options / Copy Link'}
          </button>
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
