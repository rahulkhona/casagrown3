import { NextResponse } from 'next/server'
import { TODAY_DAILY_GAMES } from '../../../../lib/gamesCatalog'

/**
 * DAILY 6:00 AM EST (11:00 UTC) CRON ROUTE HANDLER
 * Schedule: 0 11 * * * (6:00 AM EST / 3:00 AM PST)
 * Purpose: Unlocks today's 6 daily garden games & prepares social media publishing queue
 */
export async function GET() {
  const todayStr = new Date().toISOString().split('T')[0]

  return NextResponse.json({
    success: true,
    scheduledTime: '6:00 AM EST Daily',
    date: todayStr,
    unlockedGamesCount: TODAY_DAILY_GAMES.length,
    games: TODAY_DAILY_GAMES.map((g) => ({
      id: g.id,
      category: g.categoryName,
      title: g.title,
      points: g.rewardPoints,
    })),
  })
}
