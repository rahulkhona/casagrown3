'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'

/**
 * Hook that checks the actual Supabase session (persisted in cookies).
 * Uses getSession() (reads local cookie — instant) instead of getUser()
 * (network call — slow). Listens to onAuthStateChange for reactivity.
 *
 * Returns { user, loading, isAuthenticated, isBanned, banReason }
 */
export function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isBanned, setIsBanned] = useState(false)
  const [banReason, setBanReason] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const resolveUser = async (sessionUser: { id: string; email?: string } | null) => {
      if (!sessionUser) {
        // Fallback for Playwright tests: check localStorage
        try {
          const testToken = window?.localStorage?.getItem('supabase.auth.token')
          if (testToken) {
            const parsed = JSON.parse(testToken)
            if (parsed?.user?.id) {
              setUser({ id: parsed.user.id, email: parsed.user.email ?? undefined })
              setLoading(false)
              return
            }
          }
        } catch { /* ignore */ }
        setUser(null)
        setLoading(false)
        return
      }

      // Check if user is banned (lightweight single-row query)
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_banned, ban_reason')
        .eq('id', sessionUser.id)
        .single()

      if (profile?.is_banned) {
        setIsBanned(true)
        setBanReason(profile.ban_reason || null)
      }

      setUser({ id: sessionUser.id, email: sessionUser.email ?? undefined })
      setLoading(false)

      // Stamp last_active_at in background (fire and forget)
      supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', sessionUser.id).then(() => {})
    }

    // getSession reads from cookie — instant, no network call
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolveUser(session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null)
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? undefined })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading, isAuthenticated: !!user && !isBanned, isBanned, banReason }
}
