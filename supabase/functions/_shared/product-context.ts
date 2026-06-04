/**
 * product-context.ts — Product context extraction for webhook handlers
 *
 * When a buyer messages from a product listing (catalog, marketplace, post,
 * wa.me link, or CasaGrown product page), this module extracts the product
 * reference and builds a focused prompt injection so the bot knows exactly
 * which product the buyer is asking about.
 *
 * Supported surfaces:
 *   (a) Facebook Shop / Commerce Catalog  → referral.product.id (= market_products.id)
 *   (b) Instagram Shop / Commerce Catalog → referral.product.id (same catalog)
 *   (c) Facebook Page Post                → reverse lookup via market_products.facebook_post_id
 *   (d) Instagram Post                    → reverse lookup via market_products.instagram_post_id
 *   (e) Google Business Profile Post      → reverse lookup via market_products.google_post_id
 *   (f) Facebook Marketplace Listing      → Graph API fetch → title match or inject raw context
 *   (g) WhatsApp Catalog                  → message.context.referred_product.product_retailer_id
 *   (h) WhatsApp wa.me link (from posts)  → pre-filled text "ref:{productId}"
 *   (i) CasaGrown product page DM         → productId URL param → system message
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ProductContext {
  id: string
  name: string
  price: number
  unit: string
  description: string | null
  boothId: string
  boothName: string | null
  photos: string[]
  inventory: number
  siteUrl: string
}

// ─── Extraction from Messenger webhook events ─────────────────────────────

export interface MessengerReferral {
  productId: string | null
  source: string | null
  rawTitle: string | null  // For Marketplace listings where we can't map to our product
}

/**
 * Extract product referral from a Facebook Messenger webhook event.
 * Handles: catalog items, marketplace listings, m.me links, postbacks, post referrals.
 */
export function extractMessengerReferral(event: any): MessengerReferral {
  let productId: string | null = null
  let source: string | null = null
  let rawTitle: string | null = null

  // 1. Message-level referral (catalog item click, marketplace listing)
  if (event.message?.referral) {
    const ref = event.message.referral
    source = ref.source || null

    // Commerce Catalog: product.id = our retailer_id = market_products.id
    if (ref.product?.id) {
      productId = ref.product.id
    }
    // Marketplace listing: ad_id is the listing ID (not our product ID)
    // We'll try to match later via Graph API or title
    if (!productId && ref.ad_id) {
      source = 'MARKETPLACE'
      // ad_id stored for potential Graph API lookup
    }
  }

  // 2. Top-level referral (m.me link click, ad click, Get Started with ref)
  if (!productId && event.referral) {
    const ref = event.referral
    source = ref.source || source

    if (ref.product?.id) {
      productId = ref.product.id
    }
    // Parse ref parameter for product context (our posts include product:UUID)
    if (!productId && ref.ref) {
      const refMatch = ref.ref.match(/product:([a-f0-9-]+)/i)
      if (refMatch) productId = refMatch[1]
    }
  }

  // 3. Postback referral (Get Started button, persistent menu)
  if (!productId && event.postback?.referral) {
    const ref = event.postback.referral
    source = ref.source || source
    if (ref.product?.id) {
      productId = ref.product.id
    }
  }

  return { productId, source, rawTitle }
}

// ─── Extraction from Instagram webhook events ─────────────────────────────

/**
 * Extract product referral from an Instagram webhook event.
 * Handles: IG Shop items, story mentions with product tags, post referrals.
 */
export function extractInstagramReferral(event: any): MessengerReferral {
  let productId: string | null = null
  let source: string | null = null

  // Message-level referral (IG Shop product tap, story product tag)
  if (event.message?.referral) {
    const ref = event.message.referral
    source = ref.source || 'INSTAGRAM'
    if (ref.product?.id) {
      productId = ref.product.id
    }
  }

  // Top-level referral
  if (!productId && event.referral) {
    source = event.referral.source || 'INSTAGRAM'
    if (event.referral.product?.id) {
      productId = event.referral.product.id
    }
    if (!productId && event.referral.ref) {
      const refMatch = event.referral.ref.match(/product:([a-f0-9-]+)/i)
      if (refMatch) productId = refMatch[1]
    }
  }

  return { productId, source, rawTitle: null }
}

// ─── Extraction from WhatsApp webhook messages ────────────────────────────

export interface WhatsAppProductRef {
  productId: string | null
  source: string | null
  cleanedMessage: string | null  // Message with ref tag stripped
}

/**
 * Extract product referral from a WhatsApp Cloud API message.
 * Handles: catalog product inquiry, order items, referred_product context,
 * and pre-filled wa.me text with "ref:{productId}".
 */
