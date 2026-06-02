'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createClient } from './supabase'

// ============================================================================
// Types
// ============================================================================

export interface BootstrapProfile {
  full_name: string | null
  avatar_url: string | null
  is_banned: boolean
  ban_reason: string | null
  tos_accepted_at: string | null
  profile_completed_at: string | null
  referral_code?: string | null
  is_pro?: boolean
}

export interface BootstrapMarketConfig {
  schedule: { dayOfWeek: number; dayName: string; openTime: string; closeTime: string }[]
  productsNeverExpire: boolean
  marketNeverCloses: boolean
}

export interface BootstrapBadges {
  dm_unread: number
  community_unread: number
  actionable_orders: number
}

export interface BootstrapData {
  profile: BootstrapProfile | null
  market_config: BootstrapMarketConfig
  badges: BootstrapBadges | null
}

interface BootstrapContextType {
  /** The bootstrap data (null while loading) */
  data: BootstrapData | null
  /** Whether the bootstrap RPC is still in-flight */
  loading: boolean
  /** The authenticated user (from cookie session) */
  user: { id: string; email?: string } | null
  /** Whether the user is authenticated and not banned */
  isAuthenticated: boolean
  /** Re-fetch bootstrap data (e.g. after profile edit) */
  refresh: () => Promise<void>
}

const DEFAULT_CONFIG: BootstrapMarketConfig = {
  schedule: [{ dayOfWeek: 6, dayName: 'Saturday', openTime: '08:00', closeTime: '11:00' }],
  productsNeverExpire: false,
  marketNeverCloses: true,
}

// ============================================================================
// Context
// ============================================================================

const BootstrapContext = createContext<BootstrapContextType | null>(null)

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const initialized = useRef(false)

  const fetchBootstrap = useCallback(async (userId: string | null) => {
    try {
      const supabase = createClient()
      const { data: result, error } = await supabase.rpc('get_client_bootstrap', {
        p_user_id: userId,
      })

      if (error) {
        console.error('[BOOTSTRAP] RPC error:', error.message)
        // Fallback: at least load market config via the old path
        const { data: fallbackConfig } = await supabase.rpc('get_market_config')
        setData({
          profile: null,
          market_config: fallbackConfig ? {
            schedule: fallbackConfig.schedule || [],
            productsNeverExpire: fallbackConfig.productsNeverExpire || false,
            marketNeverCloses: fallbackConfig.marketNeverCloses ?? true,
          } : DEFAULT_CONFIG,
          badges: null,
        })
        return
      }

      if (result) {
        const mc = result.market_config || {}
        setData({
          profile: result.profile || null,
          market_config: {
            schedule: mc.schedule || [],
            productsNeverExpire: mc.productsNeverExpire || false,
            marketNeverCloses: mc.marketNeverCloses ?? true,
          },
          badges: result.badges || null,
        })
      }
    } catch (err) {
      console.error('[BOOTSTRAP] Unexpected error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (user) {
      await fetchBootstrap(user.id)
    }
  }, [user, fetchBootstrap])

  // One-time initialization
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const supabase = createClient()

    // Step 1: Read session from cookie (instant, no network)
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      const sessionUser = session?.user
      if (sessionUser) {
        // Check for Playwright test override
        setUser({ id: sessionUser.id, email: sessionUser.email ?? undefined })
        fetchBootstrap(sessionUser.id)
      } else {
        // Check localStorage fallback for Playwright tests
        try {
          const testToken = typeof window !== 'undefined' ? window?.localStorage?.getItem('supabase.auth.token') : null
          if (testToken) {
            const parsed = JSON.parse(testToken)
            if (parsed?.user?.id) {
              setUser({ id: parsed.user.id, email: parsed.user.email ?? undefined })
              fetchBootstrap(parsed.user.id)
              return
            }
          }
        } catch { /* ignore */ }

        // Guest mode
        setUser(null)
        fetchBootstrap(null)
      }
    })

    // Listen for auth changes (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        const u = { id: session.user.id, email: session.user.email ?? undefined }
        setUser(u)
        setLoading(true)
        fetchBootstrap(u.id)
      } else {
        setUser(null)
        setData(prev => prev ? { ...prev, profile: null, badges: null } : null)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchBootstrap])

  const isAuthenticated = !!user && !!data?.profile && !data.profile.is_banned

  return (
    <BootstrapContext.Provider value={{ data, loading, user, isAuthenticated, refresh }}>
      {children}
    </BootstrapContext.Provider>
  )
}

/**
 * Access bootstrap data from any client component.
 * Must be used within <BootstrapProvider>.
 */
export function useBootstrap(): BootstrapContextType {
  const ctx = useContext(BootstrapContext)
  if (!ctx) throw new Error('useBootstrap must be used within BootstrapProvider')
  return ctx
}
