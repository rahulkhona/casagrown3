/**
 * connect-facebook — OAuth flow for connecting Facebook Pages
 *
 * POST: Generates Facebook OAuth URL (requires auth)
 * GET:  OAuth callback from Facebook (no auth — state param has user_id)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { exchangeForLongLivedToken, getUserPages, getInstagramBusinessAccount } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const FACEBOOK_APP_ID = env('FACEBOOK_APP_ID', true)!
  const FACEBOOK_APP_SECRET = env('FACEBOOK_APP_SECRET', true)!

  if (req.method === 'GET') {
    // ── OAuth Callback ──
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const stateRaw = url.searchParams.get('state') || ''

    // Handle user declining permissions (Not Now)
    const error = url.searchParams.get('error')
    if (error || !code) {
      // Extract return path from state if available
      const [, returnPathEncoded] = (stateRaw || '').split(':')
      const redirectBack = returnPathEncoded ? decodeURIComponent(returnPathEncoded) : '/profile'
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${siteUrl}${redirectBack}?fb=canceled` },
      })
    }

    // State format: userId:returnPath
    const [userId, returnPath] = stateRaw.split(':')
    const redirectBack = returnPath ? decodeURIComponent(returnPath) : '/profile'
    const redirectUri = `${siteUrl}/api/facebook-callback` // Your app's redirect handler

    try {
      // Exchange code for access token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `client_id=${FACEBOOK_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${FACEBOOK_APP_SECRET}` +
        `&code=${code}`,
      )

      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`)
      const tokenData = await tokenRes.json()

      // Exchange for long-lived token
      const longLived = await exchangeForLongLivedToken(tokenData.access_token)

      // Get user's pages
      const pages = await getUserPages(longLived.access_token)

      // Store connection
      const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString()

      // Auto-detect linked Instagram Business Account
      let igData: { id: string; username?: string } | null = null
      if (pages.length === 1 && pages[0].access_token) {
        igData = await getInstagramBusinessAccount(pages[0].id, pages[0].access_token)
        if (igData) console.log(`[CONNECT-FB] Detected IG Business Account: ${igData.id} (@${igData.username})`)
      }

      await supabase
        .from('seller_fb_connections')
        .upsert({
          user_id: userId,
          fb_access_token: longLived.access_token,
          fb_token_expires_at: expiresAt,
          status: 'connected',
          updated_at: new Date().toISOString(),
          // If only one page, auto-select it
          ...(pages.length === 1 ? {
            fb_page_id: pages[0].id,
            fb_page_name: pages[0].name,
            fb_page_access_token: pages[0].access_token,
          } : {}),
          // Store IG Business Account if detected
          ...(igData ? {
            ig_business_account_id: igData.id,
            ig_username: igData.username || null,
          } : {}),
        }, { onConflict: 'user_id' })

      // Redirect back to profile with page info
      const pagesParam = encodeURIComponent(
        JSON.stringify(pages.map((p) => ({ id: p.id, name: p.name }))),
      )
      const redirectTo = `${siteUrl}${redirectBack}?fb=connected&pages=${pagesParam}`

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': redirectTo },
      })
    } catch (err: any) {
      console.error('Facebook OAuth callback error:', err)
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${siteUrl}${redirectBack}?fb=error&msg=${encodeURIComponent(err.message)}` },
      })
    }
  }

  // ── POST: Initiate OAuth ──
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  const userId = auth

  const { return_path } = await req.json().catch(() => ({ return_path: '/profile' }))
  const stateParam = `${userId}:${encodeURIComponent(return_path || '/profile')}`

  const redirectUri = `${siteUrl}/api/facebook-callback`
  const scopes = [
    'pages_show_list',
    'pages_manage_posts',
    'pages_messaging',
    'pages_read_engagement',
    'catalog_management',
    'instagram_basic',
    'instagram_manage_messages',
  ].join(',')
  const fbAuthUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(stateParam)}` +
    `&scope=${scopes}`

  return jsonOk({ url: fbAuthUrl }, corsHeaders)
})
