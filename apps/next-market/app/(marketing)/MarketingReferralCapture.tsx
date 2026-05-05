'use client'

import { useReferralCapture } from '../../lib/useReferralCapture'

/**
 * Client component that captures UTM/referral params on marketing pages.
 * The (marketing) layout is a Server Component (exports metadata),
 * so we need this thin client wrapper to run the useReferralCapture hook.
 */
export function MarketingReferralCapture() {
  useReferralCapture()
  return null
}
