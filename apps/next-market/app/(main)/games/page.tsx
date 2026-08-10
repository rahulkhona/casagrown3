'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getGuestGameStats } from '../../../lib/useGuestGameStats'

export default function GamesHubPage() {
  const [stats, setStats] = useState({ streakDays: 1 })

  useEffect(() => {
    const data = getGuestGameStats()
    if (data.streakDays > 0) {
      setStats({ streakDays: data.streakDays })
    }
  }, [])

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
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: 4 }}>
            🗓️ Released Daily at 5:00 AM EST
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#111827' }}>
            🎮 Learn, Play & Have Fun!
          </h1>
          <p style={{ margin: '4px 0 0', color: '#4b5563', fontSize: 14 }}>
            Play today&apos;s 6 garden games, see your neighborhood speed quartile, and share result cards!
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '6px 14px', borderRadius: 20, color: '#b45309', fontWeight: 'bold', fontSize: 14 }}>
            🔥 {stats.streakDays} Day Streak
          </div>
          <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #10b981', padding: '4px 10px', borderRadius: 16, fontWeight: 'bold', fontSize: 13 }}>
            🏆 Top 3% Rank
          </span>
          <Link href="/games/history" style={{ textDecoration: 'none', background: '#3b82f6', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 'bold', fontSize: 14 }}>
            📊 My Game History →
          </Link>
        </div>
      </div>

      {/* TODAY'S 6 APPROVED MASTER IMAGE CARDS GRID (EDGE-TO-EDGE PURE GRAPHIC CARDS IN 3x2 GRID) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 20, marginBottom: 32 }}>
        {games.map((g) => (
          <Link
            key={g.id}
            href={`/games/${g.id}`}
            style={{
              position: 'relative',
              height: 180,
              borderRadius: 18,
              overflow: 'hidden',
              textDecoration: 'none',
              boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
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

            {/* GRADIENT OVERLAY & FLOATING PLAY BUTTON */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 50%)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                padding: 14,
              }}
            >
              <span
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '7px 16px',
                  borderRadius: 20,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Play Today&apos;s {g.title} ▶️
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* ARCHIVE LINK BANNER */}
      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: 16, textAlign: 'center', color: '#475569', fontSize: 13 }}>
        📅 New daily games release every morning at 6:00 AM EST! Visit <Link href="/games/history" style={{ color: '#2563eb', fontWeight: 'bold' }}>My Game History & Archive</Link> to view past games.
      </div>
    </div>
  )
}
