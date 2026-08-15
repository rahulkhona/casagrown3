/**
 * socialPostingSlots.ts — Research-backed social posting windows for Facebook & Instagram
 * 
 * Based on Sprout Social, Meta Business Insights, and Casual Gaming engagement research:
 * - Weekdays (Mon-Thu): Morning commute (7:45-8:30 AM), Lunch (12:00-1:00 PM), Evening Prime (7:30-8:45 PM)
 * - Friday: Shifts earlier into mid-afternoon (3:30-5:00 PM) for weekend harvest prep
 * - Weekend (Sat-Sun): Morning garden walk & farm stands (9:00-10:30 AM), Sunday evening reset (7:00-8:30 PM)
 */

export interface PostingSlot {
  id: string
  name: string
  timeLabel: string
  hours: number
  minutes: number
  icon: string
  badge: string
  category: 'morning' | 'midday' | 'evening' | 'weekend'
}

export function getZipTimezone(targetZips?: string[]): { iana: string; short: string } {
  if (!targetZips || targetZips.length === 0) {
    // Default to user/Pacific timezone
    return { iana: 'America/Los_Angeles', short: 'PT (Pacific Time)' }
  }

  const firstZip = targetZips[0].trim()
  const zipNum = parseInt(firstZip.slice(0, 3), 10)

  if (isNaN(zipNum)) return { iana: 'America/Los_Angeles', short: 'PT (Pacific Time)' }

  if (zipNum >= 900 && zipNum <= 969) return { iana: 'America/Los_Angeles', short: 'PT (Pacific Time)' }
  if (zipNum >= 970 && zipNum <= 994) return { iana: 'America/Los_Angeles', short: 'PT (Pacific Time)' }
  if (zipNum >= 800 && zipNum <= 899) return { iana: 'America/Denver', short: 'MT (Mountain Time)' }
  if (zipNum >= 500 && zipNum <= 799) return { iana: 'America/Chicago', short: 'CT (Central Time)' }
  if (zipNum >= 0 && zipNum <= 499) return { iana: 'America/New_York', short: 'ET (Eastern Time)' }

  return { iana: 'America/Los_Angeles', short: 'PT (Pacific Time)' }
}

export function getOptimalSlotsForDay(dayOfWeek: number): PostingSlot[] {
  // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isFriday = dayOfWeek === 5

  if (isFriday) {
    return [
      {
        id: 'fri_morning',
        name: 'Friday Morning Drop',
        timeLabel: '8:00 AM',
        hours: 8,
        minutes: 0,
        icon: '🌅',
        badge: 'Peak for Daily Puzzle Solvers & Morning Commute',
        category: 'morning',
      },
      {
        id: 'fri_lunch',
        name: 'Lunch Break & Fresh Food',
        timeLabel: '12:15 PM',
        hours: 12,
        minutes: 15,
        icon: '🥗',
        badge: 'Peak Midday Social Feed Browsing',
        category: 'midday',
      },
      {
        id: 'fri_early_weekend',
        name: 'Early Weekend Harvest Prep',
        timeLabel: '3:45 PM',
        hours: 15,
        minutes: 45,
        icon: '🌇',
        badge: 'Peak for Weekend Cooking & Early Log-Off',
        category: 'evening',
      },
      {
        id: 'fri_evening_reels',
        name: 'Friday Evening Relaxation',
        timeLabel: '8:00 PM',
        hours: 20,
        minutes: 0,
        icon: '🛋️',
        badge: 'High Casual Reels & Story Viewership',
        category: 'evening',
      },
    ]
  }

  if (isWeekend) {
    return [
      {
        id: 'weekend_market',
        name: dayOfWeek === 6 ? 'Saturday Farm Stand Morning' : 'Sunday Garden Walk',
        timeLabel: '9:30 AM',
        hours: 9,
        minutes: 30,
        icon: '🧺',
        badge: 'Peak for Weekend Farm Stand & Produce Buyers',
        category: 'weekend',
      },
      {
        id: 'weekend_midday',
        name: 'Midday Leisure & Games',
        timeLabel: '1:00 PM',
        hours: 13,
        minutes: 0,
        icon: '☀️',
        badge: 'Relaxed Weekend Coffee & Casual Puzzles',
        category: 'midday',
      },
      {
        id: 'weekend_evening',
        name: dayOfWeek === 0 ? 'Sunday Evening Weekly Reset' : 'Saturday Evening Social',
        timeLabel: '7:30 PM',
        hours: 19,
        minutes: 30,
        icon: '🛋️',
        badge: dayOfWeek === 0 ? 'Peak for Weekly Goal Setting & Word Games' : 'High Evening Video Views',
        category: 'evening',
      },
    ]
  }

  // Mon – Thu (Standard Weekdays)
  return [
    {
      id: 'weekday_coffee',
      name: 'Morning Coffee Drop',
      timeLabel: '8:00 AM',
      hours: 8,
      minutes: 0,
      icon: '🌅',
      badge: 'Peak for Daily Games & Morning Newsfeed',
      category: 'morning',
    },
    {
      id: 'weekday_lunch',
      name: 'Lunchtime Discovery Break',
      timeLabel: '12:15 PM',
      hours: 12,
      minutes: 15,
      icon: '🥗',
      badge: 'Peak for Midday Food Craving & 3-Min Solvers',
      category: 'midday',
    },
    {
      id: 'weekday_commute',
      name: 'Afternoon Harvest & Commute',
      timeLabel: '5:00 PM',
      hours: 17,
      minutes: 0,
      icon: '🌆',
      badge: 'Peak for Tree Owners Heading Home',
      category: 'evening',
    },
    {
      id: 'weekday_prime',
      name: 'Evening Prime Time',
      timeLabel: '7:45 PM',
      hours: 19,
      minutes: 45,
      icon: '🛋️',
      badge: 'Highest Overall Facebook & Instagram Reels Reach',
      category: 'evening',
    },
  ]
}

export function computeSlotDateTime(dayOffset: number, hours: number, minutes: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hours, minutes, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
