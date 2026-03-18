'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'
import { useAuth } from './useAuth'

interface MarketRestriction {
  isFreeOnly: boolean
  reason: string
  stateName: string
  stateCode: string
  loading: boolean
}

const CACHE_KEY = 'casagrown_market_restriction'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Hook to check if the current user is in a state where only free produce
 * sharing is allowed (no paid transactions).
 *
 * Used by seller-facing pages to lock pricing and hide payment sections.
 */
export function useMarketRestriction(): MarketRestriction {
  const { user } = useAuth()
  const [restriction, setRestriction] = useState<MarketRestriction>({
    isFreeOnly: false,
    reason: '',
    stateName: '',
    stateCode: '',
    loading: true,
  })

  useEffect(() => {
    if (!user) {
      setRestriction(r => ({ ...r, loading: false }))
      return
    }

    // Check cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.userId === user.id && Date.now() - parsed.timestamp < CACHE_TTL) {
          setRestriction({ ...parsed.data, loading: false })
          return
        }
      }
    } catch { /* ignore */ }

    const supabase = createClient()
    const checkRestriction = async () => {
      // 1. Get user's state_code
      const { data: profile } = await supabase
        .from('profiles')
        .select('state_code')
        .eq('id', user.id)
        .single()

      if (!profile?.state_code) {
        setRestriction(r => ({ ...r, loading: false }))
        return
      }

      // 2. Check if their state is blocked
      const { data: block } = await supabase
        .from('market_state_blocks')
        .select('reason, states!inner(code, name)')
        .eq('states.code', profile.state_code)
        .maybeSingle()

      const result: MarketRestriction = {
        isFreeOnly: !!block,
        reason: (block as any)?.reason || 'Local regulations require free sharing only.',
        stateName: (block as any)?.states?.name || '',
        stateCode: profile.state_code,
        loading: false,
      }

      setRestriction(result)

      // Cache result
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          userId: user.id,
          timestamp: Date.now(),
          data: result,
        }))
      } catch { /* quota */ }
    }

    checkRestriction()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return restriction
}
