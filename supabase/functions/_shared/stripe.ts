/**
 * stripe.ts — Shared Stripe API base URL helper
 *
 * All edge functions that call Stripe API should use getStripeApiBase()
 * instead of hardcoding https://api.stripe.com.
 *
 * In production: STRIPE_API_BASE is not set → defaults to https://api.stripe.com
 * In testing:    STRIPE_API_BASE=http://127.0.0.1:8089 → routes to local simulator
 */

/** Returns the Stripe API base URL (no trailing slash). */
export function getStripeApiBase(): string {
    return (Deno.env.get("STRIPE_API_BASE") || "https://api.stripe.com").replace(/\/$/, "");
}
