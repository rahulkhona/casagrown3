/**
 * sync-facebook-catalog — Syncs active products to Facebook catalogs
 *
 * POST /functions/v1/sync-facebook-catalog
 * Auth: service_role (cron) or user JWT (manual trigger)
 * Body: { user_id?: string } (optional, for single-user sync)
 */
import { serveWithCors, requireAuth, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { publishPagePost } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const auth = await requireAuth(req, supabase, corsHeaders)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const targetUserId = body.user_id

  // Get all active FB connections
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
    return jsonOk({ synced: 0, message: 'No active connections found', debug: { filter: 'status=connected, auto_sync_enabled=true' } }, corsHeaders)
  }

  let totalSynced = 0
  let totalErrors = 0
  const debugLog: string[] = []

  for (const conn of connections) {
    debugLog.push(`Connection ${conn.id}: user=${conn.user_id}, status=${conn.status}, auto_sync=${conn.auto_sync_enabled}`)

    // Verify Pro/Elite subscription is active (or pro_tester)
    const { data: sub } = await supabase
      .from('seller_subscriptions')
      .select('plan, status')
      .eq('user_id', conn.user_id)
      .maybeSingle()

    let hasAccess = sub && ['active', 'trialing'].includes(sub.status)

    // Fallback: check pro_testers
    if (!hasAccess) {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', conn.user_id).single()
      if (profile?.email) {
        const { data: tester } = await supabase.from('pro_testers').select('email').ilike('email', profile.email).maybeSingle()
        if (tester) hasAccess = true
      }
    }

    if (!hasAccess) { debugLog.push('  → SKIPPED: no subscription access'); continue }
    if (!conn.fb_page_access_token || !conn.fb_page_id) { debugLog.push('  → SKIPPED: missing page token or page ID'); continue }

    try {
      // Get all booths owned by this seller
      const { data: booths } = await supabase
        .from('market_booths')
        .select('id, name, offers_pickup, offers_delivery, pickup_address, delivery_radius_miles, delivery_zipcodes')
        .eq('seller_id', conn.user_id)
        .eq('status', 'published')

      if (!booths || booths.length === 0) {
        debugLog.push('  → SKIPPED: no published booths')
        continue
      }

      debugLog.push(`  → Found ${booths.length} booths`)
      let connectionProductCount = 0

      for (const booth of booths) {
        // Get active products for this booth
        const { data: products } = await supabase
          .from('market_products')
          .select('id, name, description, price_usd, unit, inventory, category, photos, seller_id')
          .eq('booth_id', booth.id)
          .eq('is_active', true)
          .eq('is_deleted', false)

        if (!products || products.length === 0) { debugLog.push(`  → Booth ${booth.name}: 0 active products`); continue }
        debugLog.push(`  → Booth ${booth.name}: ${products.length} active products`)

        // Get timings from booth_fulfillment_windows
        const { data: windows } = await supabase
          .from('booth_fulfillment_windows')
          .select('window_type, day_of_week, start_time, end_time')
          .eq('booth_id', booth.id)

        let fulfillmentDesc = ''
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
          if (booth.delivery_radius_miles) fulfillmentDesc += ` within ${booth.delivery_radius_miles} miles`
        }

        // Get seller profile
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('full_name, city, zip_code, farm_name, seller_bio')
          .eq('id', conn.user_id)
          .single()

        const waPhone = conn.wa_display_phone || null

        for (const product of products) {
          // Check if content changed using hash
          const hash = await computeContentHash(product)
          const { data: syncRecord } = await supabase
            .from('product_fb_sync')
            .select('content_hash')
            .eq('product_id', product.id)
            .maybeSingle()

          if (syncRecord?.content_hash === hash) {
            connectionProductCount++ // Already synced, count it
            continue
          }

          const photoUrl = product.photos?.[0] || `${siteUrl}/logo.png`
          let desc = `🛒 ${product.name}\n💰 $${product.price_usd}/${product.unit}\n\n${product.description || ''}`
          if (sellerProfile?.seller_bio) desc += `\n\n🌱 ${sellerProfile.seller_bio.substring(0, 200)}`
          if (fulfillmentDesc) desc += `\n\n📦 Fulfillment:${fulfillmentDesc}`
          if (waPhone) desc += `\n\n📱 WhatsApp: wa.me/${waPhone.replace(/\D/g, '')}`
          desc += `\n\n🛍️ Order now: ${siteUrl}/market/product/${product.id}`

          // Post as a Page post
          try {
            await publishPagePost(conn.fb_page_access_token, conn.fb_page_id, {
              message: desc,
              link: `${siteUrl}/market/product/${product.id}`,
            })

            // Record sync
            await supabase
              .from('product_fb_sync')
              .upsert({
                product_id: product.id,
                content_hash: hash,
                seller_sync_status: 'synced',
                seller_synced_at: new Date().toISOString(),
                last_inventory_synced: product.inventory,
                seller_error: null,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'product_id' })

            connectionProductCount++
          } catch (postErr: any) {
            console.error(`[SYNC] Failed to post product ${product.id}:`, postErr.message)
            totalErrors++
          }
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
