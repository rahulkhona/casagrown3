'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'
import { useAuth } from './useAuth'

export interface SubscriptionInfo {
  plan: 'free' | 'pro'
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'
  isPro: boolean
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
  loading: boolean
}

export function useSubscription(): SubscriptionInfo {
  const { user } = useAuth()
  const [sub, setSub] = useState<SubscriptionInfo>({
    plan: 'free',
    status: 'inactive',
    isPro: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    canceledAt: null,
    loading: true,
  })

  useEffect(() => {
    if (!user) {
      setSub((prev) => ({ ...prev, loading: false }))
      return
    }

    const supabase = createClient()

    // Check both subscription status and pro_testers override in parallel
    const subPromise = supabase
      .from('seller_subscriptions')
      .select('plan, status, trial_ends_at, current_period_end, canceled_at')
      .eq('user_id', user.id)
      .single()

    const testerPromise = supabase
      .from('pro_testers')
      .select('email')
      .eq('email', user.email ?? '')
      .maybeSingle()

    Promise.all([subPromise, testerPromise]).then(([subResult, testerResult]) => {
      const { data, error } = subResult
      const isProTester = !!testerResult.data

      if (data && !error) {
        const isPro =
          (data.plan === 'pro' &&
          ['active', 'trialing'].includes(data.status)) || isProTester
        setSub({
          plan: isProTester ? 'pro' : (data.plan as 'free' | 'pro'),
          status: isProTester && data.status === 'inactive' ? 'active' : (data.status as any),
          isPro,
          trialEndsAt: data.trial_ends_at,
          currentPeriodEnd: data.current_period_end,
          canceledAt: data.canceled_at,
          loading: false,
        })
      } else if (isProTester) {
        // No subscription record at all, but user is a pro tester — grant implicit Pro
        setSub({
          plan: 'pro',
          status: 'active',
          isPro: true,
          trialEndsAt: null,
          currentPeriodEnd: null,
          canceledAt: null,
          loading: false,
        })
      } else {
        setSub((prev) => ({ ...prev, loading: false }))
      }
    })

    // Listen for realtime updates from the shared system channel
    // (RealtimeNotificationListener emits this event)
    const handleSubChange = (e: any) => {
      const data = e.detail || e // CustomEvent on web, plain object on native
      if (data) {
        const isPro =
          data.plan === 'pro' &&
          ['active', 'trialing'].includes(data.status)
        setSub({
          plan: data.plan,
          status: data.status,
          isPro,
          trialEndsAt: data.trial_ends_at,
          currentPeriodEnd: data.current_period_end,
          canceledAt: data.canceled_at,
          loading: false,
        })
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('casagrown:subscription-changed', handleSubChange)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('casagrown:subscription-changed', handleSubChange)
      }
    }
  }, [user])

  return sub
}
