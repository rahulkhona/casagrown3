'use client'

import { useSubscription } from '../../lib/useSubscription'

/**
 * ProGate — Hides children entirely if user is not on Pro plan.
 * Pro-only sections are only visible after enabling Pro.
 */
export function ProGate({
  children,
  feature,
}: {
  children: React.ReactNode
  feature: string
}) {
  const { isPro, loading } = useSubscription()

  if (loading || !isPro) {
    return null
  }

  return <>{children}</>
}
