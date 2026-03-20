'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from './supabase'

/**
 * Hook that checks the actual Supabase session (persisted in cookies).
 * Uses getSession() (reads local cookie — instant) instead of getUser()
 * (network call — slow). Listens to onAuthStateChange for reactivity.
 *
 * Re-fetches profile status on navigation so that changes made on
 * /profile-setup or /terms are reflected immediately.
 *
 * Returns { user, loading, isAuthenticated, isBanned, banReason, tosAccepted, profileComplete }
 */
export function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isBanned, setIsBanned] = useState(false)
  const [banReason, setBanReason] = useState<string | null>(null)
  const [tosAccepted, setTosAccepted] = useState<boolean | null>(null) // null = still loading
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null)
  const pathname = usePathname()

  const resolveProfile = useCallback(async (sessionUser: { id: string; email?: string }) => {
    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_banned, ban_reason, tos_accepted_at, profile_completed_at')
      .eq('id', sessionUser.id)
      .single()

    if (profile?.is_banned) {
      setIsBanned(true)
      setBanReason(profile.ban_reason || null)
    } else {
      setIsBanned(false)
      setBanReason(null)
    }

    setTosAccepted(!!profile?.tos_accepted_at)
    setProfileComplete(!!profile?.profile_completed_at)
  }, [])

  // Initial session check + auth state listener
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
              setTosAccepted(true) // test users are pre-accepted
              setProfileComplete(true)
              setLoading(false)
              return
            }
          }
        } catch { /* ignore */ }
        setUser(null)
        setLoading(false)
        return
      }

      await resolveProfile(sessionUser)

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
        const u = { id: session.user.id, email: session.user.email ?? undefined }
        setUser(u)
        resolveProfile(u)
      } else {
        setUser(null)
        setTosAccepted(null)
        setProfileComplete(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [resolveProfile])

  // Re-fetch profile status on navigation (catches profile-setup / ToS completion)
  useEffect(() => {
    if (!user) return
    resolveProfile(user)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return { user, loading, isAuthenticated: !!user && !isBanned, isBanned, banReason, tosAccepted, profileComplete }
}
