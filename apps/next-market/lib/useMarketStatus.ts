'use client'

/**
 * useMarketStatus — checks whether the market is currently open.
 *
 * Reads from:
 *   - market_schedule_policies (day_of_week, open_time, close_time, is_enabled)
 *   - market_settings (market_never_closes, products_never_expire)
 *
 * Returns:
 *   - isOpen: boolean — can orders be placed right now?
 *   - neverCloses: boolean — testing override active?
 *   - productsNeverExpire: boolean — testing override active?
 *   - todaySchedule: { open_time, close_time } | null
 *   - nextOpenDate: Date | null — when the market next opens
 *   - loading: boolean
 *
 * Also exports isProductExpired(marketDate) helper.
 */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from './supabase'

interface MarketSchedule {
  day_of_week: number
  day_name: string
  open_time: string
  close_time: string
  is_enabled: boolean
}

interface MarketSettings {
  market_never_closes: boolean
  products_never_expire: boolean
  enable_cart: boolean
}

interface MarketStatus {
  isOpen: boolean
  neverCloses: boolean
  productsNeverExpire: boolean
  enableCart: boolean
  todaySchedule: { open_time: string; close_time: string } | null
  nextOpenDate: Date | null
  loading: boolean
}

/** Check if a product's market_date is in the past (expired) */
export function isProductExpired(marketDate: string | Date, productsNeverExpire: boolean): boolean {
  if (productsNeverExpire) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Parse YYYY-MM-DD as local time (not UTC) to avoid timezone mismatch
  const d = typeof marketDate === 'string' ? marketDate : marketDate.toISOString().slice(0, 10)
  const [y, m, day] = d.split('-').map(Number)
  const mDate = new Date(y, m - 1, day) // local midnight
  return mDate < today
}

/**
 * Compute the next Date the market will be open,
 * given the current time and the schedule policies.
 */
function computeNextOpen(now: Date, schedules: MarketSchedule[]): Date | null {
  const enabled = schedules.filter(s => s.is_enabled)
  if (enabled.length === 0) return null

  const currentDow = now.getDay() // 0=Sun, 6=Sat
  const hh = now.getHours().toString().padStart(2, '0')
  const mm = now.getMinutes().toString().padStart(2, '0')
  const currentTime = `${hh}:${mm}`

  // Check today first — if market opens later today
  const todaySchedule = enabled.find(s => s.day_of_week === currentDow)
  if (todaySchedule && currentTime < todaySchedule.open_time) {
    const [openH, openM] = todaySchedule.open_time.split(':').map(Number)
    const next = new Date(now)
    next.setHours(openH, openM, 0, 0)
    return next
  }

  // Find the next enabled day (up to 7 days ahead)
  for (let offset = 1; offset <= 7; offset++) {
    const targetDow = (currentDow + offset) % 7
    const schedule = enabled.find(s => s.day_of_week === targetDow)
    if (schedule) {
      const [openH, openM] = schedule.open_time.split(':').map(Number)
      const next = new Date(now)
      next.setDate(next.getDate() + offset)
      next.setHours(openH, openM, 0, 0)
      return next
    }
  }

  return null
}

export function useMarketStatus(): MarketStatus {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<MarketSettings>({
    market_never_closes: false,
    products_never_expire: false,
    enable_cart: false,
  })
  const [todaySchedule, setTodaySchedule] = useState<{ open_time: string; close_time: string } | null>(null)
  const [nextOpenDate, setNextOpenDate] = useState<Date | null>(null)
  const [isOpen, setIsOpen] = useState(true) // default open to avoid flash

  useEffect(() => {
    const check = async () => {
      // Fetch settings
      const { data: settingsData } = await supabase
        .from('market_settings')
        .select('market_never_closes, products_never_expire, enable_cart')
        .eq('id', true)
        .single()

      const s: MarketSettings = {
        market_never_closes: settingsData?.market_never_closes ?? false,
        products_never_expire: settingsData?.products_never_expire ?? false,
        enable_cart: settingsData?.enable_cart ?? false,
      }
      setSettings(s)

      if (s.market_never_closes) {
        setIsOpen(true)
        setLoading(false)
        return
      }

      // Fetch ALL schedule days to compute next open
      const { data: allSchedules } = await supabase
        .from('market_schedule_policies')
        .select('day_of_week, day_name, open_time, close_time, is_enabled')
        .order('day_of_week')

      const schedules: MarketSchedule[] = allSchedules || []
      const now = new Date()
      const dow = now.getDay()

      // Today's schedule
      const today = schedules.find(s => s.day_of_week === dow && s.is_enabled)
      if (today) {
        setTodaySchedule({ open_time: today.open_time, close_time: today.close_time })
      }

      // Check if currently open
      const hh = now.getHours().toString().padStart(2, '0')
      const mm = now.getMinutes().toString().padStart(2, '0')
      const currentTime = `${hh}:${mm}`

      const open = today ? (currentTime >= today.open_time && currentTime < today.close_time) : false
      setIsOpen(open)

      // If closed, compute the next open time
      if (!open) {
        setNextOpenDate(computeNextOpen(now, schedules))
      }

      setLoading(false)
    }

    check()
  }, [supabase])

  return {
    isOpen,
    neverCloses: settings.market_never_closes,
    productsNeverExpire: settings.products_never_expire,
    enableCart: settings.enable_cart,
    todaySchedule,
    nextOpenDate,
    loading,
  }
}
