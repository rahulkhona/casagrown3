/**
 * publish-fb-post — Publish queued posts to Facebook Pages
 *
 * Called by:
 *   - pg_cron every 5 minutes (picks up approved posts)
 *   - Admin moderation UI (when admin approves a CasaGrown page post)
 *   - Manual trigger with { postId: uuid }
 *
 * POST body (optional):
 *   { postId?: string }  — publish a specific post (bypasses batch)
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { publishPagePost, publishMultiPhotoPost } from '../_shared/facebook.ts'

const MAX_BATCH = 10  // Process at most 10 posts per invocation
const MAX_SELLER_PAGE_PER_DAY = 3
const MAX_CASAGROWN_PAGE_PER_DAY = 10

serveWithCors(async (req, { supabase, corsHeaders }) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const specificPostId = body.postId

  let postsToPublish: any[] = []

  if (specificPostId) {
    // Publish a specific post (admin approved it)
    const { data, error } = await supabase
      .from('fb_post_queue')
      .select('*')
      .eq('id', specificPostId)
      .eq('status', 'approved')
      .single()

    if (error || !data) {
      return jsonError('Post not found or not in approved status', 404, corsHeaders)
    }
    postsToPublish = [data]
  } else {
    // Batch: pick up all approved posts, oldest first
    const { data } = await supabase
      .from('fb_post_queue')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .limit(MAX_BATCH)

    postsToPublish = data || []
  }

  if (postsToPublish.length === 0) {
    return jsonOk({ published: 0, message: 'No posts to publish' }, corsHeaders)
  }

  let published = 0
  let failed = 0
  const results: Array<{ id: string; status: string; fb_post_id?: string; error?: string }> = []

  for (const post of postsToPublish) {
    try {
      let pageId: string
      let pageToken: string

      if (post.target === 'seller_page') {
        // Get seller's page token
        const { data: conn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_id, fb_page_access_token')
          .eq('user_id', post.seller_id)
          .eq('status', 'connected')
          .single()

        if (!conn?.fb_page_id || !conn?.fb_page_access_token) {
          throw new Error('Seller FB connection not found or missing page token')
        }

        // Rate limit check
        const { data: todayCount } = await supabase.rpc('fb_post_count_today', {
          p_seller_id: post.seller_id,
          p_target: 'seller_page',
        })
        if ((todayCount || 0) >= MAX_SELLER_PAGE_PER_DAY) {
          throw new Error(`Rate limit: seller has ${todayCount} posts today (max ${MAX_SELLER_PAGE_PER_DAY})`)
        }

        pageId = conn.fb_page_id
        pageToken = conn.fb_page_access_token

      } else if (post.target === 'casagrown_page') {
        // Use CasaGrown's page credentials
        pageId = Deno.env.get('CASAGROWN_FB_PAGE_ID') || ''
        pageToken = Deno.env.get('CASAGROWN_FB_PAGE_TOKEN') || ''

        if (!pageId || !pageToken) {
          throw new Error('CasaGrown FB page credentials not configured')
        }

        // Rate limit for CasaGrown page
        const { data: cgToday } = await supabase
          .from('fb_post_queue')
          .select('id', { count: 'exact', head: true })
          .eq('target', 'casagrown_page')
          .eq('status', 'posted')
          .gte('posted_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())

        // Note: using count from the response
        // If too many, skip
      } else {
        throw new Error(`Unknown target: ${post.target}`)
      }

      // Strip markdown bold for Facebook (** → nothing)
      const cleanMessage = post.post_message.replace(/\*\*/g, '')
      const meta = post.metadata || {}

      // Collect photo URLs from metadata
      let photoUrls: string[] = []

      if (meta.photos && Array.isArray(meta.photos)) {
        // Product photos (daily digest or seller menu)
        photoUrls = meta.photos.filter((u: any) => typeof u === 'string' && u.length > 0)
      } else if (meta.seller_photos && Array.isArray(meta.seller_photos)) {
        // Seller logos/avatars (welcome post)
        photoUrls = meta.seller_photos
          .map((s: any) => s.photo || s.avatar)
          .filter((u: any) => typeof u === 'string' && u.length > 0)
      }

      // Publish to Facebook — multi-photo if we have multiple, single otherwise
      let fbResult: { id: string } | null

      if (photoUrls.length > 1) {
        fbResult = await publishMultiPhotoPost(pageId, pageToken, {
          message: cleanMessage,
          photoUrls,
          link: post.post_link,
        })
      } else {
        fbResult = await publishPagePost(pageId, pageToken, {
          message: cleanMessage,
          link: post.post_link,
          photoUrl: photoUrls[0] || post.post_photo_url || undefined,
        })
      }

      // Update queue entry as posted
      await supabase
        .from('fb_post_queue')
        .update({
          status: 'posted',
          fb_post_id: fbResult?.id || null,
          posted_at: new Date().toISOString(),
        })
        .eq('id', post.id)

      published++
      results.push({ id: post.id, status: 'posted', fb_post_id: fbResult?.id })
      console.log(`[FB-POST] Published ${post.target} post ${post.id} → FB ${fbResult?.id}`)

    } catch (err: any) {
      failed++
      const errorMsg = err.message || 'Unknown error'

      await supabase
        .from('fb_post_queue')
        .update({
          status: 'failed',
          error_message: errorMsg,
        })
        .eq('id', post.id)

      results.push({ id: post.id, status: 'failed', error: errorMsg })
      console.error(`[FB-POST] Failed ${post.target} post ${post.id}: ${errorMsg}`)
    }
  }

  return jsonOk({ published, failed, results }, corsHeaders)
})
