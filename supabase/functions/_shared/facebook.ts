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
    method: 'UPDATE',
    retailer_id: p.retailer_id,
    data: {
      name: p.name,
      description: p.description,
      price: Math.round(p.price * 100),
      currency: p.currency || 'USD',
      url: p.url,
      image_url: p.image_url,
      availability: p.availability,
      brand: p.brand,
      condition: p.condition,
      category: p.category || 'food & beverages > fresh fruits & vegetables',
    },
  }))

  const res = await fetch(`${getFbGraphUrl()}/${catalogId}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, requests, allow_upsert: true }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`FB batch upsert failed: ${body}`)
  
  // Check for validation errors in the response
  try {
    const parsed = JSON.parse(body)
    if (parsed.validation_status) {
      const errors = parsed.validation_status.filter((s: any) => s.errors?.length > 0)
      if (errors.length > 0) {
        console.error('[FB CATALOG] Validation errors:', JSON.stringify(errors))
        throw new Error(`FB catalog validation errors: ${JSON.stringify(errors)}`)
      }
    }
  } catch (e: any) {
    if (e.message.includes('validation errors')) throw e
  }
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

/** Get a buyer's basic Facebook profile details using their PSID */
export async function getFbUserProfile(
  psid: string,
  pageToken: string,
): Promise<{ first_name?: string; last_name?: string; profile_pic?: string } | null> {
  if (pageToken.startsWith('mock_')) {
    return { first_name: 'Neighbor', last_name: 'Test' }
  }
  try {
    const res = await fetch(
      `${getFbGraphUrl()}/${psid}?access_token=${pageToken}&fields=first_name,last_name,profile_pic`,
    )
    if (!res.ok) {
      console.warn(`[FB] User profile fetch failed: ${await res.text()}`)
      return null
    }
    return res.json()
  } catch (err: any) {
    console.error('[FB] getFbUserProfile error:', err.message)
    return null
  }
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

/**
 * Scans outgoing text for CasaGrown booth or product URLs, and appends Messenger tracking query parameters.
 */
export function appendMessengerParamsToUrls(
  text: string | undefined,
  psid: string,
  pageId: string,
): string {
  if (!text) return ''
  const siteUrl = Deno.env.get('SITE_URL') || 'https://casagrown.com'
  
  const domains = [siteUrl, 'https://casagrown.com', 'http://localhost:3000', 'http://localhost:3002']
  let textResult = text

  for (const domain of domains) {
    const domainEscaped = domain.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regex = new RegExp(`(${domainEscaped}/market/booth/[a-zA-Z0-9-]+(?:/product/[a-zA-Z0-9-]+)?)`, 'g')
    textResult = textResult.replace(regex, (url) => {
      const separator = url.includes('?') ? '&' : '?'
      return `${url}${separator}fb_psid=${psid}&fb_page_id=${pageId}&fb_channel=messenger`
    })
  }
  
  return textResult
}

/** Discovers linked IG Business Account via GET /{page-id}?fields=instagram_business_account */
export async function getInstagramBusinessAccount(
  pageId: string,
  pageToken: string,
): Promise<{ id: string; username?: string } | null> {
  try {
    const res = await fetch(
      `${getFbGraphUrl()}/${pageId}?fields=instagram_business_account&access_token=${pageToken}`,
    )
    if (!res.ok) {
      console.warn(`[FB-IG] Discovers IG account failed: ${await res.text()}`)
      return null
    }
    const data = await res.json()
    if (data.instagram_business_account) {
      const igId = data.instagram_business_account.id
      // Fetch username
      const userRes = await fetch(
        `${getFbGraphUrl()}/${igId}?fields=username&access_token=${pageToken}`,
      )
      const username = userRes.ok ? (await userRes.json()).username : null
      return { id: igId, username }
    }
    return null
  } catch (err: any) {
    console.error('[FB-IG] getInstagramBusinessAccount error:', err.message)
    return null
  }
}

/** Publish a post to Instagram (Single Image) */
export async function publishInstagramPost(
  igAccountId: string,
  token: string,
  options: {
    caption: string
    imageUrl: string
  },
): Promise<{ id: string }> {
  // Step 1: Create media container
  const containerRes = await fetch(`${getFbGraphUrl()}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      image_url: options.imageUrl,
      caption: options.caption,
    }),
  })
  if (!containerRes.ok) {
    throw new Error(`IG media container creation failed: ${await containerRes.text()}`)
  }
  const container = await containerRes.json()

  // Step 2: Publish media container
  const publishRes = await fetch(`${getFbGraphUrl()}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      creation_id: container.id,
    }),
  })
  if (!publishRes.ok) {
    throw new Error(`IG media publish failed: ${await publishRes.text()}`)
  }
  return publishRes.json()
}

/** Publish a dynamic Reels/Video post to Instagram */
export async function publishInstagramVideoPost(
  igAccountId: string,
  token: string,
  options: {
    caption: string
    videoUrl: string
  },
): Promise<{ id: string }> {
  // Step 1: Create media container for Video/Reels
  const containerRes = await fetch(`${getFbGraphUrl()}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      media_type: 'REELS',
      video_url: options.videoUrl,
      caption: options.caption,
    }),
  })
  if (!containerRes.ok) {
    throw new Error(`IG Reels container creation failed: ${await containerRes.text()}`)
  }
  const container = await containerRes.json()

  // Step 2: Wait for video processing on Meta servers
  let status = 'IN_PROGRESS'
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const statusRes = await fetch(
      `${getFbGraphUrl()}/${container.id}?fields=status_code&access_token=${token}`,
    )
    if (statusRes.ok) {
      const data = await statusRes.json()
      status = data.status_code
      if (status === 'FINISHED' || status === 'READY') break
    }
  }

  // Step 3: Publish container
  const publishRes = await fetch(`${getFbGraphUrl()}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      creation_id: container.id,
    }),
  })
  if (!publishRes.ok) {
    throw new Error(`IG Reels publish failed: ${await publishRes.text()}`)
  }
  return publishRes.json()
}

/** Publish a multi-image carousel post to Instagram */
export async function publishInstagramCarousel(
  igAccountId: string,
  token: string,
  options: {
    caption: string
    imageUrls: string[]
  },
): Promise<{ id: string }> {
  if (options.imageUrls.length <= 1) {
    return publishInstagramPost(igAccountId, token, {
      caption: options.caption,
      imageUrl: options.imageUrls[0] || '',
    })
  }

  // Step 1: Create container for each image item (is_carousel_item = true)
  const itemIds: string[] = []
  for (const url of options.imageUrls.slice(0, 10)) {
    const itemRes = await fetch(`${getFbGraphUrl()}/${igAccountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        image_url: url,
        is_carousel_item: true,
      }),
    })
    if (itemRes.ok) {
      const data = await itemRes.json()
      if (data.id) itemIds.push(data.id)
    }
  }

  if (itemIds.length === 0) {
    throw new Error('All carousel item creations failed')
  }

  // Step 2: Create parent carousel container
  const containerRes = await fetch(`${getFbGraphUrl()}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      media_type: 'CAROUSEL',
      children: itemIds,
      caption: options.caption,
    }),
  })
  if (!containerRes.ok) {
    throw new Error(`IG carousel container creation failed: ${await containerRes.text()}`)
  }
  const container = await containerRes.json()

  // Step 3: Publish carousel container
  const publishRes = await fetch(`${getFbGraphUrl()}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      creation_id: container.id,
    }),
  })
  if (!publishRes.ok) {
    throw new Error(`IG carousel publish failed: ${await publishRes.text()}`)
  }
  return publishRes.json()
}

