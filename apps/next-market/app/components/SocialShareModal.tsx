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
}: SocialShareModalProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [pasteReminder, setPasteReminder] = useState<'Facebook' | 'Nextdoor' | null>(null)
  const [shouldRemind, setShouldRemind] = useState(true)
  const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        setShouldRemind(localStorage.getItem(DONT_REMIND_KEY) !== 'true')
      } catch {}
    }
  }, [])

  if (!isOpen) return null

  /** Check if a platform should be shown */
  const show = (p: SharePlatform) => !platforms || platforms.includes(p)

  /** Get a tracked short link for the given platform, or fall back to raw URL */
  const getTrackedUrl = async (platform: SharePlatform): Promise<string> => {
    if (!shareContext) return shareUrl
    try {
      setLoadingPlatform(platform)
      return await createTrackedShareLink(shareUrl, shareContext, platform, userId)
    } catch {
      return shareUrl
    } finally {
      setLoadingPlatform(null)
    }
  }

  /** Resolve the share message for a given platform */
  const resolveMessage = (platform: SharePlatformType): string => {
    return typeof shareMessage === 'function' ? shareMessage(platform) : shareMessage
  }

  /** Build the share payload text, replacing the raw URL with the tracked one */
  const getPayload = (trackedUrl: string, platform: SharePlatformType) => {
    const msg = resolveMessage(platform)
    // If message already includes the raw URL, replace it with tracked
    if (msg.includes(shareUrl)) {
      return msg.replace(shareUrl, trackedUrl)
    }
    return `${msg}\n\n${trackedUrl}`
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  const handleShareSMS = async () => {
    const tracked = await getTrackedUrl('sms')
    const text = encodeURIComponent(getPayload(tracked, 'sms'))
    window.location.href = `sms:?body=${text}`
  }

  const handleShareWhatsApp = async () => {
    const tracked = await getTrackedUrl('whatsapp')
    const text = encodeURIComponent(getPayload(tracked, 'whatsapp'))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handleShareEmail = async () => {
    const tracked = await getTrackedUrl('email')
    const subject = encodeURIComponent(entityName || title)
    const body = encodeURIComponent(getPayload(tracked, 'email'))
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const handleShareNextdoor = async () => {
    const tracked = await getTrackedUrl('nextdoor')
    const payload = getPayload(tracked, 'nextdoor')
    navigator.clipboard.writeText(payload).catch(()=>{})
    if (shouldRemind) {
      setPasteReminder('Nextdoor')
    } else {
      showToast('✅ Copied! Paste on Nextdoor')
      window.open('https://nextdoor.com/news_feed/', '_blank')
    }
  }

  const handleShareFacebook = async () => {
    const tracked = await getTrackedUrl('facebook')
    const payload = getPayload(tracked, 'facebook')
    const url = encodeURIComponent(tracked)
    navigator.clipboard.writeText(payload).catch(()=>{})
    if (shouldRemind) {
      setPasteReminder('Facebook')
    } else {
      showToast('✅ Copied! Paste on Facebook')
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
    }
  }

  const handlePasteReminderContinue = () => {
    const platform = pasteReminder
    setPasteReminder(null)
    if (platform === 'Nextdoor') {
      window.open('https://nextdoor.com/news_feed/', '_blank')
    } else if (platform === 'Facebook') {
      // Use the original shareUrl for Facebook sharer since tracked link was already used in copied text
      const url = encodeURIComponent(shareUrl)
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
    }
  }

  const handleCopyLink = async () => {
    try {
      const tracked = await getTrackedUrl('copy')
      await navigator.clipboard.writeText(tracked)
      showToast('📋 Link Copied!')
    } catch {}
  }

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        const tracked = await getTrackedUrl('native')
        await navigator.share({ title: entityName, text: resolveMessage('native'), url: tracked })
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

  return (
    <>
      {/* Paste Reminder Interstitial */}
      {pasteReminder && (
        <PasteReminderModal
          platform={pasteReminder}
          onContinue={handlePasteReminderContinue}
          onCancel={() => setPasteReminder(null)}
        />
      )}

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
        zIndex: 10000, background: '#fff', borderRadius: 20, width: '90%', maxWidth: 400,
        padding: '28px 24px 20px', 
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
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

        {/* CasaGrown Logo */}
        <img 
          src="/logo.png" 
          alt="CasaGrown" 
          style={{ width: 48, height: 48, marginBottom: 12, borderRadius: 10 }}
        />
        <h2 style={{ margin: '0 0 6px', fontSize: 20, color: '#111827', fontWeight: 700 }}>{title}</h2>
        {subtitle && (
          <p style={{ margin: '0 0 18px', fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>{subtitle}</p>
        )}

        {/* Share Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          
          {/* SMS / iMessage */}
          {show('sms') && (
            <button
              onClick={handleShareSMS}
              disabled={loadingPlatform === 'sms'}
              style={{
                ...btnBase,
                background: 'linear-gradient(135deg, #34C759, #30B350)',
                color: '#fff',
                opacity: loadingPlatform === 'sms' ? 0.7 : 1,
              }}
            >
              <span style={{ fontSize: 20 }}>💬</span> {loadingPlatform === 'sms' ? 'Preparing...' : 'Text a Neighbor'}
            </button>
          )}

          {/* WhatsApp */}
          {show('whatsapp') && (
            <button
              onClick={handleShareWhatsApp}
              disabled={loadingPlatform === 'whatsapp'}
              style={{
                ...btnBase,
                background: '#25D366',
                color: '#fff',
                opacity: loadingPlatform === 'whatsapp' ? 0.7 : 1,
              }}
            >
              <WhatsAppIcon /> {loadingPlatform === 'whatsapp' ? 'Preparing...' : 'Share on WhatsApp'}
            </button>
          )}

          {/* Email */}
          {show('email') && (
            <button
              onClick={handleShareEmail}
              disabled={loadingPlatform === 'email'}
              style={{
                ...btnBase,
                background: '#6366F1',
                color: '#fff',
                opacity: loadingPlatform === 'email' ? 0.7 : 1,
              }}
            >
              <EmailIcon /> {loadingPlatform === 'email' ? 'Preparing...' : 'Send via Email'}
            </button>
          )}

          {/* Nextdoor */}
          {show('nextdoor') && (
            <button
              onClick={handleShareNextdoor}
              disabled={loadingPlatform === 'nextdoor'}
              style={{
                ...btnBase,
                background: '#00B246',
                color: '#fff',
                opacity: loadingPlatform === 'nextdoor' ? 0.7 : 1,
              }}
            >
              <NextdoorIcon /> {loadingPlatform === 'nextdoor' ? 'Preparing...' : 'Share on Nextdoor'}
            </button>
          )}

          {/* Facebook */}
          {show('facebook') && (
            <button
              onClick={handleShareFacebook}
              disabled={loadingPlatform === 'facebook'}
              style={{
                ...btnBase,
                background: '#1877F2',
                color: '#fff',
                opacity: loadingPlatform === 'facebook' ? 0.7 : 1,
              }}
            >
              <FacebookIcon /> {loadingPlatform === 'facebook' ? 'Preparing...' : 'Share on Facebook'}
            </button>
          )}

          {/* Copy Link */}
          {show('copy') && (
            <button 
              onClick={handleCopyLink}
              disabled={loadingPlatform === 'copy'}
              style={{
                ...btnBase,
                background: '#f9fafb',
                color: '#374151',
                border: '1px solid #e5e7eb',
                opacity: loadingPlatform === 'copy' ? 0.7 : 1,
              }}
            >
              <LinkIcon /> {loadingPlatform === 'copy' ? 'Preparing...' : toastMessage && toastMessage.includes('Link') ? 'Link Copied!' : 'Copy Link'}
            </button>
          )}

          {/* Native Share */}
          {show('native') && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button 
              onClick={handleShareNative}
              disabled={loadingPlatform === 'native'}
              style={{
                ...btnBase,
                background: '#f9fafb',
                color: '#374151',
                border: '1px solid #e5e7eb',
                opacity: loadingPlatform === 'native' ? 0.7 : 1,
              }}
            >
              <ShareMoreIcon /> {loadingPlatform === 'native' ? 'Preparing...' : 'More Options'}
            </button>
          )}
        </div>

        {/* Skip */}
        <button 
          onClick={onClose}
          style={{
            marginTop: 16, background: 'none', border: 'none', color: '#9ca3af',
            fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '8px 16px'
          }}
        >
          Skip
        </button>
      </div>
    </>
  )
}
