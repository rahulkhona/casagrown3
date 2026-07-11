'use client'

import { usePathname } from 'next/navigation'
import { useMarketingAnalytics } from '../../lib/crm-analytics'

/**
 * Invisible component that tracks page visits for the CRM Marketing dashboard.
 * Designed to be placed in the root layout to capture ALL traffic (authenticated and unauthenticated).
 */
export function GlobalMarketingTracker() {
  const pathname = usePathname()
  useMarketingAnalytics(pathname || '/')
  return null
}
