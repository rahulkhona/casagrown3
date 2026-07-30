'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createTrackedShareLink, type ShareContext, type SharePlatform } from '../../lib/createTrackedShareLink'
import type { SharePlatformType } from '../../lib/shareMessages'

interface SocialShareModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  entityName: string
  shareUrl: string
  shareMessage: string | ((platform: SharePlatformType) => string)
  shareContext?: ShareContext
  userId?: string
  /** If provided, only these platform buttons are shown. Omit for all platforms. */
  platforms?: SharePlatform[]
  imageUrl?: string
  ogTitle?: string
  isFree?: boolean
}

// ── Platform SVG Icons ──

const WhatsAppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

const NextdoorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 9.5V22h7.5v-7h5v7H22V9.5L12 2zm0 2.5l7 5.25V20h-3.5v-7h-7v7H5V9.75l7-5.25z"/>
  </svg>
)

const LinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)

const ShareMoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)

const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
)

// ── Paste Reminder Interstitial ──

const DONT_REMIND_KEY = 'cg_paste_reminder_dismissed'

function PasteReminderModal({ 
  platform, 
  onContinue, 
  onCancel 
}: { 
  platform: 'Facebook' | 'Nextdoor'
  onContinue: () => void
  onCancel: () => void
}) {
  const [dontRemind, setDontRemind] = useState(false)
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)
  
  const platformColor = platform === 'Facebook' ? '#1877F2' : '#00B246'
  const platformIcon = platform === 'Facebook' ? <FacebookIcon /> : <NextdoorIcon />
  const postBoxName = platform === 'Facebook' ? '"What\'s on your mind?"' : '"Write a post..."'

  const handleContinue = () => {
    if (dontRemind) {
      try { localStorage.setItem(DONT_REMIND_KEY, 'true') } catch {}
    }
    onContinue()
  }

  return (
    <>
      <div onClick={onCancel} style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: 'rgba(0,0,0,0.5)'
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 10002, background: '#fff', borderRadius: 16, width: '88%', maxWidth: 380,
        padding: '28px 24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: platformColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', marginBottom: 16
        }}>
          {platformIcon}
        </div>
        
        <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#111827', fontWeight: 700 }}>
          Message Copied! 📋
        </h3>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
          {platform} doesn&apos;t allow auto-pasting.
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#374151', lineHeight: 1.5, fontWeight: 500 }}>
          Tap the {postBoxName} box, then:
        </p>
        
        {isMobile ? (
          /* Mobile: long-press instruction */
          <div style={{
            background: '#f3f4f6', borderRadius: 10, padding: '14px 20px',
            marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
          }}>
            <span style={{ fontSize: 28 }}>👆</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              Long-press → tap &quot;Paste&quot;
            </span>
          </div>
        ) : (
          /* Desktop: keyboard shortcut */
          <div style={{
            background: '#f3f4f6', borderRadius: 10, padding: '12px 24px',
            marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 8
          }}>
            <kbd style={{
              background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
              padding: '4px 10px', fontSize: 16, fontWeight: 700, color: '#111827',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontFamily: 'system-ui'
            }}>
              {isMac ? '⌘V' : 'Ctrl+V'}
            </kbd>
            <span style={{ fontSize: 13, color: '#6b7280' }}>to paste</span>
          </div>
        )}

        <button
          onClick={handleContinue}
          style={{
            width: '100%', padding: '13px', border: 'none', borderRadius: 999,
            background: platformColor, color: '#fff', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 12
          }}
        >
          Continue to {platform} →
        </button>
        
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, color: '#9ca3af', cursor: 'pointer', userSelect: 'none',
          marginBottom: 8
        }}>
          <input
            type="checkbox"
            checked={dontRemind}
            onChange={(e) => setDontRemind(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: platformColor, cursor: 'pointer' }}
          />
          Don&apos;t remind me again
        </label>
        
        <button
          onClick={onCancel}
          style={{
            background: 'none', border: 'none', color: '#9ca3af',
            fontSize: 13, cursor: 'pointer', padding: '4px 12px'
          }}
        >
          Skip
        </button>
      </div>
    </>
  )
}

