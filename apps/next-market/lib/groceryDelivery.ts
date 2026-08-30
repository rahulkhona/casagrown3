'use client'

/**
 * groceryDelivery.ts
 * Canonical single source of truth for Instacart, Kroger, and commercial grocery integrations.
 * Supports single-crop deep linking, multi-item shopping cart transfers, category-aware store routing,
 * proximity checking, and affiliate/lead tracking.
 */

import { createClient } from './supabase'

export interface GroceryItem {
  name: string
  quantity: number
  unit: string
  estimatedPriceUsd?: number
  price_usd?: number
  provider?: 'instacart' | 'kroger'
}

export interface PartnerStoreDisplay {
  categoryType: 'produce' | 'garden_supplies' | 'specialty'
  instacartStoresPill: string
  instacartDescription: string
}

export interface KrogerProximityResult {
  available: boolean
  banner: string
  chain?: string
  distanceMiles?: number
  locationId?: string
  address?: {
    addressLine1?: string
    city?: string
    state?: string
    zipCode?: string
  }
}

// Configurable affiliate IDs (can be overridden via environment variables)
const INSTACART_AFFILIATE_ID = process.env.NEXT_PUBLIC_INSTACART_AFFILIATE_ID || ''
const KROGER_AFFILIATE_ID = process.env.NEXT_PUBLIC_KROGER_AFFILIATE_ID || ''

const GARDEN_SUPPLY_KEYWORDS = [
  'soil',
  'compost',
  'fertilizer',
  'pot',
  'seed',
  'seeds',
  'mulch',
  'planter',
  'perlite',
  'peat',
  'worm castings',
  'tool',
  'trowel',
  'hose',
]

/**
 * Resolves the partner store display badges and descriptions based on item keywords.
 */
export function getPartnerStoreDisplay(itemName: string): PartnerStoreDisplay {
  const lower = (itemName || '').toLowerCase()
  const isGardenSupply = GARDEN_SUPPLY_KEYWORDS.some((kw) => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i')
    return regex.test(lower)
  })

  if (isGardenSupply) {
    return {
      categoryType: 'garden_supplies',
      instacartStoresPill: "Home Depot • Lowe's • Ace Hardware",
      instacartDescription: 'Same-day garden supplies & soil delivery',
    }
  }

  return {
    categoryType: 'produce',
    instacartStoresPill: 'Sprouts • Safeway • ALDI • Whole Foods',
    instacartDescription: 'Same-day fresh supermarket produce delivery',
  }
}

/**
 * Strips superfluous adjectives and marketing decorators from product names for clean store searches.
 */
export function sanitizeGroceryName(name: string): string {
  return (name || '')
    .replace(/\s*\(.*?\)/g, '') // remove parentheticals like (Instacart Supermarket)
    .replace(/\b(fresh|homegrown|backyard|organic|local|sweet|ripe)\b/gi, '')
    .trim()
}

/**
 * Builds an Instacart search / store URL for a specific produce or garden item.
 */
export function getInstacartItemUrl(itemName: string, zipcode: string): string {
  const cleanZip = (zipcode || '').trim().substring(0, 5)
  const sanitized = sanitizeGroceryName(itemName) || itemName.trim()
  const cleanQuery = encodeURIComponent(sanitized)
  
  let url = `https://www.instacart.com/store/s?k=${cleanQuery}`
  if (cleanZip) {
    url += `&zipcode=${cleanZip}`
  }
  
  // Attach partner / affiliate parameters
  url += `&utm_source=casagrown&utm_medium=partner&utm_campaign=market_want`
  if (INSTACART_AFFILIATE_ID) {
    url += `&partner_id=${encodeURIComponent(INSTACART_AFFILIATE_ID)}`
  }
  
  return url
}

/**
 * Builds an Instacart search URL for single or multiple transferred cart items.
 */
export function getInstacartMultiItemUrl(items: GroceryItem[], zipcode: string): string {
  const cleanZip = (zipcode || '').trim().substring(0, 5)
  const itemNames = items
    .map((i) => sanitizeGroceryName(i.name) || i.name)
    .filter(Boolean)

  const query = itemNames.length > 0 ? itemNames.join(' ') : 'fresh produce'
  const cleanQuery = encodeURIComponent(query)

  let url = `https://www.instacart.com/store/s?k=${cleanQuery}`
  if (cleanZip) {
    url += `&zipcode=${cleanZip}`
  }

  return url
}

/**
 * Builds a Kroger direct search / store URL for a specific produce item.
 */
export function getKrogerItemUrl(produceName: string, zipcode: string): string {
  const sanitized = sanitizeGroceryName(produceName) || produceName.trim()
  const cleanProduce = encodeURIComponent(sanitized)
  let url = `https://www.kroger.com/search?query=${cleanProduce}&fulfillment=all`
  
  if (KROGER_AFFILIATE_ID) {
    url += `&cid=${encodeURIComponent(KROGER_AFFILIATE_ID)}`
  }
  
  return url
}

/**
 * Builds Kroger 3-legged OAuth authorize URL with encoded items payload.
 */
