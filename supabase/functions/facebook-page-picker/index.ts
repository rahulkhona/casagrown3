/**
 * facebook-page-picker — Selects which FB Page to use for catalog sync
 *
 * POST /functions/v1/facebook-page-picker
 * Body: { page_id: string, page_name: string }
 * Auth: Bearer token (user JWT)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { getUserPages } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  const userId = auth

  if (userId === 'service_role') {
    return jsonError('User auth required', corsHeaders, 403)
  }

  const { page_id, page_name } = await req.json()

  if (!page_id) {
    return jsonError('page_id is required', corsHeaders, 400)
  }

  // Get seller's FB connection
  const { data: conn, error: connErr } = await supabase
    .from('seller_fb_connections')
    .select('id, fb_access_token')
    .eq('user_id', userId)
    .single()

  if (connErr || !conn) {
    return jsonError('Facebook not connected. Please connect first.', corsHeaders, 400)
  }

  // Verify the page belongs to the user and get page access token
  let pageAccessToken: string | null = null

  try {
    const pages = await getUserPages(conn.fb_access_token)
    const selectedPage = pages.find((p) => p.id === page_id)

    if (!selectedPage) {
      return jsonError('Page not found in your Facebook account', corsHeaders, 400)
    }

    pageAccessToken = selectedPage.access_token
  } catch (err: any) {
    console.error('Failed to verify FB page:', err.message)
    return jsonError('Failed to verify Facebook page', corsHeaders)
  }

  // Update connection with selected page
  const { error: updateErr } = await supabase
    .from('seller_fb_connections')
    .update({
      fb_page_id: page_id,
      fb_page_name: page_name,
      fb_page_access_token: pageAccessToken,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateErr) {
    return jsonError('Failed to save page selection', corsHeaders)
  }

  // Create booth_fb_catalogs entries for all user's booths
  const { data: booths } = await supabase
    .from('market_booths')
    .select('id')
    .eq('owner_id', userId)

  if (booths && booths.length > 0) {
    for (const booth of booths) {
      await supabase
        .from('booth_fb_catalogs')
        .upsert({
          booth_id: booth.id,
          connection_id: conn.id,
          sync_enabled: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'booth_id' })
    }
  }

  return jsonOk({
    success: true,
    page_id,
    page_name,
    booths_linked: booths?.length || 0,
  }, corsHeaders)
})
