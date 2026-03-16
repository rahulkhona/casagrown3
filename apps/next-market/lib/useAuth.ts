'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'

/**
 * Hook that checks the actual Supabase session (persisted in cookies).
 * Use this instead of state.isAuthenticated which resets on page reload.
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
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (u) {
        // Check if user is banned
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_banned, ban_reason')
          .eq('id', u.id)
          .single()

        if (profile?.is_banned) {
          setIsBanned(true)
          setBanReason(profile.ban_reason || null)
          setUser({ id: u.id, email: u.email ?? undefined })
          setLoading(false)
          return
        }

        setUser({ id: u.id, email: u.email ?? undefined })

        // Stamp last_active_at for 90-day sweep tracking
        supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', u.id).then(() => {})
      } else {
        setUser(null)
      }
      setLoading(false)
    })
  }, [])

  return { user, loading, isAuthenticated: !!user && !isBanned, isBanned, banReason }
}
