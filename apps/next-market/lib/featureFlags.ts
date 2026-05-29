/**
 * Feature Flags
 *
 * NEXT_PUBLIC_ENABLE_PRO — controls visibility of Pro marketing UI
 * (upsell carousel, interest email, "CasaGrown Pro" menu link).
 * Default: false (hidden). Set to 'true' to enable globally.
 *
 * Pro *functional* features (Facebook sync, catalog, multi-stand) are already
 * gated behind useSubscription/useAuth isPro — they only appear for users
 * with active subscriptions. This flag controls the *marketing* surfaces.
 */
export const ENABLE_PRO = process.env.NEXT_PUBLIC_ENABLE_PRO !== 'false'

