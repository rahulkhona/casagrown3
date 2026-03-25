'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface PioneerBannerProps {
  memberCount: number
  communityH3: string
  onDismiss: () => void
}

export default function PioneerBanner({ memberCount, communityH3, onDismiss }: PioneerBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Check if already dismissed
    try {
      const key = `pioneer_banner_dismissed_${communityH3}`
      if (localStorage.getItem(key)) return
    } catch {}
    // Animate in after a short delay
    const t = setTimeout(() => setVisible(true), 500)
    return () => clearTimeout(t)
  }, [communityH3])

  const handleDismiss = () => {
    setVisible(false)
    try { localStorage.setItem(`pioneer_banner_dismissed_${communityH3}`, '1') } catch {}
    setTimeout(onDismiss, 300)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/`
    const text = 'Join me on CasaGrown — a hyper-local marketplace for homegrown produce! 🌱'
    if (navigator.share) {
      try { await navigator.share({ title: 'Join CasaGrown Market', text, url }) } catch {}
    } else {
      navigator.clipboard?.writeText(`${text}\n${url}`)
      alert('Invite link copied!')
    }
  }

  if (memberCount > 20) return null

  return (
    <>
      <style>{`
        @keyframes pioneerSlideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pioneerSlideOut {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-12px); }
        }
        @keyframes confettiBounce {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25%  { transform: scale(1.2) rotate(-8deg); }
          50%  { transform: scale(1.1) rotate(4deg); }
          75%  { transform: scale(1.15) rotate(-3deg); }
        }
      `}</style>
      <div style={{
        margin: '0 0 16px',
        padding: '20px 20px 16px',
        borderRadius: 'var(--radius-xl, 16px)',
        background: 'linear-gradient(135deg, rgba(22,163,74,0.08) 0%, rgba(251,191,36,0.10) 50%, rgba(22,163,74,0.06) 100%)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(22,163,74,0.2)',
        boxShadow: '0 4px 20px rgba(22,163,74,0.1)',
        position: 'relative',
        animation: visible ? 'pioneerSlideIn 0.4s ease-out forwards' : 'pioneerSlideOut 0.3s ease-in forwards',
        overflow: 'hidden',
      }}>
        {/* Dismiss button */}
        <button onClick={handleDismiss} style={{
          position: 'absolute', top: 8, right: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 18, color: 'var(--gray-400, #9ca3af)', padding: 4,
          lineHeight: 1,
        }} aria-label="Dismiss">✕</button>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* Confetti emoji */}
          <div style={{
            fontSize: 36, lineHeight: 1, flexShrink: 0,
            animation: 'confettiBounce 2s ease-in-out infinite',
          }}>🎉</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title with member number */}
            <h3 style={{
              margin: '0 0 4px', fontSize: 17, fontWeight: 800,
              color: 'var(--gray-900, #111827)', letterSpacing: '-0.02em',
            }}>
              You&apos;re Pioneer Member #{memberCount}!
            </h3>

            <p style={{
              margin: '0 0 12px', fontSize: 13, lineHeight: 1.5,
              color: 'var(--gray-600, #4b5563)',
            }}>
              Your community is forming! Invite neighbors to grow it — 
              more members = more produce, better deals, and a thriving local market.
            </p>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href="/community" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '7px 14px', borderRadius: 'var(--radius-full, 999px)',
                background: 'var(--green-600, #16a34a)', color: '#fff',
                fontSize: 12, fontWeight: 700, textDecoration: 'none',
                transition: 'all 0.15s', border: 'none',
              }}>
                💬 Join Buzz
              </Link>

              <button onClick={handleShare} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '7px 14px', borderRadius: 'var(--radius-full, 999px)',
                background: 'var(--amber-100, #fef3c7)', color: 'var(--amber-800, #92400e)',
                fontSize: 12, fontWeight: 700, border: '1px solid var(--amber-200, #fde68a)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                📣 Invite Neighbors
              </button>
            </div>

            {/* Progress indicator */}
            <div style={{ marginTop: 10 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500, #6b7280)' }}>
                  {memberCount} of 20 founding members
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-600, #16a34a)' }}>
                  {Math.round((memberCount / 20) * 100)}%
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 3,
                background: 'var(--gray-200, #e5e7eb)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: 'linear-gradient(90deg, var(--green-500, #22c55e), var(--green-600, #16a34a))',
                  width: `${Math.min((memberCount / 20) * 100, 100)}%`,
                  transition: 'width 0.6s ease-out',
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
