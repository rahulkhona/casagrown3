'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { getGuestGameStats } from '../../../lib/useGuestGameStats'
import { getTodayDateStr, getTodayGames } from '../../../lib/gamesCatalog'
import styles from './DailyGamesMicrostrip.module.css'

export default function DailyGamesMicrostrip() {
  const [isMounted, setIsMounted] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [streakDays, setStreakDays] = useState(0)
  const [featuredGameTitle, setFeaturedGameTitle] = useState("Today's Crop Puzzle")

  useEffect(() => {
    try {
      const todayStr = getTodayDateStr()
      const minKey = `casagrown_daily_game_strip_minimized_${todayStr}`
      const wasMinimized = localStorage.getItem(minKey) === 'true'
      setIsMinimized(wasMinimized)

      // Read streak and stats
      const stats = getGuestGameStats()
      setStreakDays(stats.streakDays || 0)

      // Resolve today's featured game
      const todayGames = getTodayGames(todayStr)
      if (todayGames && todayGames.length > 0) {
        const featured = todayGames[0]
        setFeaturedGameTitle(featured.categoryName || featured.title)
      }

      setIsMounted(true)
    } catch {
      setIsMounted(false)
    }
  }, [])

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const todayStr = getTodayDateStr()
      localStorage.setItem(`casagrown_daily_game_strip_minimized_${todayStr}`, 'true')
    } catch {}
    setIsMinimized(true)
  }

  const handleExpand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const todayStr = getTodayDateStr()
      localStorage.removeItem(`casagrown_daily_game_strip_minimized_${todayStr}`)
    } catch {}
    setIsMinimized(false)
  }

  if (!isMounted) return null

  // Option 1: Minimized state on left margin above Market tab — expands on tap!
  if (isMinimized) {
    return (
      <aside aria-label="Daily games mini bubble" className={styles.miniBubbleWrapper}>
        <button
          type="button"
          onClick={handleExpand}
          className={styles.miniBubbleBtn}
          title="Tap to view Daily Games"
          aria-label="Expand Daily Games challenge"
        >
          <span className={styles.miniBubbleIcon}>🎮</span>
          <span className={styles.miniBubbleStreak}>🔥{streakDays > 0 ? streakDays : 1}</span>
        </button>
      </aside>
    )
  }

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
