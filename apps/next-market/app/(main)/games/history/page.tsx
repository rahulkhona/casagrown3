'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import SocialShareModal from '../../../components/SocialShareModal'
import { getGuestGameStats, GuestGameStats } from '../../../../lib/useGuestGameStats'
import { useAuth } from '../../../../lib/useAuth'
import { useQuickSetup } from '../../../../lib/useQuickSetup'

export default function GameHistoryPage() {
  const { user } = useAuth()
  const { requireAuth } = useQuickSetup()
  const [showShareModal, setShowShareModal] = useState(false)
  const [stats, setStats] = useState<GuestGameStats>({
    streakDays: 1,
    pointsBalance: 0,
    completedGameIds: ['garden_spell_001'],
    lastPlayedDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    const data = getGuestGameStats()
    if (data.streakDays > 0) {
      setStats(data)
    }
  }, [])

  const handleSignInToSave = () => {
    requireAuth({
      trigger: 'save_game_history',
      defaultSignIn: true,
    })
  }

  const pastGames = [
    { date: 'Today', game: 'Garden Spell #42', category: 'Garden Spell', status: 'Solved (2/6 Tries)', rank: 'Top 8%' },
    { date: 'Yesterday', game: 'Harvest Jigsaw #01', category: 'Harvest Jigsaw', status: 'Solved', rank: 'Top 5%' },
  ]

  const shareMessage = `🌱 CasaGrown Daily Games History 🏆
🔥 ${stats.streakDays}-Day Streak
📍 95125 Rank: Top 3% of Your Neighbors
Track your daily streak & play games → https://casagrown.link/games`

  return (
    <div style={{ maxWidth: 950, margin: '0 auto', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <Link href="/games" style={{ textDecoration: 'none', color: '#2563eb', fontSize: 14, fontWeight: 'bold' }}>
            ← Back to Games Hub
          </Link>
          <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 800, color: '#111827' }}>
            📊 My Game History & Neighborhood Quartiles
          </h1>
        </div>

        <button
          onClick={() => setShowShareModal(true)}
          style={{ background: '#059669', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}
        >
          🚀 Share My Stats & Quartile Rank
        </button>
      </div>

      {/* GUEST SIGN-IN NUDGE BANNER VIA QUICKSETUP */}
      {!user && (
        <div style={{ background: '#eff6ff', border: '1.5px solid #3b82f6', borderRadius: 14, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e40af', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              🔒 You are playing as a Guest
            </div>
            <div style={{ fontSize: 13, color: '#1e3a8a' }}>
              Sign in or create a free account to lock in your <strong>Top 3% Leaderboard Rank</strong>, preserve your <strong>{stats.streakDays}-Day Streak</strong>, and save your full 30-day game history log across all your devices!
            </div>
          </div>

          <button
            onClick={handleSignInToSave}
            style={{ background: '#2563eb', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            🔒 Sign In to Save →
          </button>
        </div>
      )}

      {/* 2 STATS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#b45309', textTransform: 'uppercase' }}>Daily Streak</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#92400e', margin: '4px 0' }}>🔥 {stats.streakDays} Day{stats.streakDays === 1 ? '' : 's'}</div>
          <div style={{ fontSize: 12, color: '#78350f' }}>Played {stats.streakDays} consecutive day{stats.streakDays === 1 ? '' : 's'}</div>
        </div>

        <div style={{ background: '#eff6ff', border: '1.5px solid #3b82f6', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase' }}>Zipcode Neighborhood Rank</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#1e40af', margin: '6px 0' }}>🏆 Top 3%</div>
          <div style={{ fontSize: 12, color: '#1e3a8a' }}>Ranked #3 in 95125 Willow Glen!</div>
        </div>
      </div>

      {/* PAST GAMES CALENDAR & TABLE */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#111827' }}>📅 Past Games Played & Scores</h2>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#4b5563' }}>
                <th style={{ padding: '10px 8px' }}>Date</th>
                <th style={{ padding: '10px 8px' }}>Game Title</th>
                <th style={{ padding: '10px 8px' }}>Category</th>
                <th style={{ padding: '10px 8px' }}>Status</th>
                <th style={{ padding: '10px 8px' }}>Global Rank</th>
              </tr>
            </thead>
            <tbody>
              {pastGames.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 8px', color: '#6b7280' }}>{row.date}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 'bold', color: '#111827' }}>{row.game}</td>
                  <td style={{ padding: '12px 8px', color: '#2563eb' }}>{row.category}</td>
                  <td style={{ padding: '12px 8px', color: '#059669', fontWeight: 'bold' }}>{row.status}</td>
                  <td style={{ padding: '12px 8px', color: '#d97706', fontWeight: 'bold' }}>{row.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXISTING SOCIAL SHARE MODAL INTEGRATION */}
      {showShareModal && (
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title="Share My CasaGrown Game Stats & Neighborhood Rank"
          entityName="CasaGrown Leaderboard"
          shareUrl="https://casagrown.link/g/history"
          shareMessage={shareMessage}
          subtitle="Share your ranking with neighbors on WhatsApp, SMS, Facebook, or Nextdoor."
        />
      )}
    </div>
  )
}
