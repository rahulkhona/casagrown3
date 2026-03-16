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

  // Set user ID for analytics
  useEffect(() => {
    setAnalyticsUser(user?.id ?? null)
  }, [user?.id])

  // Track page views on route change
  useEffect(() => {
    if (pathname && pathname !== prevPath.current) {
      prevPath.current = pathname
      trackPageView(pathname)
    }
  }, [pathname])

  return null // invisible tracker
}
