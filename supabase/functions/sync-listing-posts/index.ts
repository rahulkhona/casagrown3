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
import { publishPagePost, publishMultiPhotoPost, deletePagePost, publishInstagramPost, publishInstagramCarousel, publishComment, deleteComment } from '../_shared/facebook.ts'
import { getGoogleAccessToken, publishGoogleLocalPost, deleteGoogleLocalPost, updateGoogleLocalPost } from '../_shared/google.ts'

function anonymizeAddress(address: string | null | undefined): string {
  if (!address) return ''
  const trimmed = address.trim()
  if (trimmed.toLowerCase().startsWith('near')) return trimmed
  const stripped = trimmed.replace(/^\d+[a-zA-Z]?[-/\s]*/, '')
  if (stripped === trimmed) return trimmed
  return `Near ${stripped}`
}

function formatTime(timeStr: string): string {
  const parts = timeStr.split(':')
  if (parts.length < 2) return timeStr
  let hours = parseInt(parts[0] || '0', 10)
  const minutes = parseInt(parts[1] || '0', 10)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  const minStr = minutes > 0 ? `:${parts[1]}` : ''
  return `${hours}${minStr} ${ampm}`
}

function formatWindows(windows: Array<{ window_type: string; day_of_week: string; start_time: string; end_time: string }>, type: 'pickup' | 'delivery'): string {
  const filtered = windows.filter(w => w.window_type === type)
  if (filtered.length === 0) return ''
  
  const dayNames: Record<string, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
  }
  
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const sorted = [...filtered].sort((a, b) => {
    const dayDiff = order.indexOf(a.day_of_week) - order.indexOf(b.day_of_week)
    if (dayDiff !== 0) return dayDiff
    return a.start_time.localeCompare(b.start_time)
  })

  const groups: Record<string, string[]> = {}
  for (const w of sorted) {
    const day = dayNames[w.day_of_week] || w.day_of_week
    if (!groups[day]) groups[day] = []
    const timeRange = `${formatTime(w.start_time)}–${formatTime(w.end_time)}`
    groups[day].push(timeRange)
  }

  const lines: string[] = []
  for (const dayKey of order) {
    const dayName = dayNames[dayKey] || dayKey
    if (groups[dayName] && groups[dayName].length > 0) {
      lines.push(`    • ${dayName}: ${groups[dayName].join(', ')}`)
    }
  }

  if (lines.length === 0) return ''
  const label = type === 'delivery' ? 'Delivery hours:' : 'Pickup hours:'
  return `\n  🕒 ${label}\n${lines.join('\n')}`
}

