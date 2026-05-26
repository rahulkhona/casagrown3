/**
 * facebook.ts — Facebook Graph API helpers
 *
 * Shared utilities for FB OAuth, Catalog API, and Messenger.
 */

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0'

export function getFbGraphUrl(): string {
  return Deno.env.get('FB_GRAPH_URL') || FB_GRAPH_URL
}

/** Exchange short-lived token for long-lived token (~60 days) */
export async function exchangeForLongLivedToken(
  shortToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const appId = Deno.env.get('FACEBOOK_APP_ID')!
  const appSecret = Deno.env.get('FACEBOOK_APP_SECRET')!
  const res = await fetch(
    `${getFbGraphUrl()}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`,
  )
  if (!res.ok) throw new Error(`FB token exchange failed: ${await res.text()}`)
  return res.json()
}

/** Get user's Facebook pages with long-lived page tokens */
export async function getUserPages(
  userToken: string,
): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const res = await fetch(
    `${getFbGraphUrl()}/me/accounts?access_token=${userToken}&fields=id,name,access_token`,
  )
  if (!res.ok) throw new Error(`FB pages fetch failed: ${await res.text()}`)
  const data = await res.json()
  return data.data || []
}

/** Upsert products to a FB catalog via the batch API */
export async function upsertCatalogProducts(
  catalogId: string,
  products: Array<{
    retailer_id: string; name: string; description: string;
    price: number; currency: string; url: string; image_url: string;
    availability: string; brand: string; condition: string; category: string;
  }>,
  token: string,
): Promise<void> {
  const requests = products.map((p) => ({
    method: 'CREATE',
    retailer_id: p.retailer_id,
    data: {
      name: p.name,
      description: p.description,
      price: `${(p.price * 100).toFixed(0)} USD`,
      url: p.url,
      image_url: p.image_url,
      availability: p.availability,
      brand: p.brand,
      condition: p.condition,
      google_product_category: p.category,
    },
  }))

  const res = await fetch(`${getFbGraphUrl()}/${catalogId}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, requests }),
  })
  if (!res.ok) throw new Error(`FB batch upsert failed: ${await res.text()}`)
}

/** Delete a product from a catalog */
export async function deleteCatalogProduct(
  catalogId: string,
  retailerId: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${getFbGraphUrl()}/${catalogId}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      requests: [{ method: 'DELETE', retailer_id: retailerId }],
    }),
  })
  if (!res.ok) console.warn(`FB product delete failed: ${await res.text()}`)
}

/** Send a Messenger reply via the Send API */
export async function sendMessengerMessage(
  pageToken: string,
  recipientId: string,
  message: { text?: string; attachment?: unknown },
): Promise<void> {
  if (pageToken.startsWith('mock_')) {
    console.log(`[MOCK FB MESSAGE] Sent to ${recipientId} via pageToken ${pageToken}:`, JSON.stringify(message))
    return
  }

  const res = await fetch(`${getFbGraphUrl()}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: pageToken,
      recipient: { id: recipientId },
      message,
      messaging_type: 'RESPONSE',
    }),
  })
  if (!res.ok) console.error(`Messenger send failed: ${await res.text()}`)
}

/** Publish a post to a Facebook Page feed */
export async function publishPagePost(
  pageId: string,
  pageToken: string,
  options: {
    message: string
    link?: string
    photoUrl?: string  // If provided, creates a photo post (higher engagement)
  },
): Promise<{ id: string } | null> {
  const graphUrl = getFbGraphUrl()

  try {
    if (options.photoUrl) {
      // Photo post (with link in message body)
      const messageWithLink = options.link
        ? `${options.message}\n${options.link}`
        : options.message

      const res = await fetch(`${graphUrl}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: pageToken,
          url: options.photoUrl,
          message: messageWithLink,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`FB photo post failed: ${errText}`)
        throw new Error(errText)
      }
      return res.json()
    } else {
      // Link post
      const body: Record<string, string> = {
        access_token: pageToken,
        message: options.message,
      }
      if (options.link) body.link = options.link

      const res = await fetch(`${graphUrl}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`FB page post failed: ${errText}`)
        throw new Error(errText)
      }
      return res.json()
    }
  } catch (err: any) {
    console.error(`[FB] publishPagePost error: ${err.message}`)
    throw err
  }
}

/**
 * Publish a multi-photo post to a Facebook Page.
 *
 * Uses Facebook's multi-photo API:
 *   1. Upload each photo as unpublished via /{page-id}/photos?published=false
 *   2. Create feed post with attached_media[] referencing each photo's fbid
 *
 * Falls back to single photo post if only 1 image.
 */
export async function publishMultiPhotoPost(
  pageId: string,
  pageToken: string,
  options: {
    message: string
    photoUrls: string[]   // Array of image URLs (up to 10)
    link?: string         // Optional link (included in message text since photo posts suppress link cards)
  },
): Promise<{ id: string } | null> {
  const graphUrl = getFbGraphUrl()

  if (options.photoUrls.length === 0) {
    // No photos — fall back to text/link post
    return publishPagePost(pageId, pageToken, {
      message: options.message,
      link: options.link,
    })
  }

  if (options.photoUrls.length === 1) {
    // Single photo — use simple photo post
    return publishPagePost(pageId, pageToken, {
      message: options.message,
      photoUrl: options.photoUrls[0],
      link: options.link,
    })
  }

  try {
    // Step 1: Upload each photo as unpublished
    const photoIds: string[] = []

    for (const url of options.photoUrls.slice(0, 10)) {
      const res = await fetch(`${graphUrl}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: pageToken,
          url,
          published: false,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.warn(`[FB] Failed to upload photo ${url}: ${errText}`)
        continue // Skip failed photos, don't abort entire post
      }

      const data = await res.json()
      if (data.id) photoIds.push(data.id)
    }

    if (photoIds.length === 0) {
      throw new Error('All photo uploads failed')
    }

    // Step 2: Create feed post with attached_media
    const body: Record<string, unknown> = {
      access_token: pageToken,
      message: options.message,
    }

    // attached_media is an array of { media_fbid: "id" }
    photoIds.forEach((id, i) => {
      body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })
    })

    const res = await fetch(`${graphUrl}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`FB multi-photo post failed: ${errText}`)
      throw new Error(errText)
    }

    const result = await res.json()
    console.log(`[FB] Multi-photo post published: ${result.id} (${photoIds.length} photos)`)
    return result

  } catch (err: any) {
    console.error(`[FB] publishMultiPhotoPost error: ${err.message}`)
    throw err
  }
}
