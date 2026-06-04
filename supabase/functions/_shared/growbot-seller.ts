/**
 * growbot-seller.ts — Seller-specific GrowBot context builder
 *
 * Used by Messenger webhook, widget-chat, and auto-reply-seller-chat
 * to build a focused system prompt for AI-powered product Q&A.
 *
 * Includes seller biography, per-booth bot instructions, fulfillment
 * windows, and escalation detection for SMS alerts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface SellerContext {
  sellerName: string
  sellerBio: string | null
  businessCredentials: {
    businessType: string | null
    businessLicense: string | null
    foodHandlerPermit: string | null
    cottageFoodPermit: string | null
    insuranceProvider: string | null
  }
  boothName: string
  boothId: string
  botInstructions: string | null
  products: Array<{
    id: string; name: string; description: string | null;
    price: number; unit: string; inventory: number;
    category: string; photos: string[];
  }>
  fulfillment: {
    offersDelivery: boolean; offersPickup: boolean;
    deliveryRadius: number | null;
    deliveryZipcodes: string[] | null;
    pickupAddress: string | null;
    deliveryWindows: unknown; pickupWindows: unknown;
    fulfillmentWindows: Array<{
      day: string; startTime: string; endTime: string;
      type: string; label: string | null;
    }>;
  }
  otherBooths: Array<{ id: string; name: string }>
  siteUrl: string
}

export interface EscalationResult {
  escalate: boolean
  reason: string | null
}

export interface BoothSummary {
  id: string
  name: string
  offersPickup: boolean
  offersDelivery: boolean
  pickupAddress: string | null
  pickupDisplayAddress: string | null
  deliveryRadius: number | null
  deliveryZipcodes: string[] | null
  productCount: number
  productNames: string[]
}

/** Load all open booths for a seller (for multi-booth routing) */
export async function loadAllSellerBooths(
  supabase: ReturnType<typeof createClient>,
  sellerId: string,
): Promise<BoothSummary[]> {
  const { data: booths } = await supabase
    .from('market_booths')
    .select(`
      id, name, offers_pickup, offers_delivery,
      pickup_address, pickup_display_address,
      delivery_radius_miles, delivery_zipcodes
    `)
    .eq('owner_id', sellerId)
    .eq('is_open', true)
    .order('is_default', { ascending: false })

  if (!booths || booths.length === 0) return []

  // Get product counts and names per booth
  const boothIds = booths.map((b: any) => b.id)
  const { data: products } = await supabase
    .from('market_products')
    .select('booth_id, name')
    .in('booth_id', boothIds)
    .eq('is_active', true)
    .eq('is_deleted', false)

  const productsByBooth = new Map<string, string[]>()
  for (const p of (products || []) as any[]) {
    const list = productsByBooth.get(p.booth_id) || []
    list.push(p.name)
    productsByBooth.set(p.booth_id, list)
  }

  return booths.map((b: any) => ({
    id: b.id,
    name: b.name,
    offersPickup: !!b.offers_pickup,
    offersDelivery: !!b.offers_delivery,
    pickupAddress: b.pickup_address,
    pickupDisplayAddress: b.pickup_display_address,
    deliveryRadius: b.delivery_radius_miles,
    deliveryZipcodes: b.delivery_zipcodes,
    productCount: (productsByBooth.get(b.id) || []).length,
    productNames: (productsByBooth.get(b.id) || []).slice(0, 5),
  }))
}