export function getKrogerAuthorizeUrl(items: GroceryItem[], zipcode: string, returnUrl = '/cart'): string {
  const cleanZip = (zipcode || '95125').trim().substring(0, 5)
  const payload = items.map(i => ({
    name: sanitizeGroceryName(i.name) || i.name,
    quantity: i.quantity || 1,
    unit: i.unit || 'lb',
    price_usd: i.price_usd || i.estimatedPriceUsd || 0,
  }))

  return `/api/kroger/authorize?items=${encodeURIComponent(JSON.stringify(payload))}&zipcode=${encodeURIComponent(cleanZip)}&returnUrl=${encodeURIComponent(returnUrl)}`
}

/**
 * Returns regional Kroger store family banner name based on state / ZIP.
 */
export function getRegionalKrogerBanner(stateOrZip: string): string {
  const upper = (stateOrZip || '').toUpperCase().trim()
  
  if (
    upper.startsWith('90') ||
    upper.startsWith('91') ||
    upper.startsWith('92') ||
    upper.startsWith('93') ||
    upper.startsWith('94') ||
    upper.startsWith('95') ||
    upper.startsWith('96') ||
    upper === 'CA' ||
    upper === 'CA_SOUTH' ||
    upper === 'CA_NORTH'
  ) {
    return 'Ralphs'
  }
  if (upper.startsWith('98') || upper.startsWith('99') || upper === 'WA' || upper === 'OR') {
    return 'Fred Meyer / QFC'
  }
  if (upper.startsWith('85') || upper.startsWith('86') || upper === 'AZ') {
    return "Fry's Food Stores"
  }
  if (upper.startsWith('80') || upper.startsWith('81') || upper === 'CO') {
    return 'King Soopers'
  }
  if (upper.startsWith('75') || upper.startsWith('76') || upper.startsWith('77') || upper === 'TX') {
    return 'Kroger'
  }
  if (upper.startsWith('30') || upper.startsWith('31') || upper === 'GA') {
    return 'Kroger'
  }
  return 'Kroger'
}

/**
 * Checks if a Kroger banner store exists within the specified radius of a ZIP code.
 */
export async function checkKrogerProximity(zipcode: string, radiusMiles = 15): Promise<KrogerProximityResult> {
  const cleanZip = (zipcode || '95125').trim().substring(0, 5)
  const cacheKey = `casagrown_kroger_prox_${cleanZip}_${radiusMiles}`
  
  try {
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch {}

  const defaultBanner = getRegionalKrogerBanner(cleanZip)

  try {
    const supabase = createClient()
    if (supabase?.functions?.invoke) {
      const { data, error } = await supabase.functions.invoke('kroger-service', {
        body: {
          action: 'check-proximity',
          zipcode: cleanZip,
          radiusMiles,
        },
      })

      if (!error && data && data.available !== undefined) {
        const result: KrogerProximityResult = {
          available: !!data.available,
          banner: data.banner || defaultBanner,
          chain: data.chain,
          distanceMiles: data.distanceMiles,
          locationId: data.locationId,
          address: data.address,
        }
        try { sessionStorage.setItem(cacheKey, JSON.stringify(result)) } catch {}
        return result
      }
    }
  } catch (err) {
    console.warn('[checkKrogerProximity] API check error:', err)
  }

  // Fallback: West Coast & traditional Kroger regions considered available by default
  const isKrogerRegion = ['9', '8', '7', '4', '3', '6'].some(p => cleanZip.startsWith(p))
  const fallbackResult: KrogerProximityResult = {
    available: isKrogerRegion,
    banner: defaultBanner,
    distanceMiles: 3.5,
  }
  try { sessionStorage.setItem(cacheKey, JSON.stringify(fallbackResult)) } catch {}
  return fallbackResult
}

/**
 * Records commercial transfer lead event with GMV and itemized payload to database.
 */
export async function recordCommercialTransfer(params: {
  partner: 'kroger' | 'instacart'
  banner?: string
  zipcode?: string
  items: GroceryItem[]
  total_usd: number
  sessionId?: string
  userId?: string
}): Promise<void> {
  try {
    const supabase = createClient()
    const payload = {
      session_id: params.sessionId || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('crm_session_id') : null) || `sess_${Date.now()}`,
      user_id: params.userId || null,
      partner: params.partner,
      banner: params.banner || (params.partner === 'instacart' ? 'Instacart Delivery' : 'Kroger'),
      zip_code: (params.zipcode || '95125').trim().substring(0, 5),
      total_usd: Math.round(params.total_usd * 100) / 100,
      item_count: params.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
      items: params.items.map(i => ({
        name: sanitizeGroceryName(i.name) || i.name,
        quantity: Number(i.quantity) || 1,
        unit: i.unit || 'lb',
        price_usd: Number(i.price_usd || i.estimatedPriceUsd || 0),
        total_usd: Math.round(((Number(i.price_usd || i.estimatedPriceUsd || 0)) * (Number(i.quantity) || 1)) * 100) / 100,
      })),
    }

    await supabase.from('commercial_cart_transfers').insert(payload)
  } catch (err) {
    console.warn('[recordCommercialTransfer] Tracking error:', err)
  }
}
