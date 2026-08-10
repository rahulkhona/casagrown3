'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../../../lib/useAuth'
import { getGameById, GameInstance } from '../../../../lib/gamesCatalog'
import { recordGameCompletion, isGameCompleted } from '../../../../lib/useGuestGameStats'
import { trackGameView, trackGameSolve } from '../../../../lib/analytics'
import GameVictoryModal from '../../../components/games/GameVictoryModal'
import WordleGardenCanvas from '../../../components/games/WordleGardenCanvas'
import JigsawPuzzleCanvas from '../../../components/games/JigsawPuzzleCanvas'
import GardenCrownsCanvas from '../../../components/games/GardenCrownsCanvas'
import NutritionalAlgebraCanvas from '../../../components/games/NutritionalAlgebraCanvas'
import GardenMemoryCanvas from '../../../components/games/GardenMemoryCanvas'
import CropAnagramCanvas from '../../../components/games/CropAnagramCanvas'

export default function GameCanvasPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const gameId = (params?.gameId as string) || 'garden_spell_001'

  const { user } = useAuth()
  const [game, setGame] = useState<GameInstance | null>(null)
  const [solved, setSolved] = useState(false)
  const [alreadyCompletedToday, setAlreadyCompletedToday] = useState(false)
  const [showVictoryModal, setShowVictoryModal] = useState(false)
  const [solveTimeSeconds, setSolveTimeSeconds] = useState(35)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (searchParams?.get('focus') === 'true' || searchParams?.get('embed') === 'true') {
      setIsFocusMode(true)
    }
  }, [searchParams])

  useEffect(() => {
    startTimeRef.current = Date.now()
    const found = getGameById(gameId)
    if (found) {
      setGame(found)
      trackGameView(found.id, found.title)
      
      // 1. Local Check (Instant)
      if (isGameCompleted(found.id)) {
        setSolved(true)
        setAlreadyCompletedToday(true)
        setShowVictoryModal(true)
      }

      // 2. Database Check for Logged-In Users (Cross-Device Lock)
      if (user?.id) {
        const todayStr = new Date().toISOString().split('T')[0]
        const { createClient } = require('@supabase/supabase-js')
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        supabase
          .from('user_game_completions')
          .select('solve_time_seconds')
          .eq('user_id', user.id)
          .eq('game_id', found.id)
          .eq('game_date', todayStr)
          .maybeSingle()
          .then(({ data }: any) => {
            if (data) {
              setSolved(true)
              setAlreadyCompletedToday(true)
              if (data.solve_time_seconds) setSolveTimeSeconds(data.solve_time_seconds)
              setShowVictoryModal(true)
            }
          })
          .catch(() => ({}))
      }
    }
  }, [gameId, user?.id])

  if (!game) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
        Loading Game #{gameId}...
      </div>
    )
  }

  const handleSolve = () => {
    const elapsed = Math.max(5, Math.round((Date.now() - startTimeRef.current) / 1000))
    setSolveTimeSeconds(elapsed)
    setSolved(true)
    recordGameCompletion(game.id, 0)
    trackGameSolve(game.id, 0)
    setShowVictoryModal(true)

    // Sync to Supabase Database for Logged-In Users AND Guest Devices
    const todayStr = new Date().toISOString().split('T')[0]
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    let guestDeviceId = ''
    if (typeof window !== 'undefined') {
      guestDeviceId = localStorage.getItem('casagrown_guest_device_id') || ''
      if (!guestDeviceId) {
        guestDeviceId = `guest_${Math.random().toString(36).substring(2, 15)}`
        localStorage.setItem('casagrown_guest_device_id', guestDeviceId)
      }
    }

    const payload = user?.id
      ? { user_id: user.id, game_id: game.id, game_date: todayStr, solve_time_seconds: elapsed }
      : { guest_id: guestDeviceId, game_id: game.id, game_date: todayStr, solve_time_seconds: elapsed }

    void (async () => {
      try {
        await supabase.from('user_game_completions').insert(payload)
      } catch (err) {
        console.warn('[Games] Failed to save completion:', err)
      }
    })()
  }

  const shareText = `🌱 CasaGrown ${game.title} 🟩🟩🟩🟩🟩
🏆 Global Player Rank: Top 8%
📍 95125 Rank: Top 3% of Your Neighbors
Play today's game & see your neighborhood rank → https://casagrown.link/g/${game.id}`

  // 100% DISTRACTION-FREE FOCUS MODE FOR AD / VIDEO RECORDING (CLEAN CANVAS ONLY)
  if (isFocusMode) {
    return (
      <div style={{ width: '100%', maxWidth: 750, margin: '0 auto', padding: '12px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          {game.category === 'garden_spell' && (
            <WordleGardenCanvas targetWord={game.targetWord || 'LEMON'} onSolve={handleSolve} />
          )}

          {game.category === 'jigsaw' && (
            <JigsawPuzzleCanvas
              imageUrl={game.imageUrl || 'https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg'}
              title={game.title}
              onSolve={handleSolve}
            />
          )}

          {(game.category === 'garden_plots' || game.category === 'garden_crowns') && (
            <GardenCrownsCanvas onSolve={handleSolve} />
          )}

          {game.category === 'math' && (
            <NutritionalAlgebraCanvas onSolve={handleSolve} />
          )}

          {game.category === 'memory_match' && (
            <GardenMemoryCanvas onSolve={handleSolve} />
          )}

          {game.category === 'anagram' && (
            <CropAnagramCanvas
              anagramText={game.anagramText || 'S-M-O-N-E-L'}
              solutionWord={game.solutionWord || 'LEMONS'}
              varietyDetail={game.varietyDetail || 'Meyer Lemons — Sweet, juicy backyard citrus popular in San Jose gardens'}
              onSolve={handleSolve}
            />
          )}
        </div>

        <GameVictoryModal
          isOpen={showVictoryModal}
          onClose={() => setShowVictoryModal(false)}
          gameTitle={game.title}
          solveTimeSeconds={solveTimeSeconds}
          shareResultCardText={shareText}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 750, margin: '0 auto', padding: '20px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Link href="/games" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 'bold', fontSize: 14 }}>
          ← Games Hub
        </Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 'bold', color: '#047857' }}>
            🏆 Top 3% Rank
          </div>
        </div>
      </div>

      {/* GAME TITLE CARD */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20, textAlign: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 'bold', color: '#059669', textTransform: 'uppercase' }}>{game.categoryName}</span>
        <h1 style={{ margin: '4px 0 6px', fontSize: 24, fontWeight: 800, color: '#111827' }}>{game.title}</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#4b5563' }}>{game.subtitle}</p>
      </div>

      {/* CANVAS DISPLAY FOR SPECIFIC GAME TYPES */}
      <div style={{ background: '#f9fafb', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 20, textAlign: 'center' }}>
        {game.category === 'garden_spell' && (
          <WordleGardenCanvas targetWord={game.targetWord || 'LEMON'} onSolve={handleSolve} />
        )}

        {game.category === 'jigsaw' && (
          <JigsawPuzzleCanvas
            imageUrl={game.imageUrl || 'https://upload.wikimedia.org/wikipedia/commons/f/f3/MeyerLemon.jpg'}
            title={game.title}
            onSolve={handleSolve}
          />
        )}

        {(game.category === 'garden_plots' || game.category === 'garden_crowns') && (
          <GardenCrownsCanvas onSolve={handleSolve} />
        )}

        {game.category === 'math' && (
          <NutritionalAlgebraCanvas onSolve={handleSolve} />
        )}

        {game.category === 'memory_match' && (
          <GardenMemoryCanvas onSolve={handleSolve} />
        )}

        {game.category === 'anagram' && (
          <CropAnagramCanvas
            anagramText={game.anagramText || 'S-M-O-N-E-L'}
            solutionWord={game.solutionWord || 'LEMONS'}
            varietyDetail={game.varietyDetail || 'Meyer Lemons — Sweet, juicy backyard citrus popular in San Jose gardens'}
            onSolve={handleSolve}
          />
        )}
      </div>

      {/* VICTORY MODAL */}
      <GameVictoryModal
        isOpen={showVictoryModal}
        onClose={() => setShowVictoryModal(false)}
        gameTitle={game.title}
        gameCategory={game.category}
        solveTimeSeconds={solveTimeSeconds}
        shareResultCardText={shareText}
      />
    </div>
  )
}
