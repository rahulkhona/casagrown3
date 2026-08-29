'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getGuestGameStats } from '../../../lib/useGuestGameStats'
import { useQuickSetup } from '../../../lib/useQuickSetup'
import { useAuth } from '../../../lib/useAuth'
import styles from './DailyGamesBar.module.css'

export default function DailyGamesBar() {
  const { user } = useAuth()
  const { requireAuth } = useQuickSetup()
  const [streakDays, setStreakDays] = useState(1)

  const isAuthed = Boolean(user)

  useEffect(() => {
    if (isAuthed) {
      const data = getGuestGameStats()
      if (data.streakDays > 0) {
        setStreakDays(data.streakDays)
      }
    } else {
      setStreakDays(1)
    }
  }, [isAuthed])

  const handleSignInToSave = () => {
    requireAuth({
      trigger: 'save_game_rank',
      defaultSignIn: true,
    })
  }

  const games = [
    {
      id: 'garden_spell_001',
      title: 'Garden Spell',
      imgUrl: '/images/games/og_garden_spell.jpg',
    },
    {
      id: 'jigsaw_001',
      title: 'Harvest Jigsaw',
      imgUrl: '/images/games/og_harvest_jigsaw.jpg',
    },
    {
      id: 'math_001',
      title: 'Nutri-Calc',
      imgUrl: '/images/games/og_nutri_calc.jpg',
    },
    {
      id: 'garden_plots_001',
      title: 'Garden Plots',
      imgUrl: '/images/games/og_garden_plots.jpg',
    },
    {
      id: 'memory_match_001',
      title: 'Memory Match',
      imgUrl: '/images/games/og_memory_match.jpg',
    },
    {
      id: 'anagram_001',
      title: 'Crop Anagram',
      imgUrl: '/images/games/og_crop_anagram.jpg',
    },
  ]

  return (
    <div className={styles.dailyGamesBarWrapper}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '18px 16px', margin: '20px 0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
            🎮 Learn, Play & Have Fun!
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#475569' }}>
            Swipe horizontally to play today&apos;s 6 garden games!
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', padding: '4px 10px', borderRadius: 16, fontWeight: 'bold', fontSize: 12 }}>
            🔥 {streakDays} Day Streak
          </span>

          <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #10b981', padding: '4px 10px', borderRadius: 16, fontWeight: 'bold', fontSize: 12 }}>
            🏆 Top 3% Rank
          </span>

          <Link
            href="/games"
            style={{ background: '#059669', color: '#fff', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, fontWeight: 'bold', fontSize: 12 }}
          >
            All 6 Games →
          </Link>
        </div>
      </div>

      {/* ULTRA-SHORT & PUNCHY SIGN-IN BANNER FOR GUESTS */}
      {!isAuthed && (
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={handleSignInToSave}
            style={{
              width: '100%',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              padding: '8px 12px',
              color: '#166534',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            <span>🔒 <strong>Sign-in to keep your streak alive!</strong></span>
            <span style={{ background: '#059669', color: '#ffffff', padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', marginLeft: 8 }}>
              Sign In →
            </span>
          </button>
        </div>
      )}

      {/* EDGE-TO-EDGE PURE GRAPHIC CARDS CAROUSEL */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingBottom: 6,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {games.map((g) => (
          <Link
            key={g.id}
            href={`/games/${g.id}`}
            style={{
              flex: '0 0 240px',
              scrollSnapAlign: 'start',
              position: 'relative',
              height: 135,
              borderRadius: 14,
              overflow: 'hidden',
              textDecoration: 'none',
              boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
              border: '1px solid rgba(0,0,0,0.1)',
              transition: 'transform 0.15s ease',
            }}
          >
            {/* FULL MASTER IMAGE (EDGE TO EDGE) */}
            <img
              src={g.imgUrl}
              alt={g.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* SLEEK GRADIENT OVERLAY & FLOATING PLAY PILL */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 50%)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                padding: 10,
              }}
            >
              <span
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '5px 12px',
                  borderRadius: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Play Now ▶
              </span>
            </div>
          </Link>
        ))}
      </div>
      </div>
    </div>
  )
}
