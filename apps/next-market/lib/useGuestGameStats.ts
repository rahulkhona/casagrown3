/**
 * GUEST GAME STATS & STREAK LOCALSTORAGE ENGINE
 * Manages guest streaks, harvest points, and completed games across sessions.
 */

export interface GuestGameStats {
  streakDays: number
  pointsBalance: number
  completedGameIds: string[]
  lastPlayedDate: string | null
}

const STORAGE_KEY = 'casagrown_guest_game_stats_v1'

export function getGuestGameStats(): GuestGameStats {
  if (typeof window === 'undefined') {
    return { streakDays: 1, pointsBalance: 0, completedGameIds: [], lastPlayedDate: null }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { streakDays: 0, pointsBalance: 0, completedGameIds: [], lastPlayedDate: null }
    }
    return JSON.parse(raw)
  } catch (err) {
    return { streakDays: 0, pointsBalance: 0, completedGameIds: [], lastPlayedDate: null }
  }
}

export function recordGameCompletion(gameId: string, rewardPoints: number = 50): GuestGameStats {
  const current = getGuestGameStats()
  const todayStr = new Date().toISOString().split('T')[0]

  const alreadyCompleted = current.completedGameIds.includes(gameId)
  const newCompleted = alreadyCompleted
    ? current.completedGameIds
    : [...current.completedGameIds, gameId]

  const newPoints = alreadyCompleted
    ? current.pointsBalance
    : current.pointsBalance + rewardPoints

  let newStreak = current.streakDays

  if (current.lastPlayedDate !== todayStr) {
    if (!current.lastPlayedDate) {
      // First time player
      newStreak = 1
    } else {
      const lastDate = new Date(current.lastPlayedDate)
      const todayDate = new Date(todayStr)
      const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24))

      if (diffDays === 1) {
        newStreak = current.streakDays + 1
      } else if (diffDays > 1) {
        newStreak = 1 // Reset streak if missed a day
      }
    }
  }

  const updated: GuestGameStats = {
    streakDays: Math.max(1, newStreak),
    pointsBalance: newPoints,
    completedGameIds: newCompleted,
    lastPlayedDate: todayStr,
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  return updated
}

export function isGameCompletedLocal(gameId: string): boolean {
  const stats = getGuestGameStats()
  return stats.completedGameIds.includes(gameId)
}

export function isGameCompleted(gameId: string): boolean {
  return isGameCompletedLocal(gameId)
}