function buildMessageText({
  product,
  booth,
  profile,
  windows,
  sellerName,
  price,
  productLink,
  siteUrl,
  ch
}: {
  product: any;
  booth: any;
  profile: any;
  windows: any;
  sellerName: string;
  price: string;
  productLink: string;
  siteUrl: string;
  ch: string;
}): string {
  const bizTypeLabels: Record<string, string> = {
    hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
    cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
    homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
    gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
    commercial: '🏢 Commercial / Licensed',
  }

  let msg = `🌱 Just listed from ${sellerName}!\n`
  if (profile?.business_type && bizTypeLabels[profile.business_type]) {
    msg += `${bizTypeLabels[profile.business_type]}\n`
  }
  if (profile?.seller_bio) {
    msg += `🚜 About Us: ${profile.seller_bio}\n`
  }
  const unit = product.unit || (product.category === 'produce' ? 'lb' : 'each')
  msg += `\n${product.name} — $${price}/${unit}\n`
  if (product.description) {
    msg += `${product.description}\n`
  }

  const offersPickup = product.product_pickup_windows !== null || (product.product_pickup_windows === null && booth?.offers_pickup)
  const offersDelivery = product.product_delivery_windows !== null || (product.product_delivery_windows === null && booth?.offers_delivery)
  const resolvedPickupAddress = product.pickup_address || booth?.pickup_address
  const resolvedRadius = product.delivery_radius_miles !== null && product.delivery_radius_miles !== undefined ? product.delivery_radius_miles : (booth?.delivery_radius_miles ?? 5)
  const resolvedZipcodes = product.delivery_zipcodes && product.delivery_zipcodes.length > 0 ? product.delivery_zipcodes : (booth?.delivery_zipcodes || [])

  if (offersPickup && resolvedPickupAddress) {
    const anonymizedPickup = anonymizeAddress(resolvedPickupAddress)
    msg += `\n📍 Pickup: ${anonymizedPickup}`
    const pickupWin = windows ? formatWindows(windows, 'pickup') : ''
    if (pickupWin) {
      msg += pickupWin
    }
  }
  if (offersDelivery) {
    let delMsg = ''
    if (resolvedRadius > 0) {
      const anonymizedBase = anonymizeAddress(booth?.booth_address || resolvedPickupAddress)
      delMsg = `\n🚗 Delivery: within ${resolvedRadius} miles from our base: ${anonymizedBase}`
    } else {
      delMsg = `\n🚗 Delivery: Available`
    }
    const deliveryWin = windows ? formatWindows(windows, 'delivery') : ''
    if (deliveryWin) {
      delMsg += deliveryWin
    }
    if (resolvedZipcodes.length > 0) {
      const prefix = resolvedRadius > 0 ? '\n📦 Also delivering in Zip Codes: ' : '\n📦 Delivering in Zip Codes: '
      delMsg += `${prefix}${resolvedZipcodes.join(', ')}`
    }
    msg += delMsg
  }
  const permits: string[] = []
  if (profile?.business_license) permits.push(`License: ${profile.business_license}`)
  if (profile?.cottage_food_permit) permits.push(`Cottage Food: ${profile.cottage_food_permit}`)
  if (profile?.food_handler_permit) permits.push(`Food Handler: ${profile.food_handler_permit}`)
  if (permits.length > 0) {
    msg += `\n\n📄 Permits/Licenses: ${permits.join(', ')}`
  }

  msg += `\n\n🛒 Order now → ${productLink}`
  if (profile?.dm_short_code) {
    const chatUrl = `${siteUrl}/dm/${profile.dm_short_code}?ref=${ch}`
    msg += `\n💬 Chat with us → ${chatUrl}`
  }
  msg += `\n\n[Published via CasaGrown Auto-Post]`

  if (ch === 'instagram' && msg.length > 2200) {
    msg = msg.substring(0, 2197) + '...'
  } else if (ch === 'google' && msg.length > 1500) {
    msg = msg.substring(0, 1497) + '...'
  }
  return msg
}

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl: defaultSiteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth
  const body = await req.json()
  const { action, product_id, seller_id, booth_id, site_url } = body
  const siteUrl = site_url || defaultSiteUrl || 'https://casagrown.com'

  // Helper to update quantity comments and GBP description
  const updateQuantityComments = async (
    prod: any,
    fbPageId: string,
    fbPageToken: string,
    igBusinessAccountId: string | null,
    commentLink: string
  ) => {
    const commResults: Record<string, any> = {}
    const commentText = `Stock Update: Only ${prod.inventory} left in stock! 🛒 Link: ${commentLink}`

    // 1. Facebook comment update
    if (fbPageId && fbPageToken && prod.facebook_post_id) {
      try {
        if (prod.facebook_comment_id) {
          await deleteComment(prod.facebook_comment_id, fbPageToken).catch(() => {})
        }
        const commRes = await publishComment(prod.facebook_post_id, commentText, fbPageToken)
        if (commRes?.id) {
          commResults.facebook_comment_id = commRes.id
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] FB stock comment update failed: ${err.message}`)
      }
    }

    // 2. Instagram comment update (Elite only)
    if (igBusinessAccountId && fbPageToken && prod.instagram_post_id) {
      try {
        if (prod.instagram_comment_id) {
          await deleteComment(prod.instagram_comment_id, fbPageToken).catch(() => {})
        }
        const commRes = await publishComment(prod.instagram_post_id, commentText, fbPageToken)
        if (commRes?.id) {
          commResults.instagram_comment_id = commRes.id
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] IG stock comment update failed: ${err.message}`)
      }
    }

    if (Object.keys(commResults).length > 0) {
      await supabase
        .from('market_products')
        .update(commResults)
        .eq('id', prod.id)
    }

    return commResults
  }

  if (!action || !seller_id) {
    return jsonError('Missing required fields: action, seller_id', corsHeaders)
  }

  if (action === 'sync_booth') {
    if (!booth_id) {
      return jsonError('Missing required field: booth_id for action sync_booth', corsHeaders)
    }
  } else {
    if (!product_id) {
      return jsonError('Missing required field: product_id', corsHeaders)
    }
  }

  console.log(`[SYNC-POSTS] Action=${action} product=${product_id} seller=${seller_id} booth=${booth_id}`)

  // ── SYNC_BOOTH — Sync all active products for a booth ──
  if (action === 'sync_booth') {
    console.log(`[SYNC-POSTS] Starting sync_booth for booth_id=${booth_id} seller_id=${seller_id}`)

    // 1. Fetch active products for the booth
    const { data: products, error: productsErr } = await supabase
      .from('market_products')
      .select('id, name')
      .eq('booth_id', booth_id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .gt('inventory', 0)

    if (productsErr) {
      return jsonError(`Failed to fetch booth products: ${productsErr.message}`, corsHeaders)
    }

    if (!products || products.length === 0) {
      return jsonOk({ action, message: 'No active products with inventory found to sync for this booth.', synced: [] }, corsHeaders)
    }

    console.log(`[SYNC-POSTS] Found ${products.length} products to sync for booth ${booth_id}`)

    // 2. Fetch connections, subscription, profile, booth, windows ONCE to optimize DB calls
    const { data: conn } = await supabase
      .from('seller_fb_connections')
      .select(`
        fb_page_id, fb_page_access_token, fb_page_name, status,
        auto_post_enabled,
        ig_business_account_id, ig_access_token, ig_auto_post_enabled,
        wa_phone_number_id, wa_display_phone
      `)
      .eq('user_id', seller_id)
      .eq('status', 'connected')
      .maybeSingle()

    if (!conn) {
      return jsonError('No active Facebook/Instagram connection found for seller', corsHeaders)
    }

    const { data: sub } = await supabase
      .from('seller_subscriptions')
      .select('plan, status')
      .eq('user_id', seller_id)
      .in('status', ['active', 'trialing'])
      .maybeSingle()

    if (!sub) {
      return jsonError('No active subscription found for seller', corsHeaders)
    }

    const { data: tierData } = await supabase
      .from('subscription_tiers')
      .select('features')
      .eq('tier_name', sub.plan)
      .single()

    const features = tierData?.features || {}

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, farm_name, dm_short_code, business_type, seller_bio, business_license, cottage_food_permit, food_handler_permit')
      .eq('id', seller_id)
      .single()

    const { data: booth } = await supabase
      .from('market_booths')
      .select('id, name, short_code, pickup_address, offers_pickup, offers_delivery, booth_address, delivery_radius_miles, delivery_zipcodes')
      .eq('id', booth_id)
      .single()

    const sellerName = booth?.name || profile?.farm_name || profile?.full_name || 'Grower'

    const { data: windows } = await supabase
      .from('booth_fulfillment_windows')
      .select('window_type, day_of_week, start_time, end_time')
      .eq('booth_id', booth_id)

    const results: Record<string, any> = {}

    // 3. Loop and publish/update each product
    for (const prod of products) {
      console.log(`[SYNC-POSTS] Processing product: ${prod.name} (${prod.id})`)
      const { data: product } = await supabase
        .from('market_products')
        .select(`
          id, name, description, price_usd, photos, inventory, category, unit, market_date, booth_id, is_active,
          facebook_post_id, instagram_post_id, google_post_id, facebook_comment_id, instagram_comment_id,
          product_pickup_windows, product_delivery_windows, delivery_radius_miles, pickup_address, delivery_zipcodes
        `)
        .eq('id', prod.id)
        .single()

      if (!product) continue

      // Retire existing posts first (same as 'update' action)
      if (conn?.fb_page_access_token) {
        if (product.facebook_post_id) {
          if (product.facebook_comment_id) {
            await deleteComment(product.facebook_comment_id, conn.fb_page_access_token).catch(() => {})
          }
          await deletePagePost(product.facebook_post_id, conn.fb_page_access_token).catch(() => {})
        }
        if (product.instagram_post_id && product.instagram_comment_id) {
          await deleteComment(product.instagram_comment_id, conn.fb_page_access_token).catch(() => {})
        }
      }

      if (product.google_post_id) {
        try {
          const { data: googleConn } = await supabase
            .from('seller_google_connections')
            .select('google_refresh_token')
            .eq('user_id', seller_id)
            .maybeSingle()

          if (googleConn?.google_refresh_token) {
            const accessToken = await getGoogleAccessToken(googleConn.google_refresh_token)
            await deleteGoogleLocalPost(product.google_post_id, accessToken).catch(() => {})
          }
        } catch (e) {}
      }

      // Clear IDs in database
      await supabase
        .from('market_products')
        .update({
          facebook_post_id: null,
          instagram_post_id: null,
          google_post_id: null,
          facebook_comment_id: null,
          instagram_comment_id: null,
        })
        .eq('id', product.id)

      // Construct message
      const price = Number(product.price_usd).toFixed(2)
      const productLink = `${siteUrl}/market/booth/${booth_id}/product/${product.id}`
      const boothShortCode = booth?.short_code
      const dmShortCode = profile?.dm_short_code

      const boothUrl = (ch: string) =>
        boothShortCode
          ? `${siteUrl}/b/${boothShortCode}?ref=${ch}`
          : `${siteUrl}/market/booth/${booth_id}`
      const dmUrl = (ch: string) =>
        dmShortCode
          ? `${siteUrl}/dm/${dmShortCode}?ref=${ch}`
          : null

      const bizTypeLabels: Record<string, string> = {
        hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
        cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
        homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
        gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
        commercial: '🏢 Commercial / Licensed',
      }

      const buildMessage = (ch: string) => buildMessageText({
        product,
        booth,
        profile,
        windows,
        sellerName,
        price,
        productLink,
        siteUrl,
        ch
      })

      const photoUrl = product.photos?.[0] || undefined
      const prodResults: Record<string, any> = {}

      // ── Facebook Post ──
      if (features.facebook_posts && conn.auto_post_enabled && conn.fb_page_id && conn.fb_page_access_token) {
        try {
          const fbMessage = buildMessage('facebook')
          const fbResult = await publishMultiPhotoPost(conn.fb_page_id, conn.fb_page_access_token, {
            message: fbMessage,
            photoUrls: product.photos || [],
          })

          prodResults.facebook = { post_id: fbResult?.id, status: 'published' }
        } catch (err: any) {
          console.error(`[SYNC-POSTS] ❌ FB post failed: ${err.message}`)
          prodResults.facebook = { status: 'error', error: err.message }
        }
      }

      // ── Instagram Post ──
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

          prodResults.instagram = { post_id: igResult?.id, status: 'published' }
        } catch (err: any) {
          console.error(`[SYNC-POSTS] ❌ IG post failed: ${err.message}`)
          prodResults.instagram = { status: 'error', error: err.message }
        }
      }

      // ── Google Business Profile Post ──
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

            const gbpResult = await publishGoogleLocalPost(googleConn.google_location_id, googleAccessToken, {
              caption: googleMessage,
              photoUrl,
              buttonUrl: productLink,
              eventTitle: `${product.name} — $${price}`,
              eventStartDate: product.market_date,
              eventEndDate: product.market_date,
            })

            prodResults.google = { post_id: gbpResult?.name, status: 'published' }
          } catch (err: any) {
            console.error(`[SYNC-POSTS] ❌ Google post failed: ${err.message}`)
            prodResults.google = { status: 'error', error: err.message }
          }
        }
      }

      // ── Update database fields ──
      const updateData: Record<string, any> = {
        posts_published_at: new Date().toISOString(),
      }
      if (prodResults.facebook?.post_id) updateData.facebook_post_id = prodResults.facebook.post_id
      if (prodResults.instagram?.post_id) updateData.instagram_post_id = prodResults.instagram.post_id
      if (prodResults.google?.post_id) updateData.google_post_id = prodResults.google.post_id

      await supabase
        .from('market_products')
        .update(updateData)
        .eq('id', product.id)

      // Log
      await supabase.from('fb_auto_post_log').insert({
        user_id: seller_id,
        product_id: product.id,
        target: 'sync_booth_publish',
        message: JSON.stringify(prodResults),
      })

      // Comments
      const freshProduct = {
        id: product.id,
        inventory: product.inventory,
        facebook_post_id: prodResults.facebook?.post_id || null,
        instagram_post_id: prodResults.instagram?.post_id || null,
        facebook_comment_id: null,
        instagram_comment_id: null
      }

      const commentRes = await updateQuantityComments(
        freshProduct,
        conn.fb_page_id,
        conn.fb_page_access_token,
        conn.ig_business_account_id,
        productLink
      )

      results[product.name] = { publish: prodResults, comments: commentRes }
    }

    return jsonOk({ action, results }, corsHeaders)
  }


  // ── EXPIRE / DELETE — Remove posts from all channels ──
  if (action === 'expire' || action === 'delete') {
    const {
      facebook_post_id,
      instagram_post_id,
      google_post_id,
      wa_catalog_item_id,
    } = body

    // Fetch comment IDs from database if we need to clean them up
    const { data: product } = await supabase
      .from('market_products')
      .select('facebook_comment_id, instagram_comment_id')
      .eq('id', product_id)
      .maybeSingle()

    const results: Record<string, string> = {}

    // Delete Facebook post and its quantity comment
    if (facebook_post_id) {
      try {
        const { data: conn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_access_token')
          .eq('user_id', seller_id)
          .eq('status', 'connected')
          .maybeSingle()

        if (conn?.fb_page_access_token) {
          if (product?.facebook_comment_id) {
            try {
              await deleteComment(product.facebook_comment_id, conn.fb_page_access_token)
            } catch (err: any) {
              console.warn(`[SYNC-POSTS] FB comment deletion failed: ${err.message}`)
            }
          }
          await deletePagePost(facebook_post_id, conn.fb_page_access_token)
          results.facebook = 'deleted'
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] FB delete failed: ${err.message}`)
        results.facebook = `error: ${err.message}`
      }
    }

    // Delete Instagram comment (since post deletion is not supported)
    if (instagram_post_id) {
      try {
        const { data: conn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_access_token')
          .eq('user_id', seller_id)
          .eq('status', 'connected')
          .maybeSingle()

        if (conn?.fb_page_access_token && product?.instagram_comment_id) {
          await deleteComment(product.instagram_comment_id, conn.fb_page_access_token)
          results.instagram = 'comment deleted (post kept as IG does not support delete)'
        } else {
          results.instagram = 'cleared (IG API does not support deletion)'
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] IG comment delete failed: ${err.message}`)
        results.instagram = `error: ${err.message}`
      }
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
      results.whatsapp = 'cleared'
    }

    // Clear post and comment IDs from the listing
    await supabase
      .from('market_products')
      .update({
        facebook_post_id: null,
        instagram_post_id: null,
        google_post_id: null,
        wa_catalog_item_id: null,
        facebook_comment_id: null,
        instagram_comment_id: null,
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



  // ── UPDATE — Delete old posts first, then fall through to publish ──
  if (action === 'update') {
    const { data: product } = await supabase
      .from('market_products')
      .select('facebook_post_id, instagram_post_id, google_post_id, facebook_comment_id, instagram_comment_id')
      .eq('id', product_id)
      .maybeSingle()

    if (product) {
      const { data: conn } = await supabase
        .from('seller_fb_connections')
        .select('fb_page_access_token')
        .eq('user_id', seller_id)
        .eq('status', 'connected')
        .maybeSingle()

      if (conn?.fb_page_access_token) {
        if (product.facebook_post_id) {
          if (product.facebook_comment_id) {
            await deleteComment(product.facebook_comment_id, conn.fb_page_access_token).catch(() => {})
          }
          await deletePagePost(product.facebook_post_id, conn.fb_page_access_token).catch(() => {})
        }
        if (product.instagram_post_id && product.instagram_comment_id) {
          await deleteComment(product.instagram_comment_id, conn.fb_page_access_token).catch(() => {})
        }
      }

      if (product.google_post_id) {
        try {
          const { data: googleConn } = await supabase
            .from('seller_google_connections')
            .select('google_refresh_token')
            .eq('user_id', seller_id)
            .maybeSingle()

          if (googleConn?.google_refresh_token) {
            const accessToken = await getGoogleAccessToken(googleConn.google_refresh_token)
            await deleteGoogleLocalPost(product.google_post_id, accessToken).catch(() => {})
          }
        } catch (e) {}
      }

      await supabase
        .from('market_products')
        .update({
          facebook_post_id: null,
          instagram_post_id: null,
          google_post_id: null,
          facebook_comment_id: null,
          instagram_comment_id: null,
        })
        .eq('id', product_id)
    }
  }

  // ── UPDATE_INVENTORY — Just update quantity comments & Google description ──
  if (action === 'update_inventory') {
    const { data: product, error: productErr } = await supabase
      .from('market_products')
      .select(`
        id, name, description, price_usd, photos, inventory, category, unit, market_date, booth_id, is_active,
        facebook_post_id, instagram_post_id, google_post_id, facebook_comment_id, instagram_comment_id,
        product_pickup_windows, product_delivery_windows, delivery_radius_miles, pickup_address, delivery_zipcodes
      `)
      .eq('id', product_id)
      .single()

    if (productErr || !product) {
      return jsonError('Product not found', corsHeaders)
    }

    if (!product.is_active || product.inventory <= 0) {
      return jsonOk({ action, skipped: true, reason: 'inactive_or_out_of_stock' }, corsHeaders)
    }

    const { data: conn } = await supabase
      .from('seller_fb_connections')
      .select(`
        fb_page_id, fb_page_access_token, fb_page_name, status,
        auto_post_enabled,
        ig_business_account_id, ig_access_token, ig_auto_post_enabled,
        wa_phone_number_id, wa_display_phone
      `)
      .eq('user_id', seller_id)
      .eq('status', 'connected')
      .maybeSingle()

    if (!conn) {
      return jsonOk({ action, skipped: true, reason: 'no_active_connection' }, corsHeaders)
    }

    const { data: sub } = await supabase
      .from('seller_subscriptions')
      .select('plan, status')
      .eq('user_id', seller_id)
      .in('status', ['active', 'trialing'])
      .maybeSingle()

    if (!sub) {
      return jsonOk({ action, skipped: true, reason: 'no_active_subscription' }, corsHeaders)
    }

    const { data: tierData } = await supabase
      .from('subscription_tiers')
      .select('features')
      .eq('tier_name', sub.plan)
      .single()

    const features = tierData?.features || {}

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, farm_name, dm_short_code, business_type, seller_bio, business_license, cottage_food_permit, food_handler_permit')
      .eq('id', seller_id)
      .single()

    const { data: booth } = await supabase
      .from('market_booths')
      .select('id, name, short_code, pickup_address, offers_pickup, offers_delivery, booth_address, delivery_radius_miles, delivery_zipcodes')
      .eq('id', product.booth_id || booth_id)
      .single()

    const sellerName = booth?.name || profile?.farm_name || profile?.full_name || 'Grower'

    const { data: windows } = await supabase
      .from('booth_fulfillment_windows')
      .select('window_type, day_of_week, start_time, end_time')
      .eq('booth_id', booth?.id || product.booth_id || booth_id)

    const price = Number(product.price_usd).toFixed(2)
    const boothIdVal = booth?.id || product.booth_id
    const productLink = `${siteUrl}/market/booth/${boothIdVal}/product/${product.id}`

    const boothShortCode = booth?.short_code
    const dmShortCode = profile?.dm_short_code

    const boothUrl = (ch: string) =>
      boothShortCode
        ? `${siteUrl}/b/${boothShortCode}?ref=${ch}`
        : `${siteUrl}/market/booth/${boothIdVal}`
    const dmUrl = (ch: string) =>
      dmShortCode
        ? `${siteUrl}/dm/${dmShortCode}?ref=${ch}`
        : null

    const bizTypeLabels: Record<string, string> = {
      hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
      cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
      homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
      gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
      commercial: '🏢 Commercial / Licensed',
    }

    const buildMessage = (ch: string) => buildMessageText({
      product,
      booth,
      profile,
      windows,
      sellerName,
      price,
      productLink,
      siteUrl,
      ch
    })

    const commentText = `Stock Update: Only ${product.inventory} left in stock! 🛒 Link: ${productLink}`
    const commResults: Record<string, any> = {}

    // Facebook comment update
    if (features.facebook_posts && conn.auto_post_enabled && conn.fb_page_id && conn.fb_page_access_token && product.facebook_post_id) {
      try {
        if (product.facebook_comment_id) {
          await deleteComment(product.facebook_comment_id, conn.fb_page_access_token).catch(() => {})
        }
        const commRes = await publishComment(product.facebook_post_id, commentText, conn.fb_page_access_token)
        if (commRes?.id) {
          commResults.facebook_comment_id = commRes.id
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] FB stock comment update failed: ${err.message}`)
      }
    }

    // Instagram comment update (Elite only)
    if (features.instagram_posts && conn.ig_auto_post_enabled && conn.ig_business_account_id && product.instagram_post_id) {
      try {
        if (product.instagram_comment_id) {
          await deleteComment(product.instagram_comment_id, conn.fb_page_access_token).catch(() => {})
        }
        const commRes = await publishComment(product.instagram_post_id, commentText, conn.fb_page_access_token)
        if (commRes?.id) {
          commResults.instagram_comment_id = commRes.id
        }
      } catch (err: any) {
        console.error(`[SYNC-POSTS] IG stock comment update failed: ${err.message}`)
      }
    }

    // Google Local Post body update (Elite only)
    if (features.google_places && product.google_post_id) {
      const { data: googleConn } = await supabase
        .from('seller_google_connections')
        .select('google_refresh_token, google_location_id, auto_post_specials')
        .eq('user_id', seller_id)
        .maybeSingle()

      if (googleConn?.google_refresh_token) {
        try {
          const googleAccessToken = await getGoogleAccessToken(googleConn.google_refresh_token)
          const googleMessage = buildMessage('google')
          await updateGoogleLocalPost(product.google_post_id, googleAccessToken, { caption: googleMessage })
        } catch (err: any) {
          console.error(`[SYNC-POSTS] Google post body update failed: ${err.message}`)
        }
      }
    }

    if (Object.keys(commResults).length > 0) {
      await supabase
        .from('market_products')
        .update(commResults)
        .eq('id', product_id)
    }

    return jsonOk({ action, comment_updated: true, commResults }, corsHeaders)
  }

  // ── PUBLISH ──
  if (action === 'publish' || action === 'update') {
    // Get the product details
    const { data: product, error: productErr } = await supabase
      .from('market_products')
      .select(`
        id, name, description, price_usd, photos, inventory, category, unit, market_date, booth_id, is_active,
        facebook_post_id, instagram_post_id, google_post_id,
        product_pickup_windows, product_delivery_windows, delivery_radius_miles, pickup_address, delivery_zipcodes
      `)
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
        wa_phone_number_id, wa_display_phone
      `)
      .eq('user_id', seller_id)
      .eq('status', 'connected')
      .maybeSingle()

    if (!conn) {
      return jsonOk({ action, skipped: true, reason: 'no_active_connection' }, corsHeaders)
    }

    const { data: sub } = await supabase
      .from('seller_subscriptions')
      .select('plan, status')
      .eq('user_id', seller_id)
      .in('status', ['active', 'trialing'])
      .maybeSingle()

    if (!sub) {
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
      .select('full_name, farm_name, dm_short_code, business_type, seller_bio, business_license, cottage_food_permit, food_handler_permit')
      .eq('id', seller_id)
      .single()

    const { data: booth } = await supabase
      .from('market_booths')
      .select('id, name, short_code, pickup_address, offers_pickup, offers_delivery, booth_address, delivery_radius_miles, delivery_zipcodes')
      .eq('id', product.booth_id || booth_id)
      .single()

    const sellerName = booth?.name || profile?.farm_name || profile?.full_name || 'Grower'

    // Get fulfillment windows
    const { data: windows } = await supabase
      .from('booth_fulfillment_windows')
      .select('window_type, day_of_week, start_time, end_time')
      .eq('booth_id', booth?.id || product.booth_id || booth_id)

    // Build the post message — uses short URLs to avoid exposing UUIDs
    const price = Number(product.price_usd).toFixed(2)
    const boothIdVal = booth?.id || product.booth_id
    const productLink = `${siteUrl}/market/booth/${boothIdVal}/product/${product.id}`

    const boothShortCode = booth?.short_code
    const dmShortCode = profile?.dm_short_code

    const boothUrl = (ch: string) =>
      boothShortCode
        ? `${siteUrl}/b/${boothShortCode}?ref=${ch}`
        : `${siteUrl}/market/booth/${boothIdVal}`
    const dmUrl = (ch: string) =>
      dmShortCode
        ? `${siteUrl}/dm/${dmShortCode}?ref=${ch}`
        : null

    const bizTypeLabels: Record<string, string> = {
      hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
      cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
      homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
      gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
      commercial: '🏢 Commercial / Licensed',
    }

    const buildMessage = (ch: string) => buildMessageText({
      product,
      booth,
      profile,
      windows,
      sellerName,
      price,
      productLink,
      siteUrl,
      ch
    })

    const photoUrl = product.photos?.[0] || undefined
    const results: Record<string, any> = {}

    // ── Facebook Post (Pro + Elite) ──
    if (features.facebook_posts && conn.auto_post_enabled && conn.fb_page_id && conn.fb_page_access_token) {
      try {
        const fbMessage = buildMessage('facebook')
        const fbResult = await publishMultiPhotoPost(conn.fb_page_id, conn.fb_page_access_token, {
          message: fbMessage,
          photoUrls: product.photos || [],
        })

        results.facebook = { post_id: fbResult?.id, status: 'published' }
        console.log(`[SYNC-POSTS] ✅ FB photo post created for ${product.name}`)
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
            eventTitle: `${product.name} — $${price}`,
            eventStartDate: product.market_date,
            eventEndDate: product.market_date,
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
      target: action === 'publish' ? 'sync_publish' : 'sync_update',
      message: JSON.stringify(results),
    })

    // Now publish initial quantity comments!
    const freshProduct = {
      id: product_id,
      inventory: product.inventory,
      facebook_post_id: results.facebook?.post_id || null,
      instagram_post_id: results.instagram?.post_id || null,
      facebook_comment_id: null,
      instagram_comment_id: null
    }

    const commentRes = await updateQuantityComments(
      freshProduct,
      conn.fb_page_id,
      conn.fb_page_access_token,
      conn.ig_business_account_id,
      productLink
    )

    return jsonOk({ action, results, commentRes }, corsHeaders)
  }

  return jsonError(`Unknown action: ${action}`, corsHeaders)
})
