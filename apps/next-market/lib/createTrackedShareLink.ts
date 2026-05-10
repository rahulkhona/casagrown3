'use client'

/**
 * createTrackedShareLink — Generates a short, tracked share link.
 *
 * 1. Appends UTM parameters to the base URL based on share context + platform
 * 2. Calls /api/crm/short-links to create a casagrown.com/r/{token} short link
 * 3. Falls back to the raw URL (with UTMs) if short link creation fails
 */

export type ShareContext =
  | 'community_invite'
  | 'chat_message_share'
  | 'following_invite'
  | 'market_invite'
  | 'product_share'
  | 'booth_share'
  | 'new_product_share'
  | 'onboarding_share'
  | 'pioneer_invite'
  | 'market_closed_invite'
  | 'helper_invite'
  | 'booth_invitation'
  | 'buy_request'

export type SharePlatform = 'sms' | 'whatsapp' | 'nextdoor' | 'facebook' | 'copy' | 'email' | 'native'

/**
 * Build a destination URL with UTM params appended.
 * Preserves any existing query params (like ?ref=userId).
 */
function buildUtmUrl(
  baseUrl: string,
  context: ShareContext,
  platform: SharePlatform,
  userId?: string,
): string {
  try {
    // Handle relative URLs by prepending origin
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'
    const url = new URL(baseUrl, origin)

    url.searchParams.set('utm_source', platform)
    url.searchParams.set('utm_medium', 'social_share')
    url.searchParams.set('utm_campaign', context)
    if (userId) {
      url.searchParams.set('utm_content', userId)
    }

    return url.toString()
  } catch {
    // If URL parsing fails, return raw URL
    return baseUrl
  }
}

/**
 * Create a tracked, short share link.
 *
 * @returns Short URL like casagrown.com/r/abc123, or falls back to UTM-tagged raw URL on failure.
 */
export async function createTrackedShareLink(
  baseUrl: string,
  context: ShareContext,
  platform: SharePlatform,
  userId?: string,
): Promise<string> {
  const destinationUrl = buildUtmUrl(baseUrl, context, platform, userId)

  try {
    const res = await fetch('/api/crm/short-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination_url: destinationUrl,
        label: `${context}:${platform}`,
      }),
    })

    if (!res.ok) {
      console.warn('[TrackedLink] Short link API failed, using raw URL', res.status)
      return destinationUrl
    }

    const data = await res.json()
    return data.short_url || destinationUrl
  } catch (err) {
    console.warn('[TrackedLink] Short link creation failed, using raw URL', err)
    return destinationUrl
  }
}
