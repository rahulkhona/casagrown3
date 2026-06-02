/**
 * generate-fb-posts — Auto-generate Facebook posts daily
 *
 * Called by pg_cron daily at 13:00 UTC (6 AM PT / 9 AM ET).
 *
 * Post Types:
 *   1. CasaGrown Daily Digest — new listings grouped by category (→ queue for admin)
 *   2. CasaGrown New Seller Welcome — Pro sellers from past 7 days (→ queue for admin)
 *   3. Seller Daily Menu — all products by booth with pickup/delivery info (→ auto-post)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { publishPagePost, publishMultiPhotoPost, publishInstagramPost, publishInstagramCarousel } from '../_shared/facebook.ts'
import { getGoogleAccessToken, publishGoogleLocalPost } from '../_shared/google.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // ── 1. Get all Pro/Elite sellers with active FB connections ──────────
  const { data: connections, error: connErr } = await supabase
    .from('seller_fb_connections')
    .select(`
      id, user_id, fb_page_id, fb_page_access_token, fb_page_name, status,
      auto_post_enabled, casagrown_post_enabled,
      ig_business_account_id, ig_username, ig_access_token, ig_auto_post_enabled,
      wa_phone_number_id, wa_display_phone, wa_auto_reply_enabled,
      seller_subscriptions!inner(plan, status)
    `)
    .eq('status', 'connected')

  if (connErr) {
    console.error('[GEN-FB-POST] Failed to fetch connections:', connErr)
    return jsonError('Failed to fetch connections', corsHeaders)
  }

  if (!connections || connections.length === 0) {
    return jsonOk({ seller_posts: 0, casagrown_posts: 0, message: 'No active connections' }, corsHeaders)
  }

  // Load subscription tiers to check features dynamically
  const { data: tiersData } = await supabase
    .from('subscription_tiers')
    .select('tier_name, features')

  const tierFeatures: Record<string, any> = {}
  if (tiersData) {
    for (const t of tiersData) {
      tierFeatures[t.tier_name] = t.features || {}
    }
  }

  let sellerPostsPublished = 0
  let sellerPostsFailed = 0
  let casagrownPublished = 0
  let casagrownFailed = 0

  // ═══════════════════════════════════════════════════════════════
  // POST TYPE 3: Seller Daily Menu (auto-post to seller's FB page)
  // ═══════════════════════════════════════════════════════════════
  for (const conn of connections) {
    const sub = (conn as any).seller_subscriptions
    if (!sub || !['active', 'trialing'].includes(sub.status)) continue
    if (!conn.fb_page_access_token || !conn.fb_page_id) continue

    const features = tierFeatures[sub.plan] || {}
    if (!features.facebook_posts) continue

    const autoPostEnabled = (conn as any).auto_post_enabled === true
    if (!autoPostEnabled) continue

    // Check if already posted today
    const { count: todayPosts } = await supabase
      .from('fb_auto_post_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', conn.user_id)
      .eq('target', 'seller_page')
      .gte('created_at', `${todayStr}T00:00:00Z`)

    if ((todayPosts || 0) >= 1) continue

    // Query booth IDs with active sync enabled for this connection
    const { data: catalogs } = await supabase
      .from('booth_fb_catalogs')
      .select('booth_id')
      .eq('connection_id', conn.id)
      .eq('sync_enabled', true)

    const syncedBoothIds = catalogs?.map(c => c.booth_id) || []

    if (syncedBoothIds.length === 0) continue // Skip if no booths are opted into sync

    // Get seller profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, farm_name, business_type')
      .eq('id', conn.user_id)
      .single()

    const sellerName = profile?.farm_name || profile?.full_name || 'Local Grower'

    // Get all booths with active products
    const { data: booths } = await supabase
      .from('market_booths')
      .select('id, name, pickup_address, pickup_city, pickup_zip, offers_pickup, offers_delivery, delivery_zipcodes, delivery_radius_miles')
      .eq('owner_id', conn.user_id)
      .eq('is_open', true)
      .in('id', syncedBoothIds)

    if (!booths || booths.length === 0) continue

    // Business type labels
    const bizTypeLabels: Record<string, string> = {
      hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
      cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
      homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
      gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
      commercial: '🏢 Commercial / Licensed',
    }

    // Build the daily menu post grouped by booth
    let message = `🌱 What's fresh today from ${sellerName}!\n`
    if (profile?.business_type && bizTypeLabels[profile.business_type]) {
      message += `${bizTypeLabels[profile.business_type]}\n`
    }
    let hasProducts = false
    const allProductPhotos: string[] = []
    const boothLinks: string[] = []

    for (const booth of booths) {
      const { data: products } = await supabase
        .from('market_products')
        .select('name, price_usd, photos')
        .eq('booth_id', booth.id)
        .eq('is_active', true)
        .eq('is_deleted', false)
        .gt('inventory', 0)
        .order('created_at', { ascending: false })

      if (!products || products.length === 0) continue
      hasProducts = true

      // Collect product photos for carousel
      for (const p of products) {
        if (p.photos?.length > 0 && allProductPhotos.length < 10) {
          allProductPhotos.push(p.photos[0])
        }
      }

      // Query booth fulfillment hours
      const { data: windows } = await supabase
        .from('booth_fulfillment_windows')
        .select('window_type, day_of_week, start_time, end_time')
        .eq('booth_id', booth.id)

      message += `\n📍 ${booth.name}`
      if (booth.pickup_address && booth.offers_pickup) {
        message += `\n  🏠 Pickup location: ${booth.pickup_address}`
      }

      if (booth.offers_pickup && windows) {
        const pickupWindows = windows.filter(w => w.window_type === 'pickup')
        if (pickupWindows.length > 0) {
          message += `\n  🕒 Pickup hours:`
          const grouped = groupByDay(pickupWindows)
          for (const [day, times] of Object.entries(grouped)) {
            message += `\n    • ${day}: ${times.join(', ')}`
          }
        }
      }

      message += `\n`

      for (const p of products) {
        const price = Number(p.price_usd).toFixed(2)
        message += `  • ${p.name} — $${price}\n`
      }

      if (booth.offers_delivery) {
        let delDetails = '  🚗 Delivery: Available'
        if (booth.delivery_radius_miles) {
          delDetails += ` within ${booth.delivery_radius_miles} miles`
        }
        if (booth.delivery_zipcodes && booth.delivery_zipcodes.length > 0) {
          delDetails += ` (Zips: ${booth.delivery_zipcodes.join(', ')})`
        }
        message += `\n${delDetails}`

        if (windows) {
          const deliveryWindows = windows.filter(w => w.window_type === 'delivery')
          if (deliveryWindows.length > 0) {
            message += `\n  🕒 Delivery hours:`
            const grouped = groupByDay(deliveryWindows)
            for (const [day, times] of Object.entries(grouped)) {
              message += `\n    • ${day}: ${times.join(', ')}`
            }
          }
        }
        message += `\n`
      }

      boothLinks.push(`${siteUrl}/market/booth/${booth.id}`)
    }

    if (!hasProducts) continue

    if (features.whatsapp_chat && conn.wa_display_phone) {
      const cleanWaPhone = conn.wa_display_phone.replace(/\D/g, '')
      if (cleanWaPhone) {
        const waLink = `https://wa.me/${cleanWaPhone}?text=Hi!%20I%20saw%20your%20post%20on%20social%20media%20and%20would%20love%20to%20order%20some%20fresh%20produce!`
        message += `\n\n💬 Or message us on WhatsApp to order:\n${waLink}`
      }
    }

    message += `\n\nOrder now 👇\n${boothLinks[0]}`

    try {
      // Use multi-photo carousel if we have multiple product photos
      const fbResult = allProductPhotos.length > 1
        ? await publishMultiPhotoPost(conn.fb_page_id, conn.fb_page_access_token, {
            message,
            photoUrls: allProductPhotos,
            link: boothLinks[0],
          })
        : await publishPagePost(conn.fb_page_id, conn.fb_page_access_token, {
            message,
            link: boothLinks[0],
            photoUrl: allProductPhotos[0] || undefined,
          })

      await supabase.from('fb_auto_post_log').insert({
        user_id: conn.user_id,
        target: 'seller_page',
        fb_post_id: fbResult?.id || null,
        message,
      })

      // ── Instagram posting for Elite sellers ──
      if (features.instagram_posts && conn.ig_auto_post_enabled && conn.ig_business_account_id) {
        try {
          const igResult = allProductPhotos.length > 1
            ? await publishInstagramCarousel(conn.ig_business_account_id, conn.fb_page_access_token, {
                caption: message,
                imageUrls: allProductPhotos,
              })
            : await publishInstagramPost(conn.ig_business_account_id, conn.fb_page_access_token, {
                caption: message,
                imageUrl: allProductPhotos[0] || '',
              })

          await supabase.from('fb_auto_post_log').insert({
            user_id: conn.user_id,
            target: 'instagram',
            fb_post_id: igResult?.id || null,
            message,
          })
          console.log(`[GEN-FB-POST] ✅ Posted daily menu to Instagram for ${sellerName}`)
        } catch (igErr: any) {
          console.error(`[GEN-FB-POST] ❌ Instagram posting failed for ${sellerName}: ${igErr.message}`)
          await supabase.from('fb_auto_post_log').insert({
            user_id: conn.user_id,
            target: 'instagram',
            error: igErr.message,
            message,
          })
        }
      }

      // ── Google Business Profile posting for Elite sellers ──
      if (features.google_places) {
        const { data: googleConn } = await supabase
          .from('seller_google_connections')
          .select('google_refresh_token, google_location_id, google_location_name, auto_post_specials')
          .eq('user_id', conn.user_id)
          .maybeSingle()

        if (googleConn?.auto_post_specials && googleConn?.google_location_id && googleConn?.google_refresh_token) {
          try {
            const googleAccessToken = await getGoogleAccessToken(googleConn.google_refresh_token)
            const gbpResult = await publishGoogleLocalPost(googleConn.google_location_id, googleAccessToken, {
              caption: message,
              photoUrl: allProductPhotos[0] || undefined,
              buttonUrl: boothLinks[0],
            })

            await supabase.from('fb_auto_post_log').insert({
              user_id: conn.user_id,
              target: 'google_local',
              fb_post_id: gbpResult?.name || null,
              message,
            })
            console.log(`[GEN-FB-POST] ✅ Posted daily specials to Google Maps for ${sellerName}`)
          } catch (gbpErr: any) {
            console.error(`[GEN-FB-POST] ❌ Google Maps posting failed for ${sellerName}: ${gbpErr.message}`)
            await supabase.from('fb_auto_post_log').insert({
              user_id: conn.user_id,
              target: 'google_local',
              error: gbpErr.message,
              message,
            })
          }
        }
      }

      sellerPostsPublished++
      console.log(`[GEN-FB-POST] ✅ Posted daily menu to ${sellerName}'s page (${allProductPhotos.length} photos)`)
    } catch (err: any) {
      sellerPostsFailed++
      console.error(`[GEN-FB-POST] ❌ Failed for ${sellerName}: ${err.message}`)

      await supabase.from('fb_auto_post_log').insert({
        user_id: conn.user_id,
        target: 'seller_page',
        error: err.message,
        message,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // POST TYPE 1: CasaGrown Daily Listings Digest (→ queue)
  // ═══════════════════════════════════════════════════════════════
  // Get all new listings from the past 24 hours across all Pro sellers
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const proSellerIds = connections
    .filter((c: any) => {
      const sub = (c as any).seller_subscriptions
      return sub && ['active', 'trialing'].includes(sub.status) && (c as any).casagrown_post_enabled
    })
    .map((c: any) => c.user_id)

  if (proSellerIds.length > 0) {
    const { data: newListings } = await supabase
      .from('market_products')
      .select('name, price_usd, photos, seller_id, booth_id, category')
      .in('seller_id', proSellerIds)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .gt('inventory', 0)
      .order('created_at', { ascending: false })
      .limit(50)

    if (newListings && newListings.length > 0) {
      // Group by product name and count sellers per product
      const productSellers: Record<string, Set<string>> = {}
      const sellerNames: Record<string, string> = {}

      for (const item of newListings) {
        if (!sellerNames[item.seller_id]) {
          const { data: p } = await supabase
            .from('profiles')
            .select('full_name, farm_name')
            .eq('id', item.seller_id)
            .single()
          sellerNames[item.seller_id] = p?.farm_name || p?.full_name || 'Local Grower'
        }

        const productName = item.name.toLowerCase()
        if (!productSellers[productName]) productSellers[productName] = new Set()
        productSellers[productName].add(item.seller_id)
      }

      // Build the summary: "tomatoes from 3 growers, sweet corn, fresh eggs..."
      const summaryParts: string[] = []
      for (const [product, sellers] of Object.entries(productSellers)) {
        if (sellers.size > 1) {
          summaryParts.push(`${product} from ${sellers.size} growers`)
        } else {
          summaryParts.push(product)
        }
      }

      const uniqueSellers = new Set(newListings.map((l: any) => l.seller_id)).size
      const summaryText = summaryParts.slice(0, 8).join(', ')
      const andMore = summaryParts.length > 8 ? ', and more!' : '!'

      let digestMsg = `🌱 New on CasaGrown today!\n\n` +
        `${summaryText}${andMore}\n`

      // Include new Pro sellers from the past 7 days
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentSellers } = await supabase
        .from('seller_subscriptions')
        .select('user_id, created_at')
        .in('status', ['active', 'trialing'])
        .gte('created_at', sevenDaysAgo)

      if (recentSellers && recentSellers.length > 0) {
        digestMsg += `\n🆕 New Pro sellers this week:\n\n`

        for (const seller of recentSellers) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name, farm_name, city, state_code')
            .eq('id', seller.user_id)
            .single()

          const { data: booths } = await supabase
            .from('market_booths')
            .select('id, name')
            .eq('owner_id', seller.user_id)
            .eq('is_open', true)
            .limit(1)

          const { data: fbConn } = await supabase
            .from('seller_fb_connections')
            .select('fb_page_id, fb_page_name')
            .eq('user_id', seller.user_id)
            .limit(1)
            .maybeSingle()

          const name = prof?.farm_name || prof?.full_name || 'New Grower'
          const location = [prof?.city, prof?.state_code].filter(Boolean).join(', ')

          digestMsg += `👩‍🌾 ${name}`
          if (location) digestMsg += ` — ${location}`
          digestMsg += `\n`

          if (booths && booths.length > 0) {
            digestMsg += `🛒 ${siteUrl}/market/booth/${booths[0].id}\n`
          }

          if (fbConn?.fb_page_id) {
            digestMsg += `📘 https://facebook.com/${fbConn.fb_page_id}\n`
          }

          digestMsg += `\n`
        }
      }

      digestMsg += `Browse what's fresh from your neighbors → ${siteUrl}/market`

      // Collect product photos for carousel (up to 6)
      const allPhotos = newListings
        .filter((l: any) => l.photos?.length > 0)
        .map((l: any) => l.photos[0])
        .slice(0, 6)

      // Auto-publish directly to CasaGrown's FB page
      const cgPageId = Deno.env.get('CASAGROWN_FB_PAGE_ID') || ''
      const cgPageToken = Deno.env.get('CASAGROWN_FB_PAGE_TOKEN') || ''

      if (cgPageId && cgPageToken) {
        try {
          const fbResult = allPhotos.length > 1
            ? await publishMultiPhotoPost(cgPageId, cgPageToken, {
                message: digestMsg,
                photoUrls: allPhotos,
              })
            : await publishPagePost(cgPageId, cgPageToken, {
                message: digestMsg,
                photoUrl: allPhotos[0] || undefined,
              })

          await supabase.from('fb_auto_post_log').insert({
            target: 'casagrown_page',
            fb_post_id: fbResult?.id || null,
            message: digestMsg,
          })

          casagrownPublished++
          console.log(`[GEN-FB-POST] ✅ Published daily digest to CasaGrown page (${allPhotos.length} photos)`)
        } catch (err: any) {
          casagrownFailed++
          console.error(`[GEN-FB-POST] ❌ Failed CasaGrown digest: ${err.message}`)
          await supabase.from('fb_auto_post_log').insert({
            target: 'casagrown_page',
            error: err.message,
            message: digestMsg,
          })
        }
      } else {
        console.warn('[GEN-FB-POST] ⚠️ CasaGrown FB page credentials not configured, skipping digest')
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // POST TYPE 2: New Seller Welcome (auto-post, weekly)
  // ═══════════════════════════════════════════════════════════════
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Check if we already posted a welcome this week
  const { count: welcomeThisWeek } = await supabase
    .from('fb_auto_post_log')
    .select('id', { count: 'exact', head: true })
    .eq('target', 'casagrown_page')
    .ilike('message', '%New on CasaGrown this week%')
    .gte('created_at', sevenDaysAgo)

  if ((welcomeThisWeek || 0) === 0) {
    // Find Pro sellers who activated in the past 7 days
    const { data: newSellers } = await supabase
      .from('seller_subscriptions')
      .select('user_id, created_at')
      .in('status', ['active', 'trialing'])
      .gte('created_at', sevenDaysAgo)

    if (newSellers && newSellers.length > 0) {
      let welcomeMsg = `🎉 New on CasaGrown this week!\n\n`
      welcomeMsg += `Welcome to our newest local growers:\n\n`

      const sellerPhotoUrls: string[] = []

      for (const seller of newSellers) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, farm_name, city, state_code, avatar_url, business_logo_url')
          .eq('id', seller.user_id)
          .single()

        const { data: booths } = await supabase
          .from('market_booths')
          .select('id, name, pickup_address, offers_delivery, delivery_zipcodes')
          .eq('owner_id', seller.user_id)
          .eq('is_open', true)

        const { data: fbConn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_name, fb_page_id, casagrown_post_enabled')
          .eq('user_id', seller.user_id)
          .limit(1)
          .maybeSingle()

        if (fbConn && fbConn.casagrown_post_enabled === false) {
          continue // Seller opted out of being featured on CasaGrown Page
        }

        const name = prof?.farm_name || prof?.full_name || 'New Grower'
        const location = [prof?.city, prof?.state_code].filter(Boolean).join(', ')

        // Collect seller photo for carousel
        const sellerPhoto = prof?.business_logo_url || prof?.avatar_url
        if (sellerPhoto) sellerPhotoUrls.push(sellerPhoto)

        welcomeMsg += `👩‍🌾 ${name}`
        if (location) welcomeMsg += ` — ${location}`
        welcomeMsg += `\n`

        if (booths && booths.length > 0) {
          const booth = booths[0]
          welcomeMsg += `🛒 Shop: ${siteUrl}/market/booth/${booth.id}\n`
          if (booth.pickup_address) {
            welcomeMsg += `📍 Pickup: ${booth.pickup_address}\n`
          }
          if (booth.offers_delivery && booth.delivery_zipcodes?.length > 0) {
            welcomeMsg += `🚗 Delivery: ${booth.delivery_zipcodes.join(', ')}\n`
          }
        }

        if (fbConn?.fb_page_id) {
          welcomeMsg += `📘 Follow: https://facebook.com/${fbConn.fb_page_id}\n`
        }

        welcomeMsg += `\n`
      }

      welcomeMsg += `Support local! 🌱 ${siteUrl}/market`

      // Auto-publish directly to CasaGrown's FB page
      const cgPageId = Deno.env.get('CASAGROWN_FB_PAGE_ID') || ''
      const cgPageToken = Deno.env.get('CASAGROWN_FB_PAGE_TOKEN') || ''

      if (cgPageId && cgPageToken) {
        try {
          const fbResult = sellerPhotoUrls.length > 1
            ? await publishMultiPhotoPost(cgPageId, cgPageToken, {
                message: welcomeMsg,
                photoUrls: sellerPhotoUrls,
              })
            : await publishPagePost(cgPageId, cgPageToken, {
                message: welcomeMsg,
                photoUrl: sellerPhotoUrls[0] || undefined,
              })

          await supabase.from('fb_auto_post_log').insert({
            target: 'casagrown_page',
            fb_post_id: fbResult?.id || null,
            message: welcomeMsg,
          })

          casagrownPublished++
          console.log(`[GEN-FB-POST] ✅ Published welcome post to CasaGrown page (${newSellers.length} sellers, ${sellerPhotoUrls.length} photos)`)
        } catch (err: any) {
          casagrownFailed++
          console.error(`[GEN-FB-POST] ❌ Failed CasaGrown welcome: ${err.message}`)
          await supabase.from('fb_auto_post_log').insert({
            target: 'casagrown_page',
            error: err.message,
            message: welcomeMsg,
          })
        }
      }
    }
  }

  return jsonOk({
    seller_posts: sellerPostsPublished,
    seller_failed: sellerPostsFailed,
    casagrown_published: casagrownPublished,
    casagrown_failed: casagrownFailed,
  }, corsHeaders)
})

function formatTime(timeStr: string): string {
  const [hourStr, minStr] = timeStr.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const formattedHour = hour % 12 || 12
  return `${formattedHour}:${minStr} ${ampm}`
}

function groupByDay(windows: any[]): Record<string, string[]> {
  const dayNames: Record<string, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
  }
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  
  const sorted = [...windows].sort((a, b) => {
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
  return groups
}
