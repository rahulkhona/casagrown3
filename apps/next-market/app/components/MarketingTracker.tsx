'use client'

import { useMarketingAnalytics } from '../../lib/crm-analytics'

export function MarketingTracker({ slug }: { slug: string }) {
  useMarketingAnalytics(slug)
  return null
}
