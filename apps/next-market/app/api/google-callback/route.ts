import { NextRequest, NextResponse } from 'next/server'

/**
 * Google Business Profile OAuth callback — proxies callback to the connect-google Edge function.
 *
 * State format: "userId:encodedReturnPath"
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state') || ''
  const error = url.searchParams.get('error')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.host}`

  // Parse return path from state (format: userId:encodedReturnPath)
  let returnPath = '/profile'
  if (stateRaw) {
    const parts = decodeURIComponent(stateRaw).split(':')
    if (parts[1]) {
      returnPath = decodeURIComponent(parts[1])
    }
  }

  // User cancelled or denied — go back to where they came from
  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}${returnPath}?google=canceled`)
  }

  // Forward to the appropriate edge function for token exchange
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const edgeFnUrl = `${supabaseUrl}/functions/v1/connect-google?code=${encodeURIComponent(code)}&state=${encodeURIComponent(stateRaw)}`

  // Pass Origin header so Edge function knows where to redirect back
  const res = await fetch(edgeFnUrl, {
    method: 'GET',
    headers: {
      Origin: baseUrl,
    },
    redirect: 'manual',
  })

  // The edge function returns a 302 redirect — follow it
  const location = res.headers.get('location')
  if (location) {
    return NextResponse.redirect(location)
  }

  // Fallback
  return NextResponse.redirect(`${baseUrl}${returnPath}`)
}
