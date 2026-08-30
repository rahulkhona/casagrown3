import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { getKrogerToken } from '../sync-produce-benchmarks/index.ts'

export interface KrogerLocation {
  locationId: string
  name: string
  chain: string
  distance?: number
  address?: {
    addressLine1?: string
    city?: string
    state?: string
    zipCode?: string
  }
}

export interface KrogerProductMatch {
  searchTerm: string
  upc: string
  name: string
  price_usd: number
  unit: string
  found: boolean
}

serveWithCors(async (req, { env, corsHeaders }) => {
  const KROGER_CLIENT_ID = env('KROGER_CLIENT_ID') || ''
  const KROGER_CLIENT_SECRET = env('KROGER_CLIENT_SECRET') || ''
  const isMock = env('AI_MOCK') === 'true' || env('SKIP_AI') === 'true'

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', corsHeaders, 405)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid JSON body', corsHeaders, 400)
  }

  const { action } = body

  // ─────────────────────────────────────────────────────────────
  // Action 1: check-proximity (Check if Kroger banner is within radius)
  // ─────────────────────────────────────────────────────────────
  if (action === 'check-proximity') {
    const zipcode = (body.zipcode || '').trim().substring(0, 5)
    const radiusMiles = Number(body.radiusMiles) || 15

    if (!zipcode) {
      return jsonError('Missing zipcode', corsHeaders, 400)
    }

    if (isMock || (!KROGER_CLIENT_ID && !KROGER_CLIENT_SECRET)) {
      // Mock response for tests/local development
      const isWestCoastOrMidwest = ['9', '8', '7', '4', '3'].some(p => zipcode.startsWith(p))
      if (isWestCoastOrMidwest) {
        return jsonOk({
          available: true,
          locationId: '01400452',
          banner: zipcode.startsWith('9') ? 'Ralphs' : 'Kroger',
          chain: 'KROGER',
          distanceMiles: 2.4,
          address: { addressLine1: '123 Market St', city: 'Local City', state: 'CA', zipCode: zipcode },
        }, corsHeaders)
      }
      return jsonOk({ available: false, reason: 'No Kroger banner within radius' }, corsHeaders)
    }

    const token = await getKrogerToken(KROGER_CLIENT_ID, KROGER_CLIENT_SECRET)
    if (!token) {
      return jsonOk({ available: false, error: 'Could not obtain Kroger API token' }, corsHeaders)
    }

    try {
      const resp = await fetch(
        `https://api.kroger.com/v1/locations?filter.zipCode.near=${encodeURIComponent(zipcode)}&filter.radiusInMiles=${radiusMiles}&filter.limit=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      )

      if (!resp.ok) {
        return jsonOk({ available: false, reason: 'Location lookup failed' }, corsHeaders)
      }

      const data = await resp.json()
      const location = data.data?.[0]

      if (!location || !location.locationId) {
        return jsonOk({ available: false, reason: 'No Kroger location found within radius' }, corsHeaders)
      }

      // Resolve friendly banner name (Ralphs, Fred Meyer, King Soopers, etc.)
      const rawChain = (location.chain || location.name || 'Kroger').toUpperCase()
      let friendlyBanner = 'Kroger'
      if (rawChain.includes('RALPHS')) friendlyBanner = 'Ralphs'
      else if (rawChain.includes('FRED MEYER')) friendlyBanner = 'Fred Meyer'
      else if (rawChain.includes('KING SOOPERS')) friendlyBanner = 'King Soopers'
      else if (rawChain.includes('FRY')) friendlyBanner = "Fry's"
      else if (rawChain.includes('QFC')) friendlyBanner = 'QFC'
      else if (rawChain.includes('DILLONS')) friendlyBanner = 'Dillons'
      else if (rawChain.includes('SMITH')) friendlyBanner = "Smith's"
      else if (location.name) friendlyBanner = location.name

      return jsonOk({
        available: true,
        locationId: location.locationId,
        banner: friendlyBanner,
        chain: location.chain || friendlyBanner,
        distanceMiles: location.distance != null ? Number(location.distance) : undefined,
        address: location.address,
      }, corsHeaders)
    } catch (e: any) {
      console.warn('[kroger-service] Location check error:', e)
      return jsonOk({ available: false, error: e?.message }, corsHeaders)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Action 2: search-products-by-location (Get UPCs and shelf prices)
  // ─────────────────────────────────────────────────────────────
  if (action === 'search-products-by-location') {
    const { locationId, items } = body

    if (!locationId || !Array.isArray(items) || items.length === 0) {
      return jsonError('Missing locationId or items array', corsHeaders, 400)
    }

    if (isMock || (!KROGER_CLIENT_ID && !KROGER_CLIENT_SECRET)) {
      const mockResults: KrogerProductMatch[] = items.map((name: string, i: number) => ({
        searchTerm: name,
        upc: `00000000040${10 + i}`,
        name: `${name} (Fresh)`,
        price_usd: 2.49 + i * 0.5,
        unit: 'lb',
        found: true,
      }))
      return jsonOk({ matches: mockResults }, corsHeaders)
    }

    const token = await getKrogerToken(KROGER_CLIENT_ID, KROGER_CLIENT_SECRET)
    if (!token) {
      return jsonError('Could not obtain Kroger API token', corsHeaders, 500)
    }

    const matches: KrogerProductMatch[] = []

    for (const rawName of items) {
      const sanitized = String(rawName || '')
        .replace(/\b(fresh|homegrown|backyard|organic|local|sweet|ripe)\b/gi, '')
        .trim() || String(rawName || '').trim()

      try {
        const prodResp = await fetch(
          `https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(sanitized)}&filter.locationId=${encodeURIComponent(locationId)}&filter.limit=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        )

        if (!prodResp.ok) {
          matches.push({
            searchTerm: rawName,
            upc: '',
            name: rawName,
            price_usd: 0,
            unit: 'each',
            found: false,
          })
          continue
        }

        const prodData = await prodResp.json()
        const item = prodData.data?.[0]

        if (!item || !item.upc) {
          matches.push({
            searchTerm: rawName,
            upc: '',
            name: rawName,
            price_usd: 0,
            unit: 'each',
            found: false,
          })
          continue
        }

        const priceObj = item.items?.[0]?.price
        const price = priceObj?.promo || priceObj?.regular || 0
        const soldBy = item.items?.[0]?.soldBy || 'UNIT'
        const unit = soldBy.toLowerCase() === 'weight' ? 'lb' : 'each'

        matches.push({
          searchTerm: rawName,
          upc: item.upc,
          name: item.description || rawName,
          price_usd: Number(price) || 0,
          unit,
          found: true,
        })
      } catch (err) {
        console.warn(`[kroger-service] Product search error for ${rawName}:`, err)
        matches.push({
          searchTerm: rawName,
          upc: '',
          name: rawName,
          price_usd: 0,
          unit: 'each',
          found: false,
        })
      }
    }

    return jsonOk({ matches }, corsHeaders)
  }

  // ─────────────────────────────────────────────────────────────
  // Action 3: add-to-cart (Push items to user's Kroger cart)
  // ─────────────────────────────────────────────────────────────
  if (action === 'add-to-cart') {
    const { userToken, items } = body

    if (!userToken || !Array.isArray(items) || items.length === 0) {
      return jsonError('Missing userToken or items array', corsHeaders, 400)
    }

    if (isMock) {
      return jsonOk({ success: true, addedCount: items.length, mock: true }, corsHeaders)
    }

    try {
      const cartResp = await fetch('https://api.kroger.com/v1/cart/add', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          items: items.map((i: any) => ({
            upc: String(i.upc),
            quantity: Number(i.quantity) || 1,
          })),
        }),
      })

      if (!cartResp.ok && cartResp.status !== 204) {
        const errorText = await cartResp.text()
        return jsonError(`Kroger Cart API error: ${errorText}`, corsHeaders, cartResp.status)
      }

      return jsonOk({ success: true, addedCount: items.length }, corsHeaders)
    } catch (e: any) {
      console.error('[kroger-service] Cart add error:', e)
      return jsonError(e?.message || 'Failed to add items to Kroger cart', corsHeaders, 500)
    }
  }

  return jsonError(`Unknown action: ${action}`, corsHeaders, 400)
})