/** Load seller booth context from Supabase */
export async function loadBoothContext(
  supabase: ReturnType<typeof createClient>,
  boothId: string,
): Promise<SellerContext | null> {
  const { data: rawBooth } = await supabase
    .from('market_booths')
    .select(`
      id, name, owner_id, bot_instructions,
      offers_delivery, offers_pickup,
      delivery_radius_miles, pickup_address, pickup_display_address,
      delivery_windows, pickup_windows, delivery_zipcodes
    `)
    .eq('id', boothId)
    .single()

  const booth = rawBooth as any
  if (!booth) return null

  const { data: rawProfile } = await supabase
    .from('profiles')
    .select('full_name, farm_name, seller_bio, business_type, business_license, food_handler_permit, cottage_food_permit, insurance_provider, bot_instructions')
    .eq('id', booth.owner_id)
    .single()

  const profile = rawProfile as any
  const profileBotInstructions = profile?.bot_instructions || null

  const { data: products } = await supabase
    .from('market_products')
    .select('id, name, description, price_usd, unit, inventory, category, photos')
    .eq('booth_id', boothId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('created_at')

  // Fetch structured fulfillment windows
  const { data: fWindows } = await supabase
    .from('booth_fulfillment_windows')
    .select('day_of_week, start_time, end_time, fulfillment_type, label')
    .eq('booth_id', boothId)
    .order('day_of_week')

  // Fetch other booths by same seller (for cross-referral)
  const { data: otherBooths } = await supabase
    .from('market_booths')
    .select('id, name')
    .eq('owner_id', booth.owner_id)
    .neq('id', boothId)
    .eq('is_open', true)

  const siteUrl = Deno.env.get('SITE_URL') || 'https://casagrown.com'

  // Merge profile-level and booth-level bot instructions
  // Profile instructions (Manage Features) take priority as global override
  const mergedInstructions = [profileBotInstructions, booth.bot_instructions]
    .filter(Boolean)
    .join('\n\n')

  return {
    sellerName: profile?.farm_name || profile?.full_name || 'the seller',
    sellerBio: profile?.seller_bio || null,
    businessCredentials: {
      businessType: profile?.business_type || null,
      businessLicense: profile?.business_license || null,
      foodHandlerPermit: profile?.food_handler_permit || null,
      cottageFoodPermit: profile?.cottage_food_permit || null,
      insuranceProvider: profile?.insurance_provider || null,
    },
    boothName: booth.name,
    boothId: booth.id,
    botInstructions: mergedInstructions || null,
    products: (products || []).map((p: any) => ({
      id: p.id, name: p.name, description: p.description,
      price: Number(p.price_usd), unit: p.unit,
      inventory: p.inventory, category: p.category,
      photos: p.photos || [],
    })),
    fulfillment: {
      offersDelivery: booth.offers_delivery,
      offersPickup: booth.offers_pickup,
      deliveryRadius: booth.delivery_radius_miles,
      deliveryZipcodes: booth.delivery_zipcodes,
      pickupAddress: booth.pickup_display_address || booth.pickup_address,
      deliveryWindows: booth.delivery_windows,
      pickupWindows: booth.pickup_windows,
      fulfillmentWindows: (fWindows || []).map((w: any) => ({
        day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w.day_of_week] || `Day ${w.day_of_week}`,
        startTime: w.start_time,
        endTime: w.end_time,
        type: w.fulfillment_type,
        label: w.label,
      })),
    },
    otherBooths: (otherBooths || []).map((b: any) => ({ id: b.id, name: b.name })),
    siteUrl,
  }
}

/** Load admin-managed universal seller bot rules from DB */
export async function loadSellerBotRules(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data } = await supabase
    .from('growbot_seller_rules')
    .select('rule_text')
    .eq('is_active', true)
    .order('created_at')

  return (data || []).map((r: any) => r.rule_text)
}

/** Build a credentials section for the bot prompt if any credentials exist */
function buildCredentialsSection(creds: SellerContext['businessCredentials']): string {
  const lines: string[] = []
  if (creds.businessType) lines.push(`Business Type: ${creds.businessType}`)
  if (creds.businessLicense) lines.push(`Business License: ${creds.businessLicense}`)
  if (creds.foodHandlerPermit) lines.push(`Food Handler Permit: ${creds.foodHandlerPermit}`)
  if (creds.cottageFoodPermit) lines.push(`Cottage Food Permit: ${creds.cottageFoodPermit}`)
  if (creds.insuranceProvider) lines.push(`Insurance Provider: ${creds.insuranceProvider}`)
  if (lines.length === 0) return ''
  return `\nSELLER CREDENTIALS & CERTIFICATIONS:\n${lines.join('\n')}`
}

