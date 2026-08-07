/**
 * Feature Flags
 *
 * NEXT_PUBLIC_ENABLE_PRO — controls visibility of Pro marketing UI
 * (upsell carousel, interest email, "CasaGrown Pro" menu link).
 * Default: true (visible). Set to 'false' to hide globally.
 *
 * NEXT_PUBLIC_ENABLE_ELITE — controls visibility of Elite tier
 * (Instagram, WhatsApp, Google Business features).
 * Default: false (hidden until Meta approves permissions).
 *
 * Pro *functional* features (Facebook sync, catalog, multi-stand) are already
 * gated behind useSubscription/useAuth isPro — they only appear for users
 * with active subscriptions. These flags control the *marketing* surfaces.
 */
export const ENABLE_PRO = process.env.NEXT_PUBLIC_ENABLE_PRO === 'true'
export const ENABLE_ELITE = process.env.NEXT_PUBLIC_ENABLE_ELITE === 'true'

export const isSocialLoginEnabled = () => {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('enable_social_login')
      if (stored === 'true') return true
      if (stored === 'false') return false
    } catch {}
  }
  return process.env.NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN !== 'false'
}

export const ENABLE_SOCIAL_LOGIN = isSocialLoginEnabled()
