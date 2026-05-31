/**
 * connect-google — OAuth flow for connecting Google Business Profile
 *
 * POST: Generates Google OAuth URL (requires auth)
 * GET:  OAuth callback from Google (no auth — state param has user_id)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { getGoogleLocations } from '../_shared/google.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const GOOGLE_CLIENT_ID = env('GOOGLE_CLIENT_ID', true) || 'mock_google_client_id'
  const GOOGLE_CLIENT_SECRET = env('GOOGLE_CLIENT_SECRET', true) || 'mock_google_client_secret'

  if (req.method === 'GET') {
    // ── OAuth Callback ──
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const stateRaw = url.searchParams.get('state') || ''
    const error = url.searchParams.get('error')

    const [userId, returnPath] = stateRaw.split(':')
    const redirectBack = returnPath ? decodeURIComponent(returnPath) : '/profile'

    if (error || !code) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${siteUrl}${redirectBack}?google=canceled` },
      })
    }

    const redirectUri = `${siteUrl}/api/google-callback`

    try {
      let refreshToken = 'mock_refresh_token_xyz'
      let accessToken = 'mock_access_token_xyz'

      const isMockMode = GOOGLE_CLIENT_ID === 'mock_google_client_id'

      if (!isMockMode) {
        // Exchange code for token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
        })

        if (!tokenRes.ok) {
          throw new Error(`Google token exchange failed: ${await tokenRes.text()}`)
        }

        const tokenData = await tokenRes.json()
        refreshToken = tokenData.refresh_token || refreshToken
        accessToken = tokenData.access_token || accessToken
      }

      // Fetch Locations under account
      const locations = await getGoogleLocations(accessToken)

      // Store Google Connection
      await supabase
        .from('seller_google_connections')
        .upsert({
          user_id: userId,
          google_refresh_token: refreshToken,
          status: 'connected',
          updated_at: new Date().toISOString(),
          // Auto-select if only one location verified
          ...(locations.length === 1 ? {
            google_location_id: locations[0].name,
            google_location_name: locations[0].title,
            auto_sync_catalog: true,
            auto_post_specials: true,
          } : {}),
        }, { onConflict: 'user_id' })

      const locationsParam = encodeURIComponent(
        JSON.stringify(locations.map((l) => ({ id: l.name, name: l.title }))),
      )
      const redirectTo = `${siteUrl}${redirectBack}?google=connected&locations=${locationsParam}`

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': redirectTo },
      })

    } catch (err: any) {
      console.error('Google OAuth callback error:', err)
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${siteUrl}${redirectBack}?google=error&msg=${encodeURIComponent(err.message)}` },
      })
    }
  }

  // ── POST: Initiate OAuth ──
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  const userId = auth

  const { return_path } = await req.json().catch(() => ({ return_path: '/profile' }))
  const stateParam = `${userId}:${encodeURIComponent(return_path || '/profile')}`

  const redirectUri = `${siteUrl}/api/google-callback`
  const scope = encodeURIComponent('https://www.googleapis.com/auth/business.manage')
  
  const googleAuthUrl = 
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(stateParam)}`

  return jsonOk({ url: googleAuthUrl }, corsHeaders)
})