interface PlatformCardProps {
  icon: React.ReactNode
  title: string
  description: string
  brandColor: string
  onClick: () => void
}

function PlatformCard({
  icon,
  title,
  description,
  brandColor,
  onClick
}: PlatformCardProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '14px 16px',
        border: hovered ? '1px solid #10B981' : '1px solid #e5e7eb',
        borderRadius: 14,
        background: hovered ? 'rgba(16, 185, 129, 0.02)' : '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s ease',
        boxShadow: hovered ? '0 4px 12px rgba(16, 185, 129, 0.08)' : '0 1px 2px rgba(0,0,0,0.02)',
        boxSizing: 'border-box',
        outline: 'none',
      }}
    >
      <div style={{
        width: 42,
        height: 42,
        borderRadius: 10,
        background: brandColor,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        flexShrink: 0,
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</span>
        <span style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.3 }}>{description}</span>
      </div>
      <div style={{
        marginLeft: 8,
        color: hovered ? '#10B981' : '#d1d5db',
        fontSize: 16,
        fontWeight: 700,
        transition: 'color 0.2s ease'
      }}>
        →
      </div>
    </button>
  )
}

// ── Main Modal ──

export default function SocialShareModal({
  isOpen,
  onClose,
  title,
  subtitle,
  entityName,
  shareUrl,
  shareMessage,
  shareContext,
  userId,
  platforms,
  imageUrl,
  ogTitle,
  isFree = false,
}: SocialShareModalProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({})
  const [activePreviewTab, setActivePreviewTab] = useState<SharePlatformType>('whatsapp')
  const [isEditing, setIsEditing] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<SharePlatformType | null>(null)
  const [trackedUrls, setTrackedUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      setIsEditing(false)
      setSelectedPlatform(null)
      setTrackedUrls({})
      const initial: Record<string, string> = {}
      const keys: SharePlatformType[] = ['sms', 'whatsapp', 'email', 'nextdoor', 'facebook', 'native', 'copy']
      keys.forEach((p) => {
        initial[p] = typeof shareMessage === 'function' ? shareMessage(p) : shareMessage || ''
      })
      setCustomMessages(initial)
    }
  }, [isOpen, shareMessage])

  // Dynamically filter active tab to the first visible option when opening or updating platforms
  useEffect(() => {
    if (isOpen) {
      const available = (['whatsapp', 'nextdoor', 'facebook', 'sms', 'email', 'copy'] as const).filter(show)
      if (available.length > 0 && !available.includes(activePreviewTab as any)) {
        setActivePreviewTab(available[0])
      }
    }
  }, [isOpen, platforms])

  /** Check if a platform should be shown */
  const show = (p: SharePlatform) => !platforms || platforms.includes(p)

  const availableTabs = (['whatsapp', 'nextdoor', 'facebook', 'sms', 'email', 'copy'] as const).filter(show)

  /** Fetch a tracked link quietly in the background */
  const fetchTrackedUrl = useCallback(async (platform: SharePlatform): Promise<string> => {
    if (!shareContext) return shareUrl
    try {
      return await createTrackedShareLink(shareUrl, shareContext, platform, userId)
    } catch {
      return shareUrl
    }
  }, [shareUrl, shareContext, userId])

  // Pre-fetch tracked URLs in parallel as soon as the modal is opened
  useEffect(() => {
    if (isOpen) {
      availableTabs.forEach(async (p) => {
        try {
          const url = await fetchTrackedUrl(p)
          setTrackedUrls(prev => ({ ...prev, [p]: url }))
          setCustomMessages(prev => {
            const msg = prev[p] || (typeof shareMessage === 'function' ? shareMessage(p) : shareMessage) || ''
            if (shareUrl && msg.includes(shareUrl)) {
              return { ...prev, [p]: msg.replaceAll(shareUrl, url) }
            }
            return prev
          })
        } catch (e) {
          console.warn('[SocialShareModal] Pre-fetch failed for', p, e)
        }
      })
    }
  }, [isOpen, shareUrl, shareMessage])

  /** Resolve the share message for a given platform */
  const resolveMessage = (platform: SharePlatformType): string => {
    return typeof shareMessage === 'function' ? shareMessage(platform) : shareMessage
  }

  /** Build the share payload text, replacing the raw URL with the tracked one */
  const getPayload = (trackedUrl: string, platform: SharePlatformType) => {
    const baseMsg = (customMessages[platform] || resolveMessage(platform)).trim()
    if (!baseMsg) return trackedUrl
    // If message already includes the raw URL, replace it with tracked
    if (baseMsg.includes(shareUrl)) {
      return baseMsg.replace(shareUrl, trackedUrl)
    }
    // If message already includes the tracked URL, return it as is
    if (baseMsg.includes(trackedUrl)) {
      return baseMsg
    }
    return `${baseMsg}\n\n${trackedUrl}`
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  const confirmShareLink = useCallback(async (platform: SharePlatform) => {
    const url = trackedUrls[platform]
    if (!url) return
    const token = url.split('/r/')[1]
    if (!token) return
    try {
      await fetch('/api/crm/short-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, is_shared: true }),
      })
    } catch (err) {
      console.warn('[SocialShareModal] Failed to confirm share link', err)
    }
  }, [trackedUrls])

  const handleShareSMS = () => {
    confirmShareLink('sms')
    const tracked = trackedUrls['sms'] || shareUrl
    const text = encodeURIComponent(getPayload(tracked, 'sms'))
    window.location.href = `sms:?body=${text}`
  }

  const handleShareWhatsApp = () => {
    confirmShareLink('whatsapp')
    const tracked = trackedUrls['whatsapp'] || shareUrl
    const text = encodeURIComponent(getPayload(tracked, 'whatsapp'))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handleShareEmail = () => {
    confirmShareLink('email')
    const tracked = trackedUrls['email'] || shareUrl
    const subject = encodeURIComponent(entityName || title)
    const body = encodeURIComponent(getPayload(tracked, 'email'))
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const getCommentPayload = (trackedUrl: string) => {
    if (shareContext === 'product_share' || shareContext === 'new_product_share' || shareContext === 'buy_request') {
      return `👉 Browse & order here: ${trackedUrl} 🌿`
    }
    if (shareContext === 'booth_share' || shareContext === 'booth_invitation') {
      return `👉 View my produce stand and order here: ${trackedUrl} 🌿`
    }
    if (shareContext === 'community_invite' || shareContext === 'following_invite' || shareContext === 'market_invite') {
      return `👉 Join our local garden community and browse fresh produce here: ${trackedUrl} 🌿`
    }
    return `👉 Explore what's fresh and order here: ${trackedUrl} 🌿`
  }

  const handleShareNextdoorStep1 = () => {
    const baseMsg = (customMessages['nextdoor'] || resolveMessage('nextdoor')).trim()
    navigator.clipboard.writeText(baseMsg).catch(()=>{})
    showToast('📋 Post Text Copied! Opening Nextdoor...')
    window.open('https://nextdoor.com/news_feed/', '_blank')
  }

  const handleShareNextdoorStep2 = () => {
    confirmShareLink('nextdoor')
    const tracked = trackedUrls['nextdoor'] || shareUrl
    const commentText = getCommentPayload(tracked)
    navigator.clipboard.writeText(commentText).catch(()=>{})
    showToast('📋 Comment Message Copied! Paste in comments.')
  }

  const handleShareFacebookStep1 = () => {
    const baseMsg = (customMessages['facebook'] || resolveMessage('facebook')).trim()
    navigator.clipboard.writeText(baseMsg).catch(()=>{})
    showToast('📋 Post Text Copied! Opening Facebook...')
    window.open('https://www.facebook.com/', '_blank')
  }

  const handleShareFacebookStep2 = () => {
    confirmShareLink('facebook')
    const tracked = trackedUrls['facebook'] || shareUrl
    const commentText = getCommentPayload(tracked)
    navigator.clipboard.writeText(commentText).catch(()=>{})
    showToast('📋 Comment Message Copied! Paste in comments.')
  }

  const handleCopyLink = () => {
    try {
      confirmShareLink('copy')
      const tracked = trackedUrls['copy'] || shareUrl
      const payload = getPayload(tracked, 'copy')
      navigator.clipboard.writeText(payload).catch(()=>{})
      showToast('📋 Copied to Clipboard!')
    } catch {}
  }

  const handleShareNative = () => {
    if (navigator.share) {
      try {
        confirmShareLink('native')
        const tracked = trackedUrls['native'] || shareUrl
        navigator.share({ title: entityName, text: customMessages['native'] || resolveMessage('native'), url: tracked }).catch(()=>{})
      } catch {}
    }
  }

  // Button styles
  const btnBase: React.CSSProperties = {
    width: '100%', padding: '13px 16px', border: 'none', borderRadius: 12,
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    transition: 'transform 0.1s ease, box-shadow 0.15s ease',
  }

  if (!isOpen) return null

  return (
    <>

      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)'
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 10000, background: '#fff', borderRadius: 20, width: '90%', maxWidth: 410,
        padding: '24px 20px 20px', 
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Toast */}
        {toastMessage && (
          <div style={{
            position: 'absolute', top: -44, left: '50%', transform: 'translateX(-50%)',
            background: '#1f2937', color: '#fff', padding: '8px 16px', borderRadius: 8,
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            {toastMessage}
          </div>
        )}

        {selectedPlatform === null ? (
          <>
            {/* Custom Header Row - Selection Screen */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginBottom: 16,
              borderBottom: '1px solid #f3f4f6',
              paddingBottom: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img 
                  src="/logo.png" 
                  alt="CasaGrown" 
                  style={{ width: 24, height: 24, borderRadius: 5 }}
                />
                <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>CasaGrown Share</span>
              </div>
              <button 
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: 'none', border: 'none', color: '#9CA3AF',
                  cursor: 'pointer', padding: '4px 8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#111827', fontWeight: 700, width: '100%', textAlign: 'left' }}>
              {title || 'Select Platform to Share'}
            </h2>
            {shareContext === 'new_product_share' ? (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 12,
                padding: '12px 16px',
                margin: '0 0 20px',
                textAlign: 'left',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{isFree ? "🎁" : "💰"}</span>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#166534', lineHeight: 1.45 }}>
                    {isFree 
                      ? `Let friends and neighbors know you want to share your ${entityName || 'produce'} in just a couple of clicks!`
                      : "Sell out fast by letting neighbors know about your listing in just a couple of clicks."
                    }
                  </p>
                </div>
              </div>
            ) : (
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.4, width: '100%', textAlign: 'left' }}>
                {subtitle || 'Choose a platform to preview, customize, and invite your neighbors!'}
              </p>
            )}

            {/* Screen 1: Platform Selection Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', padding: '4px 0' }}>
              {/* WhatsApp Card */}
              {show('whatsapp') && (
                <PlatformCard
                  icon={<WhatsAppIcon />}
                  title="Share on WhatsApp"
                  description="Send a message to neighbors or group chats"
                  brandColor="#25D366"
                  onClick={() => {
                    setSelectedPlatform('whatsapp')
                    setActivePreviewTab('whatsapp')
                  }}
                />
              )}
              {/* Nextdoor Card */}
              {show('nextdoor') && (
                <PlatformCard
                  icon={<NextdoorIcon />}
                  title="Share on Nextdoor"
                  description="Post directly to your neighborhood feed"
                  brandColor="#00B246"
                  onClick={() => {
                    setSelectedPlatform('nextdoor')
                    setActivePreviewTab('nextdoor')
                  }}
                />
              )}
              {/* Facebook Card */}
              {show('facebook') && (
                <PlatformCard
                  icon={<FacebookIcon />}
                  title="Share on Facebook"
                  description="Post to your timeline or local garden groups"
                  brandColor="#1877F2"
                  onClick={() => {
                    setSelectedPlatform('facebook')
                    setActivePreviewTab('facebook')
                  }}
                />
              )}
              {/* SMS/iMessage Card */}
              {show('sms') && (
                <PlatformCard
                  icon={<span style={{ fontSize: 20 }}>💬</span>}
                  title="Text a Neighbor"
                  description="Text a direct invite using iMessage/SMS"
                  brandColor="#34C759"
                  onClick={() => {
                    setSelectedPlatform('sms')
                    setActivePreviewTab('sms')
                  }}
                />
              )}
              {/* Email Card */}
              {show('email') && (
                <PlatformCard
                  icon={<EmailIcon />}
                  title="Send via Email"
                  description="Send a beautiful rich newsletter banner"
                  brandColor="#6366F1"
                  onClick={() => {
                    setSelectedPlatform('email')
                    setActivePreviewTab('email')
                  }}
                />
              )}
              {/* Copy Card */}
              {show('copy') && (
                <PlatformCard
                  icon={<LinkIcon />}
                  title="Copy Link"
                  description="Copy tailored text + short link to clipboard"
                  brandColor="#4B5563"
                  onClick={() => {
                    setSelectedPlatform('copy')
                    setActivePreviewTab('copy')
                    handleCopyLink()
                  }}
                />
              )}
              {/* Native Share Card */}
              {show('native') && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <PlatformCard
                  icon={<ShareMoreIcon />}
                  title="More Options"
                  description="Share using your device's native options"
                  brandColor="#10B981"
                  onClick={() => {
                    setSelectedPlatform('native')
                    setActivePreviewTab('native')
                  }}
                />
              )}
            </div>
            <button 
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: '#9CA3AF',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                marginTop: 16, padding: '8px 16px', textDecoration: 'underline'
              }}
              onMouseOver={e => e.currentTarget.style.color = '#6B7280'}
              onMouseOut={e => e.currentTarget.style.color = '#9CA3AF'}
            >
              No thanks, I'll share later
            </button>
          </>
        ) : (
          <>
            {/* Custom Header Row - Focused Screen */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginBottom: 16,
              borderBottom: '1px solid #f3f4f6',
              paddingBottom: 10
            }}>
              <button 
                onClick={() => setSelectedPlatform(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#10B981',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                ← Back
              </button>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {selectedPlatform === 'whatsapp' ? 'WhatsApp Share' :
                 selectedPlatform === 'sms' ? 'Text Message' :
                 selectedPlatform === 'email' ? 'Email Invite' :
                 selectedPlatform === 'facebook' ? 'Facebook Post' :
                 selectedPlatform === 'nextdoor' ? 'Nextdoor Post' :
                 selectedPlatform === 'copy' ? 'Copy Message' : 'Share Options'}
              </span>
              <button 
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: 'none', border: 'none', color: '#9CA3AF',
                  cursor: 'pointer', padding: '4px 8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Context Title/Subtitle */}
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2, marginBottom: 12, textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#374151' }}>{title}</h3>
              {subtitle && <p style={{ margin: 0, fontSize: 12, color: '#6b7280', lineHeight: 1.3 }}>{subtitle}</p>}
            </div>

            {/* Message Editor */}
            {isEditing ? (
              <div style={{ width: '100%', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  value={customMessages[activePreviewTab] || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setCustomMessages((prev) => ({ ...prev, [activePreviewTab]: val }))
                  }}
                  placeholder="Add a custom message to your share..."
                  rows={8}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                    color: '#374151',
                    fontFamily: 'inherit',
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#10B981'
                    e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af', padding: '0 2px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span>{(customMessages[activePreviewTab] || '').length} characters</span>
                    {(customMessages[activePreviewTab] || '') !== resolveMessage(activePreviewTab) && (
                      <button 
                        onClick={() => {
                          const defaultMsg = resolveMessage(activePreviewTab)
                          setCustomMessages((prev) => ({ ...prev, [activePreviewTab]: defaultMsg }))
                        }}
                        style={{ background: 'none', border: 'none', color: '#10B981', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setIsEditing(false)}
                    style={{
                      background: '#10B981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    ✓ Done
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1px solid #10B981',
                  borderRadius: 10,
                  background: 'transparent',
                  color: '#10B981',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 16,
                  transition: 'background 0.2s ease, color 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.05)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                ✏️ Edit Message
              </button>
            )}

            {/* Dynamic Preview Container */}
            {!isEditing && (
              <div style={{
                width: '100%',
                background: '#f3f4f6',
                borderRadius: 12,
              padding: '12px',
              marginBottom: 16,
              boxSizing: 'border-box',
              textAlign: 'left',
              fontSize: 13,
              minHeight: 120,
              maxHeight: 240,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              border: '1px solid #e5e7eb',
            }}>
              {activePreviewTab === 'whatsapp' && (
                /* WhatsApp Preview Bubble */
                <div style={{
                  background: '#DCF8C6',
                  borderRadius: '8px 8px 8px 0',
                  padding: '10px 12px',
                  alignSelf: 'flex-start',
                  maxWidth: '92%',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  border: '1px solid #c7eeb3',
                  boxSizing: 'border-box'
                }}>
                  <span style={{ color: '#303030', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {customMessages['whatsapp'] || resolveMessage('whatsapp') || 'Hey neighbors! Check out my listing on CasaGrown!'}
                  </span>
                  
                  {/* WhatsApp Link Preview Card */}
                  <div style={{
                    background: '#e1f5fe',
                    borderRadius: 6,
                    overflow: 'hidden',
                    borderLeft: '4px solid #039be5',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ padding: '8px 10px', display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, color: '#039be5', fontWeight: 600 }}>casagrown.org</span>
                        <span style={{ fontSize: 12, color: '#212121', fontWeight: 700 }}>
                          {ogTitle || entityName || 'Organic Homegrown Produce'}
                        </span>
                        <span style={{ fontSize: 11, color: '#727272', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          Grown with love. Click to check out my local garden share!
                        </span>
                      </div>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={entityName}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 4,
                            objectFit: 'cover',
                            flexShrink: 0
                          }}
                        />
                      ) : (
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: 4,
                          background: '#10B981',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          flexShrink: 0,
                          fontSize: 20
                        }}>
                          🍅
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 10, color: '#757575', marginTop: -2 }}>
                    <span>10:42 AM ✓✓</span>
                  </div>
                </div>
              )}

              {activePreviewTab === 'sms' && (
                /* iMessage/SMS Preview Bubble */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  <div style={{
                    background: '#34C759',
                    color: '#fff',
                    borderRadius: 20,
                    padding: '10px 16px',
                    alignSelf: 'flex-start',
                    maxWidth: '85%',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    boxSizing: 'border-box'
                  }}>
                    {customMessages['sms'] || resolveMessage('sms') || 'Hey neighbors! Check out my listing on CasaGrown!'}
                  </div>
                  
                  {/* iMessage Link Preview Bubble */}
                  <div style={{
                    background: '#fff',
                    borderRadius: 18,
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb',
                    maxWidth: '85%',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    alignSelf: 'flex-start',
                    boxSizing: 'border-box'
                  }}>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={entityName}
                        style={{
                          width: '100%',
                          height: 90,
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <div style={{ height: 90, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
                        🌱
                      </div>
                    )}
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10, color: '#8e8e93', textTransform: 'uppercase', fontWeight: 600 }}>CASAGROWN.ORG</span>
                      <span style={{ fontSize: 12, color: '#000', fontWeight: 600 }}>
                        {ogTitle || entityName || 'Organic Homegrown Produce'}
                      </span>
                      <span style={{ fontSize: 10, color: '#8e8e93' }}>
                        Tap to view details and order.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activePreviewTab === 'nextdoor' && (
                /* Nextdoor Feed Post Card */
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  padding: '12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: '#00B246',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11
                    }}>
                      N
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: '#111827' }}>Your Neighbor</span>
                      <span style={{ fontSize: 9, color: '#6b7280' }}>CasaGrown • Just now</span>
                    </div>
                  </div>
                  
                  <span style={{ color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontSize: 12 }}>
                    {customMessages['nextdoor'] || resolveMessage('nextdoor') || 'Hey neighbors! Check out my listing on CasaGrown!'}
                  </span>

                  {/* Nextdoor Post Link Box */}
                  <div style={{
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                    background: '#f9fafb',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box'
                  }}>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={entityName}
                        style={{
                          width: '100%',
                          height: 90,
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <div style={{ height: 90, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
                        🧺
                      </div>
                    )}
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10, color: '#00B246', fontWeight: 600 }}>casagrown.org</span>
                      <span style={{ fontSize: 12, color: '#111827', fontWeight: 700 }}>
                        {ogTitle || entityName || 'Organic Homegrown Produce'}
                      </span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>
                        Connect with local growers in our neighborhood.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activePreviewTab === 'facebook' && (
                /* Facebook Post Preview */
                <div style={{
                  background: '#fff',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  padding: '12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: '#1877F2',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12
                    }}>
                      F
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: '#050505' }}>CasaGrown Member</span>
                      <span style={{ fontSize: 9, color: '#65676b' }}>Just now • 🌐</span>
                    </div>
                  </div>
                  
                  <span style={{ color: '#050505', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontSize: 12 }}>
                    {customMessages['facebook'] || resolveMessage('facebook') || 'Hey neighbors! Check out my listing on CasaGrown!'}
                  </span>

                  {/* Facebook Link Preview Box */}
                  <div style={{
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                    background: '#f0f2f5',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box'
                  }}>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={entityName}
                        style={{
                          width: '100%',
                          height: 90,
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <div style={{ height: 90, background: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
                        🏡
                      </div>
                    )}
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 9, color: '#65676b', textTransform: 'uppercase' }}>CASAGROWN.ORG</span>
                      <span style={{ fontSize: 12, color: '#050505', fontWeight: 700 }}>
                        {ogTitle || entityName || 'Organic Homegrown Produce'}
                      </span>
                      <span style={{ fontSize: 11, color: '#65676b', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        Fresh local produce from my garden to your table.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activePreviewTab === 'email' && (
                /* Email Client Preview */
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  padding: '12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                    <div style={{ display: 'flex', gap: 4 }}><span style={{ color: '#9ca3af', width: 44 }}>To:</span><span style={{ color: '#374151', fontWeight: 500 }}>neighbor@community.org</span></div>
                    <div style={{ display: 'flex', gap: 4 }}><span style={{ color: '#9ca3af', width: 44 }}>Subject:</span><span style={{ color: '#111827', fontWeight: 600 }}>{ogTitle || entityName || title || 'Check this out'}</span></div>
                  </div>
                  <div style={{
                    color: '#374151',
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    paddingTop: 4
                  }}>
                    {/* Embedded Rich Email Banner */}
                    <img 
                      src={imageUrl || "/produce-banner.png"} 
                      alt="Organic Produce Banner" 
                      style={{
                        width: '100%',
                        height: 'auto',
                        maxHeight: 140,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb'
                      }}
                    />
                    <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {customMessages['email'] || resolveMessage('email') || 'Hey, check out this local gardening share!'}
                    </span>
                  </div>
                </div>
              )}

              {activePreviewTab === 'copy' && (
                /* Clipboard Preview */
                <div style={{
                  background: '#f9fafb',
                  borderRadius: 12,
                  border: '1px dashed #d1d5db',
                  padding: '14px',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: '#e0f2fe',
                    color: '#0369a1',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontFamily: 'system-ui'
                  }}>
                    Clipboard
                  </div>
                  <div style={{ color: '#4b5563', whiteSpace: 'pre-wrap', lineHeight: 1.4, wordBreak: 'break-all' }}>
                    {customMessages['copy'] || resolveMessage('copy') || shareUrl}
                  </div>
                  <div style={{
                    borderTop: '1px solid #e5e7eb',
                    paddingTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#10B981',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: 'system-ui'
                  }}>
                    <span>📋</span> Ready to paste anywhere
                  </div>
                </div>
              )}

              {activePreviewTab === 'native' && (
                /* Native Share Device Mockup */
                <div style={{
                  background: '#f9fafb',
                  borderRadius: 12,
                  border: '1px dashed #d1d5db',
                  padding: '14px',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontFamily: 'system-ui',
                  fontSize: 12,
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: '#e0f2fe',
                    color: '#0369a1',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    Device Share
                  </div>
                  <div style={{ color: '#4b5563', whiteSpace: 'pre-wrap', lineHeight: 1.4, wordBreak: 'break-all' }}>
                    {customMessages['native'] || resolveMessage('native') || shareUrl}
                  </div>
                  <div style={{
                    borderTop: '1px solid #e5e7eb',
                    paddingTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#10B981',
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    <span>📱</span> Launches native system dialog
                  </div>
                </div>
              )}
              </div>
            )}

            {/* Single Platform Action Button */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedPlatform === 'sms' && (
                <button
                  onClick={handleShareSMS}
                  style={{
                    ...btnBase,
                    background: 'linear-gradient(135deg, #34C759, #30B350)',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(52, 199, 89, 0.25)',
                  }}
                >
                  <span style={{ fontSize: 20 }}>💬</span> Open Messages & Text
                </button>
              )}

              {selectedPlatform === 'whatsapp' && (
                <button
                  onClick={handleShareWhatsApp}
                  style={{
                    ...btnBase,
                    background: '#25D366',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(37, 211, 102, 0.25)',
                  }}
                >
                  <WhatsAppIcon /> Open WhatsApp & Share
                </button>
              )}

              {selectedPlatform === 'email' && (
                <button
                  onClick={handleShareEmail}
                  style={{
                    ...btnBase,
                    background: '#6366F1',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)',
                  }}
                >
                  <EmailIcon /> Open Email & Send
                </button>
              )}

              {selectedPlatform === 'nextdoor' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                  <div style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: '14px 16px',
                    textAlign: 'left',
                    background: '#f9fafb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Step 1: Custom Post Text</span>
                      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Copies text only</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                      Copy the custom description, then paste it in your new post composer on Nextdoor.
                    </p>
                    <button
                      onClick={handleShareNextdoorStep1}
                      style={{
                        ...btnBase,
                        background: '#00B246',
                        color: '#fff',
                        boxShadow: '0 4px 14px rgba(0, 178, 70, 0.2)',
                      }}
                    >
                      <NextdoorIcon /> Copy & Continue to Nextdoor
                    </button>
                  </div>

                  <div style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: '14px 16px',
                    textAlign: 'left',
                    background: '#f9fafb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Step 2: Copy Comment Message</span>
                      <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>Algorithm-safe</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                      Copy the pre-formatted comment containing your tracked shop link, to paste in the comments section immediately following your post publication!
                    </p>
                    <button
                      onClick={handleShareNextdoorStep2}
                      style={{
                        ...btnBase,
                        background: '#fff',
                        color: '#10B981',
                        border: '1px solid #10B981',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(16, 185, 129, 0.02)'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#fff'
                      }}
                    >
                      <LinkIcon /> Copy Comment Message
                    </button>
                  </div>
                </div>
              )}

              {selectedPlatform === 'facebook' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                  <div style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: '14px 16px',
                    textAlign: 'left',
                    background: '#f9fafb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Step 1: Custom Post Text</span>
                      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Copies text only</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                      Copy the custom description, then paste it in your new post composer on Facebook.
                    </p>
                    <button
                      onClick={handleShareFacebookStep1}
                      style={{
                        ...btnBase,
                        background: '#1877F2',
                        color: '#fff',
                        boxShadow: '0 4px 14px rgba(24, 119, 242, 0.2)',
                      }}
                    >
                      <FacebookIcon /> Copy & Continue to Facebook
                    </button>
                  </div>

                  <div style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: '14px 16px',
                    textAlign: 'left',
                    background: '#f9fafb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Step 2: Copy Comment Message</span>
                      <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>Algorithm-safe</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                      Copy the pre-formatted comment containing your tracked shop link, to paste in the comments section immediately following your post publication!
                    </p>
                    <button
                      onClick={handleShareFacebookStep2}
                      style={{
                        ...btnBase,
                        background: '#fff',
                        color: '#10B981',
                        border: '1px solid #10B981',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(16, 185, 129, 0.02)'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#fff'
                      }}
                    >
                      <LinkIcon /> Copy Comment Message
                    </button>
                  </div>
                </div>
              )}

              {selectedPlatform === 'copy' && (
                <button 
                  onClick={handleCopyLink}
                  style={{
                    ...btnBase,
                    background: '#10B981',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <LinkIcon /> {toastMessage && toastMessage.includes('Link') || toastMessage && toastMessage.includes('Copied') ? 'Message Copied!' : 'Copy Message & Link'}
                </button>
              )}

              {selectedPlatform === 'native' && (
                <button 
                  onClick={handleShareNative}
                  style={{
                    ...btnBase,
                    background: '#10B981',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <ShareMoreIcon /> Share via Device Options
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
