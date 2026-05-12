/**
 * useMarketStatus — native port of the web hook.
 * Checks market_schedule_policies and market_settings to determine
 * whether the market is currently open and when it opens next.
 */
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface MarketSchedule {
  day_of_week: number;
  day_name: string;
  open_time: string;
  close_time: string;
  is_enabled: boolean;
}

export interface MarketStatus {
  isOpen: boolean;
  isScheduleOpen: boolean;
  neverCloses: boolean;
  todaySchedule: { open_time: string; close_time: string } | null;
  nextOpenDate: Date | null;
  loading: boolean;
}

function computeNextOpen(now: Date, schedules: MarketSchedule[]): Date | null {
  const enabled = schedules.filter(s => s.is_enabled);
  if (enabled.length === 0) return null;

  const currentDow = now.getDay();
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const currentTime = `${hh}:${mm}`;

  // Check today first
  const todaySchedule = enabled.find(s => s.day_of_week === currentDow);
  if (todaySchedule && currentTime < todaySchedule.open_time) {
    const [openH, openM] = todaySchedule.open_time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(openH, openM, 0, 0);
    return next;
  }

  // Find the next enabled day
  for (let offset = 1; offset <= 7; offset++) {
    const targetDow = (currentDow + offset) % 7;
    const schedule = enabled.find(s => s.day_of_week === targetDow);
    if (schedule) {
      const [openH, openM] = schedule.open_time.split(':').map(Number);
      const next = new Date(now);
      next.setDate(next.getDate() + offset);
      next.setHours(openH, openM, 0, 0);
      return next;
    }
  }
  return null;
}

export function useMarketStatus(): MarketStatus {
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [isScheduleOpen, setIsScheduleOpen] = useState(true);
  const [neverCloses, setNeverCloses] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState<{ open_time: string; close_time: string } | null>(null);
  const [nextOpenDate, setNextOpenDate] = useState<Date | null>(null);

  useEffect(() => {
    const check = async () => {
      // Fetch settings
      const { data: settingsData } = await supabase
        .from('market_settings')
        .select('market_never_closes, products_never_expire, enable_cart')
        .eq('id', true)
        .single();

      const marketNeverCloses = settingsData?.market_never_closes ?? false;
      setNeverCloses(marketNeverCloses);

      // Fetch ALL schedule days
      const { data: allSchedules } = await supabase
        .from('market_schedule_policies')
        .select('day_of_week, day_name, open_time, close_time, is_enabled')
        .order('day_of_week');

      const schedules: MarketSchedule[] = allSchedules || [];
      const now = new Date();
      const dow = now.getDay();

      // Today's schedule
      const today = schedules.find(s => s.day_of_week === dow && s.is_enabled);
      if (today) {
        setTodaySchedule({ open_time: today.open_time, close_time: today.close_time });
      }

      // Check if currently open
      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');
      const currentTime = `${hh}:${mm}`;

      const open = today ? (currentTime >= today.open_time && currentTime < today.close_time) : false;
      setIsScheduleOpen(open);
      setIsOpen(marketNeverCloses || open);

      if (!open) {
        setNextOpenDate(computeNextOpen(now, schedules));
      }

      setLoading(false);
    };

    check();
  }, []);

  return { isOpen, isScheduleOpen, neverCloses, todaySchedule, nextOpenDate, loading };
}
