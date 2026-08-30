import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemsParam = searchParams.get('items') || '[]'
  const zipcode = searchParams.get('zipcode') || '95125'
  const returnUrl = searchParams.get('returnUrl') || '/cart'

  const clientId = process.env.KROGER_CLIENT_ID || process.env.NEXT_PUBLIC_KROGER_CLIENT_ID || 'casagrown-bbchvmkv'
  
  // Resolve host for callback
  const origin = req.nextUrl.origin || 'https://casagrown.com'
  const redirectUri = `${origin}/api/kroger/callback`

  const statePayload = {
    items: itemsParam,
    zipcode,
    returnUrl,
    timestamp: Date.now(),
  }

  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

  const krogerAuthUrl = new URL('https://api.kroger.com/v1/connect/oauth2/authorize')
  krogerAuthUrl.searchParams.set('client_id', clientId)
  krogerAuthUrl.searchParams.set('response_type', 'code')
  krogerAuthUrl.searchParams.set('scope', 'cart.basic:write profile.compact')
  krogerAuthUrl.searchParams.set('redirect_uri', redirectUri)
  krogerAuthUrl.searchParams.set('state', state)

  return NextResponse.redirect(krogerAuthUrl.toString())
}
