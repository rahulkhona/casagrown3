'use client'

import { useState } from 'react'
import GameAdPostCreatorModal, { CASAGROWN_GAMES, GameModalContext } from '../../../../components/GameAdPostCreatorModal'

export default function GamesMarketingPage() {
  const [modalState, setModalState] = useState<GameModalContext>({
    isOpen: false,
    initialPublishType: 'paid_ad',
    gameId: 'garden_spell',
  })

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '28px' }}>🎮</span>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Daily Games Marketing &amp; Video Ads
          </h1>
        </div>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, maxWidth: '720px', lineHeight: 1.5 }}>
          Create high-converting video-only ads and organic posts for CasaGrown's 6 date-seeded daily brain games. Target puzzle lovers, Wordle enthusiasts, and garden communities on Facebook and Instagram.
        </p>
      </div>

      {/* Highlights Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div style={{ background: '#FAF5FF', border: '1px solid #DDD6FE', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            FORMAT
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            📹 Video-Only Creatives
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            Upload 9:16 vertical screen recordings of real gameplay solve
          </div>
        </div>

        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ENGAGEMENT
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            🔥 Daily Solve Streaks
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            Drives recurring daily visits with 0 paywalls and 0 third-party ads
          </div>
        </div>

        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TARGET AUDIENCE
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            🧩 Wordle &amp; NYT Gamers
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            Auto-targeted to puzzle gamers, crossword solvers &amp; retirees
          </div>
        </div>
      </div>

      {/* Games Catalog Grid */}
      <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Select Game to Launch Ad / Post
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '18px',
        }}
      >
        {CASAGROWN_GAMES.map(game => (
          <div
            key={game.id}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '20px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                    {game.icon}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      {game.name}
                    </h3>
                    <span style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 700 }}>
                      {game.category}
                    </span>
                  </div>
                </div>

                <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  Daily 6 AM
                </span>
              </div>

              <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.4, margin: '0 0 14px 0' }}>
                {game.subtitle}
              </p>

              {/* Target Tags */}
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                  Target Interests:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {game.defaultInterests.slice(0, 4).map(t => (
                    <span key={t} style={{ fontSize: '10px', background: '#FAF5FF', color: '#6D28D9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {t}
                    </span>
                  ))}
                  {game.defaultInterests.length > 4 && (
                    <span style={{ fontSize: '10px', background: '#F1F5F9', color: '#64748B', padding: '2px 6px', borderRadius: '4px' }}>
                      +{game.defaultInterests.length - 4}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
              <button
                onClick={() => setModalState({
                  isOpen: true,
                  initialPublishType: 'paid_ad',
                  gameId: game.id,
                })}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#7C3AED',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                }}
              >
                <span>📢</span>
                <span>Create Video Ad</span>
              </button>

              <button
                onClick={() => setModalState({
                  isOpen: true,
                  initialPublishType: 'organic_post',
                  gameId: game.id,
                })}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <span>📘</span>
                <span>Create Video Post</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Game Ad/Post Modal */}
      <GameAdPostCreatorModal
        modalContext={modalState}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
