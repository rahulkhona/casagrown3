'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { getGuestGameStats } from '../../../lib/useGuestGameStats'
import { getTodayDateStr, getTodayGames } from '../../../lib/gamesCatalog'
import styles from './DailyGamesMicrostrip.module.css'

export default function DailyGamesMicrostrip() {
  const [isVisible, setIsVisible] = useState(false)
  const [streakDays, setStreakDays] = useState(0)
  const [featuredGameTitle, setFeaturedGameTitle] = useState("Today's Crop Puzzle")
  const [featuredGameId, setFeaturedGameId] = useState('/games')

  useEffect(() => {
    try {
      const todayStr = getTodayDateStr()
      const dismissedKey = `casagrown_daily_game_strip_dismissed_${todayStr}`
      const isDismissed = localStorage.getItem(dismissedKey)

      if (isDismissed === 'true') {
        setIsVisible(false)
        return
      }

      // Read streak and stats
      const stats = getGuestGameStats()
      setStreakDays(stats.streakDays || 0)

      // Resolve today's featured game
      const todayGames = getTodayGames(todayStr)
      if (todayGames && todayGames.length > 0) {
        const featured = todayGames[0]
        setFeaturedGameTitle(featured.categoryName || featured.title)
        setFeaturedGameId(`/games/${featured.id}`)
      }

      setIsVisible(true)
    } catch {
      setIsVisible(false)
    }
  }, [])

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const todayStr = getTodayDateStr()
      localStorage.setItem(`casagrown_daily_game_strip_dismissed_${todayStr}`, 'true')
    } catch {}
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <aside aria-label="Daily games hub banner" className={styles.microstripWrapper}>
      <Link href="/games" className={styles.microstripContent}>
        <div className={styles.microstripLeft}>
          <span className={styles.gameIcon}>🎮</span>
          <span className={styles.gameTitle}>
            <strong>Daily Game:</strong> {featuredGameTitle}
          </span>
          <span className={styles.streakBadge}>
            🔥 {streakDays > 0 ? `${streakDays}d Streak` : 'Daily Streak'}
          </span>
        </div>

        <div className={styles.microstripRight}>
          <span className={styles.playBtn}>
            Play →
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            className={styles.dismissBtn}
            title="Dismiss for today"
            aria-label="Dismiss daily challenge banner"
          >
            ✕
          </button>
        </div>
      </Link>
    </aside>
  )
}
