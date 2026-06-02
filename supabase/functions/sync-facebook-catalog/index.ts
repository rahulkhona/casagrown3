/**
 * sync-facebook-catalog — Syncs active products to Facebook catalogs
 *
 * POST /functions/v1/sync-facebook-catalog
 * Auth: service_role (cron) or user JWT (manual trigger)
 * Body: { user_id?: string } (optional, for single-user sync)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { upsertCatalogProducts, deleteCatalogProduct } from '../_shared/facebook.ts'
import { getGoogleAccessToken, syncProductToGoogleCatalog, updateGoogleBusinessProfile } from '../_shared/google.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const targetUserId = body.user_id

  // Get all active FB connections with Pro subscriptions
  let query = supabase
    .from('seller_fb_connections')
    .select(`
      id, user_id, fb_page_access_token, fb_page_id, status, auto_sync_enabled,
      wa_display_phone, wa_auto_reply_enabled,
      seller_subscriptions!inner(plan, status)
    `)
    .eq('status', 'connected')
    .eq('auto_sync_enabled', true)

  if (targetUserId) {
    query = query.eq('user_id', targetUserId)
  }

  const { data: connections, error: connErr } = await query

  if (connErr) {
    console.error('Failed to fetch connections:', connErr)
    return jsonError('Failed to fetch connections', corsHeaders)
  }

  if (!connections || connections.length === 0) {
    return jsonOk({ synced: 0, message: 'No active connections' }, corsHeaders)
  }

  let totalSynced = 0
  let totalErrors = 0

  for (const conn of connections) {
    // Verify Pro subscription is active
    const sub = (conn as any).seller_subscriptions
    if (!sub || !['active', 'trialing'].includes(sub.status)) continue

    if (!conn.fb_page_access_token || !conn.fb_page_id) continue

    try {
      // Get booth catalogs for this connection
      const { data: catalogs } = await supabase
        .from('booth_fb_catalogs')
        .select('id, booth_id, fb_catalog_id, sync_enabled')
        .eq('connection_id', conn.id)
        .eq('sync_enabled', true)

      let connectionProductCount = 0

      for (const catalog of catalogs || []) {
        if (!catalog.fb_catalog_id) continue

        // Get active products for this booth
        const { data: products } = await supabase
          .from('market_products')
          .select('id, name, description, price_usd, unit, inventory, category, photos, seller_id')
          .eq('booth_id', catalog.booth_id)
          .eq('is_active', true)
          .eq('is_deleted', false)

        if (!products || products.length === 0) continue

        // Get booth details for fulfillment options
        const { data: booth } = await supabase
          .from('market_booths')
          .select('offers_pickup, offers_delivery, pickup_address, delivery_radius_miles, delivery_zipcodes')
          .eq('id', catalog.booth_id)
          .single()

        // Get timings from booth_fulfillment_windows
        const { data: windows } = await supabase
          .from('booth_fulfillment_windows')
          .select('window_type, day_of_week, start_time, end_time')
          .eq('booth_id', catalog.booth_id)

        let fulfillmentDesc = ''
        if (booth) {
          fulfillmentDesc += '\n\n📦 Fulfillment Options:'
          
          if (booth.offers_pickup) {
            fulfillmentDesc += `\n📍 Pickup: Available near ${booth.pickup_address || 'our neighborhood'}`
            const pickupWindows = windows?.filter(w => w.window_type === 'pickup')
            if (pickupWindows && pickupWindows.length > 0) {
              fulfillmentDesc += '\n🕒 Pickup timings:'
              const grouped = groupByDay(pickupWindows)
              for (const [day, times] of Object.entries(grouped)) {
                fulfillmentDesc += `\n  • ${day}: ${times.join(', ')}`
              }
            }
          }

          if (booth.offers_delivery) {
            fulfillmentDesc += '\n🚗 Delivery: Available'
            if (booth.delivery_radius_miles) {
              fulfillmentDesc += ` within ${booth.delivery_radius_miles} miles`
            }
            if (booth.delivery_zipcodes && booth.delivery_zipcodes.length > 0) {
              fulfillmentDesc += ` (Zip codes: ${booth.delivery_zipcodes.join(', ')})`
            }
            const deliveryWindows = windows?.filter(w => w.window_type === 'delivery')
            if (deliveryWindows && deliveryWindows.length > 0) {
              fulfillmentDesc += '\n🕒 Delivery timings:'
              const grouped = groupByDay(deliveryWindows)
              for (const [day, times] of Object.entries(grouped)) {
                fulfillmentDesc += `\n  • ${day}: ${times.join(', ')}`
              }
            }
          }
        }

        // Get seller profile for brand name
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('full_name, city, zip_code, farm_name, seller_bio, business_type, business_license, food_handler_permit, cottage_food_permit, insurance_provider')
          .eq('id', conn.user_id)
          .single()

        // Get WA phone for this connection
        const waPhone = conn.wa_display_phone || null

        // Business type labels
        const bizTypeLabels: Record<string, string> = {
          hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
          cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
          homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
          gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
          commercial: '🏢 Commercial / Licensed',
        }

        // Compute content hashes and find changed products
        const productPayloads = []
        for (const product of products) {
          const hash = await computeContentHash(product)

          // Check if content changed
          const { data: syncRecord } = await supabase
            .from('product_fb_sync')
            .select('content_hash')
            .eq('product_id', product.id)
            .single()

          if (syncRecord?.content_hash === hash) continue // No change

          const photoUrl = product.photos?.[0] || `${siteUrl}/logo.png`

          // Build enriched description
          let enrichedDesc = product.description || product.name

          // Business type
          if (sellerProfile?.business_type && bizTypeLabels[sellerProfile.business_type]) {
            enrichedDesc += `\n\n${bizTypeLabels[sellerProfile.business_type]}`
          }

          // Seller bio
          if (sellerProfile?.seller_bio) {
            enrichedDesc += `\n\n🌱 About: ${sellerProfile.seller_bio.substring(0, 200)}`
          }

          // Trust badges
          const badges = []
          if (sellerProfile?.business_license) badges.push('✓ Licensed')
          if (sellerProfile?.food_handler_permit) badges.push('✓ Food Handler')
          if (sellerProfile?.cottage_food_permit) badges.push('✓ Cottage Food')
          if (sellerProfile?.insurance_provider) badges.push('✓ Insured')
          if (badges.length > 0) enrichedDesc += `\n${badges.join(' · ')}`

          // Add fulfillment
          enrichedDesc += fulfillmentDesc

          // WA number
          if (waPhone) enrichedDesc += `\n\n📱 WhatsApp: wa.me/${waPhone.replace(/\D/g, '')}`

          productPayloads.push({
            retailer_id: product.id,
            name: `${product.name} · ${sellerProfile?.city || ''} ${sellerProfile?.zip_code || ''}`.trim(),
            description: enrichedDesc.substring(0, 5000),
            price: Number(product.price_usd),
            currency: 'USD',
            url: `${siteUrl}/market/product/${product.id}`,
            image_url: photoUrl,
            availability: product.inventory > 0 ? 'in stock' : 'out of stock',
            brand: sellerProfile?.farm_name || sellerProfile?.full_name || 'CasaGrown Seller',
            condition: 'new',
            category: product.category || 'Food, Beverages & Tobacco',
          })

          // Upsert sync record
          await supabase
            .from('product_fb_sync')
            .upsert({
              product_id: product.id,
              content_hash: hash,
              seller_sync_status: 'pending',
              last_inventory_synced: product.inventory,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'product_id' })
        }

        // Batch upsert to Facebook
        if (productPayloads.length > 0) {
          try {
            await upsertCatalogProducts(
              catalog.fb_catalog_id,
              productPayloads,
              conn.fb_page_access_token,
            )

            // Update sync status to synced
            for (const p of productPayloads) {
              await supabase
                .from('product_fb_sync')
                .update({
                  seller_sync_status: 'synced',
                  seller_synced_at: new Date().toISOString(),
                  seller_error: null,
                })
                .eq('product_id', p.retailer_id)
            }

            // ── Google Business Profile Catalog Sync ──
            if (sub.plan === 'elite') {
              const { data: googleConn } = await supabase
                .from('seller_google_connections')
                .select('google_refresh_token, google_location_id, google_location_name, auto_sync_catalog')
                .eq('user_id', conn.user_id)
                .maybeSingle()

              if (googleConn?.auto_sync_catalog && googleConn?.google_location_id && googleConn?.google_refresh_token) {
                try {
                  const googleAccessToken = await getGoogleAccessToken(googleConn.google_refresh_token)
                  for (const p of productPayloads) {
                    await syncProductToGoogleCatalog(googleConn.google_location_id, googleAccessToken, {
                      retailer_id: p.retailer_id,
                      name: p.name,
                      description: p.description,
                      price: p.price,
                      image_url: p.image_url,
                      url: p.url,
                    })
                  }
                  console.log(`[GBP-CATALOG] ✅ Synced ${productPayloads.length} products to Google Maps Catalog`)

                  // Update Google Business Profile metadata
                  try {
                    await updateGoogleBusinessProfile(googleConn.google_location_id, googleAccessToken, {
                      description: sellerProfile?.seller_bio || undefined,
                      additionalPhone: waPhone,
                    })
                  } catch (gbpMetaErr: any) {
                    console.warn(`[GBP] Profile metadata update failed: ${gbpMetaErr.message}`)
                  }
                } catch (gbpErr: any) {
                  console.error(`[GBP-CATALOG] ❌ Google Maps Catalog sync failed: ${gbpErr.message}`)
                }
              }
            }

            connectionProductCount += productPayloads.length
          } catch (fbErr: any) {
            console.error(`FB sync error for catalog ${catalog.fb_catalog_id}:`, fbErr.message)

            // Mark products as errored
            for (const p of productPayloads) {
              await supabase
                .from('product_fb_sync')
                .update({
                  seller_sync_status: 'error',
                  seller_error: fbErr.message,
                })
                .eq('product_id', p.retailer_id)
            }

            await supabase
              .from('booth_fb_catalogs')
              .update({ last_error: fbErr.message })
              .eq('id', catalog.id)

            totalErrors++
          }
        }

        // Update catalog stats
        await supabase
          .from('booth_fb_catalogs')
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_count: products.length,
            last_error: null,
          })
          .eq('id', catalog.id)
      }

      // Update connection stats
      await supabase
        .from('seller_fb_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_product_count: connectionProductCount,
          last_error: null,
        })
        .eq('id', conn.id)

      totalSynced += connectionProductCount
    } catch (err: any) {
      console.error(`Sync failed for connection ${conn.id}:`, err.message)
      await supabase
        .from('seller_fb_connections')
        .update({ last_error: err.message })
        .eq('id', conn.id)
      totalErrors++
    }
  }

  return jsonOk({
    synced: totalSynced,
    errors: totalErrors,
    connections: connections.length,
  }, corsHeaders)
})

/** Compute SHA-256 content hash for change detection */
async function computeContentHash(product: any): Promise<string> {
  const data = `${product.name}|${product.description || ''}|${product.price_usd}|${product.inventory}|${(product.photos || []).join(',')}`
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

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
