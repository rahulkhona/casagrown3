'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'

/**
 * Hook that checks the actual Supabase session (persisted in cookies).
 * Use this instead of state.isAuthenticated which resets on page reload.
 *
 * Returns { user, loading } — `user` is the Supabase user or null.
 */
export function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { id: u.id, email: u.email ?? undefined } : null)
      setLoading(false)

      // Stamp last_active_at for 90-day sweep tracking
      if (u) {
        supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', u.id).then(() => {})
      }
    })
  }, [])

  return { user, loading, isAuthenticated: !!user }
}
