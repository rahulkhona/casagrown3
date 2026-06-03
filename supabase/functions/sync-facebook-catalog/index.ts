/**
 * sync-facebook-catalog — Syncs active products to Facebook Commerce Catalogs
 *
 * POST /functions/v1/sync-facebook-catalog
 * Auth: service_role (cron) or user JWT (manual trigger)
 * Body: { user_id?: string } (optional, for single-user sync)
 *
 * Flow:
 *   1. Get all connected seller_fb_connections with auto_sync_enabled
 *   2. Verify subscription (or pro_tester fallback)
 *   3. For each connection, discover booths via owner_id (matching my-stands page)
 *   4. For each booth, get products (matching booth detail page: is_deleted=false)
 *   5. Enrich with full seller profile, catalog_items metadata, fulfillment details
 *   6. Batch upsert to Facebook Commerce Catalog via Catalog Batch API
 *   7. Sync to Google Business Profile for Elite sellers
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { upsertCatalogProducts } from '../_shared/facebook.ts'
import { getGoogleAccessToken, syncProductToGoogleCatalog, updateGoogleBusinessProfile } from '../_shared/google.ts'

// Business type labels (same as generate-fb-posts)
const bizTypeLabels: Record<string, string> = {
  hobby_gardener: '🌱 Hobby Gardener', small_farm: '🚜 Small Farm',
  cottage_food: '🏠 Cottage Food Operation', urban_farm: '🏙️ Urban Farm',
  homestead: '🌾 Homestead', community_garden: '🌻 Community Garden',
  gardening_service: '🌿 Gardening Service', landscaping_service: '🏡 Landscaping Service',
  commercial: '🏢 Commercial / Licensed',
}

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const targetUserId = body.user_id

  // ── 1. Get all active FB connections ──
  let query = supabase
    .from('seller_fb_connections')
    .select('id, user_id, fb_page_access_token, fb_page_id, status, auto_sync_enabled, wa_display_phone, wa_auto_reply_enabled')
    .eq('status', 'connected')
    .eq('auto_sync_enabled', true)

  if (targetUserId) {
    query = query.eq('user_id', targetUserId)
  }

  const { data: connections, error: connErr } = await query

  if (connErr) {
    console.error('Failed to fetch connections:', connErr)
    return jsonError('Failed to fetch connections: ' + connErr.message, corsHeaders)
  }

  if (!connections || connections.length === 0) {
    return jsonOk({ synced: 0, message: 'No active connections found' }, corsHeaders)
  }

  let totalSynced = 0
  let totalErrors = 0
  const debugLog: string[] = []

  for (const conn of connections) {
    debugLog.push(`Connection ${conn.id}: user=${conn.user_id}`)

    // ── 2. Verify subscription access ──
    const { data: sub } = await supabase
      .from('seller_subscriptions')
      .select('plan, status')
      .eq('user_id', conn.user_id)
      .maybeSingle()

    let hasAccess = sub && ['active', 'trialing'].includes(sub.status)
    let sellerPlan = sub?.plan || 'pro'

    // Fallback: check pro_testers
    if (!hasAccess) {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', conn.user_id).single()
      if (profile?.email) {
        const { data: tester } = await supabase.from('pro_testers').select('email').ilike('email', profile.email).maybeSingle()
        if (tester) { hasAccess = true; sellerPlan = 'elite' }
      }
    }

    if (!hasAccess) { debugLog.push('  → SKIPPED: no subscription access'); continue }
    if (!conn.fb_page_access_token || !conn.fb_page_id) { debugLog.push('  → SKIPPED: missing page token or page ID'); continue }

    try {
      // ── 3. Get all booths (matching my-stands page: owner_id, no status filter) ──
      const { data: booths } = await supabase
        .from('market_booths')
        .select('*')
        .eq('owner_id', conn.user_id)

      if (!booths || booths.length === 0) {
        debugLog.push('  → SKIPPED: no booths found')
        continue
      }

      debugLog.push(`  → Found ${booths.length} booth(s)`)

      // ── Get full seller profile ──
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('full_name, farm_name, business_type, seller_bio, city, state_code, zip_code, business_license, food_handler_permit, cottage_food_permit, insurance_provider, business_logo_url')
        .eq('id', conn.user_id)
        .single()

      const waPhone = conn.wa_display_phone || null

      let connectionProductCount = 0

      for (const booth of booths) {
        // ── Auto-create booth_fb_catalogs entry if missing ──
        const { data: existingCatalog } = await supabase
          .from('booth_fb_catalogs')
          .select('id, fb_catalog_id, sync_enabled')
          .eq('booth_id', booth.id)
          .maybeSingle()

        if (!existingCatalog) {
          // Auto-create entry for this booth
          await supabase.from('booth_fb_catalogs').insert({
            booth_id: booth.id,
            connection_id: conn.id,
            sync_enabled: true,
          })
          debugLog.push(`  → Auto-created booth_fb_catalogs for "${booth.name}"`)
        }

        if (existingCatalog && !existingCatalog.sync_enabled) {
          debugLog.push(`  → Booth "${booth.name}": sync disabled`)
          continue
        }

        let fbCatalogId = existingCatalog?.fb_catalog_id || null

        // ── Auto-create Facebook catalog if none exists ──
        if (!fbCatalogId) {
          try {
            // First, check if the Page already has a catalog we can use
            const existingRes = await fetch(
              `https://graph.facebook.com/v21.0/${conn.fb_page_id}/owned_product_catalogs?access_token=${conn.fb_page_access_token}`
            )
            const existingData = await existingRes.json()

            if (existingData?.data?.length > 0) {
              // Use the first existing catalog
              fbCatalogId = existingData.data[0].id
              debugLog.push(`  → Using existing FB catalog: ${fbCatalogId}`)
            } else {
              // Create a new catalog via the Page
              const catalogName = `${booth.name || 'CasaGrown'} Products`
              const createRes = await fetch(
                `https://graph.facebook.com/v21.0/${conn.fb_page_id}/owned_product_catalogs`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    access_token: conn.fb_page_access_token,
                    name: catalogName,
                  }),
                }
              )
              const createData = await createRes.json()
              if (createData?.id) {
                fbCatalogId = createData.id
                debugLog.push(`  → Created new FB catalog "${catalogName}": ${fbCatalogId}`)
              } else {
                debugLog.push(`  → Failed to create FB catalog: ${JSON.stringify(createData)}`)
              }
            }

            // Save catalog ID to our DB
            if (fbCatalogId) {
              const catalogRecordId = existingCatalog?.id
              if (catalogRecordId) {
                await supabase.from('booth_fb_catalogs').update({ fb_catalog_id: fbCatalogId }).eq('id', catalogRecordId)
              } else {
                await supabase.from('booth_fb_catalogs').upsert({
                  booth_id: booth.id,
                  connection_id: conn.id,
                  fb_catalog_id: fbCatalogId,
                  sync_enabled: true,
                }, { onConflict: 'booth_id' })
              }
            }
          } catch (catErr: any) {
            debugLog.push(`  → Catalog creation error: ${catErr.message}`)
          }
        }

        // ── 4. Get products (matching booth detail page: is_deleted=false) ──
        const { data: products } = await supabase
          .from('market_products')
          .select('*')
          .eq('booth_id', booth.id)
          .eq('is_deleted', false)

        if (!products || products.length === 0) {
          debugLog.push(`  → Booth "${booth.name}": 0 products`)
          continue
        }

        debugLog.push(`  → Booth "${booth.name}": ${products.length} products`)

        // ── Get fulfillment windows (grouped by day) ──
        const { data: windows } = await supabase
          .from('booth_fulfillment_windows')
          .select('window_type, day_of_week, start_time, end_time')
          .eq('booth_id', booth.id)

        let fulfillmentDesc = ''

        if (booth.offers_pickup) {
          fulfillmentDesc += `\n📍 Pickup: ${booth.pickup_address || booth.pickup_street || 'Available'}`
          if (booth.pickup_city) fulfillmentDesc += `, ${booth.pickup_city}`
          if (booth.pickup_state) fulfillmentDesc += ` ${booth.pickup_state}`
          const pickupWindows = windows?.filter(w => w.window_type === 'pickup')
          if (pickupWindows && pickupWindows.length > 0) {
            fulfillmentDesc += '\n🕒 Pickup hours:'
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
            fulfillmentDesc += '\n🕒 Delivery hours:'
            const grouped = groupByDay(deliveryWindows)
            for (const [day, times] of Object.entries(grouped)) {
              fulfillmentDesc += `\n  • ${day}: ${times.join(', ')}`
            }
          }
        }

        // ── Get linked catalog_items for enrichment ──
        const catalogItemIds = products.map(p => p.catalog_item_id).filter(Boolean)
        let catalogItemMap: Record<string, any> = {}
        if (catalogItemIds.length > 0) {
          const { data: catItems } = await supabase
            .from('catalog_items')
            .select('id, certifications, growing_method, variety, allergens, geographical_origin, shelf_life_days, storage_instructions')
            .in('id', catalogItemIds)
          if (catItems) {
            for (const ci of catItems) catalogItemMap[ci.id] = ci
          }
        }

        // ── 5. Build enriched product payloads ──
        const productPayloads = []

        for (const product of products) {
          // Only sync active products to the catalog
          if (!product.is_active) continue

          const hash = await computeContentHash(product)

          // Check if content changed
          const { data: syncRecord } = await supabase
            .from('product_fb_sync')
            .select('content_hash')
            .eq('product_id', product.id)
            .maybeSingle()

          if (syncRecord?.content_hash === hash) continue // No change

          const photoUrl = product.photos?.[0] || `${siteUrl}/logo.png`
          const catalogItem = product.catalog_item_id ? catalogItemMap[product.catalog_item_id] : null

          // Build enriched description
          let enrichedDesc = product.description || product.name

          // Business type
          if (sellerProfile?.business_type && bizTypeLabels[sellerProfile.business_type]) {
            enrichedDesc += `\n\n${bizTypeLabels[sellerProfile.business_type]}`
          }

          // Seller bio
          if (sellerProfile?.seller_bio) {
            enrichedDesc += `\n\n🌱 About: ${sellerProfile.seller_bio.substring(0, 300)}`
          }

          // Catalog item enrichment
          if (catalogItem) {
            if (catalogItem.certifications?.length > 0) {
              enrichedDesc += `\n🏅 Certifications: ${catalogItem.certifications.join(', ')}`
            }
            if (catalogItem.growing_method) {
              enrichedDesc += `\n🌿 Growing method: ${catalogItem.growing_method}`
            }
            if (catalogItem.variety) {
              enrichedDesc += `\n🌾 Variety: ${catalogItem.variety}`
            }
            if (catalogItem.allergens?.length > 0) {
              enrichedDesc += `\n⚠️ Allergens: ${catalogItem.allergens.join(', ')}`
            }
            if (catalogItem.geographical_origin) {
              enrichedDesc += `\n📍 Origin: ${catalogItem.geographical_origin}`
            }
            if (catalogItem.shelf_life_days) {
              enrichedDesc += `\n📅 Shelf life: ${catalogItem.shelf_life_days} days`
            }
            if (catalogItem.storage_instructions) {
              enrichedDesc += `\n🧊 Storage: ${catalogItem.storage_instructions}`
            }
          }

          // Trust badges
          const badges = []
          if (sellerProfile?.business_license) badges.push('✓ Licensed')
          if (sellerProfile?.food_handler_permit) badges.push('✓ Food Handler')
          if (sellerProfile?.cottage_food_permit) badges.push('✓ Cottage Food')
          if (sellerProfile?.insurance_provider) badges.push('✓ Insured')
          if (badges.length > 0) enrichedDesc += `\n\n${badges.join(' · ')}`

          // Fulfillment
          if (fulfillmentDesc) enrichedDesc += `\n\n📦 Fulfillment Options:${fulfillmentDesc}`

          // Links
          const productUrl = `${siteUrl}/market/booth/${booth.id}/product/${product.id}`
          const waUrl = waPhone ? `https://wa.me/${waPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi! I'd like to order ${product.name} from CasaGrown: ${productUrl}`)}` : null

          enrichedDesc += `\n\n🛍️ Order on CasaGrown: ${productUrl}`
          if (waUrl) enrichedDesc += `\n📱 Order via WhatsApp: ${waUrl}`

          productPayloads.push({
            retailer_id: product.id,
            name: `${product.name}${sellerProfile?.city ? ` · ${sellerProfile.city}` : ''}${sellerProfile?.zip_code ? ` ${sellerProfile.zip_code}` : ''}`.trim(),
            description: enrichedDesc.substring(0, 5000),
            price: Number(product.price_usd),
            currency: 'USD',
            url: productUrl,
            image_url: photoUrl,
            availability: product.inventory > 0 ? 'in stock' : 'out of stock',
            brand: sellerProfile?.farm_name || sellerProfile?.full_name || 'CasaGrown Seller',
            condition: 'new',
            category: product.category || 'Food, Beverages & Tobacco',
          })

          // Upsert sync record as pending
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

        // ── 6. Batch upsert to Facebook Catalog ──
        if (productPayloads.length > 0 && fbCatalogId) {
          try {
            await upsertCatalogProducts(
              fbCatalogId,
              productPayloads,
              conn.fb_page_access_token,
            )

            // Mark as synced
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

            debugLog.push(`  → Synced ${productPayloads.length} products to FB Catalog ${fbCatalogId}`)

            // ── 7. Google Business Profile sync (Elite only) ──
            if (sellerPlan === 'elite') {
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
                  console.log(`[GBP-CATALOG] ✅ Synced ${productPayloads.length} products to Google Maps`)

                  try {
                    await updateGoogleBusinessProfile(googleConn.google_location_id, googleAccessToken, {
                      description: sellerProfile?.seller_bio || undefined,
                      additionalPhone: waPhone,
                    })
                  } catch (gbpMetaErr: any) {
                    console.warn(`[GBP] Profile metadata update failed: ${gbpMetaErr.message}`)
                  }
                } catch (gbpErr: any) {
                  console.error(`[GBP-CATALOG] ❌ Google sync failed: ${gbpErr.message}`)
                }
              }
            }

            connectionProductCount += productPayloads.length
          } catch (fbErr: any) {
            console.error(`FB catalog sync error:`, fbErr.message)
            debugLog.push(`  → ERROR syncing to FB Catalog: ${fbErr.message}`)

            for (const p of productPayloads) {
              await supabase
                .from('product_fb_sync')
                .update({ seller_sync_status: 'error', seller_error: fbErr.message })
                .eq('product_id', p.retailer_id)
            }
            totalErrors++
          }
        } else if (productPayloads.length > 0 && !fbCatalogId) {
          // No FB Catalog ID yet — products are tracked but not pushed
          debugLog.push(`  → ${productPayloads.length} products ready but no fb_catalog_id set — create a catalog in Facebook Commerce Manager`)
          connectionProductCount += productPayloads.length
        }

        // Update catalog stats
        const catalogId = existingCatalog?.id
        if (catalogId) {
          await supabase
            .from('booth_fb_catalogs')
            .update({
              last_sync_at: new Date().toISOString(),
              last_sync_count: productPayloads.length,
              last_error: null,
            })
            .eq('id', catalogId)
        }
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
      debugLog.push(`  → FATAL ERROR: ${err.message}`)
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
    debug: debugLog,
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
