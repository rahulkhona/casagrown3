'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { trackPageView, setAnalyticsUser } from '../../lib/analytics'
import { useAuth } from '../../lib/useAuth'

/**
 * Invisible component that tracks page views on route changes
 * and sets the analytics user ID from auth state.
 */
export function AnalyticsTracker() {
  const pathname = usePathname()
  const { user } = useAuth()
  const prevPath = useRef<string | null>(null)
  const trackedUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return

    // Set user ID for analytics
    setAnalyticsUser(user?.id ?? null)

    // Track page view if pathname changed OR if user just hydrated/authenticated
    const shouldTrack = pathname !== prevPath.current || (user?.id && user.id !== trackedUserId.current)
    if (shouldTrack) {
      prevPath.current = pathname
      trackedUserId.current = user?.id ?? null
      trackPageView(pathname)
    }
  }, [pathname, user?.id])

  return null // invisible tracker
}