/** Build a system prompt for seller-specific GrowBot */
export function buildSellerSystemPrompt(ctx: SellerContext, rules?: string[]): string {
  const productList = ctx.products
    .map(
      (p) =>
        `- ${p.name}: $${p.price.toFixed(2)}/${p.unit} (${p.inventory} available) — ${p.description || 'No description'}\n  Order link: ${ctx.siteUrl}/market/booth/${ctx.boothId}/product/${p.id}`,
    )
    .join('\n')

  const deliveryZipsStr = ctx.fulfillment.deliveryZipcodes && ctx.fulfillment.deliveryZipcodes.length > 0
    ? ctx.fulfillment.deliveryZipcodes.join(', ')
    : 'None specified'

  const fulfillmentInfo = [
    ctx.fulfillment.offersDelivery
      ? `Delivery: Offers Local Delivery
  - Delivery Radius: within ${ctx.fulfillment.deliveryRadius || '?'} miles
  - Delivery Base Address (Farm Address): ${ctx.fulfillment.pickupAddress || 'None specified'}
  - Delivery Zipcodes: ${deliveryZipsStr}`
      : null,
    ctx.fulfillment.offersPickup
      ? `Pickup: ${ctx.fulfillment.pickupAddress || 'Address on request'}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const windowsInfo = ctx.fulfillment.fulfillmentWindows.length > 0
    ? ctx.fulfillment.fulfillmentWindows
        .map(w => `- ${w.day} ${w.startTime}–${w.endTime} (${w.type}${w.label ? `: ${w.label}` : ''})`)
        .join('\n')
    : 'Contact seller for schedule.'

  const otherBoothsInfo = ctx.otherBooths.length > 0
    ? ctx.otherBooths
        .map(b => `- "${b.name}": ${ctx.siteUrl}/market/booth/${b.id}`)
        .join('\n')
    : null

  // Build the dynamic context sections
  let prompt = `You are GrowBot 🤖, an AI assistant responding on behalf of ${ctx.sellerName}. Always introduce yourself clearly as "GrowBot, responding on behalf of ${ctx.sellerName}" in your first message. Be warm, helpful, and knowledgeable about their products.

SELLER CONTEXT: ${ctx.sellerName}'s farm stand "${ctx.boothName}" on CasaGrown.
${ctx.sellerBio ? `\nABOUT THE SELLER:\n${ctx.sellerBio}` : ''}
${buildCredentialsSection(ctx.businessCredentials)}
${ctx.botInstructions ? `\nSELLER'S CUSTOM INSTRUCTIONS:\n${ctx.botInstructions}` : ''}

AVAILABLE PRODUCTS:
${productList || 'No products currently listed.'}

FULFILLMENT OPTIONS:
${fulfillmentInfo || 'Contact seller for fulfillment details.'}

SCHEDULE / FULFILLMENT WINDOWS:
${windowsInfo}
${otherBoothsInfo ? `\nOTHER BOOTHS BY THIS SELLER:\n${otherBoothsInfo}` : ''}

ORDERING:
To place an order, direct buyers to: ${ctx.siteUrl}/market/booth/${ctx.boothId}

RESPONSE GUIDELINES:
- You are GrowBot, responding on behalf of ${ctx.sellerName}. Always speak from that persona.
- Never tell the buyer to "message the seller directly through CasaGrown" or "contact the seller" to check delivery or ask questions. Since you are GrowBot representing the seller in this chat, they are already chatting with the seller! If you cannot answer a complex question, simply state what you know and say you will notify the seller to get back to them.
- When suggesting purchase links or URLs, look at our SCHEDULE / FULFILLMENT WINDOWS (delivery and pickup dates/times) above and mention them clearly to the buyer so they know when they can expect to receive or pick up their order.
- If the buyer asks about delivery:
  1. Check if the buyer's zip code is explicitly listed under Delivery Zipcodes above. If it is in the list, confirm delivery is available (say yes/confirm) and send a direct link to purchase from the booth: ${ctx.siteUrl}/market/booth/${ctx.boothId}
  2. If their zip code is NOT in the list, or if no zip codes are specified: Clearly state our local delivery radius (e.g. 5 miles) relative to our base farm address ("${ctx.fulfillment.pickupAddress || 'our farm address'}"), provide a link to the booth or product, and ask them to verify whether their home falls within that delivery radius.
- If the buyer asks about a specific product you have: you MUST confirm availability, state the exact inventory quantity available, state the price, and include the specific product's direct order link (e.g., ${ctx.siteUrl}/market/booth/${ctx.boothId}/product/[product-id]). Do NOT use the generic booth URL when a specific product link is available.
- If the buyer asks about the quantity of a product or how much/many you have: you MUST check the inventory number listed under AVAILABLE PRODUCTS below and state the exact quantity available in your reply.
- If the buyer asks about something you DON'T carry, say so clearly and suggest similar items if available.
- Always include the relevant direct product link or booth link when directing buyers to order.
- Keep responses concise but helpful.
- DO NOT output any internal thoughts, reasoning, explanations, or '<thought>' tags in your response. Stick strictly to the final customer-facing response.
- Keep the response brief, and ensure it is less than 2048 characters in total.`

  // Append admin-managed universal rules
  if (rules && rules.length > 0) {
    prompt += '\n\nRULES (follow strictly):\n'
    rules.forEach(r => { prompt += `- ${r}\n` })
  }

  return prompt
}

/** Detect escalation signals in the bot's response */
export function detectEscalation(botReply: string): EscalationResult {
  const hasEscalateTag = botReply.includes('[ESCALATE]')

  // Also detect implicit escalation patterns
  const implicitPatterns = [
    /let me connect you with/i,
    /i('m| am) not (sure|able)/i,
    /i don'?t have (that|enough) information/i,
    /please (contact|reach out to|message)/i,
    /speak (with|to) (the |)(seller|owner)/i,
    /human|operator|representative|agent|real person/i,
  ]

  const implicitMatch = implicitPatterns.some(p => p.test(botReply))

  if (hasEscalateTag || implicitMatch) {
    return {
      escalate: true,
      reason: hasEscalateTag ? 'explicit_escalation_tag' : 'implicit_escalation_pattern',
    }
  }

  return { escalate: false, reason: null }
}

/** Strip the [ESCALATE] tag from the response before sending to the customer */
export function cleanBotReply(reply: string): string {
  return reply.replace(/\s*\[ESCALATE\]\s*/g, '').trim()
}
