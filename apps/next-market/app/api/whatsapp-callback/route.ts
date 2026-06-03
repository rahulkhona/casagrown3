import { NextRequest, NextResponse } from 'next/server'

/**
 * WhatsApp Embedded Signup callback — proxies the callback to the connect-whatsapp edge function.
 * Meta redirects here after a seller completes the Embedded Signup flow.
 * Query params: ?code=...&state=... (success) or ?error=... (cancelled/denied).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state') || ''
  const error = url.searchParams.get('error')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'

  // Parse return path from state (format: userId:encodedReturnPath)
  let returnPath = '/pro-manage'
  if (stateRaw) {
    const parts = decodeURIComponent(stateRaw).split(':')
    if (parts[1]) {
      returnPath = decodeURIComponent(parts[1])
    }
  }

  // User cancelled or denied — go back to settings
  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}${returnPath}?wa=canceled`)
  }

  // Forward to connect-whatsapp edge function for token exchange
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const edgeFnUrl = `${supabaseUrl}/functions/v1/connect-whatsapp?code=${encodeURIComponent(code)}&state=${encodeURIComponent(stateRaw)}`

  const res = await fetch(edgeFnUrl, { redirect: 'manual' })

  // The edge function returns a 302 redirect — follow it
  const location = res.headers.get('location')
  if (location) {
    return NextResponse.redirect(location)
  }

  // Fallback
  return NextResponse.redirect(`${baseUrl}${returnPath}?wa=error`)
}
