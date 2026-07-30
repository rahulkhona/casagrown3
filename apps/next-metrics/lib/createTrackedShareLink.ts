'use client'

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
  | string

export type SharePlatform = 'sms' | 'whatsapp' | 'nextdoor' | 'facebook' | 'copy' | 'email' | 'native'

function buildUtmUrl(
  baseUrl: string,
  context: ShareContext,
  platform: SharePlatform,
  userId?: string,
): string {
  try {
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
    return baseUrl
  }
}

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
      return destinationUrl
    }

    const data = await res.json()
    return data.short_url || destinationUrl
  } catch {
    return destinationUrl
  }
}
