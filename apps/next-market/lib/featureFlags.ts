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
const isMobile = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export const ENABLE_SOCIAL_LOGIN =
  (typeof window !== 'undefined' && (window as any).NATIVE_SUPPORTS_SOCIAL_LOGIN === true) ||
  (process.env.NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN === 'true') ||
  (typeof window !== 'undefined' && window.localStorage.getItem('enable_social_login') === 'true')

