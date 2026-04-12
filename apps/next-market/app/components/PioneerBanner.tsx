'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '../../lib/useAuth'
import { useErrorToast } from './ErrorToast'

interface PioneerBannerProps {
  memberCount: number
  communityH3: string
  onDismiss: () => void
}

export default function PioneerBanner({ memberCount, communityH3, onDismiss }: PioneerBannerProps) {
  const [visible, setVisible] = useState(false)
  const { user } = useAuth()
  const { showSuccess } = useErrorToast()

  useEffect(() => {
    try {
      const key = `pioneer_banner_dismissed_${communityH3}`
      if (localStorage.getItem(key)) return
      // Track impression the exact second it's rendered to prevent loop harassment
      localStorage.setItem(key, '1')
    } catch {}
    const t = setTimeout(() => setVisible(true), 500)
    return () => clearTimeout(t)
  }, [communityH3])

  const handleDismiss = () => {
    setVisible(false)
    try { localStorage.setItem(`pioneer_banner_dismissed_${communityH3}`, '1') } catch {}
    setTimeout(onDismiss, 300)
  }

  const handleInvite = async () => {
    const url = `${window.location.origin}/`
    const text = 'I just joined CasaGrown — a marketplace for homegrown produce right in our neighborhood! 🌱🏡 Come grow with us!'
    if (navigator.share) {
      try { await navigator.share({ title: 'Join CasaGrown', text, url }) } catch {}
    } else {
      navigator.clipboard?.writeText(`${text}\n${url}`)
      showSuccess('Invite link copied!')
    }
  }

  if (memberCount > 20) return null

  return (
    <>
      <style>{`
        @keyframes pioneerSlideIn {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pioneerSlideOut {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-16px); }
        }
        @keyframes confettiBounce {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25%  { transform: scale(1.15) rotate(-6deg); }
          50%  { transform: scale(1.05) rotate(3deg); }
          75%  { transform: scale(1.1) rotate(-2deg); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        zIndex: 90,
        padding: '16px 16px 14px',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(240,253,244,0.97) 50%, rgba(255,251,235,0.96) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(22,163,74,0.15)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        animation: visible ? 'pioneerSlideIn 0.5s ease-out forwards' : 'pioneerSlideOut 0.3s ease-in forwards',
      }}>
        {/* Dismiss */}
        <button onClick={handleDismiss} style={{
          position: 'absolute', top: 6, right: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 16, color: '#9ca3af', padding: 4, lineHeight: 1,
        }} aria-label="Dismiss">✕</button>

        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          {/* Welcome heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 26, animation: 'confettiBounce 2s ease-in-out infinite' }}>🎉</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              Welcome to CasaGrown!
            </h3>
          </div>

          {/* Aspirational message */}
          <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
            A vibrant community means more neighbors trading fresh produce, sharing 
            garden know-how, and discovering what grows best nearby. Help us grow your 
            community by inviting your neighbors! Meanwhile, visit <strong>Community</strong> to 
            connect and ask <strong>CasaBot</strong> for gardening tips and advice.
          </p>

          {/* Action buttons - well spaced */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={handleInvite} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', borderRadius: 999,
              background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff',
              fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
            }}>
              📣 Invite Neighbors
            </button>
            <Link href="/community" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', borderRadius: 999,
              background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
              fontSize: 12, fontWeight: 600, textDecoration: 'none',
            }}>
              💬 Visit Community
            </Link>
            <Link href={user ? "/my-booth/products/new" : "/login?redirect=%2Fmy-booth%2Fproducts%2Fnew"} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', borderRadius: 999,
              background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
              fontSize: 12, fontWeight: 600, textDecoration: 'none',
            }}>
              🌱 List Produce
            </Link>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                width: `${Math.min((memberCount / 20) * 100, 100)}%`,
                transition: 'width 0.6s ease-out',
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
              {memberCount}/20 founding members
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