/** Send Instagram DM reply via the Send API */
export async function sendInstagramMessage(
  pageToken: string,
  recipientId: string,
  message: { text?: string; attachment?: unknown },
): Promise<void> {
  if (pageToken.startsWith('mock_')) {
    console.log(`[MOCK IG MESSAGE] Sent to ${recipientId} via pageToken ${pageToken}:`, JSON.stringify(message))
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
  if (!res.ok) console.error(`Instagram DM send failed: ${await res.text()}`)
}

/** Send WhatsApp message via Cloud API */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  token: string,
  recipientPhone: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  if (token.startsWith('mock_')) {
    console.log(`[MOCK WA MESSAGE] Sent to ${recipientPhone} via ID ${phoneNumberId}:`, message)
    return { success: true }
  }

  // Ensure recipient phone is formatted correctly (strip leading + for WhatsApp Cloud API)
  const cleanPhone = recipientPhone.replace('+', '')

  const res = await fetch(`${getFbGraphUrl()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: message },
    }),
  })

  if (res.ok) return { success: true }
  const errText = await res.text()
  console.error(`WhatsApp send failed: ${errText}`)
  return { success: false, error: errText }
}

/** Send WhatsApp template message */
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  token: string,
  recipientPhone: string,
  templateName: string,
  languageCode = 'en_US',
  components: any[] = [],
): Promise<{ success: boolean; error?: string }> {
  if (token.startsWith('mock_')) {
    console.log(`[MOCK WA TEMPLATE] Sent to ${recipientPhone} via ID ${phoneNumberId}: ${templateName}`)
    return { success: true }
  }

  const cleanPhone = recipientPhone.replace('+', '')

  const res = await fetch(`${getFbGraphUrl()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }),
  })

  if (res.ok) return { success: true }
  const errText = await res.text()
  console.error(`WhatsApp template send failed: ${errText}`)
  return { success: false, error: errText }
}

