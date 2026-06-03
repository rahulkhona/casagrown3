import { NextRequest, NextResponse } from 'next/server'

/**
 * Facebook/WhatsApp OAuth callback — proxies callbacks to the appropriate edge function.
 *
 * Facebook OAuth:  state = "userId:encodedReturnPath" → connect-facebook
 * WhatsApp Embedded Signup: state = "wa:userId:encodedReturnPath" → connect-whatsapp
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state') || ''
  const error = url.searchParams.get('error')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'

  // Detect WhatsApp Embedded Signup flow (state starts with "wa:")
  const isWhatsApp = stateRaw.startsWith('wa:')
  const effectiveState = isWhatsApp ? stateRaw.slice(3) : stateRaw // strip "wa:" prefix

  // Parse return path from state (format: userId:encodedReturnPath)
  let returnPath = isWhatsApp ? '/pro-manage' : '/profile'
  if (effectiveState) {
    const parts = decodeURIComponent(effectiveState).split(':')
    if (parts[1]) {
      returnPath = decodeURIComponent(parts[1])
    }
  }

  // User cancelled or denied — go back to where they came from
  if (error || !code) {
    const param = isWhatsApp ? 'wa=canceled' : 'fb=canceled'
    return NextResponse.redirect(`${baseUrl}${returnPath}?${param}`)
  }

  // Forward to the appropriate edge function for token exchange
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const edgeFn = isWhatsApp ? 'connect-whatsapp' : 'connect-facebook'
  const edgeFnUrl = `${supabaseUrl}/functions/v1/${edgeFn}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(effectiveState)}`

  const res = await fetch(edgeFnUrl, { redirect: 'manual' })

  // The edge function returns a 302 redirect — follow it
  const location = res.headers.get('location')
  if (location) {
    return NextResponse.redirect(location)
  }

  // Fallback
  return NextResponse.redirect(`${baseUrl}${returnPath}`)
}