export function extractWhatsAppProductRef(message: any, userMessage: string | null): WhatsAppProductRef {
  let productId: string | null = null
  let source: string | null = null
  let cleanedMessage: string | null = null

  // 1. Interactive product inquiry (buyer tapped product in WA catalog)
  if (message.interactive?.type === 'product_inquiry') {
    productId = message.interactive.product_retailer_id || null
    source = 'WA_CATALOG_INQUIRY'
  }

  // 2. Order from catalog (buyer added item to cart from WA catalog)
  if (!productId && message.order?.product_items?.[0]) {
    productId = message.order.product_items[0].product_retailer_id || null
    source = 'WA_CATALOG_ORDER'
  }

  // 3. Context from viewing a product while messaging
  if (!productId && message.context?.referred_product) {
    productId = message.context.referred_product.product_retailer_id || null
    source = 'WA_REFERRED_PRODUCT'
  }

  // 4. Pre-filled text from wa.me link (our posts include "ref:{productId}")
  if (!productId && userMessage) {
    const refMatch = userMessage.match(/\(ref:([a-f0-9-]+)\)/i)
    if (refMatch) {
      productId = refMatch[1]
      source = 'WA_ME_LINK'
      // Clean the ref tag from the display message
      cleanedMessage = userMessage.replace(/\s*\(ref:[a-f0-9-]+\)/i, '').trim()
    }
  }

  return { productId, source, cleanedMessage }
}

// ─── Product Lookup ───────────────────────────────────────────────────────

/**
 * Look up a product by its ID (direct match — used for catalog items).
 */
export async function lookupProductById(
  supabase: ReturnType<typeof createClient>,
  productId: string,
): Promise<ProductContext | null> {
  const siteUrl = Deno.env.get('SITE_URL') || 'https://casagrown.com'

  const { data: product } = await supabase
    .from('market_products')
    .select('id, name, description, price_usd, unit, inventory, photos, booth_id, market_booths!inner(name)')
    .eq('id', productId)
    .eq('is_deleted', false)
    .single()

  if (!product) return null

  return {
    id: product.id,
    name: product.name,
    price: Number(product.price_usd),
    unit: product.unit,
    description: product.description,
    boothId: product.booth_id,
    boothName: (product as any).market_booths?.name || null,
    photos: product.photos || [],
    inventory: product.inventory,
    siteUrl,
  }
}

/**
 * Reverse-lookup a product by its Facebook post ID.
 */
export async function lookupProductByFbPostId(
  supabase: ReturnType<typeof createClient>,
  fbPostId: string,
): Promise<ProductContext | null> {
  const { data } = await supabase
    .from('market_products')
    .select('id')
    .eq('facebook_post_id', fbPostId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!data) return null
  return lookupProductById(supabase, data.id)
}

/**
 * Reverse-lookup a product by its Instagram post ID.
 */
export async function lookupProductByIgPostId(
  supabase: ReturnType<typeof createClient>,
  igPostId: string,
): Promise<ProductContext | null> {
  const { data } = await supabase
    .from('market_products')
    .select('id')
    .eq('instagram_post_id', igPostId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!data) return null
  return lookupProductById(supabase, data.id)
}

// ─── Prompt Builder ───────────────────────────────────────────────────────

/**
 * Build a system prompt injection describing the product the buyer is asking about.
 * Append this to the end of the existing system prompt.
 */
export function buildProductContextPrompt(product: ProductContext): string {
  return `

PRODUCT THE BUYER IS ASKING ABOUT:
- Name: ${product.name}
- Price: $${product.price.toFixed(2)}/${product.unit}
- Available: ${product.inventory > 0 ? `Yes (${product.inventory} in stock)` : 'Out of stock'}
- Description: ${product.description || 'No description provided'}
- Direct order link: ${product.siteUrl}/market/booth/${product.boothId}/product/${product.id}

IMPORTANT: The buyer initiated this conversation specifically about this product.
- If they say "is this available?" or "how much?" — they mean THIS product.
- Lead with information about THIS product first, then offer to help with other items.
- Always include the direct order link for this product in your response.`
}

/**
 * Smart product matching helper that tokenizes user messages and product names,
 * filters out common stop words, singularizes terms, and matches based on stem overlap.
 */
export function findBestProductMatch(
  userMsg: string,
  products: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  if (!userMsg || !products || products.length === 0) return null

  const cleanMsg = userMsg.toLowerCase()

  // 1. Direct substring check
  for (const p of products) {
    const prodName = p.name.toLowerCase()
    if (cleanMsg.includes(prodName) || prodName.includes(cleanMsg)) {
      return p
    }
  }

  // 2. Tokenized matching with simple stemming (singularization)
  const stopWords = new Set([
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", 
    "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", 
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", 
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", 
    "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", 
    "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", 
    "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", 
    "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", 
    "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", 
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", 
    "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now", 
    "fresh", "organic", "local", "ripe", "delicious", "sweet"
  ])

  const getStems = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .map(w => {
        let stem = w
        if (w.endsWith('ies') && w.length > 3) {
          stem = w.slice(0, -3) + 'y'
        } else if (w.endsWith('es') && w.length > 3) {
          stem = w.slice(0, -2)
        } else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) {
          stem = w.slice(0, -1)
        }
        return stem
      })
      .filter(w => w.length > 2 && !stopWords.has(w))
  }

  const msgStems = getStems(cleanMsg)
  if (msgStems.length === 0) return null

  let bestMatch: typeof products[0] | null = null
  let maxMatches = 0

  for (const p of products) {
    const prodStems = getStems(p.name)
    const matches = prodStems.filter(s => msgStems.includes(s))
    if (matches.length > maxMatches) {
      maxMatches = matches.length
      bestMatch = p
    }
  }

  return bestMatch
}

