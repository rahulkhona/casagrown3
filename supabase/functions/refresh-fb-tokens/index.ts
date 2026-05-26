/**
 * refresh-fb-tokens — Cron job to refresh expiring Facebook access tokens
 *
 * POST /functions/v1/refresh-fb-tokens
 * Auth: service_role key (invoked by pg_cron or scheduled job)
 *
 * Refreshes tokens expiring within the next 7 days.
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { exchangeForLongLivedToken } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth

  // Find connections with tokens expiring within 7 days
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString()

  const { data: connections, error } = await supabase
    .from('seller_fb_connections')
    .select('id, user_id, fb_access_token, fb_token_expires_at, status')
    .eq('status', 'connected')
    .lt('fb_token_expires_at', sevenDaysFromNow)
    .not('fb_access_token', 'is', null)

  if (error) {
    console.error('[FB-TOKEN] Failed to query connections:', error)
    return jsonError('Failed to query connections', corsHeaders)
  }

  if (!connections || connections.length === 0) {
    return jsonOk({ refreshed: 0, message: 'No tokens need refresh' }, corsHeaders)
  }

  let refreshed = 0
  let failed = 0

  for (const conn of connections) {
    try {
      const result = await exchangeForLongLivedToken(conn.fb_access_token)
      const newExpiry = new Date(Date.now() + result.expires_in * 1000).toISOString()

      await supabase
        .from('seller_fb_connections')
        .update({
          fb_access_token: result.access_token,
          fb_token_expires_at: newExpiry,
          status: 'connected',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id)

      console.log(`[FB-TOKEN] Refreshed token for user ${conn.user_id}, expires ${newExpiry}`)
      refreshed++
    } catch (err: any) {
      console.error(`[FB-TOKEN] Failed to refresh token for user ${conn.user_id}:`, err.message)

      await supabase
        .from('seller_fb_connections')
        .update({
          status: 'token_expired',
          last_error: `Token refresh failed: ${err.message}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id)

      // Notify user
      await supabase.from('notifications').insert({
        user_id: conn.user_id,
        content: '⚠️ Your Facebook connection needs to be re-authorized. Please reconnect from your profile.',
        link_url: '/profile',
      })

      failed++
    }
  }

  return jsonOk({
    refreshed,
    failed,
    total: connections.length,
  }, corsHeaders)
})
