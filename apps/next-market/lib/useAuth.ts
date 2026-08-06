'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useBootstrap } from './useBootstrap'

/**
 * Hook that provides authentication state derived from the BootstrapProvider.
 *
 * Previously, this hook independently called getSession() + profiles.select() +
 * profiles.update(last_active_at). Now it reads entirely from the shared bootstrap
 * context, eliminating 3 redundant network calls.
 *
 * Re-fetches on navigation so that changes made on /profile-setup or /terms
 * are reflected immediately.
 *
 * Returns { user, loading, isAuthenticated, isBanned, banReason, tosAccepted, profileComplete }
 */
export function useAuth() {
  const { data, loading: bootstrapLoading, user, refresh } = useBootstrap()
  const pathname = usePathname()

  // Re-fetch bootstrap on navigation (catches profile-setup / ToS completion / fresh OAuth landing)
  useEffect(() => {
    refresh()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const profile = data?.profile
  const isBanned = profile?.is_banned ?? false
  const banReason = profile?.ban_reason ?? null
  const tosAccepted = profile ? !!profile.tos_accepted_at : null
  const profileComplete = profile ? !!profile.profile_completed_at : null
  const isPro = profile?.is_pro ?? false

  return {
    user,
    loading: bootstrapLoading,
    isAuthenticated: !!user && !isBanned,
    isBanned,
    banReason,
    tosAccepted,
    profileComplete,
    isPro,
    refresh,
  }
}
