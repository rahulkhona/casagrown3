/**
 * sync-listing-posts — Listing-lifecycle-driven social post sync
 *
 * Called by the database trigger `trg_listing_social_post_sync` when a
 * listing is created, updated, deactivated, or deleted.
 *
 * Actions:
 *   publish  — Create posts on all enabled channels (FB, IG, Google, WhatsApp)
 *   update   — Update existing posts with new listing details
 *   expire   — Delete/expire posts when fulfillment window ends or listing deactivated
 *   delete   — Delete posts when listing is hard-deleted
 *
 * Post lifecycle:
 *   Listing published → posts created on all enabled channels
 *   Listing updated   → posts updated with new price/name/photos
 *   Fulfillment ends  → posts expired/deleted automatically
 *   Listing deleted   → posts deleted immediately
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { publishPagePost, publishMultiPhotoPost, deletePagePost, publishInstagramPost, publishInstagramCarousel } from '../_shared/facebook.ts'
import { getGoogleAccessToken, publishGoogleLocalPost, deleteGoogleLocalPost } from '../_shared/google.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth

  const body = await req.json()
  const { action, product_id, seller_id, booth_id } = body

  if (!action || !product_id || !seller_id) {
    return jsonError('Missing required fields: action, product_id, seller_id', corsHeaders)
  }

  console.log(`[SYNC-POSTS] Action=${action} product=${product_id} seller=${seller_id}`)

  // ── EXPIRE / DELETE — Remove posts from all channels ──
  if (action === 'expire' || action === 'delete') {
    const {
      facebook_post_id,
      instagram_post_id,
      google_post_id,
      wa_catalog_item_id,
    } = body

    const results: Record<string, string> = {}

    // Delete Facebook post
    if (facebook_post_id) {
      try {
        const { data: conn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_access_token')
          .eq('user_id', seller_id)
          .eq('status', 'connected')
          .maybeSingle()

        if (conn?.fb_page_access_token) {
          await deletePagePost(facebook_post_id, conn.fb_page_access_token)
          results.facebook = 'deleted'
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] FB delete failed: ${err.message}`)
        results.facebook = `error: ${err.message}`
      }
    }

    // Delete Instagram post (Instagram API doesn't support deletion via Graph API)
    // Posts will naturally fall off the feed. Just clear the tracking ID.
    if (instagram_post_id) {
      results.instagram = 'cleared (IG API does not support deletion)'
    }

    // Delete Google Business Profile post
    if (google_post_id) {
      try {
        const { data: googleConn } = await supabase
          .from('seller_google_connections')
          .select('google_refresh_token, google_location_id')
          .eq('user_id', seller_id)
          .maybeSingle()

        if (googleConn?.google_refresh_token) {
          const accessToken = await getGoogleAccessToken(googleConn.google_refresh_token)
          await deleteGoogleLocalPost(google_post_id, accessToken)
          results.google = 'deleted'
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] Google delete failed: ${err.message}`)
        results.google = `error: ${err.message}`
      }
    }

    // Clear WhatsApp catalog item
    if (wa_catalog_item_id) {
      // WhatsApp catalog sync is managed via the catalog API
      // For now, just clear the tracking ID
      results.whatsapp = 'cleared'
    }

    // Clear post IDs from the listing
    await supabase
      .from('market_products')
      .update({
        facebook_post_id: null,
        instagram_post_id: null,
        google_post_id: null,
        wa_catalog_item_id: null,
        posts_expired_at: new Date().toISOString(),
      })
      .eq('id', product_id)

    // Log the expiration
    await supabase.from('fb_auto_post_log').insert({
      user_id: seller_id,
      product_id,
      target: 'sync_expire',
      message: JSON.stringify(results),
    })

    return jsonOk({ action, results }, corsHeaders)
  }

  // ── PUBLISH — Create posts on all enabled channels ──
  if (action === 'publish') {
    // Get the product details
    const { data: product, error: productErr } = await supabase
      .from('market_products')
      .select('id, name, description, price_usd, photos, inventory, category, market_date, booth_id, is_active')
      .eq('id', product_id)
      .single()

    if (productErr || !product) {
      return jsonError('Product not found', corsHeaders)
    }

    // Don't post if product is inactive or out of stock
    if (!product.is_active || product.inventory <= 0) {
      return jsonOk({ action, skipped: true, reason: 'inactive_or_out_of_stock' }, corsHeaders)
    }

    // Get seller's social connections and subscription
    const { data: conn } = await supabase
      .from('seller_fb_connections')
      .select(`
        fb_page_id, fb_page_access_token, fb_page_name, status,
        auto_post_enabled,
        ig_business_account_id, ig_access_token, ig_auto_post_enabled,
        wa_phone_number_id, wa_display_phone,
        seller_subscriptions!inner(plan, status)
      `)
      .eq('user_id', seller_id)
      .eq('status', 'connected')
      .maybeSingle()

    if (!conn) {
      return jsonOk({ action, skipped: true, reason: 'no_active_connection' }, corsHeaders)
    }

    const sub = (conn as any).seller_subscriptions
    if (!sub || !['active', 'trialing'].includes(sub.status)) {
      return jsonOk({ action, skipped: true, reason: 'no_active_subscription' }, corsHeaders)
    }

    // Load tier features
    const { data: tierData } = await supabase
      .from('subscription_tiers')
      .select('features')
      .eq('tier_name', sub.plan)
      .single()

    const features = tierData?.features || {}

    // Get seller profile and booth info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, farm_name, dm_short_code, business_type')
      .eq('id', seller_id)
      .single()

    const sellerName = profile?.farm_name || profile?.full_name || 'Local Grower'

    const { data: booth } = await supabase
      .from('market_booths')
      .select('id, name, short_code, pickup_address, offers_pickup, offers_delivery')
      .eq('id', product.booth_id || booth_id)
      .single()

    // Build the post message — uses short URLs to avoid exposing UUIDs
    const price = Number(product.price_usd).toFixed(2)
    const boothId = booth?.id || product.booth_id
    // Product deep link (full UUID path — only used internally in the post)
    const productLink = `${siteUrl}/market/booth/${boothId}/product/${product.id}`

    // Determine which channel we're building for (set per-channel below)
    // Default links use short codes when available
    const boothShortCode = booth?.short_code
    const dmShortCode = profile?.dm_short_code

    // Helper to build channel-attributed short URLs
    const boothUrl = (channel: string) =>
      boothShortCode
        ? `${siteUrl}/b/${boothShortCode}?ref=${channel}`
        : `${siteUrl}/market/booth/${boothId}`
    const dmUrl = (channel: string) =>
      dmShortCode
        ? `${siteUrl}/dm/${dmShortCode}?ref=${channel}`
        : null

    // Business type labels
    const bizTypeLabels: Record<string, string> = {
      hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
      cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
      homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
      gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
      commercial: '🏢 Commercial / Licensed',
    }

    // Build base message (channel-specific links appended per platform below)
    const buildMessage = (channel: string) => {
      let msg = `🌱 Just listed from ${sellerName}!\n`
      if (profile?.business_type && bizTypeLabels[profile.business_type]) {
        msg += `${bizTypeLabels[profile.business_type]}\n`
      }
      msg += `\n${product.name} — $${price}/${product.category === 'produce' ? 'lb' : 'each'}\n`
      if (product.description) {
        msg += `${product.description}\n`
      }
      if (booth?.offers_pickup && booth?.pickup_address) {
        msg += `\n📍 Pickup: ${booth.pickup_address}`
      }
      if (booth?.offers_delivery) {
        msg += `\n🚗 Delivery available`
      }

      msg += `\n\n🛒 Order now → ${productLink}`
      msg += `\n🏪 Browse all listings → ${boothUrl(channel)}`

      const dm = dmUrl(channel)
      if (dm) {
        msg += `\n💬 Chat with us on CasaGrown → ${dm}`
      }

      // Add WhatsApp follow CTA for Elite sellers (Q&A only, not commerce)
      if (features.whatsapp_chat && conn.wa_display_phone) {
        const cleanPhone = conn.wa_display_phone.replace(/\D/g, '')
        if (cleanPhone) {
          const waText = encodeURIComponent(`Hi! I'm interested in ${product.name} (ref:${product.id})`)
          msg += `\n\n📱 Ask about this on WhatsApp → https://wa.me/${cleanPhone}?text=${waText}`
        }
      }

      return msg
    }

    const photoUrl = product.photos?.[0] || undefined
    const results: Record<string, any> = {}

    // ── Facebook Post (Pro + Elite) ──
    if (features.facebook_posts && conn.auto_post_enabled && conn.fb_page_id && conn.fb_page_access_token) {
      try {
        const fbMessage = buildMessage('facebook')
        const fbResult = product.photos?.length > 1
          ? await publishMultiPhotoPost(conn.fb_page_id, conn.fb_page_access_token, {
              message: fbMessage,
              photoUrls: product.photos,
              link: productLink,
            })
          : await publishPagePost(conn.fb_page_id, conn.fb_page_access_token, {
              message: fbMessage,
              link: productLink,
              photoUrl,
            })

        results.facebook = { post_id: fbResult?.id, status: 'published' }
        console.log(`[SYNC-POSTS] ✅ FB post created for ${product.name}`)
      } catch (err: any) {
        console.error(`[SYNC-POSTS] ❌ FB post failed: ${err.message}`)
        results.facebook = { status: 'error', error: err.message }
      }
    }

    // ── Instagram Post (Elite only) ──
    if (features.instagram_posts && conn.ig_auto_post_enabled && conn.ig_business_account_id) {
      try {
        const igMessage = buildMessage('instagram')
        const igResult = product.photos?.length > 1
          ? await publishInstagramCarousel(conn.ig_business_account_id, conn.fb_page_access_token, {
              caption: igMessage,
              imageUrls: product.photos,
            })
          : await publishInstagramPost(conn.ig_business_account_id, conn.fb_page_access_token, {
              caption: igMessage,
              imageUrl: photoUrl || '',
            })

        results.instagram = { post_id: igResult?.id, status: 'published' }
        console.log(`[SYNC-POSTS] ✅ IG post created for ${product.name}`)
      } catch (err: any) {
        console.error(`[SYNC-POSTS] ❌ IG post failed: ${err.message}`)
        results.instagram = { status: 'error', error: err.message }
      }
    }

    // ── Google Business Profile Post (Elite only) ──
    if (features.google_places) {
      const { data: googleConn } = await supabase
        .from('seller_google_connections')
        .select('google_refresh_token, google_location_id, auto_post_specials')
        .eq('user_id', seller_id)
        .maybeSingle()

      if (googleConn?.auto_post_specials && googleConn?.google_location_id && googleConn?.google_refresh_token) {
        try {
          const googleAccessToken = await getGoogleAccessToken(googleConn.google_refresh_token)

          const googleMessage = buildMessage('google')

          // Use EVENT type post with market_date as start/end for auto-expiration
          const gbpResult = await publishGoogleLocalPost(googleConn.google_location_id, googleAccessToken, {
            caption: googleMessage,
            photoUrl,
            buttonUrl: productLink,
            // Google Event posts auto-expire at the end time
            eventTitle: `${product.name} — $${price}`,
            eventStartDate: product.market_date,
            eventEndDate: product.market_date, // Same day — expires at end of market day
          })

          results.google = { post_id: gbpResult?.name, status: 'published' }
          console.log(`[SYNC-POSTS] ✅ Google post created for ${product.name}`)
        } catch (err: any) {
          console.error(`[SYNC-POSTS] ❌ Google post failed: ${err.message}`)
          results.google = { status: 'error', error: err.message }
        }
      }
    }

    // ── Update the product with post IDs ──
    const updateData: Record<string, any> = {
      posts_published_at: new Date().toISOString(),
    }
    if (results.facebook?.post_id) updateData.facebook_post_id = results.facebook.post_id
    if (results.instagram?.post_id) updateData.instagram_post_id = results.instagram.post_id
    if (results.google?.post_id) updateData.google_post_id = results.google.post_id

    await supabase
      .from('market_products')
      .update(updateData)
      .eq('id', product_id)

    // Log it
    await supabase.from('fb_auto_post_log').insert({
      user_id: seller_id,
      product_id,
      target: 'sync_publish',
      message: JSON.stringify(results),
    })

    return jsonOk({ action, results }, corsHeaders)
  }

  // ── UPDATE — Update existing posts ──
  if (action === 'update') {
    // For now, Facebook doesn't allow editing posts via API (only comments).
    // Google Business Posts can be updated. Instagram cannot.
    // Best approach: delete old + create new for channels that don't support update.
    // For MVP: just log the update request. The daily cron still handles aggregated posts.
    console.log(`[SYNC-POSTS] Update requested for product ${product_id} — logged for future implementation`)

    return jsonOk({ action, status: 'logged', note: 'Post updates will be implemented in v2' }, corsHeaders)
  }

  return jsonError(`Unknown action: ${action}`, corsHeaders)
})
