'use client'

import { useState } from 'react'
import Link from 'next/link'
import SocialShareModal from '../SocialShareModal'
import { useQuickSetup } from '../../../lib/useQuickSetup'
import { useAuth } from '../../../lib/useAuth'
import { getGuestGameStats } from '../../../lib/useGuestGameStats'
import { useNotificationPrompt } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../NotificationPromptModal'

interface GameVictoryModalProps {
  isOpen: boolean
  onClose: () => void
  gameTitle: string
  gameCategory?: string
  zipcode?: string
  solveTimeSeconds?: number
  shareResultCardText: string
}

export function computeSpeedPercentiles(seconds = 35, localPct?: number, globalPct?: number) {
  const localVal = localPct ?? (seconds <= 25 ? 2 : seconds <= 45 ? 5 : seconds <= 75 ? 12 : 20)
  const globalVal = globalPct ?? (seconds <= 25 ? 3 : seconds <= 45 ? 8 : seconds <= 75 ? 15 : 25)

  let label = '🌻 Daily Challenge Cleared!'
  if (seconds <= 20) label = '⚡ Ultra Lightning Fast!'
  else if (seconds <= 45) label = '🚀 Speedy Finish!'
  else if (seconds <= 90) label = '🌱 Strong Garden Performance!'
  else if (seconds <= 180) label = '🧠 Solid Brain Workout!'

  return {
    local: `Top ${localVal}%`,
    global: `Top ${globalVal}%`,
    label
  }
}

function getVictorySubtitle(gameTitle: string, category?: string, solveTime = 35) {
  if (category === 'garden_spell') {
    return <>Great job! You solved <strong>{gameTitle}</strong> in {solveTime}s & mastered today&apos;s crop!</>
  }
  if (category === 'math') {
    return <>Great job! You solved <strong>{gameTitle}</strong> in {solveTime}s & unlocked today&apos;s USDA nutrition fact!</>
  }
  if (category === 'jigsaw') {
    return <>Great job! You assembled <strong>{gameTitle}</strong> in {solveTime}s!</>
  }
  if (category === 'garden_plots' || category === 'garden_crowns') {
    return <>Great job! You solved <strong>{gameTitle}</strong> in {solveTime}s & planted today&apos;s garden grid!</>
  }
  if (category === 'anagram') {
    return <>Great job! You unscrambled <strong>{gameTitle}</strong> in {solveTime}s!</>
  }
  if (category === 'memory_match') {
    return <>Great job! You matched <strong>{gameTitle}</strong> in {solveTime}s!</>
  }
  return <>Great job! You solved <strong>{gameTitle}</strong> in {solveTime}s!</>
}

export default function GameVictoryModal({
  isOpen,
  onClose,
  gameTitle,
  gameCategory,
  zipcode = '95125',
  solveTimeSeconds = 35,
  shareResultCardText,
}: GameVictoryModalProps) {
  const { user } = useAuth()
  const { requireAuth } = useQuickSetup()
  const stats = getGuestGameStats()
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)
  const [showShareModal, setShowShareModal] = useState(false)

  if (!isOpen) return null

  const percentiles = computeSpeedPercentiles(solveTimeSeconds)

  const handleSignInToSave = () => {
    requireAuth({
      trigger: 'save_game_victory',
      defaultSignIn: true,
    })
  }

  const handleNotifyClick = () => {
    if (!user) {
      requireAuth({
        trigger: 'enable_game_notifications',
        defaultSignIn: true,
        onReady: () => {
          showPrompt(true)
        },
      })
    } else {
      showPrompt(true)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%', padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        
        {/* CELEBRATION EMOJI */}
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎉 🏅 🎉</div>

        <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#111827' }}>
          PUZZLE SOLVED!
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#4b5563' }}>
          {getVictorySubtitle(gameTitle, gameCategory, solveTimeSeconds)}
        </p>

        {/* HERO RANK & STREAK BOX */}
        <div style={{ background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: 16, padding: '16px 14px', marginBottom: 16, textAlign: 'center' }}>
          {user ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🏆 Daily Leaderboard Rank
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#064e3b', margin: '2px 0 6px' }}>
                #4 All-Time
              </div>

              {stats.streakDays > 0 && (
                <div style={{ display: 'inline-block', background: '#fef3c7', color: '#b45309', padding: '3px 12px', borderRadius: 16, fontSize: 12, fontWeight: 800, marginBottom: 12 }}>
                  🔥 {stats.streakDays}-Day Streak
                </div>
              )}

              <div style={{ borderTop: '1px solid #a7f3d0', marginBottom: 12 }} />
            </>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                🏆 Daily Leaderboard
              </div>
              <button
                onClick={handleSignInToSave}
                style={{ background: '#059669', color: '#ffffff', border: 'none', padding: '6px 14px', borderRadius: 20, fontWeight: 800, fontSize: 13, cursor: 'pointer', marginBottom: 10, boxShadow: '0 2px 6px rgba(5,150,105,0.2)' }}
              >
                🔒 Unlock Leaderboard Rank →
              </button>
              <div style={{ borderTop: '1px solid #a7f3d0', marginBottom: 12 }} />
            </div>
          )}

          {/* TODAY'S RANKS: MOBILE-FRIENDLY FLEX BADGES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', border: '1px solid #a7f3d0', padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, color: '#047857', width: '100%', maxWidth: 320, justifyContent: 'center' }}>
              📍 <span>{percentiles.local} of your neighbors</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', border: '1px solid #a7f3d0', padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, color: '#047857', width: '100%', maxWidth: 320, justifyContent: 'center' }}>
              🌍 <span>{percentiles.global} of all users</span>
            </div>
          </div>
        </div>

        {/* PUSH NOTIFICATION REMINDER PROMPT */}
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <button
            onClick={handleNotifyClick}
            style={{ width: '100%', background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            🔔 Notify me when new daily games drop!
          </button>
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => setShowShareModal(true)}
            style={{ width: '100%', background: '#059669', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
          >
            🚀 Share Result Card with Neighbors
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <Link
              href="/market"
              style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', textDecoration: 'none', padding: '12px', borderRadius: 8, fontWeight: 'bold', fontSize: 14, display: 'inline-block', boxSizing: 'border-box' }}
            >
              🏠 Return to Market
            </Link>

            <Link
              href="/games"
              style={{ flex: 1, background: '#3b82f6', color: '#fff', textDecoration: 'none', padding: '12px', borderRadius: 8, fontWeight: 'bold', fontSize: 14, display: 'inline-block', boxSizing: 'border-box' }}
            >
              🎮 Play Next Game →
            </Link>
          </div>
        </div>

        <NotificationPromptModal {...modalProps} />
      </div>

      {/* EXISTING SOCIAL SHARE MODAL INTEGRATION */}
      {showShareModal && (
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title="Share Game Result Card"
          entityName={gameTitle}
          shareUrl="https://casagrown.link/g/today"
          shareMessage={shareResultCardText}
          subtitle="Share your ranking with neighbors on WhatsApp, SMS, Facebook, or Nextdoor."
        />
      )}
    </div>
  )
}
