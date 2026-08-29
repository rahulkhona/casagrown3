'use client'

/**
 * groceryDelivery.ts
 * Canonical single source of truth for Instacart, Kroger, and commercial grocery integrations.
 * Supports single-crop deep linking, multi-item shopping cart transfers, category-aware store routing, and affiliate tracking.
 */

export interface GroceryItem {
  name: string
  quantity: number
  unit: string
  estimatedPriceUsd?: number
  provider?: 'instacart' | 'kroger'
}

export interface PartnerStoreDisplay {
  categoryType: 'produce' | 'garden_supplies' | 'specialty'
  instacartStoresPill: string
  instacartDescription: string
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
 * Builds an Instacart search / store URL for a specific produce or garden item.
 */
export function getInstacartItemUrl(itemName: string, zipcode: string): string {
  const cleanZip = (zipcode || '').trim().substring(0, 5)
  // Sanitize item name by trimming extraneous marketing buzzwords
  const sanitized = itemName
    .replace(/\b(fresh|homegrown|backyard|organic|local|sweet|ripe)\b/gi, '')
    .trim() || itemName.trim()

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
 * Builds an Instacart multi-item recipe / shoppable cart bundle URL.
 */
export function getInstacartMultiItemUrl(items: GroceryItem[], zipcode: string): string {
  const cleanZip = (zipcode || '').trim().substring(0, 5)
  const ingredientNames = items.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(',')
  
  let url = `https://www.instacart.com/store/partner_recipe?title=CasaGrown+Produce+List&ingredients=${encodeURIComponent(ingredientNames)}`
  if (cleanZip) {
    url += `&zipcode=${cleanZip}`
  }
  
  url += `&utm_source=casagrown&utm_medium=partner&utm_campaign=cart_transfer`
  if (INSTACART_AFFILIATE_ID) {
    url += `&partner_id=${encodeURIComponent(INSTACART_AFFILIATE_ID)}`
  }
  
  return url
}

/**
 * Builds a Kroger direct search / store URL for a specific produce item.
 */
export function getKrogerItemUrl(produceName: string, zipcode: string): string {
  const sanitized = produceName
    .replace(/\b(fresh|homegrown|backyard|organic|local|sweet|ripe)\b/gi, '')
    .trim() || produceName.trim()

  const cleanProduce = encodeURIComponent(sanitized)
  let url = `https://www.kroger.com/search?query=${cleanProduce}&fulfillment=all`
  
  if (KROGER_AFFILIATE_ID) {
    url += `&cid=${encodeURIComponent(KROGER_AFFILIATE_ID)}`
  }
  
  return url
}

/**
 * Returns regional Kroger store family banner name based on state / ZIP.
 */
export function getRegionalKrogerBanner(stateOrZip: string): string {
  const upper = (stateOrZip || '').toUpperCase().trim()
  
  if (upper.startsWith('90') || upper.startsWith('91') || upper.startsWith('92') || upper.startsWith('93') || upper === 'CA_SOUTH') {
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
