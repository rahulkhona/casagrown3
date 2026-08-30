import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const KROGER_CLIENT_ID = process.env.KROGER_CLIENT_ID || process.env.NEXT_PUBLIC_KROGER_CLIENT_ID || 'casagrown-bbchvmkv'
const KROGER_CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET || ''

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  let origin = req.nextUrl.origin || 'https://casagrown.com'
  if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
    origin = origin.replace('http://', 'https://')
  }
  const redirectUri = `${origin}/api/kroger/callback`

  if (error || !code) {
    console.warn('[Kroger OAuth] Callback error or cancelled:', error)
    return NextResponse.redirect(`${origin}/cart?kroger_error=${encodeURIComponent(error || 'cancelled')}`)
  }

  let state: { items?: string; zipcode?: string; returnUrl?: string } = {}
  try {
    if (stateParam) {
      state = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8'))
    }
  } catch (e) {
    console.warn('[Kroger OAuth] Failed to parse state:', e)
  }

  let itemsList: Array<{ name: string; quantity: number; unit?: string; price_usd?: number }> = []
  try {
    if (state.items) {
      itemsList = typeof state.items === 'string' ? JSON.parse(state.items) : state.items
    }
  } catch (e) {
    console.warn('[Kroger OAuth] Failed to parse items:', e)
  }

  const cleanZip = (state.zipcode || '95125').trim().substring(0, 5)

  try {
    // 1. Exchange code for user access token
    const authHeader = Buffer.from(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`).toString('base64')
    const tokenResp = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenResp.ok) {
      const errText = await tokenResp.text()
      console.error('[Kroger OAuth] Token exchange failed:', errText)
      return NextResponse.redirect(`${origin}/cart?kroger_error=token_exchange_failed`)
    }

    const tokenData = await tokenResp.json()
    const userAccessToken = tokenData.access_token

    if (!userAccessToken) {
      return NextResponse.redirect(`${origin}/cart?kroger_error=missing_access_token`)
    }

    // 2. Find closest Kroger location to get correct UPCs
    let locationId = '01400452' // Fallback
    let bannerName = 'Kroger'
    try {
      const locResp = await fetch(
        `https://api.kroger.com/v1/locations?filter.zipCode.near=${encodeURIComponent(cleanZip)}&filter.limit=1`,
        { headers: { Authorization: `Bearer ${userAccessToken}`, Accept: 'application/json' } }
      )
      if (locResp.ok) {
        const locData = await locResp.json()
        if (locData.data?.[0]?.locationId) {
          locationId = locData.data[0].locationId
          bannerName = locData.data[0].name || locData.data[0].chain || 'Kroger'
        }
      }
    } catch {}

    // 3. Resolve UPCs for all items
    const upcItems: Array<{ upc: string; quantity: number }> = []
    let calculatedGmv = 0

    for (const it of itemsList) {
      const sanitized = it.name
        .replace(/\b(fresh|homegrown|backyard|organic|local|sweet|ripe)\b/gi, '')
        .trim() || it.name.trim()

      try {
        const prodResp = await fetch(
          `https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(sanitized)}&filter.locationId=${locationId}&filter.limit=1`,
          { headers: { Authorization: `Bearer ${userAccessToken}`, Accept: 'application/json' } }
        )
        if (prodResp.ok) {
          const prodData = await prodResp.json()
          const prod = prodData.data?.[0]
          if (prod?.upc) {
            upcItems.push({
              upc: prod.upc,
              quantity: Math.max(1, Number(it.quantity) || 1),
            })
            const price = Number(prod.items?.[0]?.price?.promo || prod.items?.[0]?.price?.regular || it.price_usd || 2.50)
            calculatedGmv += price * (Number(it.quantity) || 1)
            continue
          }
        }
      } catch (err) {
        console.warn(`[Kroger OAuth] Product search failed for ${it.name}:`, err)
      }

      // If specific lookup failed, we still track estimated value
      calculatedGmv += (Number(it.price_usd) || 2.50) * (Number(it.quantity) || 1)
    }

    // 4. Add items to Kroger cart
    if (upcItems.length > 0) {
      try {
        const addResp = await fetch('https://api.kroger.com/v1/cart/add', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: upcItems }),
        })
        if (!addResp.ok && addResp.status !== 204) {
          console.warn('[Kroger OAuth] Cart add failed:', await addResp.text())
        }
      } catch (addErr) {
        console.error('[Kroger OAuth] Error calling cart/add:', addErr)
      }
    }

    // 5. Log transfer event to database
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        await supabase.from('commercial_cart_transfers').insert({
          session_id: `kroger_oauth_${Date.now()}`,
          partner: 'kroger',
          banner: bannerName,
          zip_code: cleanZip,
          total_usd: Math.round(calculatedGmv * 100) / 100,
          item_count: itemsList.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
          items: itemsList.map(i => ({
            name: i.name,
            quantity: Number(i.quantity) || 1,
            unit: i.unit || 'lb',
            price_usd: Number(i.price_usd) || 0,
            total_usd: Math.round(((Number(i.price_usd) || 0) * (Number(i.quantity) || 1)) * 100) / 100,
          })),
        })
      } catch (dbErr) {
        console.warn('[Kroger OAuth] Database logging failed:', dbErr)
      }
    }

    // 6. Redirect user to Kroger cart page
    return NextResponse.redirect('https://www.kroger.com/cart')
  } catch (err: any) {
    console.error('[Kroger OAuth] Fatal callback error:', err)
    return NextResponse.redirect(`${origin}/cart?kroger_error=unexpected_error`)
  }
}
